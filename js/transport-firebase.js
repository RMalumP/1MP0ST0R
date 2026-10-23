// js/transport-firebase.js — Transporte principal: Firebase Realtime Database + Autenticación anónima.
// Es un módulo ES que solo se carga cuando el jugador entra en modo online (lo hace js/transport.js).
// El modo local no lo necesita y sigue funcionando abriendo index.html con doble clic.

// ===== CONFIGURACIÓN: pega aquí los valores de tu proyecto de Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyDwEogM2aCgegFhyRa24gK7E45-I1dHmzE",
  authDomain: "impostor-11e9f.firebaseapp.com",
  databaseURL: "https://impostor-11e9f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "impostor-11e9f",
  appId: "1:728640662006:web:40c0c6037a713b6a593fd7"
};
// ===========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, child, get, set, update, remove, push, onValue, onChildAdded, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const MAX_JUGADORES = 20;
const T_AUTH = 10000;   // ms para iniciar sesión anónima
const T_RED = 8000;     // ms para lecturas iniciales
const LATIDO_MS = 60000;      // cada minuto, cada móvil conectado marca la sala como "viva"
const SALA_LIBRE_MS = 600000; // sala sin nadie conectado más de 10 minutos = libre (lo aplican también las reglas)

let app = null, auth = null, db = null, uid = null, offsetMs = 0, iniciado = null;
let sala = null; // { roomId, session, esHost, hostUid, nombreJugador, unsubs, jugadoresRaw }
const cbs = { msg: [], jug: [], con: [] };

// ---------- utilidades ----------
function errApp(code, message) { const e = new Error(message); e.code = code; e.esAppError = true; return e; }
function esPermiso(e) { return !!e && (e.code === 'PERMISSION_DENIED' || e.code === 'permission-denied' || /permission[_ ]denied/i.test(e.message || '')); }
function traducir(e) {
  if (e && e.esAppError) return e;
  const c = (e && e.code) || '';
  if (c === 'auth/unauthorized-domain') return errApp('dominio-no-autorizado', 'Este dominio no está autorizado en Firebase (Authentication → Settings → Dominios autorizados).');
  if (c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation') return errApp('auth', 'La autenticación anónima no está activada en Firebase (Authentication → Sign-in method → Anónimo).');
  if (c === 'auth/network-request-failed') return errApp('red', 'No hay conexión con Firebase. Comprueba tu conexión a internet.');
  if (c === 'auth/invalid-api-key' || c === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') return errApp('config', 'La apiKey de Firebase no es válida. Revisa firebaseConfig en js/transport-firebase.js.');
  if (c === 'auth/configuration-not-found') return errApp('config', 'Firebase Authentication no está configurado en el proyecto.');
  if (esPermiso(e)) return errApp('permiso-denegado', 'Firebase ha rechazado la operación por las reglas de seguridad. ¿Has publicado las reglas de la base de datos?');
  return errApp('desconocido', 'Error de conexión: ' + ((e && e.message) || 'desconocido'));
}
function conTiempo(promesa, ms, mensaje) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(errApp('tiempo-agotado', mensaje || 'Firebase no responde.')), ms);
    Promise.resolve(promesa).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
function safe(f, ...a) { try { f(...a); } catch (e) { console.error(e); } }
function nuevoId() {
  const b = new Uint8Array(12); crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
// ID de sala = SHA-256(nombre normalizado + contraseña). La contraseña nunca se guarda ni se envía.
async function hashSala(nombre, password) {
  if (!(globalThis.crypto && crypto.subtle)) throw errApp('contexto-inseguro', 'Este navegador solo permite el modo online desde una página https.');
  const norm = String(nombre).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  const datos = new TextEncoder().encode('impostor-v1|' + norm + '|' + String(password).trim());
  const buf = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2, '0')).join('');
}
const P = (...partes) => ['rooms', ...partes].join('/');
const R = (roomId, ...partes) => ref(db, P(roomId, ...partes));
function validarDatos(nombre, password, jugador) {
  if (String(nombre).trim().length < 3) throw errApp('datos', 'El nombre de la sala debe tener al menos 3 caracteres.');
  if (String(password).trim().length < 4) throw errApp('datos', 'La contraseña debe tener al menos 4 caracteres.');
  const j = String(jugador || '').trim();
  if (j.length < 1 || j.length > 24) throw errApp('datos', 'Escribe tu nombre (máximo 24 caracteres).');
}

// ---------- inicio de Firebase + sesión anónima ----------
function configCompleta() { return Object.values(firebaseConfig).every(v => typeof v === 'string' && v && !v.includes('PEGA_AQUI')); }
function iniciar() {
  if (iniciado) return iniciado;
  iniciado = (async () => {
    if (!configCompleta()) throw errApp('config-incompleta', 'Falta configurar Firebase: pega tus valores en firebaseConfig (js/transport-firebase.js).');
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    try { await conTiempo(signInAnonymously(auth), T_AUTH, 'Firebase no responde (¿sin conexión?).'); }
    catch (e) { throw traducir(e); }
    uid = auth.currentUser.uid;
    onValue(ref(db, '.info/serverTimeOffset'), s => { offsetMs = Number(s.val()) || 0; });
    onValue(ref(db, '.info/connected'), s => {
      const conectado = s.val() === true;
      if (conectado && sala) reafirmarPresencia();
      cbs.con.forEach(f => safe(f, conectado));
    });
    return true;
  })();
  iniciado.catch(() => { iniciado = null; });
  return iniciado;
}

// ---------- presencia ----------
function refOnline() { return ref(db, P(sala.roomId, 'players', uid, 'online')); }
async function registrarDesconexion() {
  try {
    await onDisconnect(refOnline()).set(false);
    // Al desconectarse se anota también la hora: así la sala "caduca" 5 min después de que salga el último.
    await onDisconnect(ref(db, P(sala.roomId, 'beat'))).set(serverTimestamp());
  } catch (e) { console.warn('onDisconnect:', e); }
}
async function latido() {
  if (!sala) return;
  try { await set(ref(db, P(sala.roomId, 'beat')), serverTimestamp()); } catch (e) { console.warn('latido:', e && e.message); }
}
async function reafirmarPresencia() {
  if (!sala) return;
  try { await update(ref(db, P(sala.roomId, 'players', uid)), { online: true }); } catch (e) { console.warn('presencia:', e); }
  registrarDesconexion(); latido();
}

// ---------- entrar en una sala (crea/actualiza mi ficha de jugador y suscribe) ----------
async function entrar(roomId, session, hostUid, nombreJugador) {
  const pRef = ref(db, P(roomId, 'players', uid));
  try {
    const actual = await conTiempo(get(pRef), T_RED, 'Firebase no responde.');
    if (actual.exists() && actual.val().session === session) await update(pRef, { name: nombreJugador, online: true });
    else await set(pRef, { name: nombreJugador, joinedAt: serverTimestamp(), session, online: true });
  } catch (e) {
    if (esPermiso(e)) throw errApp('partida-en-curso', 'No se pudo entrar: la partida ya ha empezado o la sala ya no existe.');
    throw traducir(e);
  }
  sala = { roomId, session, esHost: hostUid === uid, hostUid, nombreJugador, unsubs: [], jugadoresRaw: {} };
  await registrarDesconexion();
  await latido();
  sala.latidoT = setInterval(latido, LATIDO_MS);
  suscribir();
  return { transporte: 'firebase', roomId, uid, esAnfitrion: sala.esHost, nombreSala: null };
}
function emitir(m) { cbs.msg.forEach(f => safe(f, m)); }
function emitirJugadores() {
  if (!sala) return;
  const lista = Object.entries(sala.jugadoresRaw)
    .filter(([, v]) => v && v.session === sala.session)
    .map(([id, v]) => ({ id, nombre: v.name, esAnfitrion: id === sala.hostUid, conectado: v.online === true, yo: id === uid, orden: Number(v.joinedAt) || 0 }))
    .sort((a, b) => (a.orden - b.orden) || (a.id < b.id ? -1 : 1));
  cbs.jug.forEach(f => safe(f, lista));
}
function suscribir() {
  const s = sala;
  const escuchar = (r, cb) => { s.unsubs.push(onValue(r, cb, e => console.warn('Lectura rechazada en ' + r.key + ':', e && e.message))); };
  escuchar(R(s.roomId, 'meta'), snap => {
    if (sala !== s) return;
    if (!snap.exists() || snap.val().session !== s.session) { emitir({ tipo: 'sala-cerrada' }); return; }
    if (s.hostUid !== snap.val().host) { s.hostUid = snap.val().host; s.esHost = s.hostUid === uid; emitirJugadores(); if (s.esHost) recordarSala(s.roomId); emitir({ tipo: 'anfitrion', esAnfitrion: s.esHost }); }
  });
  escuchar(R(s.roomId, 'players'), snap => {
    if (sala !== s) return;
    s.jugadoresRaw = snap.val() || {};
    // Si mi ficha desaparece sin haber salido yo, el anfitrión me ha expulsado.
    if (s.jugadoresRaw[uid]) s.vistoYo = true;
    else if (s.vistoYo && !s.esHost) { s.vistoYo = false; emitir({ tipo: 'expulsado' }); return; }
    emitirJugadores();
  });
  escuchar(R(s.roomId, 'state'), snap => { if (sala !== s || !snap.exists()) return; emitir({ tipo: 'estado', ...snap.val() }); });
  escuchar(R(s.roomId, 'roles', uid), snap => {
    if (sala !== s) return;
    const v = snap.val();
    if (v && v.session === s.session) emitir({ tipo: 'rol', ...v });
    else emitir({ tipo: 'rol', vacio: true });
  });
  if (s.esHost) {
    s.unsubs.push(onChildAdded(R(s.roomId, 'inbox'), snap => {
      if (sala !== s) return;
      const v = snap.val(); if (!v) return;
      let datos = {}; try { datos = JSON.parse(v.datos || '{}'); } catch (e) { /* mensaje corrupto: se ignora */ }
      remove(snap.ref).catch(() => {});
      emitir({ ...datos, tipo: v.tipo, de: v.from });
    }, e => console.warn('Lectura de buzón rechazada:', e && e.message)));
  }
}
function desuscribir(s) { (s.unsubs || []).forEach(u => { try { u(); } catch (e) { /* nada */ } }); s.unsubs = []; clearInterval(s.latidoT); }

// ---------- interfaz pública ----------
async function crearSala(nombre, password, nombreJugador) {
  validarDatos(nombre, password, nombreJugador);
  await iniciar();
  const roomId = await hashSala(nombre, password);
  const metaRef = R(roomId, 'meta');
  let session, reanudada = false;
  try {
    const snap = await conTiempo(get(metaRef), T_RED, 'Firebase no responde.');
    const nuevaMeta = () => ({ host: uid, session: (session = nuevoId()), createdAt: serverTimestamp(), lastActive: serverTimestamp(), phase: 'lobby', schema: 1 });
    if (!snap.exists()) {
      await set(metaRef, nuevaMeta());
      await set(R(roomId, 'state'), { phase: 'lobby', round: 0 });
    } else if (snap.val().host === uid) {
      session = snap.val().session; reanudada = true;
    } else {
      // Sala de otro anfitrión: solo se puede ocupar si lleva muchas horas abandonada (lo decide la regla del servidor).
      try { await set(metaRef, nuevaMeta()); }
      catch (e) { if (esPermiso(e)) throw errApp('sala-existe', 'Ya existe una sala con ese nombre y contraseña. Elige otra combinación.'); throw e; }
      await remove(R(roomId, 'roles')); await remove(R(roomId, 'inbox'));
      await set(R(roomId, 'state'), { phase: 'lobby', round: 0 });
    }
  } catch (e) { throw traducir(e); }
  recordarSala(roomId);
  const info = await entrar(roomId, session, uid, nombreJugador.trim());
  info.reanudada = reanudada;
  limpiarSalasViejas();
  return info;
}
async function unirse(nombre, password, nombreJugador) {
  validarDatos(nombre, password, nombreJugador);
  await iniciar();
  const roomId = await hashSala(nombre, password);
  let meta, todos;
  try {
    const snap = await conTiempo(get(R(roomId, 'meta')), T_RED, 'Firebase no responde.');
    if (!snap.exists()) throw errApp('sala-no-encontrada', 'Sala no encontrada o contraseña incorrecta.');
    meta = snap.val();
    todos = (await conTiempo(get(R(roomId, 'players')), T_RED, 'Firebase no responde.')).val() || {};
    const latidoSala = (await conTiempo(get(R(roomId, 'beat')), T_RED, 'Firebase no responde.')).val();
    const ref0 = typeof latidoSala === 'number' ? latidoSala : Number(meta.lastActive) || 0;
    const mio0 = todos[uid];
    if (!(mio0 && mio0.session === meta.session) && Date.now() + offsetMs - ref0 > SALA_LIBRE_MS) throw errApp('sala-no-encontrada', 'Sala no encontrada o contraseña incorrecta.');
  } catch (e) { throw traducir(e); }
  const mios = todos[uid];
  const yaDentro = !!mios && mios.session === meta.session;
  const vivos = Object.entries(todos).filter(([, v]) => v && v.session === meta.session);
  if (!yaDentro) {
    if (meta.phase !== 'lobby') throw errApp('partida-en-curso', 'La partida ya ha empezado. Espera a que termine la ronda para entrar.');
    if (vivos.length >= MAX_JUGADORES) throw errApp('sala-llena', 'La sala está llena (máximo ' + MAX_JUGADORES + ' jugadores).');
  }
  const norm = n => String(n || '').trim().toLowerCase();
  if (vivos.some(([id, v]) => id !== uid && norm(v.name) === norm(nombreJugador))) throw errApp('nombre-repetido', 'Ya hay un jugador con ese nombre en la sala. Elige otro.');
  const info = await entrar(roomId, meta.session, meta.host, nombreJugador.trim());
  info.reanudada = yaDentro;
  limpiarSalasViejas();
  return info;
}
// Volver a una sala tras recargar la página (sin contraseña: se usa el ID guardado en este dispositivo).
async function reanudar(sesion) {
  await iniciar();
  const roomId = sesion && sesion.roomId;
  if (!/^[0-9a-f]{64}$/.test(roomId || '')) throw errApp('sala-no-encontrada', 'La sesión guardada no es válida.');
  let meta, mio;
  try {
    const snap = await conTiempo(get(R(roomId, 'meta')), T_RED, 'Firebase no responde.');
    if (!snap.exists()) throw errApp('sala-no-encontrada', 'La sala ya no existe.');
    meta = snap.val();
    mio = (await conTiempo(get(R(roomId, 'players', uid)), T_RED, 'Firebase no responde.')).val();
  } catch (e) { throw traducir(e); }
  if (!mio || mio.session !== meta.session) throw errApp('sala-no-encontrada', 'Ya no estás en esa sala.');
  const info = await entrar(roomId, meta.session, meta.host, mio.name);
  info.reanudada = true;
  return info;
}
async function enviar(destino, mensaje) {
  if (!sala) throw errApp('sin-sala', 'No estás en ninguna sala.');
  const { tipo, ...resto } = mensaje || {};
  const sv = serverTimestamp();
  try {
    if (destino === 'host') {
      const datos = JSON.stringify(resto);
      if (datos.length > 1500) throw errApp('mensaje-largo', 'El mensaje es demasiado largo.');
      await set(push(R(sala.roomId, 'inbox')), { from: uid, tipo, datos, ts: sv });
    } else if (destino === 'todos') {
      if (!sala.esHost) throw errApp('no-anfitrion', 'Solo el anfitrión puede enviar a todos.');
      const upd = {};
      const campos = tipo === 'reparto' ? (mensaje.estado || {}) : resto;
      for (const k of Object.keys(campos)) upd['state/' + k] = campos[k];
      if (tipo === 'reparto') {
        upd.roles = mensaje.roles ? Object.fromEntries(Object.entries(mensaje.roles).map(([id, r]) => [id, { ...r, session: sala.session }])) : null;
      }
      if (campos.phase) upd['meta/phase'] = campos.phase;
      upd['meta/lastActive'] = sv;
      await update(R(sala.roomId), upd);
    } else if (tipo === 'rol') {
      if (!sala.esHost) throw errApp('no-anfitrion', 'Solo el anfitrión puede enviar roles.');
      await set(R(sala.roomId, 'roles', destino), { ...resto, session: sala.session });
    } else {
      throw errApp('destino', 'Destino no válido.');
    }
  } catch (e) { throw traducir(e); }
}
// Si el anfitrión lleva un rato desconectado, cualquier jugador de la sala puede pasar a ser el anfitrión (lo valida la regla de meta).
async function tomarSala() {
  if (!sala || sala.esHost) return;
  try { await update(R(sala.roomId, 'meta'), { host: uid, lastActive: serverTimestamp() }); }
  catch (e) { if (esPermiso(e)) throw errApp('anfitrion-activo', 'El anfitrión ha vuelto o ya lo ha tomado otro jugador.'); throw traducir(e); }
}
// El anfitrión borra la ficha (y el rol) de otro jugador; ese móvil lo detecta y sale de la sala.
async function expulsar(id) {
  if (!sala || !sala.esHost) throw errApp('no-anfitrion', 'Solo el anfitrión puede expulsar jugadores.');
  if (!id || id === uid) throw errApp('destino', 'No puedes expulsarte a ti mismo.');
  try {
    await remove(R(sala.roomId, 'roles', id));
    await remove(R(sala.roomId, 'players', id));
  } catch (e) { throw traducir(e); }
}
async function salir() {
  if (!sala) return;
  const s = sala; sala = null; desuscribir(s);
  try { await remove(ref(db, P(s.roomId, 'players', uid))); } catch (e) { /* ya no importa */ }
  try { await onDisconnect(ref(db, P(s.roomId, 'players', uid, 'online'))).cancel(); } catch (e) { /* nada */ }
}
async function cerrarSala() {
  if (!sala) return;
  if (!sala.esHost) return salir();
  const s = sala; desuscribir(s);
  await borrarSala(s.roomId);
  await salir();
}
// Borra la sala entera. El orden importa por las reglas: la meta (que dice quién es el anfitrión) va la última y el latido se borra
// mientras mi ficha de jugador aún existe. Las fichas de los demás las borra el anfitrión antes de borrar la meta.
async function borrarSala(roomId) {
  for (const parte of ['inbox', 'roles', 'state', 'beat']) { try { await remove(R(roomId, parte)); } catch (e) { console.warn('borrarSala', parte, e && e.message); } }
  try {
    const otros = (await get(R(roomId, 'players'))).val() || {}, upd = {};
    Object.keys(otros).forEach(id => { if (id !== uid) upd['players/' + id] = null; });
    if (Object.keys(upd).length) await update(R(roomId), upd);
  } catch (e) { console.warn('borrarSala jugadores', e && e.message); }
  try { await remove(R(roomId, 'meta')); } catch (e) { console.warn('borrarSala meta', e && e.message); }
  try { await remove(R(roomId, 'players', uid)); } catch (e) { /* nada */ }
}
// Salas que he creado y dejé abandonadas: al volver a abrir el juego se borran (no hay servidor que lo haga por nosotros).
const SALAS_KEY = 'impostor.misSalas';
function misSalas() { try { const v = JSON.parse(localStorage.getItem(SALAS_KEY)); return Array.isArray(v) ? v.filter(x => /^[0-9a-f]{64}$/.test(x)) : []; } catch (e) { return []; } }
function guardarMisSalas(l) { try { localStorage.setItem(SALAS_KEY, JSON.stringify([...new Set(l)].slice(-10))); } catch (e) { /* nada */ } }
function recordarSala(roomId) { guardarMisSalas(misSalas().concat(roomId)); }
function olvidarSala(roomId) { guardarMisSalas(misSalas().filter(x => x !== roomId)); }
async function limpiarSalasViejas() {
  const actual = sala && sala.roomId;
  for (const id of misSalas()) {
    if (id === actual) continue;
    try {
      const m = (await conTiempo(get(R(id, 'meta')), T_RED, 'x')).val();
      if (!m || m.host !== uid) { olvidarSala(id); continue; }
      const beat = (await conTiempo(get(R(id, 'beat')), T_RED, 'x')).val();
      const ref0 = typeof beat === 'number' ? beat : Number(m.lastActive) || 0;
      if (Date.now() + offsetMs - ref0 > SALA_LIBRE_MS) { await borrarSala(id); olvidarSala(id); console.info('Sala abandonada borrada'); }
    } catch (e) { /* se reintentará la próxima vez */ }
  }
}
// Comprobación que usa el selector de transporte: inicio de sesión anónimo + una escritura de prueba.
async function probar() {
  await iniciar();
  try { await set(ref(db, 'probe/' + uid), serverTimestamp()); } catch (e) { throw traducir(e); }
  return true;
}
async function leerRoles() {
  if (!sala || !sala.esHost) return {};
  try { return (await get(R(sala.roomId, 'roles'))).val() || {}; } catch (e) { return {}; }
}

export default {
  nombre: 'firebase',
  crearSala, unirse, reanudar, enviar, expulsar, tomarSala, salir, cerrarSala, leerRoles, probar,
  alRecibir(cb) { cbs.msg.push(cb); },
  alCambiarJugadores(cb) { cbs.jug.push(cb); },
  alConexion(cb) { cbs.con.push(cb); },
  ahora() { return Date.now() + offsetMs; },
  miId() { return uid; }
};
