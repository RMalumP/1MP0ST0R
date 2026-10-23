// js/online.js — Modo online: sala, lobby, reparto de roles, eliminaciones, cronómetro y reconexión.
// Solo habla con la capa Transport (js/transport.js). Usa funciones y el objeto `state` de js/script.js.
// Reglas de privacidad: cada móvil recibe únicamente SU tarjeta ya resuelta; el anfitrión es el único que conoce todos los roles.
const Online = (function () {
'use strict';
const SES_KEY = 'impostor.online.sesion', NAME_KEY = 'impostor.online.nombre', POPUP_KEY = 'impostor.online.popup';
const SES_MAX_MS = 12 * 3600 * 1000;
const MODOS = { normal: '🎭 Normal', multiple: '🔀 Múltiple', escondite: '🕵️ Escondite' };
const O = {
  active: false, host: false, uid: null, roomId: null, roomName: '', myName: '', players: [], pub: {}, myRole: null,
  hostRoles: {}, order: [], readySet: new Set(), readySent: -1, elim: new Set(), cur: null, savedNames: null, firstState: true, lastRoundShown: -1,
  popupSeen: 0, popupEl: null, popupId: 0, lastPopupId: 0, revealed: false, lastSettings: '', conn: true, wake: null,
  transporte: 'firebase', avisos: [], tick: null, setInt: null, pending: false, sentWords: false, cardSig: '', seatView: 0, stageT: null, stageShown: -1, bg: null, bgPref: true, quickPending: false, history: [], histRound: -1, decoyDone: {}, offSince: {}, hostOffSince: 0, autoRelevo: 0, myVotes: {}, myVotesId: 0, proposals: [], lastPropose: 0, shareData: null, votes: {}, mantN: 0, early: { jug: null, estado: null, rol: null }, timerSecs: null, vibSecs: -1, resultShown: '', busy: false
};

// ---------- utilidades ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* nada */ } }
function parse(s, fb) { try { const v = JSON.parse(s); return v === undefined ? fb : v; } catch (e) { return fb; } }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function go(id) { O.cur = id; showScreen(id); }
function curScreen() { const a = document.querySelector('.screen.active'); return a && a.id ? a.id : O.cur; }
function clean(w) { return w ? String(w).replace(/\s*\(.*\)$/, '').trim() : '—'; }
function aviso(msg, ms) {
  const t = $('on-toast'); if (!t) return;
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(aviso._t); aviso._t = setTimeout(() => { t.style.display = 'none'; }, ms || 4500);
}
function errorEnvio(e) { console.error(e); aviso((e && e.message) || 'No se pudo enviar. Comprueba tu conexión.'); }
// Datos públicos extra (los escribe el anfitrión): g = invitados que comparten móvil [{o: uid del dueño, n: nombre}], a = nombres cambiados {uid: nombre}.
function extra() { const e = parse(O.pub.extra, {}); return { g: Array.isArray(e.g) ? e.g : [], a: (e.a && typeof e.a === 'object') ? e.a : {}, o: Array.isArray(e.o) ? e.o : [] }; }
// Asientos = jugadores reales + sus invitados (id 'g:<uid del dueño>'). Un móvil puede llevar dos asientos.
function seats() {
  const ex = extra(), out = [];
  O.players.forEach(p => {
    out.push({ ...p, nombre: ex.a[p.id] || p.nombre });
    ex.g.filter(x => x.o === p.id).forEach(g => out.push({ id: 'g:' + p.id + ':' + g.k, nombre: g.n, owner: p.id, k: g.k, conectado: p.conectado, esAnfitrion: false, yo: false, guest: true }));
  });
  if (ex.o.length) { const pos = id => { const i = ex.o.indexOf(id); return i < 0 ? 1e6 : i; }; out.sort((a, b) => pos(a.id) - pos(b.id)); }
  return out;
}
const seatOwner = id => String(id).startsWith('g:') ? String(id).split(':')[1] : id;
function miNombre() { return extra().a[O.uid] || O.myName; }
function nombreDe(uid) {
  const p = seats().find(x => x.id === uid); if (p) return p.nombre;
  return (O.hostRoles[uid] && O.hostRoles[uid].name) || 'Jugador';
}
function ajustes() { return parse(O.pub.settings, {}); }
function settingsObj() {
  return { mode: state.gameMode, imp: state.numImpostors, hint: !!state.hintOn, timer: !!state.timerOn, secs: state.timerSeconds, custom: !!state.customOn, multi: state.multiWordCount, alc: state.alcaldeMode === 'host' ? 'host' : state.alcaldeMode === 'rotate' ? 'rot' : 'rand', vote: !!state.voteOn, hm: state.hintMode, hs: state.hintStaged ? 1 : 0, tr: state.traitorOn ? 1 : 0, mi: state.missionOn ? state.missionWho : '', ik: state.impKnows ? 1 : 0, kc: state.keyCat };
}

// ---------- sesión guardada (para volver tras recargar) ----------
function guardarSesion() { lsSet(SES_KEY, JSON.stringify({ roomId: O.roomId, roomName: O.roomName, nombre: O.myName, host: O.host, transporte: O.transporte, t: Date.now() })); }
function leerSesion() { const s = parse(lsGet(SES_KEY), null); if (!s || !s.roomId || Date.now() - (s.t || 0) > SES_MAX_MS) return null; return s; }
function borrarSesion() { lsDel(SES_KEY); }

// ---------- menú: crear / unirse ----------
function abrirMenu() {
  $('on-menu-error').textContent = '';
  const n = lsGet(NAME_KEY); if (n && !$('on-name').value) $('on-name').value = n;
  go('screen-online-menu');
}
function setBusy(b, txt) {
  O.busy = b;
  ['on-btn-create', 'on-btn-join', 'on-btn-menu-back'].forEach(id => { const e = $(id); if (e) e.disabled = b; });
  const m = $('on-menu-status'); if (m) m.textContent = b ? (txt || 'Conectando…') : '';
}
async function conectar(modo) {
  if (O.busy) return;
  const room = $('on-room').value, pass = $('on-pass').value, name = $('on-name').value.trim();
  const err = $('on-menu-error'); err.textContent = '';
  $('on-menu-detail').style.display = 'none'; $('on-menu-detail-btn').style.display = 'none';
  if (room.trim().length < 3) { err.textContent = 'El nombre de la sala debe tener al menos 3 caracteres.'; return; }
  if (pass.trim().length < 4) { err.textContent = 'La contraseña debe tener al menos 4 caracteres.'; return; }
  if (!name) { err.textContent = 'Escribe tu nombre.'; return; }
  O.early = { jug: null, estado: null, rol: null };
  setBusy(true, modo === 'crear' ? 'Creando la sala…' : 'Entrando en la sala…');
  try {
    const res = modo === 'crear' ? await Transport.crearSala(room, pass, name) : await Transport.unirse(room, pass, name);
    entrarEnSala(res, room.trim(), name);
    O.shareData = { room: room.trim(), pass };
  } catch (e) {
    err.textContent = (e && e.message) || 'No se pudo conectar.';
    if (e && e.detalle) { $('on-menu-detail').textContent = e.detalle; $('on-menu-detail-btn').style.display = 'inline-block'; console.warn(e.detalle); }
  } finally { setBusy(false); }
}
function entrarEnSala(res, roomName, name) {
  Object.assign(O, { active: true, host: !!res.esAnfitrion, uid: res.uid, roomId: res.roomId, roomName, myName: name, transporte: res.transporte || 'firebase', avisos: res.avisos || [], players: [], pub: {}, myRole: null,
    hostRoles: {}, order: [], readySet: new Set(), readySent: -1, elim: new Set(), firstState: true, revealed: false, lastRoundShown: -1, pending: false, lastSettings: '', timerSecs: null, resultShown: '' });
  O.savedNames = playerNames.slice();
  O.popupSeen = Number(ssGet(POPUP_KEY)) || 0;
  lsSet(NAME_KEY, name); guardarSesion();
  document.body.classList.add('online-on');
  if (O.host) {
    $('screen-setup').classList.add('online-host');
    O.setInt = setInterval(() => publicarAjustes(false), 1000);
    pedirWake(); if (O.bgPref) activarSegundoPlano().then(() => renderHostPanel());
    publicarAjustes(true);
  }
  O.tick = setInterval(tickTimer, 250);
  if (O.avisos.length) console.warn('Avisos de conexión:', O.avisos.join(' '));
  const e = O.early; O.early = { jug: null, estado: null, rol: null };
  if (e.jug) onJugadores(e.jug);
  if (e.estado) onMsg(e.estado);
  if (e.rol) onMsg(e.rol);
  renderTodo(); route();
}
function limpiar() {
  clearInterval(O.tick); clearInterval(O.setInt); O.tick = O.setInt = null;
  cerrarPopup(false); liberarWake(); pararSegundoPlano();
  O.active = false; O.host = false; O.pub = {}; O.myRole = null; O.hostRoles = {}; O.players = []; O.order = []; O.pending = false;
  O.early = { jug: null, estado: null, rol: null }; O.proposals = []; O.shareData = null; O.votes = {};
  borrarSesion();
  document.body.classList.remove('online-on');
  $('screen-setup').classList.remove('online-host');
  if (O.savedNames) { playerNames = O.savedNames.slice(); setPlayers(playerNames.length); O.savedNames = null; }
  updateModeUI();
  renderHostPanel(); // oculta el panel de la sala (si no, «Un solo móvil» lo seguía mostrando)
  const tb = $('on-takeover-banner'); if (tb) tb.style.display = 'none';
  const b = $('on-resume-banner'); if (b) b.style.display = 'none';
  go('screen-home');
}
async function salirDeSala() {
  if (!O.active) return;
  const host = O.host;
  if (!confirm(host ? '¿Cerrar la sala para todos los jugadores?' : '¿Salir de la sala?')) return;
  try { if (host) await Transport.cerrarSala(); else await Transport.salir(); } catch (e) { /* la sala se abandona igualmente */ }
  limpiar();
}
function onSalaCerrada() {
  if (!O.active) return;
  aviso('La sala se ha cerrado.');
  Transport.salir().catch(() => {});
  limpiar();
}

function onExpulsado() {
  if (!O.active) return;
  aviso('El anfitrión te ha expulsado de la sala.', 6000);
  Transport.salir().catch(() => {});
  limpiar();
}
// ---------- palabras propuestas por los jugadores (el anfitrión las acepta o descarta) ----------
function hostOnPropuesta(m) {
  const texto = String(m.texto || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!O.host || !texto || O.proposals.length >= 30) return;
  if (O.proposals.filter(p => p.de === m.de).length >= 5) return;
  if (O.proposals.some(p => p.texto.toLowerCase() === texto.toLowerCase())) return;
  O.proposals.push({ de: m.de, nombre: nombreDe(m.de), texto });
  vibrate(15); renderProposals();
}
function renderProposals() {
  const box = $('on-proposals'); if (!box) return;
  box.innerHTML = '';
  O.proposals.forEach((p, i) => {
    const d = el('div', 'on-player on-prop'); d.appendChild(el('span', 'on-pname', p.nombre + ': «' + p.texto + '»'));
    const ok = el('button', 'on-kick', 'Añadir'), no = el('button', 'on-kick', '✕'); ok.type = no.type = 'button';
    ok.addEventListener('click', () => { O.proposals.splice(i, 1); aviso(anadirPalabraPropuesta(p.texto) ? '«' + p.texto + '» añadida a la categoría Propuestas.' : 'Esa palabra ya estaba.'); renderProposals(); });
    no.addEventListener('click', () => { O.proposals.splice(i, 1); renderProposals(); });
    d.append(ok, no); box.appendChild(d);
  });
}
function enviarPropuesta() {
  const inp = $('on-inp-propose'), t = inp.value.trim().slice(0, 40), msg = $('on-propose-msg');
  if (!t || Date.now() - O.lastPropose < 2000) return;
  O.lastPropose = Date.now();
  Transport.enviar('host', { tipo: 'propuesta', texto: t }).then(() => { inp.value = ''; msg.textContent = 'Enviada ✓ El anfitrión decidirá si la añade.'; }).catch(errorEnvio);
}
// ---------- compartir la sala (enlace con el nombre y, si se quiere, la contraseña en el fragmento #, que no viaja a ningún servidor) ----------
function armarEnlace() {
  const d = O.shareData, base = location.href.split('#')[0];
  let url = base, texto = 'Sala del Impostor: ' + O.roomName;
  if (d && confirm('El enlace incluirá la contraseña de la sala (quien lo reciba entrará directamente). ¿Hacerlo así?')) { url = base + '#s=' + encodeURIComponent(d.room + '\n' + d.pass); texto += ' · Contraseña: ' + d.pass; }
  else texto += ' (pídele la contraseña al anfitrión)';
  return { url, texto };
}
// QR con el enlace de la sala: quien lo escanee con la cámara entra directamente (la librería se carga solo al pedirlo).
function cargarQR() {
  if (window.qrcode) return Promise.resolve();
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'js/qrcode.js?v=1'; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el generador de QR.')); document.head.appendChild(s); });
}
function hostMostrarQR() {
  const { url } = armarEnlace();
  cargarQR().then(() => {
    const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    const ov = el('div', 'rol-overlay'); ov.style.zIndex = 1200;
    const card = el('div', 'rol-card'); card.style.background = '#fff'; card.style.color = '#111';
    const t = el('div', 'rol-player-label', 'Escanea con la cámara'); t.style.color = '#555';
    const box = el('div'); box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); box.style.cssText = 'width:100%;max-width:280px;margin:10px auto;';
    const svg = box.querySelector('svg'); if (svg) { svg.style.width = '100%'; svg.style.height = 'auto'; }
    const h = el('div', 'rol-tap-hint', 'Toca para cerrar'); h.style.color = '#555';
    card.append(t, box, h); ov.appendChild(card); ov.addEventListener('click', () => ov.remove()); document.body.appendChild(ov);
  }).catch(e => errorEnvio(e));
}
function hostCompartir() {
  const { url, texto } = armarEnlace();
  if (navigator.share) navigator.share({ title: 'El Impostor', text: texto, url }).catch(() => {});
  else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto + '\n' + url).then(() => aviso('Enlace copiado.'), () => prompt('Copia este enlace:', url));
  else prompt('Copia este enlace:', url);
}
function aplicarEnlace() {
  const m = /^#s=(.+)$/.exec(location.hash || ''); if (!m) return false;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nada */ }
  let partes; try { partes = decodeURIComponent(m[1]).split('\n'); } catch (e) { return false; }
  if (!partes[0]) return false;
  abrirMenu(); $('on-room').value = partes[0].slice(0, 30); if (partes[1]) $('on-pass').value = partes[1].slice(0, 30);
  fuerzaClave(); return true;
}
function fuerzaClave() {
  const p = $('on-pass').value, o = $('on-pass-strength'); if (!o) return;
  if (!p) { o.textContent = ''; return; }
  const pts = (p.length >= 10) + (p.length >= 14) + (/[a-z]/.test(p) && /[A-Z]/.test(p)) + /\d/.test(p) + /[^A-Za-z0-9]/.test(p);
  const [txt, cls] = p.trim().length < 4 ? ['Muy corta (mínimo 4)', 'pw-weak'] : pts <= 1 ? ['Débil: usa 10 o más caracteres para que no la adivinen', 'pw-weak'] : pts <= 3 ? ['Media', 'pw-mid'] : ['Fuerte', 'pw-ok'];
  o.textContent = 'Contraseña: ' + txt; o.className = 'on-msg ' + cls;
}
function hostExpulsar(p) {
  if (!O.host || p.esAnfitrion || p.yo) return;
  if (!confirm('¿Expulsar a ' + p.nombre + ' de la sala?')) return;
  Transport.expulsar(p.id).then(() => { vibrate(20); if (extra().g.some(x => x.o === p.id)) hostQuitarInvitado(p.id); }).catch(errorEnvio);
}
// Cambia datos públicos extra (invitados, nombres) y los publica; solo en el lobby.
function hostSetExtra(fn) {
  if (!O.host || (O.pub.phase || 'lobby') !== 'lobby') return;
  const ex = extra(); fn(ex);
  const txt = JSON.stringify(ex);
  if (txt.length > 2800) { aviso('Demasiados cambios de nombre o invitados.'); return; }
  Transport.enviar('todos', { tipo: 'estado', extra: txt }).catch(errorEnvio);
}
function hostAnadirInvitado(ownerId) {
  if (seats().length >= 20) { aviso('La sala está llena (máximo 20 jugadores).'); return; }
  const base = 'Jugador ' + (seats().length + 1);
  const n = (prompt('Nombre del segundo jugador que usará este móvil:', base) || '').trim().slice(0, 24);
  if (!n) return;
  if (seats().some(s => s.nombre.toLowerCase() === n.toLowerCase())) { aviso('Ya hay un jugador con ese nombre.'); return; }
  hostSetExtra(ex => { const k = ex.g.reduce((m, x) => Math.max(m, x.k || 0), 0) + 1; ex.g.push({ o: ownerId, n, k }); });
}
function hostQuitarInvitado(ownerId, k) { hostSetExtra(ex => { ex.g = ex.g.filter(x => !(x.o === ownerId && (k === undefined || x.k === k))); }); }
function hostMover(id, dir) {
  hostSetExtra(ex => {
    const ids = seats().map(s => s.id), i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; ex.o = ids;
  });
}
function hostRenombrar(p) {
  const n = (prompt('Nuevo nombre:', p.nombre) || '').trim().slice(0, 24);
  if (!n || n === p.nombre) return;
  if (seats().some(s => s.id !== p.id && s.nombre.toLowerCase() === n.toLowerCase())) { aviso('Ya hay un jugador con ese nombre.'); return; }
  hostSetExtra(ex => { if (p.guest) { const g = ex.g.find(x => x.o === p.owner && x.k === p.k); if (g) g.n = n; } else ex.a[p.id] = n; });
}

// ---------- recibir mensajes ----------
function onMsg(m) {
  if (!m) return;
  // Los primeros datos de la sala llegan mientras el transporte aún está terminando de entrar: se guardan y se reproducen.
  if (!O.active) { if (m.tipo === 'estado') O.early.estado = m; else if (m.tipo === 'rol') O.early.rol = m; return; }
  switch (m.tipo) {
    case 'estado': { const { tipo, ...st } = m; onEstado(st); break; }
    case 'rol': onRol(m); break;
    case 'sala-cerrada': onSalaCerrada(); break;
    case 'expulsado': onExpulsado(); break;
    case 'anfitrion': if (m.esAnfitrion) volverseAnfitrion(); else if (O.host) perderAnfitrion(); else { O.hostOffSince = 0; $('on-takeover-banner').style.display = 'none'; aviso('La sala tiene un nuevo anfitrión.', 5000); } break;
    case 'clave': if (O.host) hostOnClave(m); break;
    case 'palabras': if (O.host) hostOnPalabras(m); break;
    case 'listo': if (O.host) hostOnListo(m); break;
    case 'voto': if (O.host) hostOnVoto(m); break;
    case 'propuesta': if (O.host) hostOnPropuesta(m); break;
    default: break;
  }
}
function onJugadores(lista) {
  if (!O.active) { O.early.jug = lista || []; return; }
  O.players = lista || [];
  if (O.host) { syncHostPlayers(); hostComprobarListos(); }
  renderTodo();
}
function onConexion(c) {
  O.conn = c;
  const b = $('on-conn-banner'); if (b) b.style.display = (!c && O.active) ? 'block' : 'none';
}
function onEstado(st) {
  O.pub = st;
  if (st.phase === 'playing' && st.waiting !== true && (!O.stageT || O.stageT.round !== st.round)) { O.stageT = { round: st.round, t: Date.now() }; O.stageShown = -1; }
  if (O.host && (st.phase || 'lobby') === 'lobby') syncHostPlayers();
  if (st.phase !== 'alcalde') O.sentWords = false;
  O.elim = new Set(parse(st.eliminated, []));
  const enJuego = st.phase === 'playing' || st.phase === 'ended';
  if (O.firstState) {
    O.firstState = false;
    if (enJuego) O.lastRoundShown = st.round;
    if (O.host) O.history = [].concat(parse(st.history, []));
    if (O.host && enJuego) { recuperarRolesHost(); O.readySet = new Set(parse(st.ready, [])); }
    if (O.host && st.phase === 'alcalde') { volverALobby(true); return; } // el reparto pendiente se perdió al recargar
  } else if (st.phase === 'playing' && st.round !== O.lastRoundShown) {
    O.lastRoundShown = st.round; O.revealed = false;
    if (st.starting) { if (st.waiting === true) O.startMsg = st.starting; else showStartingPlayerDialog(escapeHtml(st.starting)); }
  }
  // El aviso de quién empieza sale cuando termina la espera inicial (todos listos), no antes.
  if (st.phase === 'playing' && st.waiting !== true && O.startMsg) { const q = O.startMsg; O.startMsg = null; showStartingPlayerDialog(escapeHtml(q)); }
  if (st.phase !== 'playing') O.startMsg = null;
  if (!enJuego) cerrarPopup(false);
  revisarPopup();
  route(); renderTodo();
  if (O.quickPending && st.phase === 'lobby') { O.quickPending = false; setTimeout(() => { if (O.active && O.host && (O.pub.phase || 'lobby') === 'lobby') $('btn-start').click(); }, 200); }
}
function onRol(m) {
  if (m.vacio) { O.myRole = null; O.revealed = false; renderCard(); return; }
  const antes = O.myRole; O.myRole = m;
  if (!antes || antes.round !== m.round) { O.revealed = false; O.seatView = 0; }
  renderCard(); renderGame();
  if (O.pub.phase === 'playing' || O.pub.phase === 'ended') route();
}

// ---------- decidir qué pantalla mostrar ----------
function route() {
  if (!O.active) return;
  const ph = O.pub.phase || 'lobby', cur = curScreen();
  if (ph === 'lobby') {
    if (O.host) { if (cur !== 'screen-setup' && cur !== 'screen-archivo') go('screen-setup'); }
    else if (cur !== 'screen-online-lobby') go('screen-online-lobby');
  } else if (ph === 'alcalde') {
    if (O.pub.alcalde === O.uid && !O.sentWords) { if (cur !== 'screen-alcalde') mostrarAlcalde(); }
    else if (cur !== 'screen-online-lobby') go('screen-online-lobby');
  } else if (cur !== 'screen-online-game') go('screen-online-game');
}
function renderTodo() { renderHostPanel(); renderLobby(); renderGame(); }

// ---------- jugadores: chips, lobby y panel del anfitrión ----------
function chip(p, ctrl) {
  const d = el('div', 'on-player' + (p.guest ? ' on-guest' : ''));
  d.appendChild(el('span', 'on-dot ' + (p.conectado ? 'on' : 'off')));
  d.appendChild(el('span', 'on-pname', (p.guest ? '↳ ' : '') + p.nombre + (p.guest ? ' 👥' : '') + (p.esAnfitrion ? ' 👑' : '') + (p.yo ? ' (tú)' : '')));
  if (!p.conectado) d.appendChild(el('span', 'on-off', 'sin conexión'));
  if (ctrl) {
    const btn = (txt, title, fn, extraCls) => { const b = el('button', 'on-kick' + (extraCls || ''), txt); b.type = 'button'; b.title = title; b.addEventListener('click', e => { e.stopPropagation(); fn(); }); d.appendChild(b); };
    btn('▲', 'Subir en el orden', () => hostMover(p.id, -1)); btn('▼', 'Bajar en el orden', () => hostMover(p.id, 1));
    btn('✏️', 'Cambiar nombre', () => hostRenombrar(p));
    if (p.guest) btn('Quitar', 'Quitar al jugador invitado', () => hostQuitarInvitado(p.owner, p.k));
    else {
      if (extra().g.filter(x => x.o === p.id).length < 2) btn('👥 +1', 'Otro jugador usará este móvil', () => hostAnadirInvitado(p.id));
      if (!p.esAnfitrion && !p.yo) btn('Expulsar', 'Expulsar de la sala', () => hostExpulsar(p));
    }
  }
  return d;
}
function syncHostPlayers() {
  playerNames = seats().map(p => p.nombre);
  state.numPlayers = playerNames.length;
  updateImpostorCap(); updateModeUI();
}
function renderHostPanel() {
  const p = $('online-host-panel'); if (!p) return;
  p.style.display = (O.active && O.host) ? 'block' : 'none';
  if (!(O.active && O.host)) return;
  $('on-host-room').textContent = O.roomName;
  $('on-host-transport').textContent = Transport.etiqueta();
  const w = $('on-host-warn');
  const peer = O.transporte === 'peer';
  w.style.display = 'block'; w.className = 'on-warn' + (peer ? '' : ' on-info');
  w.textContent = peer
    ? '⚠️ Este móvil hace de servidor de la sala: no cierres ni recargues esta pestaña y no dejes que se bloquee la pantalla; si se pierde, los demás se quedan sin conexión.'
    : 'ℹ️ Eres el anfitrión: tu móvil coordina la partida. Procura no cerrar la pestaña ni bloquear la pantalla; si te desconectas más de 10 minutos, el control pasará al siguiente jugador.';
  const wk = $('on-btn-wake'); if (wk) wk.style.display = (navigator.wakeLock && !O.wake) ? 'block' : 'none';
  const bg = $('on-btn-bg'); if (bg) bg.textContent = O.bg ? '🔒 Segundo plano activado: sigue con la pantalla bloqueada (toca para desactivar)' : '🔒 Seguir activo con la pantalla bloqueada';
  const list = $('on-host-players'); list.innerHTML = '';
  const lobby = (O.pub.phase || 'lobby') === 'lobby';
  seats().forEach(pl => list.appendChild(chip(pl, lobby)));
  renderProposals();
  const n = seats().length, off = O.players.filter(x => !x.conectado).length;
  let msg = n < 3 ? 'Faltan jugadores: se necesitan al menos 3 (ahora ' + n + '). Que se unan con el nombre de la sala y la contraseña.' : n + ' jugadores en la sala.';
  if (n >= 3 && off > 0) msg += ' ' + off + ' sin conexión.';
  $('on-host-msg').textContent = msg;
}
function settingsLines() {
  const s = ajustes(); if (!s.mode) return ['Esperando los ajustes del anfitrión…'];
  const l = ['Modo: ' + (MODOS[s.mode] || s.mode) + (s.custom ? ' · 👑 Alcalde (' + (s.alc === 'host' ? 'el anfitrión' : s.alc === 'rot' ? 'sin repetir' : 'aleatorio') + ')' : ''), 'Impostores: ' + s.imp, 'Pista: ' + (s.hint ? (s.hs ? 'sí, escalonada' : 'sí (' + ({ cat: 'categoría', inicial: 'inicial y letras', desc: 'descripción' }[s.hm] || 'categoría') + ')') : 'no')];
  l.push('Cronómetro: ' + (s.timer ? fmtTime(s.secs) : 'no'));
  if (s.mode === 'escondite') l.push('Impostores: ' + (s.ik === 0 ? 'no conocen la palabra de la gente' : 'conocen la palabra de la gente') + (s.custom ? '' : ' · su palabra es de ' + (s.kc === 'misma' ? 'la misma categoría' : 'otra categoría')));
  if (s.tr) l.push('Traidor: sí');
  if (s.mi) l.push('Misiones secretas: ' + ({ todos: 'todos', civiles: 'solo civiles', impostores: 'solo impostores' }[s.mi] || 'sí'));
  l.push('Votación integrada: ' + (s.vote ? 'sí' : 'no'));
  return l;
}
function renderLobby() {
  const root = $('on-lobby-room'); if (!root) return;
  root.textContent = O.roomName;
  $('on-lobby-transport').textContent = Transport.etiqueta();
  const list = $('on-lobby-players'); list.innerHTML = '';
  seats().forEach(pl => list.appendChild(chip(pl)));
  const ph = O.pub.phase || 'lobby';
  $('on-lobby-msg').textContent = ph === 'alcalde'
    ? '👑 ' + (O.pub.alcaldeName || 'El Alcalde') + ' está eligiendo las palabras…'
    : (O.host ? '' : 'Esperando a que el anfitrión empiece la partida…');
  const box = $('on-lobby-settings'); box.innerHTML = '';
  settingsLines().forEach(t => box.appendChild(el('div', 'on-setting', t)));
  $('on-btn-cancel-round').style.display = (O.host && ph === 'alcalde') ? 'block' : 'none';
  renderHistorial();
  const pb = $('on-propose-box'); if (pb) pb.style.display = (!O.host && ph === 'lobby') ? 'block' : 'none';
}

// ---------- pantalla de juego ----------
function renderGame() {
  if (!$('on-reveal-card')) return;
  const s = ajustes();
  renderEspera();
  const b = $('on-mode-badge'); b.innerHTML = '';
  if (s.mode) b.appendChild(el('span', 'mode-badge ' + (s.mode === 'escondite' ? 'escondite' : s.mode), (MODOS[s.mode] || s.mode)));
  $('on-player-name').textContent = vistaActual().nombre;
  $('on-round-label').textContent = 'Ronda ' + (O.pub.round || 1) + ' · Sala ' + O.roomName;
  renderCard(); renderResult(); renderGamePlayers(); renderTimerControls(); renderVoto();
  const fin = $('on-btn-end'); fin.style.display = O.host ? 'block' : 'none';
  fin.textContent = O.pub.result ? 'Nueva ronda' : 'Terminar ronda';
  $('on-btn-results').style.display = O.host ? 'block' : 'none';
  const hn = $('on-host-note'); if (hn) hn.style.display = O.host ? 'block' : 'none';
  const qk = $('on-btn-quick'); if (qk) qk.style.display = (O.host && (O.pub.phase === 'playing' || O.pub.phase === 'ended') && !esperando()) ? 'block' : 'none';
  renderHistorial();
  $('on-btn-clear-popup').style.display = (O.host && O.pub.popup) ? 'block' : 'none';
}
// ---------- espera inicial: cada móvil ve su rol y pulsa «Comenzar»; cuando todos lo hacen sale la pantalla de partida ----------
function esperando() { return O.pub.phase === 'playing' && O.pub.waiting === true; }
function listos() { return new Set(parse(O.pub.ready, [])); }
// ---------- votación integrada (opcional): cada móvil vota; el anfitrión confirma la eliminación ----------
function voto() { return parse(O.pub.vote, null); }
function renderVoto() {
  const box = $('on-vote-box'), ini = $('on-btn-vote-start'); if (!box) return;
  const v = voto(), activo = !!ajustes().vote && O.pub.phase === 'playing' && !esperando();
  ini.style.display = (activo && O.host && !v) ? 'block' : 'none';
  if (!activo || !v) { box.style.display = 'none'; return; }
  if (O.myVotesId !== v.id) { O.myVotes = {}; O.myVotesId = v.id; }
  box.style.display = 'block';
  const list = $('on-vote-list'), msg = $('on-vote-msg'); list.innerHTML = '';
  $('on-vote-host').style.display = O.host ? 'block' : 'none';
  $('on-btn-vote-close').style.display = (O.host && v.open) ? 'block' : 'none';
  $('on-btn-vote-elim').style.display = (O.host && !v.open && v.win) ? 'block' : 'none';
  if (v.open) {
    const vista = vistaActual(), yo = vista.seat, vivos = seats().filter(x => !O.elim.has(x.id));
    if (O.elim.has(yo)) { msg.textContent = 'Estás eliminado: no puedes votar. Han votado ' + (v.voted || []).length + '.'; return; }
    msg.textContent = (v.cand ? 'Segunda vuelta por el empate: ' : '') + 'Vota a quién eliminar' + (vista.compartido ? ' (como ' + vista.nombre + ')' : '') + '. Han votado ' + (v.voted || []).length + ' de ' + vivos.length + '.';
    vivos.filter(x => x.id !== yo && (!v.cand || v.cand.includes(x.id))).forEach(x => {
      const b = el('button', 'on-vote-btn' + (O.myVotes[yo] === x.id ? ' sel' : ''), x.nombre); b.type = 'button';
      b.addEventListener('click', () => votar(yo, x.id)); list.appendChild(b);
    });
  } else {
    msg.textContent = v.win ? (v.gracia ? 'Empate: decide el voto de gracia del Alcalde → ' : 'Más votado: ') + v.winName + '.' : (v.empate2 ? 'Empate otra vez: nadie queda eliminado.' : 'Empate: nadie queda eliminado.');
    (v.res || []).forEach(r => list.appendChild(el('div', 'on-setting', r[0] + ' — ' + r[1] + (r[1] === 1 ? ' voto' : ' votos'))));
  }
}
function votar(seat, objetivo) {
  O.myVotes[seat] = objetivo; vibrate(15); sfx('vote'); renderVoto();
  if (O.host) hostOnVoto({ de: O.uid, como: seat, a: objetivo });
  else Transport.enviar('host', { tipo: 'voto', como: seat, a: objetivo }).catch(errorEnvio);
}
function hostIniciarVoto() {
  if (!O.host || O.pub.result || esperando()) return;
  O.votes = {};
  Transport.enviar('todos', { tipo: 'estado', vote: JSON.stringify({ id: Date.now(), open: true, voted: [] }) }).catch(errorEnvio);
}
function hostOnVoto(m) {
  const v = voto(); if (!O.host || !v || !v.open) return;
  const como = String(m.como || ''), a = String(m.a || '');
  if (seatOwner(como) !== m.de) return;
  if (!O.hostRoles[como] || O.elim.has(como) || !O.hostRoles[a] || O.elim.has(a) || a === como) return;
  if (v.cand && !v.cand.includes(a)) return;
  O.votes[como] = a;
  const votantes = Object.keys(O.hostRoles).filter(id => { if (O.elim.has(id)) return false; const d = seatOwner(id), p = O.players.find(x => x.id === d); return d === O.uid || (p && p.conectado); });
  if (votantes.length && votantes.every(id => O.votes[id])) { hostCerrarVoto(); return; }
  Transport.enviar('todos', { tipo: 'estado', vote: JSON.stringify({ ...v, voted: Object.keys(O.votes) }) }).catch(errorEnvio);
}
function hostCerrarVoto() {
  const v = voto(); if (!O.host || !v || !v.open) return;
  const cuenta = {}; Object.values(O.votes).forEach(id => { cuenta[id] = (cuenta[id] || 0) + 1; });
  const orden = Object.keys(cuenta).sort((x, y) => cuenta[y] - cuenta[x]);
  const res = orden.map(id => [nombreDe(id).slice(0, 24), cuenta[id]]);
  const empatados = orden.filter(id => cuenta[id] === cuenta[orden[0]]);
  let win = empatados.length === 1 ? empatados[0] : null, gracia = false;
  if (!win && empatados.length > 1) {
    // Empate: decide el voto de gracia del Alcalde (si está vivo y votó a uno de los empatados); si no, segunda vuelta entre los empatados (una sola vez).
    const alc = state.customOn && state.alcaldePlayer ? O.order[state.alcaldePlayer - 1] : null;
    if (alc && !O.elim.has(alc) && empatados.includes(O.votes[alc])) { win = O.votes[alc]; gracia = true; }
    else if (!v.cand) {
      O.votes = {};
      Transport.enviar('todos', { tipo: 'estado', vote: JSON.stringify({ id: Date.now(), open: true, voted: [], cand: empatados, ronda: 2 }) }).catch(errorEnvio);
      return;
    }
  }
  Transport.enviar('todos', { tipo: 'estado', vote: JSON.stringify({ id: v.id, open: false, voted: Object.keys(O.votes), res, win, gracia, empate2: !win && !!v.cand, winName: win ? nombreDe(win).slice(0, 24) : '' }) }).catch(errorEnvio);
}
function hostCancelarVoto() { if (O.host) { O.votes = {}; Transport.enviar('todos', { tipo: 'estado', vote: null }).catch(errorEnvio); } }
function renderEspera() {
  const w = esperando(), box = $('on-wait-box'); if (!box) return;
  box.style.display = w ? 'block' : 'none';
  $('on-game-main').style.display = w ? 'none' : 'block';
  $('on-btn-cancel-wait').style.display = (w && O.host) ? 'block' : 'none';
  if (!w) return;
  const ready = listos(), yo = ready.has(O.uid) || O.readySent === O.pub.round;
  const total = O.players.length || (O.order || []).length;
  const btn = $('on-btn-ready');
  btn.disabled = yo || !O.myRole;
  btn.textContent = yo ? 'Esperando a los demás…' : 'Comenzar';
  $('on-wait-msg').textContent = 'Mira tu rol (toca la tarjeta) y pulsa Comenzar cuando estés listo. Listos: ' + ready.size + ' de ' + total + '.';
  $('on-btn-start-all').style.display = O.host ? 'block' : 'none';
}
function marcarListo() {
  if (!esperando() || !O.myRole) return;
  O.readySent = O.pub.round; vibrate(20); sfx('pass'); renderEspera();
  if (O.host) hostOnListo({ de: O.uid });
  else Transport.enviar('host', { tipo: 'listo' }).catch(e => { O.readySent = -1; renderEspera(); errorEnvio(e); });
}
function hostOnListo(m) {
  if (!O.host || !esperando()) return;
  if (!O.order.includes(m.de) && !O.hostRoles[m.de]) return;
  if (!O.readySet.has(m.de)) { O.readySet.add(m.de); Transport.enviar('todos', { tipo: 'estado', ready: JSON.stringify([...O.readySet]) }).catch(errorEnvio); }
  hostComprobarListos();
}
// Empieza sola cuando todos los jugadores conectados han pulsado Comenzar.
function hostComprobarListos() {
  if (!O.host || !esperando() || O.starting) return;
  const ids = O.players.filter(p => p.yo || p.conectado).map(p => p.id);
  if (ids.length && ids.every(id => O.readySet.has(id))) hostComenzarTodos(true);
}
function hostComenzarTodos(auto) {
  if (!O.host || !esperando()) return;
  O.starting = true;
  Transport.enviar('todos', { tipo: 'estado', waiting: false }).then(() => { if (!auto) vibrate(25); }).catch(errorEnvio).finally(() => { O.starting = false; });
}
function renderCard() {
  const card = $('on-reveal-card'), shown = $('on-reveal-shown'); if (!card) return;
  const ver = !!(O.revealed && O.myRole);
  const vista = vistaActual();
  card.classList.toggle('revealed', ver);
  $('on-tap-text').textContent = O.myRole ? (vista.compartido ? 'Toca para ver el rol de ' + vista.nombre : 'Toca para ver tu rol') + (O.stageShown > 0 && !O.revealed && String(O.myRole.card).indexOf('hintstages') >= 0 ? ' · 💡 hay más pista' : '') : 'Esperando tu rol…';
  const pass = $('on-btn-pass');
  if (pass) { pass.style.display = vista.compartido ? 'block' : 'none'; pass.textContent = 'Pasar el móvil a ' + vista.otro + ' ➜'; }
  const sig = ver ? O.myRole.round + '|' + vista.idx + '|' + (O.decoyDone[claveSenuelo()] ? 1 : 0) + '|' + etapaPista() + '|' + vista.card : '';
  if (sig === O.cardSig && sig !== '') return; // sin cambios: no se toca (así no se borra la clave que se está escribiendo)
  O.cardSig = sig;
  shown.innerHTML = '';
  if (ver) renderCardView(parse(vista.card, []), shown);
}
// Si este móvil lo comparten dos jugadores, la tarjeta alterna entre ambos (botón «Pasar»), como en el modo de un solo móvil.
function vistaActual() {
  const r = O.myRole, g = r && r.g ? [].concat(parse(r.g, [])).filter(x => x && x.card) : [];
  if (!r || !g.length) return { compartido: false, idx: 0, seat: O.uid, rol: r ? r.role : null, nombre: miNombre(), otro: '', card: r ? r.card : '' };
  const vistas = [{ n: miNombre(), card: r.card, seat: O.uid, rol: r.role }, ...g.map(x => ({ n: x.n, card: x.card, seat: 'g:' + O.uid + ':' + x.k, rol: x.r }))];
  const idx = O.seatView % vistas.length, sig = vistas[(idx + 1) % vistas.length];
  return { compartido: true, idx, seat: vistas[idx].seat, rol: vistas[idx].rol, nombre: vistas[idx].n, otro: sig.n, card: vistas[idx].card };
}
function pasarMovil() {
  if (!O.myRole || !vistaActual().compartido) return;
  O.seatView = O.seatView + 1; O.revealed = false; vibrate(20); sfx('pass'); renderCard(); renderGame();
}
function claveSenuelo() { const v = vistaActual(); return (O.myRole ? O.myRole.round : 0) + '|' + v.idx; }
function renderCardView(items, box) {
  items = Array.isArray(items) ? items : [];
  if (items[0] && items[0].k === 'decoy' && !O.decoyDone[claveSenuelo()]) { box.appendChild(crearEntradaClave(true)); return; }
  items.forEach(it => {
    if (!it || typeof it !== 'object' || it.k === 'decoy') return;
    const t = typeof it.t === 'string' ? it.t.slice(0, 300) : '';
    switch (it.k) {
      case 'imp': box.appendChild(el('div', 'impostor-text', t)); break;
      case 'sub': { const d = el('div', 'impostor-sub', t); if (it.f) { d.style.marginTop = '8px'; d.style.fontSize = '.8rem'; d.style.color = 'var(--text-faded)'; } box.appendChild(d); break; }
      case 'word': renderWord(t, box); break;
      case 'wtxt': box.appendChild(el('div', 'word-text', t)); break;
      case 'hint': box.appendChild(el('div', 'hint-line', t)); break;
      case 'badge': { const d = el('div', 'alcalde-badge', t); d.style.margin = '0 auto 8px'; box.appendChild(d); break; }
      case 'key': { const k = el('div', 'secret-key-box'); k.appendChild(el('div', 'secret-key-label', it.l || 'Clave secreta')); k.appendChild(el('div', 'secret-key-word', t)); box.appendChild(k); break; }
      case 'img': { const w = el('div', 'word-img-wrap'); box.appendChild(w); fetchWordImage(String(it.w || ''), String(it.c || ''), w, true); break; }
      case 'keyinput': box.appendChild(crearEntradaClave()); break;
      case 'hintstages': { const e = etapaPista(); (Array.isArray(it.l) ? it.l : []).slice(0, e + 1).forEach((x, i) => box.appendChild(el('div', 'hint-line', (e > 0 ? 'Pista ' + (i + 1) + ' · ' : 'Pista · ') + String(x).slice(0, 200)))); break; }
      case 'mision': box.appendChild(el('div', 'mission-note', '📋 Misión secreta: ' + t)); break;
      case 'traidor': box.appendChild(el('div', 'traitor-note', '🕶 Eres el Traidor: ganas si ganan los impostores. Tú no sabes quiénes son.')); break;
      default: break;
    }
  });
}
function crearEntradaClave(senuelo) {
  const wrap = el('div', 'escondite-input-wrap');
  wrap.appendChild(el('div', 'escondite-inp-label', '✍️ Escribe una palabra. Si eres el impostor, será la clave secreta de tu equipo; si no, escribe cualquier cosa.'));
  const inp = el('input', 'escondite-inp'); inp.type = 'text'; inp.maxLength = 40; inp.placeholder = 'Escribe una palabra…';
  const btn = el('button', 'btn-escondite-confirm', 'Confirmar');
  wrap.addEventListener('click', e => e.stopPropagation());
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const v = inp.value.trim(); if (!v) { inp.focus(); return; }
    if (senuelo) { O.decoyDone[claveSenuelo()] = true; vibrate(20); O.cardSig = ''; renderCard(); return; }
    btn.disabled = true; inp.disabled = true; btn.textContent = 'Enviando…';
    if (O.host) hostOnClave({ de: O.uid, clave: v });
    else Transport.enviar('host', { tipo: 'clave', clave: v }).catch(e2 => { btn.disabled = false; inp.disabled = false; btn.textContent = 'Confirmar'; errorEnvio(e2); });
    vibrate(30);
  });
  wrap.appendChild(inp); wrap.appendChild(btn);
  return wrap;
}
function renderResult() {
  const box = $('on-result'); if (!box) return;
  const r = O.pub.result;
  if (!r) { box.className = ''; box.innerHTML = ''; return; }
  box.className = 'victory-msg';
  box.innerHTML = r === 'civiles'
    ? '<div class="victory-emoji">🏆</div><div class="victory-title civiles">Han ganado los Civiles</div><div class="victory-sub">Ha ganado la verdad.</div>'
    : '<div class="victory-emoji">🐄</div><div class="victory-title impostores">Ha ganado la mentira</div><div class="victory-sub">Vergüenza para tu vaca.</div>';
  const sum = parse(O.pub.summary, null);
  if (Array.isArray(sum) && sum.length) {
    const t = el('table', 'results-table'); t.innerHTML = '<thead><tr><th>Jugador</th><th>Rol</th><th>Palabra</th></tr></thead>';
    const tb = el('tbody'); sum.forEach(x => { if (!Array.isArray(x)) return; const tx = textosRol(x[1] === 'T' ? 'traidor' : x[1] === 'I' ? 'impostor' : 'civil', bandosOnline()), imp = tx.cls === 'impostor', tr = el('tr'); const a = el('td', '', String(x[0]) + (x[3] ? ' ✕' : '')), b = el('td', imp ? 'role-impostor' : 'role-civil', tx.nombre), c = el('td', '', String(x[2] || '—')); c.style.cssText = 'color:var(--text-faded);font-size:.8rem;'; tr.append(a, b, c); tb.appendChild(tr); });
    t.appendChild(tb); box.appendChild(t);
  }
  const k = O.pub.round + ':' + r;
  if (O.resultShown !== k) { O.resultShown = k; vibrate([100, 50, 100, 50, 200]); sfx(r === 'civiles' ? 'win' : 'lose'); if (typeof Stats !== 'undefined') Stats.ronda({ modo: ajustes().mode || 'normal', ganador: r, online: true, miRol: O.myRole ? (O.myRole.tr ? 'traidor' : O.myRole.role) : null }); }
}
function renderGamePlayers() {
  const box = $('on-players'); if (!box) return;
  box.innerHTML = '';
  // El anfitrión ve también a quien se fue a media ronda (cuenta para la victoria); el resto ve la sala actual.
  const filas = O.host && Object.keys(O.hostRoles).length
    ? Object.keys(O.hostRoles).map(id => { const p = seats().find(x => x.id === id); return { id, nombre: nombreDe(id), conectado: p ? p.conectado : false, fuera: !p, guest: id.startsWith('g:') }; })
    : seats().map(p => ({ id: p.id, nombre: p.nombre, conectado: p.conectado, fuera: false, guest: !!p.guest }));
  filas.forEach(f => {
    const elim = O.elim.has(f.id);
    const row = el('div', 'game-player-row' + (elim ? ' eliminated' : '') + (f.guest ? ' on-guest' : ''));
    const nm = el('div', 'game-player-name'); nm.appendChild(el('span', 'on-dot ' + (f.conectado ? 'on' : 'off'))); nm.appendChild(document.createTextNode(' ' + (f.guest ? '↳ ' : '') + f.nombre + (f.fuera ? ' (se fue)' : '')));
    row.appendChild(nm);
    if (O.host) {
      const btn = el('button', 'btn-ver-rol' + (elim ? ' eliminated' : ''), elim ? 'Eliminado' : 'Ver rol');
      btn.addEventListener('click', e => { e.stopPropagation(); if (!elim) hostVerRol(f.id); });
      row.appendChild(btn);
    } else if (elim) row.appendChild(el('div', 'btn-ver-rol eliminated', 'Eliminado'));
    box.appendChild(row);
  });
}

// ---------- ventana "eliminado" visible en todos los móviles ----------
const bandosOnline = () => ajustes().mode === 'bandos';
const rolHost = info => info.traidor ? 'traidor' : info.role;
function mostrarPopup(p) {
  cerrarPopup(false);
  const imp = p.role === 'impostor', tx = textosRol(p.role, bandosOnline());
  const ov = el('div', 'rol-overlay');
  ov.innerHTML = '<div class="rol-card"><div class="rol-player-label">Eliminado</div><div class="rol-player-name">' + escapeHtml(p.name) + '</div>' +
    '<div class="rol-icon">' + tx.icon + '</div>' +
    '<div class="rol-verdict ' + tx.cls + '">' + tx.verdict + '</div>' +
    '<div class="rol-sub">' + tx.msg + '</div>' +
    '<div class="rol-tap-hint">Toca para cerrar</div></div>';
  ov.addEventListener('click', () => cerrarPopup(true));
  document.body.appendChild(ov);
  O.popupEl = ov; O.popupId = p.id;
  vibrate(imp ? [40, 30, 80] : [60, 20, 60]); sfx('elim');
}
function cerrarPopup(marcar) {
  if (O.popupEl) { try { document.body.removeChild(O.popupEl); } catch (e) { /* ya cerrado */ } O.popupEl = null; }
  if (marcar && O.popupId) { O.popupSeen = Math.max(O.popupSeen, O.popupId); ssSet(POPUP_KEY, String(O.popupSeen)); }
}
function revisarPopup() {
  const p = O.pub.popup;
  if (!p) { cerrarPopup(false); return; }
  if (O.host) { O.popupSeen = Math.max(O.popupSeen, p.id); return; } // el anfitrión ya lo vio en su propio aviso
  if (p.id > O.popupSeen && !(O.popupEl && O.popupId === p.id)) mostrarPopup(p);
}

// ---------- cronómetro (lo controla el anfitrión; todos lo ven) ----------
function timerMs() {
  const t = O.pub.timer; if (!t) return null;
  const ms = t.running ? t.remaining * 1000 - (Transport.ahora() - t.at) : t.remaining * 1000;
  return Math.max(0, ms);
}
// Pista escalonada: cada «intervalo» se desbloquea la siguiente pista (un tercio del cronómetro, o 90 s si no hay cronómetro).
function etapaPista() {
  if (!O.stageT || O.stageT.round !== O.pub.round) return 0;
  const s = ajustes(), iv = s.timer ? Math.max(15, Math.floor((s.secs || 180) / 3)) : 90;
  return Math.min(2, Math.floor((Date.now() - O.stageT.t) / 1000 / iv));
}
function chequearEtapa() {
  if (!O.myRole || String(O.myRole.card).indexOf('hintstages') < 0) return;
  const e = etapaPista(); if (e === O.stageShown) return;
  const sube = e > O.stageShown && O.stageShown >= 0; O.stageShown = e;
  O.cardSig = ''; renderCard();
  if (sube && !O.revealed) { vibrate([30, 40, 30]); sfx('tick'); }
}
function tickTimer() {
  if (O.active && O.cur === 'screen-online-game') { renderTimer(); chequearEtapa(); }
  if (O.active && ++O.mantN % 16 === 0) mantenimiento();
}
// Cada ~4 s: el anfitrión quita del lobby a quien lleva 10 min sin conexión; los jugadores ofrecen tomar la sala si el anfitrión desaparece.
// Tolerancia de 10 minutos: un anfitrión con la pantalla bloqueada (pestaña en segundo plano) no pierde la sala ni el papel.
const FANTASMA_MS = 600000, ANFITRION_AUSENTE_MS = 600000, BANNER_RELEVO_MS = 720000, REINTENTO_RELEVO_MS = 15000;
function mantenimiento() {
  const ahora = Date.now(), lobby = (O.pub.phase || 'lobby') === 'lobby';
  if (O.host) {
    O.players.forEach(p => {
      if (p.yo || p.esAnfitrion) return;
      if (p.conectado) { delete O.offSince[p.id]; return; }
      if (!O.offSince[p.id]) O.offSince[p.id] = ahora;
      if (lobby && ahora - O.offSince[p.id] > FANTASMA_MS) {
        delete O.offSince[p.id];
        Transport.expulsar(p.id).then(() => { aviso('Se ha quitado a ' + p.nombre + ' por llevar 10 minutos sin conexión.', 6000); hostQuitarInvitado(p.id); }).catch(() => {});
      }
    });
  }
  const b = $('on-takeover-banner'); if (!b) return;
  const hp = O.players.find(x => x.esAnfitrion);
  if (!O.host && hp && !hp.conectado) { if (!O.hostOffSince) O.hostOffSince = ahora; }
  else O.hostOffSince = 0;
  const ausente = !O.host && O.hostOffSince ? ahora - O.hostOffSince : 0;
  // Relevo automático: pasa a ser anfitrión el primer jugador conectado de la lista (en el orden que fijó el anfitrión).
  if (ausente > ANFITRION_AUSENTE_MS && Transport.soportaTomarSala()) {
    const siguiente = seats().find(s => !s.guest && !s.esAnfitrion && s.conectado);
    if (siguiente && siguiente.yo && (!O.autoRelevo || ahora - O.autoRelevo > REINTENTO_RELEVO_MS)) { O.autoRelevo = ahora; Transport.tomarSala().catch(() => { /* el anfitrión ha vuelto o ya lo tomó otro */ }); }
  } else if (!ausente) O.autoRelevo = 0;
  // Si el relevo automático no ocurre (el siguiente tampoco responde), cualquiera puede tomar la sala a mano.
  b.style.display = (ausente > BANNER_RELEVO_MS && Transport.soportaTomarSala()) ? 'block' : 'none';
}
function tomarSala() {
  Transport.tomarSala().then(() => { $('on-takeover-banner').style.display = 'none'; }).catch(e => { aviso((e && e.message) || 'No se pudo tomar la sala.'); });
}
function volverseAnfitrion() {
  if (O.host) return;
  O.host = true; O.hostOffSince = 0; O.lastSettings = ''; guardarSesion();
  $('screen-setup').classList.add('online-host');
  clearInterval(O.setInt); O.setInt = setInterval(() => publicarAjustes(false), 1000);
  pedirWake(); if (O.bgPref) activarSegundoPlano();
  O.readySet = new Set(parse(O.pub.ready, [])); O.history = [].concat(parse(O.pub.history, []));
  const ph = O.pub.phase || 'lobby';
  if (ph === 'alcalde') volverALobby(true);
  else if (ph === 'playing' || ph === 'ended') recuperarRolesHost();
  else syncHostPlayers();
  publicarAjustes(true);
  aviso('Ahora eres el anfitrión de la sala.', 7000);
  renderTodo(); route();
}
function perderAnfitrion() {
  if (!O.host) return;
  O.host = false; clearInterval(O.setInt); O.setInt = null; liberarWake(); pararSegundoPlano();
  $('screen-setup').classList.remove('online-host');
  aviso('Otro jugador ha pasado a ser el anfitrión de la sala.', 7000);
  renderTodo(); route();
}
function renderTimer() {
  const area = $('on-timer-area'); if (!area) return;
  const ms = timerMs();
  area.style.display = ms === null ? 'none' : 'block';
  if (ms === null) return;
  const secs = Math.ceil(ms / 1000), t = $('on-timer-time'), lab = $('on-timer-label');
  t.textContent = fmtTime(secs);
  t.classList.remove('warning', 'danger', 'finished');
  const run = !!O.pub.timer.running;
  if (secs === 0) { t.classList.add('finished'); lab.textContent = '¡Tiempo terminado!'; }
  else if (secs <= 10) { t.classList.add('danger'); lab.textContent = 'Tiempo restante'; }
  else if (secs <= 30) { t.classList.add('warning'); lab.textContent = 'Tiempo restante'; }
  else lab.textContent = run ? 'Tiempo restante' : 'En pausa';
  if (run && secs !== O.vibSecs) {
    O.vibSecs = secs;
    if (secs <= 10 && secs > 0) { vibrate(40); sfx('tick'); }
    if (secs === 0) { vibrate([200, 100, 200, 100, 400]); sfx('alarm'); }
  }
  $('on-btn-timer-start').textContent = run ? 'Pausar' : 'Iniciar';
}
function renderTimerControls() {
  const c = $('on-timer-host'); if (c) c.style.display = O.host ? 'block' : 'none';
  renderTimer();
}
function escribirTimer(running, remaining) {
  return Transport.enviar('todos', { tipo: 'estado', timer: { running, remaining: Math.max(0, Math.round(remaining)), at: Transport.ahora() } }).catch(errorEnvio);
}
function secsBase() { return O.timerSecs || ajustes().secs || 180; }
function hostTimerStart() {
  const t = O.pub.timer; if (!O.host || !t) return;
  const ms = timerMs();
  if (t.running) escribirTimer(false, Math.ceil(ms / 1000));
  else if (ms > 0) escribirTimer(true, Math.ceil(ms / 1000));
  vibrate(15);
}
function hostTimerReset() { if (!O.host || !O.pub.timer) return; escribirTimer(false, secsBase()); vibrate(20); }
function hostTimerChange() {
  if (!O.host || !O.pub.timer) return;
  const v = parseInt($('on-inp-timer').value);
  if (!v || v < 10 || v > 3600) return;
  O.timerSecs = v; $('on-inp-timer').value = ''; escribirTimer(false, v); vibrate(20);
}

// =====================================================================
//                      LADO DEL ANFITRIÓN
// =====================================================================
function publicarAjustes(forzar) {
  if (!O.active || !O.host || (O.pub.phase || 'lobby') !== 'lobby') return;
  const s = JSON.stringify(settingsObj());
  if (!forzar && s === O.lastSettings) return;
  O.lastSettings = s;
  Transport.enviar('todos', { tipo: 'estado', settings: s }).catch(() => { O.lastSettings = ''; });
}
// Llamado por el botón "Comenzar" (script.js) antes de repartir.
function prepareStart(errEl) {
  if (!O.active || !O.host) return false;
  if ((O.pub.phase || 'lobby') !== 'lobby') { errEl.textContent = 'Ya hay una ronda en marcha.'; return false; }
  const as = seats();
  if (as.length < 3) { errEl.textContent = 'Se necesitan al menos 3 jugadores en la sala (ahora ' + as.length + ').'; return false; }
  O.order = as.map(p => p.id);
  playerNames = as.map(p => p.nombre);
  state.numPlayers = playerNames.length;
  return true;
}
// Modo Alcalde: ya están elegidos impostores y alcalde; ahora el alcalde escribe las palabras en SU móvil.
function onAlcaldeChosen() {
  const alc = O.order[state.alcaldePlayer - 1];
  O.pending = true;
  const fijas = state.gameMode === 'multiple' ? state.multiWordCount : 0;
  Transport.enviar('todos', { tipo: 'estado', phase: 'alcalde', alcalde: seatOwner(alc), alcaldeName: nombreDe(alc).slice(0, 24), alcaldeWords: fijas, settings: JSON.stringify(settingsObj()), result: null, popup: null })
    .catch(e => { O.pending = false; errorEnvio(e); });
}
function mostrarAlcalde() {
  const s = ajustes();
  state.hintOn = !!s.hint;
  const n = O.pub.alcaldeWords || 1;
  state.alcaldeNumWords = n;
  $('alcalde-who-name').textContent = O.pub.alcaldeName || miNombre();
  $('inp-alcalde-numwords').value = n;
  const w = $('inp-alcalde-numwords').closest('.alcalde-num-words'); if (w) w.style.display = O.pub.alcaldeWords ? 'none' : 'block';
  buildAlcaldeWordsList();
  go('screen-alcalde');
}
// Llamado por "Confirmar" del Alcalde (script.js).
function sendWords(words, hints) {
  if (O.host) { hostOnPalabras({ de: O.uid, palabras: words, pistas: hints }); return; }
  Transport.enviar('host', { tipo: 'palabras', palabras: words, pistas: hints })
    .then(() => { O.sentWords = true; route(); renderLobby(); })
    .catch(errorEnvio);
}
function hostOnPalabras(m) {
  if (!O.host || !O.pending) return;
  if (m.de !== seatOwner(O.order[state.alcaldePlayer - 1])) return;
  const words = (Array.isArray(m.palabras) ? m.palabras : []).map(w => String(w).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  if (words.length === 0) return;
  if (state.gameMode === 'multiple' && words.length !== state.multiWordCount) return;
  let pistas = (Array.isArray(m.pistas) ? m.pistas : []).map(h => String(h).trim().slice(0, 60));
  if (state.gameMode !== 'multiple' && words.length > 1) { const r = alcaldeElegirUna(words, pistas); words.length = 0; words.push(...r.words); pistas = r.hints; }
  state.alcaldeHints = pistas;
  if (words.length === 1) { state.word = words[0]; state.words = []; state.playerWordIdx = {}; }
  else {
    state.word = null; state.words = words; state.multiWordCount = words.length;
    const nonImp = []; for (let i = 1; i <= state.numPlayers; i++) if (!state.impostorSet.has(i)) nonImp.push(i);
    state.playerWordIdx = {}; fisherYates(nonImp).forEach((p, i) => { state.playerWordIdx[p] = i % words.length; });
  }
  state.alcaldeWord = words.join(' / ');
  for (let i = 1; i <= state.numPlayers; i++) if (state.impostorSet.has(i)) { state.firstImpostor = i; break; }
  state.esconditeKeyWritten = false;
  O.pending = false;
  dealRound();
}
// Tarjeta que verá cada jugador, ya resuelta (lista de elementos). Réplica de buildRevealContent para cada modo.
function buildCardView(p) {
  const isImp = state.impostorSet.has(p), mode = state.gameMode, it = [];
  const imp = () => it.push({ k: 'imp', t: 'Eres el Impostor' });
  const sub = (t, f) => it.push({ k: 'sub', t, f: f ? 1 : 0 });
  const hint = t => it.push({ k: 'hint', t });
  const img = (w, c) => { if (state.imagesOn && !isCatNoPng(c)) it.push({ k: 'img', w, c }); };
  const hints = state.alcaldeHints || [];
  const pistaItem = (w, c) => it.push(state.hintStaged ? { k: 'hintstages', l: [pistaTexto(w, c, 'cat'), pistaTexto(w, c, 'inicial'), pistaTexto(w, c, 'desc')] } : { k: 'hint', t: 'Pista · ' + pistaTexto(w, c) });
  if (state.customOn) {
    if (mode === 'escondite' && isImp && p === state.firstImpostor && !state.esconditeKeyWritten) { it.push({ k: 'keyinput' }); return it; }
    if (isImp) {
      const numW = state.words.length > 1 ? state.words.length : 1;
      imp();
      sub(mode === 'escondite' ? subImpEscondite() : (numW > 1 ? 'Hay ' + numW + ' palabras distintas' : 'No conoces la palabra'));
      if (mode === 'escondite' && state.word && state.impKnows) it.push({ k: 'word', t: state.word });
      if (mode === 'escondite') it.push({ k: 'key', l: 'Clave secreta', t: state.esconditeKey || '(el primer impostor la está escribiendo…)' });
      if (state.hintOn) hints.forEach((h, i) => { if (h) hint(numW > 1 ? 'Pista ' + (i + 1) + ' · ' + h : 'Pista · ' + h); });
    } else {
      const alc = p === state.alcaldePlayer;
      if (alc) it.push({ k: 'badge', t: '👑 Alcalde' });
      if (state.words.length > 1) {
        const w = state.playerWordIdx[p] !== undefined ? state.playerWordIdx[p] : 0;
        it.push({ k: 'wtxt', t: state.words[w] });
        if (state.hintOn && hints[w]) hint('Pista · ' + hints[w]);
        sub('Grupo ' + (w + 1) + ' de ' + state.words.length, true);
      } else {
        it.push({ k: 'wtxt', t: state.word || '—' });
        if (state.hintOn && hints[0]) hint('Pista · ' + hints[0]);
      }
      if (state.category && state.category !== 'Personalizada') hint('Categoría · ' + state.category);
      if (alc) sub('Tienes voto de gracia');
    }
    return it;
  }
  if (mode === 'multiple') {
    if (isImp) { imp(); sub('Hay ' + state.multiWordCount + ' palabras distintas'); if (state.hintOn) hint('Pista · ' + state.category); }
    else {
      const w = state.playerWordIdx[p] !== undefined ? state.playerWordIdx[p] : 0;
      const cat = (state.wordCategories && state.wordCategories[w]) || state.category;
      it.push({ k: 'word', t: state.words[w] || '—' }); hint('Categoría · ' + cat); img(state.words[w], cat);
      if (state.multiWordCount > 2) sub('Grupo ' + (w + 1) + ' de ' + state.multiWordCount, true);
    }
  } else if (mode === 'escondite') {
    if (isImp) {
      imp(); sub(subImpEscondite());
      if (state.impKnows) it.push({ k: 'word', t: state.word });
      if (state.esconditeKey) it.push({ k: 'key', l: 'Clave secreta', t: state.esconditeKey });
      if (state.hintOn) pistaItem(state.word, state.category);
    } else {
      it.push({ k: 'word', t: state.word }); hint('Categoría · ' + state.category);
      img(state.word, state.category);
    }
  } else if (isImp) { imp(); sub('No reveles tu identidad'); if (state.hintOn) pistaItem(state.word, state.category); }
  else { it.push({ k: 'word', t: state.word }); hint('Categoría · ' + state.category); img(state.word, state.category); }
  return it;
}
function resText(i) {
  if (state.impostorSet.has(i)) return state.gameMode === 'escondite' ? clean(state.word) + ' / 🔑 ' + clean(state.esconditeKey) : '—';
  if (state.words && state.words.length > 1) { const x = state.playerWordIdx[i]; return x === undefined ? '—' : clean(state.words[x]); }
  return clean(state.word);
}
function rolDoc(i, ronda) {
  const uid = O.order[i - 1], isImp = state.impostorSet.has(i), res = resText(i);
  let items = buildCardView(i);
  // Escondite con Alcalde: todos escriben una palabra primero (señuelo salvo el primer impostor) para que no se sepa quién es el impostor.
  if (state.gameMode === 'escondite' && state.customOn && !(state.impostorSet.has(i) && i === state.firstImpostor)) items = [{ k: 'decoy' }, ...items];
  const tr = !isImp && state.traitor === i;
  if (tr) items = [...items, { k: 'traidor' }];
  const mision = state.missions && state.missions[i];
  if (mision && !(items[0] && items[0].k === 'keyinput')) items = [...items, { k: 'mision', t: mision }];
  const doc = { round: ronda, role: isImp ? 'impostor' : 'civil', card: JSON.stringify(items), res: res.slice(0, 280) };
  if (tr) doc.tr = true;
  return { uid, res, doc };
}
// Un documento por móvil: el del jugador y, si comparte móvil, el de su invitado dentro de "g".
function ensamblarRoles(ronda) {
  const roles = {}, hist = {};
  for (let i = 1; i <= O.order.length; i++) { const r = rolDoc(i, ronda); hist[r.uid] = r; if (!r.uid.startsWith('g:')) roles[r.uid] = { ...r.doc }; }
  const gs = {};
  Object.keys(hist).forEach(id => {
    if (!id.startsWith('g:')) return;
    const r = hist[id], u = seatOwner(id); if (!roles[u]) return;
    (gs[u] = gs[u] || []).push({ k: Number(id.split(':')[2]), n: nombreDe(id).slice(0, 24), card: r.doc.card, r: r.doc.role, res: r.res.slice(0, 200), tr: r.doc.tr ? 1 : 0 });
  });
  Object.keys(gs).forEach(u => { roles[u].g = JSON.stringify(gs[u]); });
  return { roles, hist };
}
// Reparte: escribe a cada jugador SOLO su tarjeta y publica el estado público de la ronda.
function dealRound() {
  const n = O.order.length, ronda = (O.pub.round || 0) + 1;
  O.hostRoles = {};
  const { roles, hist } = ensamblarRoles(ronda);
  Object.keys(hist).forEach(id => { O.hostRoles[id] = { role: hist[id].doc.role, res: hist[id].res, name: nombreDe(id), traidor: !!hist[id].doc.tr }; });
  const ini = (state.customOn && state.alcaldePlayer) ? state.alcaldePlayer : Math.floor(Math.random() * n) + 1;
  O.elim = new Set(); O.timerSecs = null; O.vibSecs = -1; O.readySet = new Set(); O.readySent = -1;
  const estado = {
    phase: 'playing', round: ronda, settings: JSON.stringify(settingsObj()), starting: nombreDe(O.order[ini - 1]).slice(0, 24),
    alcalde: null, alcaldeName: null, alcaldeWords: null, eliminated: '[]', popup: null, result: null, waiting: true, ready: '[]', vote: null, summary: null,
    timer: state.timerOn ? { running: false, remaining: state.timerSeconds, at: Transport.ahora() } : null
  };
  Transport.enviar('todos', { tipo: 'reparto', roles, estado }).catch(e => { O.hostRoles = {}; errorEnvio(e); });
}
// Escondite con Alcalde: el primer impostor envía la clave y se reenvía a sus aliados.
function hostOnClave(m) {
  if (!O.host || state.gameMode !== 'escondite' || !state.customOn || state.esconditeKeyWritten) return;
  if (m.de !== seatOwner(O.order[state.firstImpostor - 1])) return;
  const k = String(m.clave || '').trim().slice(0, 60); if (!k) return;
  state.esconditeKey = k; state.esconditeKeyWritten = true;
  const ronda = O.pub.round || 1, { roles, hist } = ensamblarRoles(ronda), duenos = new Set();
  for (let i = 1; i <= O.order.length; i++) {
    if (!state.impostorSet.has(i)) continue;
    const id = O.order[i - 1];
    if (O.hostRoles[id]) O.hostRoles[id].res = hist[id].res;
    duenos.add(seatOwner(id));
  }
  duenos.forEach(u => { if (roles[u]) Transport.enviar(u, { tipo: 'rol', ...roles[u] }).catch(errorEnvio); });
}
function calcularGanador() {
  const ids = Object.keys(O.hostRoles);
  const impVivos = ids.filter(u => O.hostRoles[u].role === 'impostor' && !O.elim.has(u)).length;
  const civVivos = ids.filter(u => O.hostRoles[u].role === 'civil' && !O.hostRoles[u].traidor && !O.elim.has(u)).length;
  const trVivo = ids.filter(u => O.hostRoles[u].traidor && !O.elim.has(u)).length; // el Traidor cuenta para el bando de los impostores
  if (impVivos === 0) return 'civiles';
  if (impVivos + trVivo >= civVivos) return 'impostores';
  return null;
}
function hostVerRol(uid) {
  const info = O.hostRoles[uid]; if (!info || O.elim.has(uid)) return;
  const imp = info.role === 'impostor', name = nombreDe(uid), tx = textosRol(rolHost(info), bandosOnline());
  const ov = el('div', 'rol-overlay');
  ov.innerHTML = '<div class="rol-card"><div class="rol-player-label">Jugador</div><div class="rol-player-name">' + escapeHtml(name) + '</div>' +
    '<div class="rol-icon">' + tx.icon + '</div>' +
    '<div class="rol-verdict ' + tx.cls + '">' + tx.verdict + '</div>' +
    '<div class="rol-sub">' + tx.msg + '</div>' +
    '<div class="rol-tap-hint">Toca para cerrar (se avisa a todos)</div></div>';
  ov.addEventListener('click', () => { document.body.removeChild(ov); hostEliminar(uid); });
  document.body.appendChild(ov);
  vibrate(imp ? [40, 30, 80] : [60, 20, 60]);
}
function hostEliminar(uid) {
  const info = O.hostRoles[uid]; if (!info || O.elim.has(uid)) return;
  O.elim.add(uid);
  const id = Math.max(Transport.ahora(), O.lastPopupId + 1); O.lastPopupId = id; O.popupSeen = Math.max(O.popupSeen, id);
  const upd = { tipo: 'estado', eliminated: JSON.stringify([...O.elim]), popup: { id, name: nombreDe(uid).slice(0, 24), role: rolHost(info) } };
  upd.vote = null;
  const g = calcularGanador();
  if (g) { upd.result = g; upd.phase = 'ended'; upd.summary = resumenJson(); registrarRonda(g); upd.history = historialJson(); }
  Transport.enviar('todos', upd).catch(e => { O.elim.delete(uid); errorEnvio(e); });
}
// Historial de rondas (lo escribe el anfitrión y lo ven todos): ronda, resultado, impostores y palabra.
function registrarRonda(res) {
  const ronda = O.pub.round || 0;
  if (!O.host || !ronda || O.histRound === ronda || !Object.keys(O.hostRoles).length) return O.history;
  O.histRound = ronda;
  const imps = Object.keys(O.hostRoles).filter(id => O.hostRoles[id].role === 'impostor').map(id => nombreDe(id).slice(0, 16));
  const pal = [...new Set(Object.keys(O.hostRoles).filter(id => O.hostRoles[id].role !== 'impostor').map(id => clean(O.hostRoles[id].res).slice(0, 24)))].slice(0, 3).join(' / ');
  O.history.push([ronda, res, imps.join(', ').slice(0, 60), pal]);
  while (O.history.length > 1 && JSON.stringify(O.history).length > 2300) O.history.shift();
  return O.history;
}
function historialJson() { return JSON.stringify(O.history.slice(-12)); }
function renderHistorial() {
  const h = parse(O.pub.history, []);
  document.querySelectorAll('.on-hist').forEach(box => {
    box.innerHTML = '';
    if (!Array.isArray(h) || !h.length) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const d = el('details'), s = el('summary', 'section-title', '📜 Historial de rondas (' + h.length + ')'); s.style.cursor = 'pointer'; d.appendChild(s);
    h.slice().reverse().forEach(x => { if (!Array.isArray(x)) return; d.appendChild(el('div', 'on-setting', 'Ronda ' + x[0] + ' · ' + (x[1] === 'civiles' ? '🏆 Civiles' : x[1] === 'impostores' ? '🐄 Impostores' : 'Sin final') + ' · Impostor(es): ' + (x[2] || '—') + (x[3] ? ' · Palabra: ' + x[3] : ''))); });
    box.appendChild(d);
  });
}
function resumenJson() {
  return JSON.stringify(Object.keys(O.hostRoles).map(id => [nombreDe(id).slice(0, 24), (O.hostRoles[id].traidor ? 'T' : O.hostRoles[id].role === 'impostor' ? 'I' : 'C'), clean(O.hostRoles[id].res).slice(0, 40), O.elim.has(id) ? 1 : 0]));
}
function hostResultados() {
  const ov = el('div', 'results-overlay'); let filas = '';
  Object.keys(O.hostRoles).forEach(uid => {
    const r = O.hostRoles[uid], tx = textosRol(rolHost(r), bandosOnline()), imp = tx.cls === 'impostor';
    filas += '<tr><td>' + escapeHtml(nombreDe(uid)) + (O.elim.has(uid) ? ' <span class="elim-mark">✕</span>' : '') + '</td><td class="' + (imp ? 'role-impostor' : 'role-civil') + '">' + tx.nombre +
      '</td><td style="color:var(--text-faded);font-size:0.8rem;">' + escapeHtml(r.res) + '</td></tr>';
  });
  ov.innerHTML = '<div class="results-card"><button class="results-close" id="on-results-close">✕ Cerrar</button><div class="results-title">Resultados</div><table class="results-table"><thead><tr><th>Jugador</th><th>Rol</th><th>Palabra</th></tr></thead><tbody>' + filas + '</tbody></table></div>';
  ov.querySelector('#on-results-close').addEventListener('click', e => { e.stopPropagation(); document.body.removeChild(ov); });
  ov.addEventListener('click', e => { if (e.target === ov) document.body.removeChild(ov); });
  document.body.appendChild(ov);
}
function volverALobby(silencioso) {
  if (!O.host) return;
  if (O.pub.phase === 'playing' && O.pub.waiting !== true && !O.pub.result) registrarRonda('-');
  O.hostRoles = {}; O.elim = new Set(); O.pending = false; O.timerSecs = null; O.readySet = new Set();
  Transport.enviar('todos', { tipo: 'reparto', roles: null, estado: { phase: 'lobby', round: O.pub.round || 0, settings: JSON.stringify(settingsObj()), starting: null, alcalde: null, alcaldeName: null, alcaldeWords: null, timer: null, eliminated: null, popup: null, result: null, waiting: null, ready: null, vote: null, summary: null, history: historialJson() } })
    .catch(errorEnvio);
  O.lastSettings = JSON.stringify(settingsObj());
  if (!silencioso) vibrate(30);
}
// Ronda rápida: vuelve al lobby y reparte otra vez con los mismos ajustes (el botón «Comenzar» se pulsa solo).
function hostRondaRapida() {
  if (!O.host) return;
  if (!O.pub.result && !confirm('¿Terminar esta ronda y empezar otra con los mismos ajustes?')) return;
  O.quickPending = true; volverALobby(true);
}
function hostTerminar() {
  if (!O.host) return;
  if (!O.pub.result && !confirm('¿Terminar la ronda y volver al lobby?')) return;
  volverALobby(false);
}
async function recuperarRolesHost() {
  const roles = await Transport.leerRoles();
  O.hostRoles = {};
  Object.keys(roles).forEach(uid => {
    O.hostRoles[uid] = { role: roles[uid].role, res: roles[uid].res || '—', name: nombreDe(uid), traidor: !!roles[uid].tr };
    (roles[uid].g ? [].concat(parse(roles[uid].g, [])) : []).forEach(g => { if (g && g.r) O.hostRoles['g:' + uid + ':' + g.k] = { role: g.r, res: g.res || '—', name: g.n || 'Jugador', traidor: !!g.tr }; });
  });
  renderTodo();
}
function hostQuitarAviso() { if (O.host) Transport.enviar('todos', { tipo: 'estado', popup: null }).catch(errorEnvio); }

// ---------- pantalla encendida (anfitrión) ----------
async function pedirWake() {
  try {
    if (navigator.wakeLock && O.host && !O.wake) {
      O.wake = await navigator.wakeLock.request('screen');
      O.wake.addEventListener('release', () => { O.wake = null; });
    }
  } catch (e) { /* no disponible: se ignora */ }
}
// Segundo plano: un audio totalmente silencioso en bucle hace que el móvil trate la pestaña como «reproduciendo» y no la congele
// con la pantalla bloqueada (el navegador puede mostrar una notificación de reproducción). Es experimental y gasta algo de batería.
function wavSilencioso() {
  const n = 8000, b = new ArrayBuffer(44 + n), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(b, 44).fill(128);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function activarSegundoPlano() {
  if (O.bg) return Promise.resolve(true);
  try {
    const a = new Audio(wavSilencioso()); a.loop = true; a.volume = 1; a.setAttribute('playsinline', '');
    return a.play().then(() => {
      O.bg = a;
      try { if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: 'El Impostor', artist: 'Sala activa' }); } catch (e) { /* nada */ }
      return true;
    }).catch(() => false);
  } catch (e) { return Promise.resolve(false); }
}
function pararSegundoPlano() { try { if (O.bg) { O.bg.pause(); O.bg.src = ''; } } catch (e) { /* nada */ } O.bg = null; }
function liberarWake() { try { if (O.wake) O.wake.release(); } catch (e) { /* nada */ } O.wake = null; }

// ---------- volver a la sala tras recargar ----------
async function intentarReanudar(ses) {
  O.early = { jug: null, estado: null, rol: null };
  const busy = $('on-busy'); if (busy) { busy.style.display = 'flex'; $('on-busy-text').textContent = 'Volviendo a la sala «' + ses.roomName + '»…'; }
  try {
    const res = await Transport.reanudar({ roomId: ses.roomId, transporte: ses.transporte });
    entrarEnSala(res, ses.roomName, ses.nombre);
  } catch (e) {
    const definitivo = e && (e.code === 'sala-no-encontrada');
    if (definitivo) { borrarSesion(); aviso(e.message); }
    else mostrarBannerReanudar(ses, (e && e.message) || 'No se pudo reconectar.');
  } finally { if (busy) busy.style.display = 'none'; }
}
function mostrarBannerReanudar(ses, msg) {
  const b = $('on-resume-banner'); if (!b) return;
  $('on-resume-text').textContent = 'Tienes una sala pendiente: «' + ses.roomName + '». ' + msg;
  b.style.display = 'block';
}

// ---------- enganche de eventos ----------
function bind() {
  $('btn-open-online').addEventListener('click', abrirMenu);
  $('on-btn-menu-back').addEventListener('click', () => go('screen-home'));
  $('btn-home-online').addEventListener('click', abrirMenu);
  $('on-btn-create').addEventListener('click', () => conectar('crear'));
  $('on-btn-join').addEventListener('click', () => conectar('unirse'));
  $('on-btn-leave').addEventListener('click', salirDeSala);
  $('on-btn-leave-lobby').addEventListener('click', salirDeSala);
  $('on-host-leave').addEventListener('click', salirDeSala);
  $('on-btn-cancel-round').addEventListener('click', () => volverALobby(false));
  $('on-reveal-card').addEventListener('click', () => { if (!O.myRole) return; O.revealed = !O.revealed; vibrate(O.revealed ? 25 : 15); sfx(O.revealed ? (vistaActual().rol === 'impostor' ? 'impostor' : 'civil') : 'pass'); renderCard(); });
  $('on-btn-results').addEventListener('click', () => { hostResultados(); vibrate(15); });
  $('on-btn-end').addEventListener('click', hostTerminar);
  $('on-btn-bg').addEventListener('click', () => { if (O.bg) { O.bgPref = false; pararSegundoPlano(); renderHostPanel(); } else { O.bgPref = true; activarSegundoPlano().then(ok => { if (!ok) aviso('Tu navegador no permite mantenerse activo en segundo plano.', 6000); renderHostPanel(); }); } });
  $('on-btn-wake').addEventListener('click', () => { pedirWake().then(() => { renderHostPanel(); renderGame(); }); });
  $('on-btn-quick').addEventListener('click', hostRondaRapida);
  $('on-btn-qr').addEventListener('click', hostMostrarQR);
  $('on-btn-vote-start').addEventListener('click', hostIniciarVoto);
  $('on-btn-vote-close').addEventListener('click', hostCerrarVoto);
  $('on-btn-vote-cancel').addEventListener('click', hostCancelarVoto);
  $('on-btn-vote-elim').addEventListener('click', () => { const v = voto(); if (v && v.win) hostVerRol(v.win); });
  $('on-btn-propose').addEventListener('click', enviarPropuesta);
  $('on-btn-share').addEventListener('click', hostCompartir);
  $('on-pass').addEventListener('input', fuerzaClave);
  $('on-menu-detail-btn').addEventListener('click', () => { const d = $('on-menu-detail'); d.style.display = d.style.display === 'block' ? 'none' : 'block'; });
  $('on-btn-takeover').addEventListener('click', tomarSala);
  $('on-btn-pass').addEventListener('click', pasarMovil);
  $('on-btn-ready').addEventListener('click', marcarListo);
  $('on-btn-start-all').addEventListener('click', () => hostComenzarTodos(false));
  $('on-btn-cancel-wait').addEventListener('click', () => { if (confirm('¿Cancelar la ronda y volver al lobby?')) volverALobby(false); });
  $('on-btn-clear-popup').addEventListener('click', hostQuitarAviso);
  $('on-btn-timer-start').addEventListener('click', hostTimerStart);
  $('on-btn-timer-reset').addEventListener('click', hostTimerReset);
  $('on-btn-timer-change').addEventListener('click', hostTimerChange);
  $('on-resume-retry').addEventListener('click', () => { const s = leerSesion(); $('on-resume-banner').style.display = 'none'; if (s) intentarReanudar(s); });
  $('on-resume-discard').addEventListener('click', () => { borrarSesion(); $('on-resume-banner').style.display = 'none'; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && O.active) { if (O.host) { pedirWake(); hostComprobarListos(); } renderTodo(); } });
  Transport.alRecibir(onMsg); Transport.alCambiarJugadores(onJugadores); Transport.alConexion(onConexion);
  const ses = leerSesion(); if (!aplicarEnlace() && ses) intentarReanudar(ses);
}
bind();

return {
  get active() { return O.active; }, get isHost() { return O.host; },
  prepareStart, onAlcaldeChosen, sendWords, dealRound,
  hostSeat() { return O.order.indexOf(O.uid) + 1; }, seatId(i) { return O.order[i - 1]; }, _mantenimiento: mantenimiento,
  _O: O
};
})();
