// js/transport-peer.js — Transporte de RESPALDO: PeerJS (WebRTC punto a punto).
// Se usa solo si Firebase no funciona. El móvil del anfitrión hace de servidor: valida la contraseña, acepta o
// rechaza a cada jugador, guarda los roles y envía a cada uno SOLO lo suyo. Si el anfitrión cierra la pestaña, la sala se pierde.
// Es un módulo ES que carga js/transport.js bajo demanda; PeerJS se descarga por <script> (versión fijada) solo cuando hace falta.

// ===== CONFIGURACIÓN: pega aquí la URL de tu Worker de Cloudflare (el que reparte las credenciales TURN) =====
const TURN_PROXY_URL = "PEGA_AQUI_LA_URL_DEL_WORKER";
// ==========================================================================================================

const PEERJS_VERSION = '1.5.4';
const PEERJS_SRC = [
  'https://cdn.jsdelivr.net/npm/peerjs@' + PEERJS_VERSION + '/dist/peerjs.min.js',
  'https://unpkg.com/peerjs@' + PEERJS_VERSION + '/dist/peerjs.min.js'
];
const PREFIJO = 'miJuego-';
const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];
const MAX_JUGADORES = 20;
const T_TURN = 4000;        // ms máx. esperando credenciales TURN al Worker
const T_PEER = 12000;       // ms máx. para conectar con el servidor de señalización de PeerJS
const T_CONN = 12000;       // ms máx. para abrir la conexión con el anfitrión
const HB_MS = 8000;         // latido del jugador
const SILENCIO_MS = 25000;  // sin noticias de la otra parte durante este tiempo = conexión perdida
const MAX_MENSAJE = 6000;   // tamaño máximo (caracteres) de un mensaje de jugador al anfitrión
const SNAP_MAX_MS = 12 * 3600 * 1000;
const PERMITIDOS = ['clave', 'palabras']; // tipos de mensaje que un jugador puede mandar al anfitrión

let sala = null;
const cbs = { msg: [], jug: [], con: [] };
let ident = null, offsetMs = 0, iceCache = null;
const muestras = [];

// ---------- utilidades ----------
function errApp(code, message) { const e = new Error(message); e.code = code; e.esAppError = true; return e; }
function safe(f, ...a) { try { f(...a); } catch (e) { console.error(e); } }
const dormir = ms => new Promise(r => setTimeout(r, ms));
function hex(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
const almacen = () => globalThis.localStorage;
function lsGet(k) { try { return almacen().getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { almacen().setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
function lsDel(k) { try { almacen().removeItem(k); } catch (e) { /* nada */ } }
// Identidad del jugador en este dispositivo: "id" (público, aparece en la sala) y "token" (secreto, solo lo conocen él y el anfitrión).
function identidad() {
  if (ident) return ident;
  let id = lsGet('impostor.peer.id'), token = lsGet('impostor.peer.token');
  if (!/^p-[0-9a-f]{16}$/.test(id || '') || !/^[0-9a-f]{32}$/.test(token || '')) {
    id = 'p-' + hex(8); token = hex(16);
    lsSet('impostor.peer.id', id); lsSet('impostor.peer.token', token);
  }
  return (ident = { id, token });
}
async function sha256(txt) {
  if (!(globalThis.crypto && crypto.subtle)) throw errApp('contexto-inseguro', 'Este navegador solo permite el modo online desde una página https.');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2, '0')).join('');
}
const norm = n => String(n).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
// Mismo ID de sala que en Firebase (SHA-256 de nombre + contraseña): la contraseña nunca viaja ni se guarda.
const hashSala = (nombre, pass) => sha256('impostor-v1|' + norm(nombre) + '|' + String(pass).trim());
// Prueba de contraseña que el jugador manda al anfitrión (otro hash distinto del ID de sala).
const pruebaClave = (nombre, pass) => sha256('impostor-proof-v1|' + norm(nombre) + '|' + String(pass).trim());
function validarDatos(nombre, password, jugador) {
  if (String(nombre).trim().length < 3) throw errApp('datos', 'El nombre de la sala debe tener al menos 3 caracteres.');
  if (String(password).trim().length < 4) throw errApp('datos', 'La contraseña debe tener al menos 4 caracteres.');
  const j = String(jugador || '').trim();
  if (j.length < 1 || j.length > 24) throw errApp('datos', 'Escribe tu nombre (máximo 24 caracteres).');
}
function errMotivo(d) {
  const m = d && d.motivo;
  if (m === 'partida-en-curso') return errApp(m, 'La partida ya ha empezado. Espera a que termine la ronda para entrar.');
  if (m === 'sala-llena') return errApp(m, 'La sala está llena (máximo ' + MAX_JUGADORES + ' jugadores).');
  if (m === 'nombre-repetido') return errApp(m, 'Ya hay un jugador con ese nombre en la sala. Elige otro.');
  if (m === 'datos') return errApp(m, 'El anfitrión ha rechazado los datos de entrada.');
  return errApp('sala-no-encontrada', 'Sala no encontrada o contraseña incorrecta.');
}
function traducirPeerError(e) {
  if (e && e.esAppError) return e;
  const t = (e && e.type) || '';
  if (t === 'unavailable-id') return errApp('id-ocupado', 'Ya existe una sala con ese nombre y contraseña.');
  if (t === 'peer-unavailable') return errApp('sala-no-encontrada', 'Sala no encontrada o contraseña incorrecta.');
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return errApp('red', 'No hay conexión con el servidor de señalización de PeerJS. Comprueba tu conexión a internet.');
  if (t === 'browser-incompatible') return errApp('navegador', 'Este navegador no admite conexiones directas (WebRTC).');
  return errApp('desconocido', 'Error de conexión directa: ' + ((e && (e.message || e.type)) || 'desconocido'));
}

// ---------- carga de PeerJS (solo cuando hace falta) ----------
let cargaPeerJS = null;
function cargarPeerJS() {
  if (globalThis.Peer) return Promise.resolve();
  if (cargaPeerJS) return cargaPeerJS;
  cargaPeerJS = new Promise((resolve, reject) => {
    let i = 0;
    const probar = () => {
      if (i >= PEERJS_SRC.length) { cargaPeerJS = null; reject(errApp('carga-peerjs', 'No se pudo descargar PeerJS (sin conexión o bloqueado por el navegador).')); return; }
      const s = document.createElement('script');
      s.src = PEERJS_SRC[i++]; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => (globalThis.Peer ? resolve() : probar());
      s.onerror = () => { s.remove(); probar(); };
      document.head.appendChild(s);
    };
    probar();
  });
  return cargaPeerJS;
}

// ---------- servidores STUN/TURN (las credenciales TURN se piden al Worker, nunca están en el repositorio) ----------
async function obtenerIce() {
  if (iceCache && Date.now() - iceCache.t < 4 * 60 * 1000) return iceCache.v;
  const avisos = []; let turn = [];
  if (!TURN_PROXY_URL || TURN_PROXY_URL.includes('PEGA_AQUI')) {
    avisos.push('El servidor TURN no está configurado (TURN_PROXY_URL): se usará solo STUN y algunas redes móviles podrían fallar.');
  } else {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = setTimeout(() => ctl && ctl.abort(), T_TURN);
      const r = await fetch(TURN_PROXY_URL, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const arr = Array.isArray(d) ? d : (d && d.iceServers);
      const buenos = (Array.isArray(arr) ? arr : []).filter(x => x && x.urls && [].concat(x.urls).every(u => /^(stun|turn|turns):/.test(String(u))));
      if (!buenos.length) throw new Error('respuesta sin servidores');
      turn = buenos;
    } catch (e) {
      console.warn('TURN no disponible:', e && e.message);
      avisos.push('No se pudieron obtener las credenciales TURN: se intentará solo con STUN y algunas redes móviles (4G/5G) podrían fallar.');
    }
  }
  const v = { iceServers: [...STUN, ...turn], avisos };
  iceCache = { t: Date.now(), v };
  return v;
}
function nuevoPeer(id, iceServers) {
  return new Promise((resolve, reject) => {
    let listo = false;
    const p = new globalThis.Peer(id || undefined, { config: { iceServers }, debug: 0 });
    const t = setTimeout(() => { if (!listo) { try { p.destroy(); } catch (e) { /* nada */ } reject(errApp('tiempo-agotado', 'El servidor de señalización de PeerJS no responde.')); } }, T_PEER);
    p.on('open', () => { listo = true; clearTimeout(t); resolve(p); });
    p.on('error', e => { if (!listo) { clearTimeout(t); try { p.destroy(); } catch (e2) { /* nada */ } reject(traducirPeerError(e)); } });
  });
}
function cerrarConn(c) { try { if (c) c.close(); } catch (e) { /* ya cerrada */ } }

// ---------- emisión hacia el resto del juego ----------
function emitir(m) { cbs.msg.forEach(f => safe(f, m)); }
function emitirJug(l) { cbs.jug.forEach(f => safe(f, l)); }
function emitirAsync(fn) { Promise.resolve().then(fn); }
function muestraReloj(h) {
  if (typeof h !== 'number') return;
  muestras.push(h - Date.now()); if (muestras.length > 20) muestras.shift();
  offsetMs = Math.max(...muestras); // el valor más alto es el de menor latencia
}

// =====================================================================
//                         LADO ANFITRIÓN
// =====================================================================
const CLAVE_SNAP = 'impostor.peer.sala.';
function guardarSnap() {
  const s = sala; if (!s || !s.esHost) return;
  lsSet(CLAVE_SNAP + s.roomId, JSON.stringify({
    t: Date.now(), session: s.session, hostUid: s.hostUid, prueba: s.prueba, seq: s.seq, estado: s.estado, roles: s.roles,
    jugadores: [...s.jugadores.values()].map(j => ({ id: j.id, nombre: j.nombre, token: j.token, orden: j.orden }))
  }));
}
function persistir() { const s = sala; if (!s || !s.esHost) return; clearTimeout(s.persistT); s.persistT = setTimeout(guardarSnap, 250); }
function leerSnap(roomId) {
  try {
    const v = JSON.parse(lsGet(CLAVE_SNAP + roomId));
    if (v && v.hostUid === identidad().id && Date.now() - v.t < SNAP_MAX_MS && Array.isArray(v.jugadores)) return v;
  } catch (e) { /* sin snapshot válido */ }
  return null;
}
function listaPublica(s) {
  return [...s.jugadores.values()].sort((a, b) => (a.orden - b.orden))
    .map(j => ({ id: j.id, nombre: j.nombre, esAnfitrion: j.id === s.hostUid, conectado: j.conectado, orden: j.orden }));
}
function enviarA(id, obj) { const c = sala && sala.conns.get(id); if (c && c.open) { try { c.send(obj); } catch (e) { console.warn('envío:', e && e.message); } } }
function difundir(obj) { if (sala) for (const id of sala.conns.keys()) enviarA(id, obj); }
function difundirJug() {
  const s = sala; if (!s) return;
  const l = listaPublica(s);
  difundir({ t: 'jug', lista: l });
  emitirAsync(() => { if (sala === s) emitirJug(l.map(x => ({ ...x, yo: x.id === s.hostUid }))); });
}
function difundirEstado() {
  const s = sala; if (!s) return;
  const copia = JSON.parse(JSON.stringify(s.estado));
  difundir({ t: 'estado', estado: copia, h: Date.now() });
  emitirAsync(() => { if (sala === s) emitir({ tipo: 'estado', ...copia }); });
}
function enviarRol(id) {
  const s = sala; if (!s) return;
  const doc = s.roles[id] || null;
  if (id === s.hostUid) emitirAsync(() => { if (sala === s) emitir(doc ? { tipo: 'rol', ...doc } : { tipo: 'rol', vacio: true }); });
  else enviarA(id, { t: 'rol', rol: doc });
}
function aplicarEstado(campos) {
  const s = sala;
  for (const k of Object.keys(campos || {})) { if (campos[k] === null || campos[k] === undefined) delete s.estado[k]; else s.estado[k] = campos[k]; }
}
function marcar(id, conectado) {
  const j = sala && sala.jugadores.get(id); if (!j) return;
  j.conectado = conectado; j.ultimo = Date.now();
  difundirJug();
}
function alConectar(conn) {
  const s = sala;
  if (!s || !s.esHost) { cerrarConn(conn); return; }
  conn.__n = 0; conn.__t0 = Date.now();
  const espera = setTimeout(() => { if (!conn.__uid) cerrarConn(conn); }, 10000);
  conn.on('data', d => { try { alDatoHost(conn, d); } catch (e) { console.error(e); } });
  conn.on('close', () => {
    clearTimeout(espera);
    const id = conn.__uid;
    if (id && sala === s && s.conns.get(id) === conn) { s.conns.delete(id); marcar(id, false); }
  });
  conn.on('error', e => console.warn('conexión:', e && e.message));
}
function rechazar(conn, motivo) { try { conn.send({ t: 'no', motivo }); } catch (e) { /* nada */ } setTimeout(() => cerrarConn(conn), 300); }
function alDatoHost(conn, d) {
  const s = sala; if (!s || !d || typeof d !== 'object') return;
  const ahoraMs = Date.now();
  if (ahoraMs - conn.__t0 > 10000) { conn.__t0 = ahoraMs; conn.__n = 0; }
  if (++conn.__n > 80) return; // limitador sencillo
  let tam = 0; try { tam = JSON.stringify(d).length; } catch (e) { return; }
  if (tam > MAX_MENSAJE) return;
  if (d.t === 'hola') { alHola(conn, d); return; }
  const id = conn.__uid; if (!id) return;
  const j = s.jugadores.get(id); if (j) j.ultimo = ahoraMs;
  if (d.t === 'ping') { enviarA(id, { t: 'pong', h: ahoraMs }); if (j && !j.conectado) marcar(id, true); }
  else if (d.t === 'msg') {
    const { t, ...m } = d;
    if (typeof m.tipo !== 'string' || !PERMITIDOS.includes(m.tipo)) return;
    emitir({ ...m, de: id }); // el remitente lo pone el anfitrión: no se puede suplantar a otro
  } else if (d.t === 'adios') {
    s.conns.delete(id); s.jugadores.delete(id); persistir(); cerrarConn(conn); difundirJug();
  }
}
function alHola(conn, d) {
  const s = sala;
  const id = d.id, token = d.token;
  if (typeof id !== 'string' || !/^p-[0-9a-f]{16}$/.test(id) || typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) { rechazar(conn, 'datos'); return; }
  let j = s.jugadores.get(id);
  if (j) {
    // Jugador conocido que vuelve (recarga o corte): se comprueba su token secreto, no hace falta la contraseña.
    if (j.token !== token) { rechazar(conn, 'datos'); return; }
    const nom = String(d.nombre || '').trim();
    if (nom && nom.length <= 24) j.nombre = nom;
    const vieja = s.conns.get(id); if (vieja && vieja !== conn) cerrarConn(vieja);
  } else {
    const nombre = String(d.nombre || '').trim();
    if (!nombre || nombre.length > 24) { rechazar(conn, 'datos'); return; }
    if (d.pw !== s.prueba) { rechazar(conn, 'contrasena'); return; } // el anfitrión valida la contraseña
    if (s.estado.phase !== 'lobby') { rechazar(conn, 'partida-en-curso'); return; }
    if (s.jugadores.size >= MAX_JUGADORES) { rechazar(conn, 'sala-llena'); return; }
    if ([...s.jugadores.values()].some(x => norm(x.nombre) === norm(nombre))) { rechazar(conn, 'nombre-repetido'); return; }
    j = { id, nombre, token, orden: ++s.seq, conectado: true, ultimo: Date.now() };
    s.jugadores.set(id, j);
  }
  conn.__uid = id; s.conns.set(id, conn);
  j.conectado = true; j.ultimo = Date.now();
  conn.send({ t: 'ok', roomId: s.roomId, hostId: s.hostUid, session: s.session, h: Date.now() });
  conn.send({ t: 'jug', lista: listaPublica(s) });
  conn.send({ t: 'estado', estado: JSON.parse(JSON.stringify(s.estado)), h: Date.now() });
  enviarRol(id);
  persistir(); difundirJug();
}
function vigilar() {
  const s = sala; if (!s || !s.esHost) return;
  const ya = Date.now();
  for (const j of s.jugadores.values()) {
    if (j.id === s.hostUid || !j.conectado) continue;
    if (ya - j.ultimo > SILENCIO_MS) { const c = s.conns.get(j.id); s.conns.delete(j.id); cerrarConn(c); marcar(j.id, false); }
  }
  if (s.peer && s.peer.disconnected && !s.peer.destroyed) { try { s.peer.reconnect(); } catch (e) { /* se reintenta */ } }
}
async function abrirComoAnfitrion(roomId, prueba, nombreJugador, snap, ice) {
  const yo = identidad();
  let peer = null;
  const limite = Date.now() + (snap ? 20000 : 0); // si recargué mi propia pestaña, PeerJS puede tardar en liberar el ID
  for (;;) {
    try { peer = await nuevoPeer(PREFIJO + roomId, ice.iceServers); break; }
    catch (e) {
      if (e.code === 'id-ocupado') { if (Date.now() < limite) { await dormir(2000); continue; } throw errApp('sala-existe', 'Ya existe una sala con ese nombre y contraseña. Elige otra combinación.'); }
      throw e;
    }
  }
  const s = { esHost: true, roomId, session: (snap && snap.session) || hex(12), hostUid: yo.id, prueba, peer, ice, jugadores: new Map(), conns: new Map(),
    estado: (snap && snap.estado) || { phase: 'lobby', round: 0 }, roles: (snap && snap.roles) || {}, seq: (snap && snap.seq) || 0, timers: [] };
  if (snap) snap.jugadores.forEach(j => s.jugadores.set(j.id, { ...j, conectado: false, ultimo: 0 }));
  const previo = s.jugadores.get(yo.id);
  s.jugadores.set(yo.id, { id: yo.id, nombre: (nombreJugador || (previo && previo.nombre) || 'Anfitrión').trim(), token: yo.token, orden: previo ? previo.orden : ++s.seq, conectado: true, ultimo: Date.now() });
  sala = s;
  peer.on('connection', alConectar);
  peer.on('error', e => console.warn('PeerJS:', e && (e.type || e.message)));
  peer.on('disconnected', () => { try { if (sala === s && !peer.destroyed) peer.reconnect(); } catch (e) { /* se reintenta en vigilar */ } });
  s.timers.push(setInterval(vigilar, 5000));
  persistir();
  setTimeout(() => { if (sala === s) { difundirJug(); difundirEstado(); enviarRol(s.hostUid); } }, 0);
  return { transporte: 'peer', roomId, uid: yo.id, esAnfitrion: true, reanudada: !!snap, avisos: ice.avisos.slice() };
}
async function crearSala(nombre, password, nombreJugador) {
  validarDatos(nombre, password, nombreJugador);
  try {
    await cargarPeerJS();
    const roomId = await hashSala(nombre, password);
    const prueba = await pruebaClave(nombre, password);
    const ice = await obtenerIce();
    return await abrirComoAnfitrion(roomId, prueba, nombreJugador, leerSnap(roomId), ice);
  } catch (e) { throw e && e.esAppError ? e : traducirPeerError(e); }
}

// =====================================================================
//                         LADO JUGADOR
// =====================================================================
function holaDe(s, reanudar) {
  const yo = identidad();
  const h = { t: 'hola', id: yo.id, token: yo.token, nombre: s.nombre };
  if (!reanudar && s.prueba) h.pw = s.prueba;
  return h;
}
function conectarAlHost(s, peer, hola) {
  return new Promise((resolve, reject) => {
    let fin = false;
    const conn = peer.connect(PREFIJO + s.roomId, { reliable: true, serialization: 'json' });
    const onErr = e => { if (e && e.type === 'peer-unavailable') { cerrarConn(conn); terminar(reject, errApp('host-ausente', 'No se encuentra al anfitrión de la sala.')); } };
    const t = setTimeout(() => { cerrarConn(conn); terminar(reject, errApp('tiempo-agotado', 'No se pudo conectar con el anfitrión (tiempo agotado). Puede que tu red o la suya bloquee las conexiones directas.')); }, T_CONN);
    function terminar(fn, v) { if (fin) return; fin = true; clearTimeout(t); try { peer.removeListener('error', onErr); } catch (e) { /* nada */ } fn(v); }
    peer.on('error', onErr);
    conn.on('open', () => { try { conn.send(hola); } catch (e) { terminar(reject, traducirPeerError(e)); } });
    conn.on('data', d => {
      if (!fin) {
        if (d && d.t === 'ok') terminar(resolve, { conn, ok: d });
        else if (d && d.t === 'no') { cerrarConn(conn); terminar(reject, errMotivo(d)); }
        return;
      }
      alDatoJugador(s, conn, d);
    });
    conn.on('close', () => { if (!fin) terminar(reject, errApp('red', 'Se cerró la conexión con el anfitrión.')); else alCerrarConnJugador(s, conn); });
    conn.on('error', e => { if (!fin) terminar(reject, traducirPeerError(e)); });
  });
}
function alDatoJugador(s, conn, d) {
  if (!d || typeof d !== 'object' || s.cerrado || sala !== s) return;
  s.ultimoRx = Date.now();
  switch (d.t) {
    case 'jug': if (Array.isArray(d.lista)) emitirJug(d.lista.map(x => ({ ...x, yo: x.id === s.id }))); break;
    case 'estado': muestraReloj(d.h); if (d.estado && typeof d.estado === 'object') emitir({ tipo: 'estado', ...d.estado }); break;
    case 'rol': emitir(d.rol ? { tipo: 'rol', ...d.rol } : { tipo: 'rol', vacio: true }); break;
    case 'pong': muestraReloj(d.h); break;
    case 'cerrada': cierreRemoto(s); break;
    case 'expulsado': if (sala === s) { sala = null; limpiar(s); emitir({ tipo: 'expulsado' }); } break;
    default: break;
  }
}
function alCerrarConnJugador(s, conn) { if (sala === s && !s.cerrado && (s.conn === conn || !s.conn)) perdida(s); }
function aceptarConexion(s, r) {
  s.conn = r.conn; s.hostUid = r.ok.hostId; s.session = r.ok.session; s.ultimoRx = Date.now(); muestraReloj(r.ok.h);
  if (!s.hbT) s.hbT = setInterval(() => {
    if (sala !== s || s.cerrado) return;
    if (s.conn && s.conn.open) { try { s.conn.send({ t: 'ping' }); } catch (e) { /* se detecta por silencio */ } }
    if (Date.now() - s.ultimoRx > SILENCIO_MS) perdida(s);
  }, HB_MS);
}
function perdida(s) {
  if (sala !== s || s.cerrado || s.recon) return;
  s.recon = true; cbs.con.forEach(f => safe(f, false));
  cerrarConn(s.conn); s.conn = null;
  reconectar(s);
}
async function asegurarPeer(s) {
  const p = s.peer;
  if (p && !p.destroyed && !p.disconnected) return p;
  if (p && !p.destroyed && p.disconnected) { try { p.reconnect(); await dormir(1200); if (!p.disconnected) return p; } catch (e) { /* se crea uno nuevo */ } }
  try { if (p) p.destroy(); } catch (e) { /* nada */ }
  s.peer = await nuevoPeer(null, s.ice.iceServers);
  return s.peer;
}
async function reconectar(s) {
  for (let i = 0; i < 60 && sala === s && !s.cerrado; i++) {
    await dormir(Math.min(1500 + i * 700, 8000));
    if (sala !== s || s.cerrado) return;
    try {
      const peer = await asegurarPeer(s);
      const r = await conectarAlHost(s, peer, holaDe(s, true));
      if (sala !== s || s.cerrado) { cerrarConn(r.conn); return; }
      aceptarConexion(s, r); s.recon = false; cbs.con.forEach(f => safe(f, true));
      return;
    } catch (e) {
      if (e && e.code === 'sala-no-encontrada') { cierreRemoto(s); return; } // el anfitrión responde y ya no tiene este jugador/sala
      // 'host-ausente' y demás: se sigue intentando (el anfitrión puede estar recargando la página)
    }
  }
  if (sala === s) cierreRemoto(s);
}
function limpiar(s) {
  s.cerrado = true;
  clearInterval(s.hbT); clearTimeout(s.persistT); (s.timers || []).forEach(clearInterval);
  if (s.conns) s.conns.forEach(cerrarConn);
  cerrarConn(s.conn);
  try { if (s.peer) s.peer.destroy(); } catch (e) { /* nada */ }
}
function cierreRemoto(s) {
  if (sala !== s) return;
  sala = null; limpiar(s);
  emitir({ tipo: 'sala-cerrada' });
}
async function unirse(nombre, password, nombreJugador) {
  validarDatos(nombre, password, nombreJugador);
  let peer = null;
  try {
    await cargarPeerJS();
    const roomId = await hashSala(nombre, password);
    const prueba = await pruebaClave(nombre, password);
    const ice = await obtenerIce();
    peer = await nuevoPeer(null, ice.iceServers);
    const yo = identidad();
    const s = { esHost: false, roomId, id: yo.id, nombre: nombreJugador.trim(), prueba, peer, ice, conn: null, recon: false, cerrado: false, ultimoRx: Date.now() };
    sala = s;
    const r = await conectarAlHost(s, peer, holaDe(s, false));
    aceptarConexion(s, r);
    return { transporte: 'peer', roomId, uid: yo.id, esAnfitrion: false, reanudada: false, avisos: ice.avisos.slice() };
  } catch (e) {
    if (sala && !sala.esHost) { const s = sala; sala = null; limpiar(s); }
    else if (peer) { try { peer.destroy(); } catch (e2) { /* nada */ } }
    if (e && e.code === 'host-ausente') throw errApp('sala-no-encontrada', 'Sala no encontrada o contraseña incorrecta.');
    throw e && e.esAppError ? e : traducirPeerError(e);
  }
}
// Volver a la sala tras recargar: el anfitrión recupera su sala guardada; el jugador se reconecta con su token secreto.
async function reanudar(sesion) {
  const roomId = sesion && sesion.roomId;
  if (!/^[0-9a-f]{64}$/.test(roomId || '')) throw errApp('sala-no-encontrada', 'La sesión guardada no es válida.');
  try {
    await cargarPeerJS();
    const ice = await obtenerIce();
    const snap = leerSnap(roomId);
    if (snap) {
      const yo = snap.jugadores.find(j => j.id === identidad().id);
      return await abrirComoAnfitrion(roomId, snap.prueba, yo ? yo.nombre : null, snap, ice);
    }
    const peer = await nuevoPeer(null, ice.iceServers);
    const yo = identidad();
    const s = { esHost: false, roomId, id: yo.id, nombre: '', prueba: null, peer, ice, conn: null, recon: false, cerrado: false, ultimoRx: Date.now() };
    sala = s;
    try {
      const r = await conectarAlHost(s, peer, holaDe(s, true));
      aceptarConexion(s, r);
    } catch (e) { sala = null; limpiar(s); throw e; }
    return { transporte: 'peer', roomId, uid: yo.id, esAnfitrion: false, reanudada: true, avisos: ice.avisos.slice() };
  } catch (e) {
    if (e && e.code === 'host-ausente') throw errApp('host-ausente', 'No se encuentra al anfitrión de la sala. Puede que haya cerrado la página; inténtalo de nuevo en unos segundos.');
    throw e && e.esAppError ? e : traducirPeerError(e);
  }
}

// =====================================================================
//                         INTERFAZ COMÚN
// =====================================================================
async function enviar(destino, mensaje) {
  const s = sala; if (!s) throw errApp('sin-sala', 'No estás en ninguna sala.');
  const { tipo, ...resto } = mensaje || {};
  if (!s.esHost) {
    if (destino !== 'host') throw errApp('no-anfitrion', 'Solo el anfitrión puede enviar a otros jugadores.');
    if (!s.conn || !s.conn.open) throw errApp('sin-conexion', 'Sin conexión con el anfitrión. Reconectando…');
    if (JSON.stringify(resto).length > 1500) throw errApp('mensaje-largo', 'El mensaje es demasiado largo.');
    s.conn.send({ t: 'msg', tipo, ...resto });
    return;
  }
  if (destino === 'todos') {
    if (tipo === 'estado') { aplicarEstado(resto); persistir(); difundirEstado(); }
    else if (tipo === 'reparto') {
      s.roles = mensaje.roles ? JSON.parse(JSON.stringify(mensaje.roles)) : {};
      for (const id of Object.keys(s.roles)) s.roles[id].session = s.session;
      aplicarEstado(mensaje.estado || {});
      persistir();
      for (const j of s.jugadores.values()) enviarRol(j.id);
      difundirEstado();
    } else throw errApp('destino', 'Mensaje no válido.');
  } else if (tipo === 'rol') {
    s.roles[destino] = { ...resto, session: s.session };
    persistir(); enviarRol(destino);
  } else throw errApp('destino', 'Destino no válido.');
}
// El anfitrión avisa al jugador, lo borra de la sala y cierra su conexión.
async function expulsar(id) {
  const s = sala; if (!s || !s.esHost) throw errApp('no-anfitrion', 'Solo el anfitrión puede expulsar jugadores.');
  if (!id || id === s.hostUid || !s.jugadores.has(id)) throw errApp('destino', 'Jugador no válido.');
  const c = s.conns.get(id);
  if (c) { try { c.send({ t: 'expulsado' }); } catch (e) { /* nada */ } }
  s.conns.delete(id); s.jugadores.delete(id); delete s.roles[id];
  persistir(); difundirJug();
  if (c) setTimeout(() => cerrarConn(c), 300);
}
async function salir() {
  const s = sala; if (!s) return;
  sala = null;
  if (!s.esHost && s.conn && s.conn.open) { try { s.conn.send({ t: 'adios' }); } catch (e) { /* nada */ } await dormir(150); }
  limpiar(s);
}
async function cerrarSala() {
  const s = sala; if (!s) return;
  if (!s.esHost) return salir();
  difundir({ t: 'cerrada' });
  sala = null; lsDel(CLAVE_SNAP + s.roomId);
  await dormir(250);
  limpiar(s);
}
async function leerRoles() { return sala && sala.esHost ? JSON.parse(JSON.stringify(sala.roles)) : {}; }

export default {
  nombre: 'peer',
  crearSala, unirse, reanudar, enviar, expulsar, salir, cerrarSala, leerRoles,
  alRecibir(cb) { cbs.msg.push(cb); },
  alCambiarJugadores(cb) { cbs.jug.push(cb); },
  alConexion(cb) { cbs.con.push(cb); },
  ahora() { return Date.now() + (sala && !sala.esHost ? offsetMs : 0); },
  miId() { return identidad().id; }
};
