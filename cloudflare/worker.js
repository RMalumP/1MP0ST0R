/**
 * Worker de Cloudflare — reparte las credenciales TURN de Metered (Open Relay) SIN ponerlas en el repositorio.
 *
 * Qué hace:
 *   - El juego (solo cuando necesita el respaldo PeerJS) hace un GET a la URL de este Worker.
 *   - El Worker llama a la API de Metered con tu clave (guardada como SECRETO, nunca en el código) y devuelve
 *     el array "iceServers" en JSON.
 *   - Solo responde si la petición viene de la web permitida (cabecera Origin); al resto devuelve 403.
 *   - Guarda la respuesta 5 minutos en la caché de Cloudflare para gastar menos peticiones a Metered.
 *
 * Variables de entorno (se crean en el panel del Worker: Settings → Variables and Secrets):
 * Hay DOS formas de configurarlo (basta una):
 *   A) Con API key:  METERED_API_KEY (Secreto) + METERED_APP (Variable: la parte "NOMBRE" de NOMBRE.metered.live).
 *   B) Con usuario y contraseña TURN fijos:  METERED_USERNAME (Secreto) + METERED_CREDENTIAL (Secreto).
 *      Es lo más simple si el panel de Metered solo te enseña "Username" y "Password". Si hay API key se usa la A.
 *   ALLOWED_ORIGIN   (Variable, opcional) → origen permitido. Si no existe se usa https://rmalump.github.io
 *
 * Cómo comprobar que está desplegado: abre  https://TU-WORKER.workers.dev/estado  en el navegador.
 * Debe mostrar {"ok":true, ...} indicando si las variables están puestas (sin revelar su valor).
 * Abrir la URL principal directamente en el navegador devuelve 403: es lo correcto (no hay cabecera Origin permitida).
 */
const ORIGEN_POR_DEFECTO = 'https://rmalump.github.io';
const CACHE_SEGUNDOS = 300;
const TIMEOUT_METERED_MS = 5000;
const HOST_TURN_FIJO = 'global.relay.metered.ca';
// Lista de servidores para el modo B (usuario y contraseña fijos).
function iceFijo(usuario, clave) {
  const h = HOST_TURN_FIJO;
  return [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:' + h + ':80', username: usuario, credential: clave },
    { urls: 'turn:' + h + ':80?transport=tcp', username: usuario, credential: clave },
    { urls: 'turn:' + h + ':443', username: usuario, credential: clave },
    { urls: 'turns:' + h + ':443?transport=tcp', username: usuario, credential: clave }
  ];
}

function json(cuerpo, estado, cabeceras) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cabeceras || {}) }
  });
}
function cabecerasCors(origen) {
  return { 'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
}

export default {
  async fetch(request, env, ctx) {
    const permitido = (env.ALLOWED_ORIGIN || ORIGEN_POR_DEFECTO).trim().replace(/\/+$/, '');
    const url = new URL(request.url);
    const origen = request.headers.get('Origin');

    // Comprobación de despliegue: no revela ningún valor, solo si las variables existen.
    if (url.pathname === '/estado' && (request.method === 'GET' || request.method === 'HEAD')) {
      return json({ ok: true, configurado: { METERED_API_KEY: !!env.METERED_API_KEY, METERED_APP: !!env.METERED_APP, METERED_USERNAME: !!env.METERED_USERNAME, METERED_CREDENTIAL: !!env.METERED_CREDENTIAL }, origenPermitido: permitido }, 200);
    }

    // Todo lo demás: solo desde la web permitida.
    if (origen !== permitido) return json({ error: 'origen-no-permitido' }, 403);
    const cors = cabecerasCors(origen);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'metodo-no-permitido' }, 405, cors);

    const modoApi = !!(env.METERED_API_KEY && env.METERED_APP && /^[a-z0-9-]+$/i.test(env.METERED_APP));
    const modoFijo = !!(env.METERED_USERNAME && env.METERED_CREDENTIAL);
    if (!modoApi && !modoFijo) return json({ error: 'no-configurado' }, 500, cors);
    if (!modoApi) {
      return new Response(JSON.stringify(iceFijo(env.METERED_USERNAME, env.METERED_CREDENTIAL)), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
    }

    // Caché de Cloudflare (la clave no depende de quién pregunta ni de la API key).
    const cache = (typeof caches !== 'undefined') ? caches.default : null;
    const claveCache = new Request('https://cache.interna.invalid/turn/' + encodeURIComponent(env.METERED_APP));
    if (cache) {
      const guardada = await cache.match(claveCache);
      if (guardada) return new Response(await guardada.text(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
    }

    let respuesta;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), TIMEOUT_METERED_MS);
      respuesta = await fetch('https://' + env.METERED_APP + '.metered.live/api/v1/turn/credentials?apiKey=' + encodeURIComponent(env.METERED_API_KEY), { signal: ctl.signal });
      clearTimeout(t);
    } catch (e) {
      return json({ error: 'metered-no-responde' }, 502, cors);
    }
    if (!respuesta.ok) return json({ error: 'metered-error', estado: respuesta.status }, 502, cors);

    let iceServers;
    try { iceServers = await respuesta.json(); } catch (e) { return json({ error: 'metered-respuesta-invalida' }, 502, cors); }
    if (!Array.isArray(iceServers) || iceServers.length === 0) return json({ error: 'metered-respuesta-invalida' }, 502, cors);

    const cuerpo = JSON.stringify(iceServers);
    if (cache) {
      const aGuardar = new Response(cuerpo, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + CACHE_SEGUNDOS } });
      if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(claveCache, aGuardar)); else await cache.put(claveCache, aGuardar);
    }
    return new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
  }
};
