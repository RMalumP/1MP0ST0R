// js/transport.js — Capa de transporte (fachada). El resto del juego solo habla con "Transport".
// Interfaz:
//   crearSala(nombre, password, nombreJugador) -> Promise<{ transporte, roomId, uid, esAnfitrion, reanudada, avisos }>
//   unirse(nombre, password, nombreJugador)    -> Promise<{ ... }>
//   reanudar({ roomId, transporte })           -> Promise<{ ... }>   (volver tras recargar la página)
//   enviar(destino, mensaje)                   -> Promise   destino: 'host' | 'todos' | id de jugador
//   expulsar(id) (solo anfitrión)
//   alRecibir(cb) · alCambiarJugadores(cb) · alConexion(cb) · salir() · cerrarSala() · ahora() · miId() · leerRoles()
// Debajo hay dos transportes intercambiables (módulos ES que se cargan bajo demanda, para que el modo local siga
// funcionando con doble clic): js/transport-firebase.js (principal) y js/transport-peer.js (respaldo PeerJS).
//
// Selección automática:
//  · Anfitrión: prueba Firebase (inicio de sesión anónimo + escritura de prueba) con un límite de ~5 s; si falla o
//    se agota, crea la sala por PeerJS.
//  · Jugador: busca la sala en Firebase y, en paralelo, intenta conectar por PeerJS; se queda con el primero que responda.
//    (PeerJS arranca con una pequeña ventaja de tiempo para Firebase: así, si Firebase responde enseguida, no se piden
//    credenciales TURN al Worker de Cloudflare sin necesidad.)
//  · Todos los jugadores de una sala acaban en el mismo transporte: el que eligió el anfitrión.
const Transport = (function () {
  const T_PROBE = 5000;    // ms máx. de la prueba de Firebase del anfitrión
  const PEER_DELAY = 800;  // ms de ventaja de Firebase al unirse, antes de lanzar también PeerJS
  const ETIQUETAS = { firebase: '', peer: '' };
  const cbs = { msg: [], jug: [], con: [] };
  const cargados = {};
  let activo = null; // { nombre, impl }

  function errApp(code, message) { const e = new Error(message); e.code = code; e.esAppError = true; return e; }
  function conTiempo(p, ms, mensaje) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(errApp('tiempo-agotado', mensaje)), ms);
      Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  }
  function cargar(nombre) {
    if (!cargados[nombre]) {
      const importar = nombre === 'firebase' ? import('./transport-firebase.js') : import('./transport-peer.js');
      cargados[nombre] = importar.then(m => adjuntar(nombre, m.default)).catch(e => {
        delete cargados[nombre];
        const err = errApp('carga', nombre === 'firebase'
          ? 'No se pudo cargar Firebase (sin conexión, o el navegador no permite módulos desde este origen).'
          : 'No se pudo cargar el modo de respaldo (PeerJS).');
        err.causa = e; throw err;
      });
    }
    return cargados[nombre];
  }
  function adjuntar(nombre, impl) {
    const vale = () => !activo || activo.impl === impl; // se ignora lo que llegue de un transporte descartado
    impl.alRecibir(m => { if (vale()) cbs.msg.forEach(f => f(m)); });
    impl.alCambiarJugadores(l => { if (vale()) cbs.jug.forEach(f => f(l)); });
    impl.alConexion(c => { if (vale()) cbs.con.forEach(f => f(c)); });
    return impl;
  }
  function fijar(nombre, impl, res) { activo = { nombre, impl }; res.transporte = nombre; return res; }

  // Errores tras los cuales tiene sentido probar el otro transporte (problemas de conexión/configuración, no de datos).
  const CAMBIAR = ['carga', 'config-incompleta', 'config', 'red', 'tiempo-agotado', 'auth', 'dominio-no-autorizado', 'permiso-denegado', 'desconocido', 'contexto-inseguro'];
  // Errores que indican que la sala SÍ existe en ese transporte (o que los datos son inválidos): no se prueba el otro.
  const DEFINITIVOS = ['datos', 'sala-existe', 'nombre-repetido', 'partida-en-curso', 'sala-llena'];
  function detalle(n, e) { return e ? n + ': ' + (e.message || e.code) : ''; }
  function combinar(eFb, ePeer, accion) {
    const es = [eFb, ePeer].filter(Boolean);
    const def = es.find(e => DEFINITIVOS.includes(e.code)); if (def) return def;
    if (es.length && es.every(e => e.code === 'sala-no-encontrada')) return errApp('sala-no-encontrada', 'Sala no encontrada o contraseña incorrecta.');
    const det = [detalle('Conexión principal', eFb), detalle('Conexión de respaldo', ePeer)].filter(Boolean).join(' · ');
    // Mensaje corto para el jugador; las causas posibles y el detalle técnico van aparte (botón «Ver detalles»).
    const e = accion === 'crear'
      ? errApp('sin-transporte', 'No se pudo crear la sala. Comprueba tu conexión a internet e inténtalo de nuevo.')
      : errApp('sin-transporte', 'No se pudo entrar en la sala. Revisa el nombre y la contraseña, y que el anfitrión ya la haya creado.');
    e.detalle = (accion === 'crear'
      ? 'Posibles causas: no tienes conexión a internet; el servicio de salas no está bien configurado o este dominio no está autorizado; tu red bloquea las conexiones directas.'
      : 'Posibles causas: el nombre de sala o la contraseña no son correctos; el anfitrión todavía no ha creado la sala; tu conexión (o la del anfitrión) no permite conectar.') + '\nDetalle técnico → ' + det;
    return e;
  }

  async function crearSala(nombre, password, nombreJugador) {
    let eFb = null;
    try {
      const fb = await cargar('firebase');
      await conTiempo(fb.probar(), T_PROBE, 'Firebase no respondió a tiempo.');
      return fijar('firebase', fb, await fb.crearSala(nombre, password, nombreJugador));
    } catch (e) { if (!CAMBIAR.includes(e && e.code)) throw e; eFb = e; }
    try {
      const peer = await cargar('peer');
      const res = fijar('peer', peer, await peer.crearSala(nombre, password, nombreJugador));
      // El anfitrión debe saber POR QUÉ no se usó Firebase (p. ej. reglas sin publicar, dominio no autorizado, sin configurar).
      res.avisos = [...(res.avisos || []), 'Firebase no está disponible (' + (eFb.message || eFb.code) + ') y se usa el modo de respaldo PeerJS.'];
      return res;
    } catch (e2) { throw combinar(eFb, e2, 'crear'); }
  }
  function unirse(nombre, password, nombreJugador) {
    return new Promise((resolve, reject) => {
      let hecho = false, pendientes = 2, peerLanzado = false;
      const errores = {};
      const ganar = (n, impl, res) => {
        if (hecho) { impl.salir().catch(() => {}); return; } // el otro ya ganó: se deshace esta entrada
        hecho = true; resolve(fijar(n, impl, res));
      };
      const fallar = (n, e) => {
        errores[n] = e;
        if (hecho) return;
        if (DEFINITIVOS.includes(e && e.code)) { hecho = true; reject(e); return; }
        if (--pendientes === 0) { hecho = true; reject(combinar(errores.firebase, errores.peer, 'unirse')); }
      };
      const lanzarPeer = () => {
        if (peerLanzado) return; peerLanzado = true;
        cargar('peer').then(p => p.unirse(nombre, password, nombreJugador).then(r => ganar('peer', p, r))).catch(e => fallar('peer', e));
      };
      cargar('firebase').then(fb => fb.unirse(nombre, password, nombreJugador).then(r => ganar('firebase', fb, r)))
        .catch(e => { fallar('firebase', e); if (!hecho) lanzarPeer(); });
      setTimeout(() => { if (!hecho) lanzarPeer(); }, PEER_DELAY);
    });
  }
  async function reanudar(sesion) {
    const nombre = sesion && sesion.transporte === 'peer' ? 'peer' : 'firebase';
    const impl = await cargar(nombre);
    return fijar(nombre, impl, await impl.reanudar(sesion));
  }
  const sinSala = () => Promise.reject(errApp('sin-sala', 'No estás en ninguna sala.'));
  async function terminar(metodo) { const a = activo; if (!a) return; try { await a.impl[metodo](); } finally { if (activo === a) activo = null; } }

  return {
    get transporte() { return activo ? activo.nombre : 'firebase'; },
    etiqueta() { return ETIQUETAS[activo ? activo.nombre : 'firebase']; },
    crearSala, unirse, reanudar,
    enviar: (d, m) => activo ? activo.impl.enviar(d, m) : sinSala(),
    expulsar: id => activo ? activo.impl.expulsar(id) : sinSala(),
    soportaTomarSala: () => !!(activo && activo.impl.tomarSala),
    tomarSala: () => activo && activo.impl.tomarSala ? activo.impl.tomarSala() : sinSala(),
    salir: () => terminar('salir'),
    cerrarSala: () => terminar('cerrarSala'),
    leerRoles: () => activo ? activo.impl.leerRoles() : Promise.resolve({}),
    alRecibir(f) { cbs.msg.push(f); },
    alCambiarJugadores(f) { cbs.jug.push(f); },
    alConexion(f) { cbs.con.push(f); },
    ahora: () => activo ? activo.impl.ahora() : Date.now(),
    miId: () => activo ? activo.impl.miId() : null
  };
})();
