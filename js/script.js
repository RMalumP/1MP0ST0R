
let CATEGORIES = [];
function parseLine(line) {
const parts = [];
let buf = '', depth = 0;
for (const ch of line) {
if (ch === '(') depth++;
else if (ch === ')') depth--;
if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; }
else buf += ch;
}
if (buf.trim()) parts.push(buf.trim());
return parts;
}
const state = {
numPlayers: 4, numImpostors: 1,
selectedCats: new Set(),
hintOn: false, vibrateOn: true, soundOn: true, voteOn: true, quickOn: false, quickSecs: 60, hintStaged: false, wordB: null, categoryB: null, traitorOn: false, traitor: null, missionOn: false, missionSpicy: true, missionWho: 'todos', missions: {}, hintMode: 'cat', impKnows: true, keyCat: 'otra', timerOn: false, timerSeconds: 180,
currentPlayer: 0, revealed: false,
word: null, category: null, impostorSet: new Set(),
timerRemaining: 180, timerInterval: null, timerRunning: false,
imagesOn: false,
  gameMode: 'normal', // 'normal' | 'multiple' | 'escondite'
multiWordCount: 2, // nº de palabras distintas en modo múltiple
words: [], // array de palabras asignadas (modo múltiple)
playerWordIdx: {}, // jugador → índice de su palabra (modo múltiple)
esconditeKey: null, // palabra secreta de reconocimiento (modo escondite)
customOn: false, // modo personalizada activado
alcaldeWord: null, // palabra elegida por el alcalde
alcaldePlayer: null, // jugador elegido como alcalde (1-based)
alcaldeNumWords: 1, // nº de palabras definidas por el alcalde
alcaldeHints: [], // pistas por palabra (alcalde)
  alcaldeMode: 'random', // 'random' = al azar, 'rotate' = sin repetir hasta que lo sean todos, 'host' = siempre el anfitrión (online)
  alcaldeHist: { n: 0, vistos: [] }, // quién ha sido Alcalde (para 'rotate')
esconditeKeyWritten: false,// el primer impostor ya escribió su clave
decoyDone: {},// jugadores (no impostor inicial) que ya escribieron su palabra señuelo
firstImpostor: null, // primer impostor en orden de turno
allSeen: false, // todos los jugadores han visto su carta
eliminated: new Set(), // jugadores eliminados (1-based)
};
// ---- Sonidos sencillos con WebAudio (sin archivos). Se activan/desactivan en Opciones y se recuerdan en el navegador.
let _ac = null;
const SFX = { reveal: [[520, .08], [780, .12]], impostor: [[220, .12], [165, .22]], civil: [[520, .08], [660, .1]], pass: [[440, .06]],
  elim: [[330, .1], [247, .1], [165, .25]], win: [[523, .12], [659, .12], [784, .12], [1047, .3]], lose: [[392, .15], [330, .15], [262, .3]],
  tick: [[880, .05]], alarm: [[880, .15], [660, .15], [880, .15], [660, .3]], vote: [[600, .06], [800, .08]] };
function sfx(name) {
  if (!state.soundOn || !SFX[name]) return;
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    let t = _ac.currentTime;
    SFX[name].forEach(([f, d]) => {
      const o = _ac.createOscillator(), g = _ac.createGain();
      o.type = (name === 'impostor' || name === 'lose' || name === 'elim') ? 'sawtooth' : 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.15, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(_ac.destination); o.start(t); o.stop(t + d + .02); t += d;
    });
  } catch (e) { /* sin audio */ }
}
// Texto de la pista del impostor según el tipo elegido: categoría (general), categoría + inicial y nº de letras, o la descripción entre paréntesis de la lista.
// Escondite: ¿los impostores ven la palabra de la gente? (opción del anfitrión) y de qué categoría sale su palabra común (la clave).
const subImpEscondite = () => state.impKnows ? 'Conoces la palabra · Encuéntrate con tus aliados' : 'No conoces la palabra de la gente · Encuéntrate con tus aliados';
function updateEscCfg() {
const c = $('escondite-config'); if (!c) return;
c.style.display = state.gameMode === 'escondite' ? 'block' : 'none';
document.querySelectorAll('[data-ik]').forEach(b => b.classList.toggle('selected', (b.dataset.ik === '1') === state.impKnows));
document.querySelectorAll('[data-kc]').forEach(b => b.classList.toggle('selected', b.dataset.kc === state.keyCat));
}
// ---- Roles: etiquetas según el modo (Bandos usa «Bando A/B») y el Traidor (un civil secreto que juega para los impostores).
const esBandos = () => state.gameMode === 'bandos';
function textosRol(rol, bandos) {
if (bandos === undefined ? esBandos() : bandos) return rol === 'impostor'
? { icon: '🅱️', cls: 'impostor', verdict: 'BANDO B ELIMINADO', msg: 'Se ha eliminado a alguien del bando B.', nombre: 'Bando B' }
: { icon: '🅰️', cls: 'civil', verdict: 'BANDO A ELIMINADO', msg: 'Se ha eliminado a alguien del bando A.', nombre: 'Bando A' };
if (rol === 'traidor') return { icon: '🕶', cls: 'impostor', verdict: 'TRAIDOR ELIMINADO', msg: 'Era el Traidor: jugaba con los impostores.', nombre: 'Traidor' };
return rol === 'impostor'
? { icon: '🎭', cls: 'impostor', verdict: 'IMPOSTOR ELIMINADO', msg: 'Se ha eliminado a un Impostor.<br>Se ha hecho justicia.', nombre: 'Impostor' }
: { icon: '👤', cls: 'civil', verdict: 'CIVIL ELIMINADO', msg: 'Habéis matado un inocente.<br>Era un Civil.', nombre: 'Civil' };
}
const rolLocal = p => state.impostorSet.has(p) ? 'impostor' : (state.traitor === p ? 'traidor' : 'civil');
// Elige al Traidor entre los civiles (no el Alcalde). Hacen falta al menos 3 civiles para que tenga sentido.
function asignarTraidor() {
state.traitor = null;
if (!state.traitorOn || esBandos()) return;
const civ = []; for (let i = 1; i <= state.numPlayers; i++) if (!state.impostorSet.has(i) && !(state.customOn && i === state.alcaldePlayer)) civ.push(i);
if (civ.length >= 3) state.traitor = fisherYates(civ)[0];
}
// Misiones secretas (opción): se reparte una por jugador al empezar la ronda.
function asignarMisiones() {
state.missions = {};
if (!state.missionOn || typeof Misiones === 'undefined') return;
const asientos = []; for (let i = 1; i <= state.numPlayers; i++) asientos.push({ id: i, rol: rolLocal(i) });
state.missions = Misiones.repartir(asientos, state.missionWho, esBandos(), state.missionSpicy);
}
// Notas extra de la tarjeta (traidor y misión) que se añaden al final del contenido normal.
function notasExtra(shown, p) {
if (state.traitor === p && !shown.querySelector('.traitor-note')) { const n = document.createElement('div'); n.className = 'traitor-note'; n.textContent = '🕶 Eres el Traidor: ganas si ganan los impostores. Tú no sabes quiénes son.'; shown.appendChild(n); }
const m = state.missions && state.missions[p];
if (m && !shown.querySelector('.mission-note')) { const n = document.createElement('div'); n.className = 'mission-note'; n.textContent = '📋 Misión secreta: ' + m; shown.appendChild(n); }
}
function pistaTexto(word, cat, modo) {
modo = modo || state.hintMode;
const m = String(word || '').match(/^(.*?)\s*\((.+)\)\s*$/);
const limpia = (m ? m[1] : String(word || '')).trim(), desc = m ? m[2].trim() : '';
const letras = limpia.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length, palabras = limpia.split(/\s+/).filter(Boolean).length;
if (modo === 'desc' && desc) return desc;
if ((modo === 'inicial' || modo === 'desc') && limpia) return cat + ' · empieza por «' + limpia.charAt(0).toUpperCase() + '» · ' + (palabras > 1 ? palabras + ' palabras, ' : '') + letras + ' letras';
return cat;
}
function vibrate(ms) { if (state.vibrateOn && navigator.vibrate) { try { navigator.vibrate(ms); } catch(e){} } }
function $(id) { return document.getElementById(id); }
function fisherYates(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Sistema de historial para palabras y categorías
const _wordHistory = {
  usedWords: new Set(),       // palabras usadas en esta sesión
  usedCats: new Set(),        // categorías usadas recientemente
  lastWord: null,             // palabra de la ronda anterior
  lastCat: null,              // categoría de la ronda anterior
  catQueue: [],               // cola de categorías pendientes (para equilibrio)
  wordQueue: [],              // cola de palabras pendientes por categoría
};

// Elige una palabra equilibrada: rota categorías y evita repeticiones
// ---- Bandos: dos palabras PARECIDAS de la misma categoría. Se puntúa el parecido por palabras en común del nombre y de la descripción
// entre paréntesis (p. ej. dos personajes de «Juego de Tronos»); si no hay ninguna en común, se elige otra de la misma categoría.
const BANDOS_STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'un', 'una', 'por', 'con', 'para', 'que', 'al', 'se', 'su', 'sus', 'the', 'of', 'and']);
function tokensBandos(w) {
const m = String(w).match(/^(.*?)\s*\((.+)\)\s*$/), nombre = m ? m[1] : String(w), desc = m ? m[2] : '';
const t = s => new Set(imgNorm(s).split(' ').filter(x => x.length > 2 && !BANDOS_STOP.has(x)));
return { nombre: t(nombre), desc: t(desc), descTxt: imgNorm(desc), ini: imgNorm(nombre).charAt(0) };
}
function similitudBandos(a, b) {
const comun = (x, y) => [...x].filter(k => y.has(k)).length;
let s = 3 * comun(a.desc, b.desc) + 2 * (comun(a.desc, b.nombre) + comun(a.nombre, b.desc)) + comun(a.nombre, b.nombre);
if (a.descTxt && a.descTxt === b.descTxt) s += 2;
return s;
}
function pickBandosPair(pool) {
const main0 = pickBalancedWord(pool); if (!main0) return null;
const otras = pool.filter(p => imgNorm(p.word) !== imgNorm(main0.word));
const enCat = otras.filter(p => p.category === main0.category);
const base = enCat.length ? enCat : otras; if (!base.length) return null;
const mejorPara = (m, lista) => { const tm = tokensBandos(m.word); let mejor = -1, cand = []; lista.forEach(p => { const s = similitudBandos(tm, tokensBandos(p.word)); if (s > mejor) { mejor = s; cand = [p]; } else if (s === mejor) cand.push(p); }); return { mejor, cand }; };
const r0 = mejorPara(main0, base);
if (r0.mejor > 0 || enCat.length < 3) return { a: main0, b: fisherYates(r0.cand)[0], similitud: r0.mejor };
// La palabra elegida no tiene ninguna parecida en su categoría: se busca otra pareja de la misma categoría que sí se parezca.
const todas = enCat.concat([main0]), pares = [];
fisherYates(todas).slice(0, 40).forEach(m => { const tm = tokensBandos(m.word); todas.forEach(p => { if (imgNorm(p.word) === imgNorm(m.word)) return; const s = similitudBandos(tm, tokensBandos(p.word)); if (s > 0) pares.push({ m, p, s }); }); });
if (!pares.length) return { a: main0, b: fisherYates(r0.cand)[0], similitud: 0 };
const top = Math.max(...pares.map(x => x.s)), buenos = pares.filter(x => x.s >= Math.max(1, top / 2));
const e = fisherYates(buenos)[0];
return { a: e.m, b: e.p, similitud: e.s };
}
function pickBalancedWord(pool) {
  if (!pool || pool.length === 0) return null;

  // Agrupar palabras por categoría
  const byCat = {};
  pool.forEach(item => {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });
  const allCats = Object.keys(byCat);

  // Elegir categoría: priorizar las menos usadas recientemente
  let catCandidates = allCats.filter(c => !_wordHistory.usedCats.has(c) && c !== _wordHistory.lastCat);
  if (catCandidates.length === 0) {
    // Todas usadas: resetear pero mantener la última para evitar repetición inmediata
    _wordHistory.usedCats.clear();
    catCandidates = allCats.filter(c => c !== _wordHistory.lastCat);
    if (catCandidates.length === 0) catCandidates = allCats; // fallback total
  }

  // Shuffle de candidatos de categoría y elegir una
  const shuffledCats = fisherYates(catCandidates);
  const chosenCat = shuffledCats[0];
  _wordHistory.usedCats.add(chosenCat);
  _wordHistory.lastCat = chosenCat;

  // Dentro de la categoría elegida, evitar palabras ya usadas
  const wordsInCat = byCat[chosenCat];
  let wordCandidates = wordsInCat.filter(w => !_wordHistory.usedWords.has(w.word) && w.word !== _wordHistory.lastWord);
  if (wordCandidates.length === 0) {
    // Todas las palabras de esta categoría usadas: resetear las de esta cat
    wordsInCat.forEach(w => _wordHistory.usedWords.delete(w.word));
    wordCandidates = wordsInCat.filter(w => w.word !== _wordHistory.lastWord);
    if (wordCandidates.length === 0) wordCandidates = wordsInCat;
  }

  const shuffledWords = fisherYates(wordCandidates);
  const chosen = shuffledWords[0];
  _wordHistory.usedWords.add(chosen.word);
  _wordHistory.lastWord = chosen.word;
  return chosen;
}

// Versión para modo múltiple: elige N palabras equilibradas entre categorías distintas
function pickBalancedMultipleWords(pool, n) {
  if (!pool || pool.length < n) return null;

  const byCat = {};
  pool.forEach(item => {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  });
  const allCats = Object.keys(byCat);

  // Elegir N categorías distintas (o la misma si no hay suficientes)
  let catCandidates = allCats.filter(c => c !== _wordHistory.lastCat);
  if (catCandidates.length === 0) catCandidates = allCats;
  const shuffledCats = fisherYates(catCandidates);

  const chosen = [];
  const usedCatsThisRound = new Set();

  for (let i = 0; i < n && chosen.length < n; i++) {
    // Intentar elegir de una categoría diferente si es posible
    let cat = shuffledCats[i % shuffledCats.length];
    if (usedCatsThisRound.has(cat) && shuffledCats.length > 1) {
      const alt = shuffledCats.find(c => !usedCatsThisRound.has(c));
      if (alt) cat = alt;
    }
    usedCatsThisRound.add(cat);

    const wordsInCat = (byCat[cat] || []).filter(w => !chosen.some(c => c.word === w.word));
    let wordCandidates = wordsInCat.filter(w => !_wordHistory.usedWords.has(w.word));
    if (wordCandidates.length === 0) wordCandidates = wordsInCat;
    if (wordCandidates.length === 0) {
      // Fallback: cualquier palabra del pool no elegida aún
      const remaining = pool.filter(w => !chosen.some(c => c.word === w.word));
      if (remaining.length > 0) chosen.push(fisherYates(remaining)[0]);
      continue;
    }
    chosen.push(fisherYates(wordCandidates)[0]);
  }

  chosen.forEach(w => _wordHistory.usedWords.add(w.word));
  if (chosen[0]) _wordHistory.lastWord = chosen[0].word;
  return chosen;
}

// Reiniciar historial de palabras (al volver al setup)
function resetWordHistory() {
  _wordHistory.usedWords.clear();
  _wordHistory.usedCats.clear();
  _wordHistory.lastWord = null;
  _wordHistory.lastCat = null;
}
// Historial por número de jugadores: clave = numPlayers, valor = {counts: {}, lastImpostors: Set}
const _impostorHistory = {};

function _getHistory(numPlayers) {
  if (!_impostorHistory[numPlayers]) {
    _impostorHistory[numPlayers] = { counts: {}, lastImpostors: new Set() };
  }
  const h = _impostorHistory[numPlayers];
  // Inicializar contadores para todos los jugadores actuales
  for (let i = 1; i <= numPlayers; i++) {
    if (h.counts[i] === undefined) h.counts[i] = 0;
  }
  return h;
}

function pickImpostors(numPlayers, numImpostors) {
  const players = Array.from({length: numPlayers}, (_, i) => i + 1);
  const h = _getHistory(numPlayers);

  // Encontrar el mínimo de veces que alguien ha sido impostor
  const minCount = Math.min(...players.map(p => h.counts[p]));

  // Candidatos preferentes: los que tienen el mínimo de veces (más "frescos")
  // y que NO fueron impostores en la ronda anterior (para evitar repetición inmediata)
  let preferred = players.filter(p => h.counts[p] === minCount && !h.lastImpostors.has(p));

  // Si no hay suficientes candidatos preferentes, relajamos la restricción de la ronda anterior
  if (preferred.length < numImpostors) {
    preferred = players.filter(p => h.counts[p] === minCount);
  }

  // Si aún no hay suficientes, incluimos al siguiente nivel de conteo
  if (preferred.length < numImpostors) {
    const sorted = players.slice().sort((a, b) => h.counts[a] - h.counts[b]);
    preferred = sorted.slice(0, Math.max(numImpostors * 2, Math.ceil(numPlayers * 0.6)));
    // Quitar los de la ronda anterior si es posible
    const withoutLast = preferred.filter(p => !h.lastImpostors.has(p));
    if (withoutLast.length >= numImpostors) preferred = withoutLast;
  }

  // Mezclar aleatoriamente el pool de candidatos y elegir
  const shuffled = fisherYates(preferred);
  const chosen = new Set(shuffled.slice(0, numImpostors));

  // Actualizar historial
  chosen.forEach(p => { h.counts[p] = (h.counts[p] || 0) + 1; });
  h.lastImpostors = new Set(chosen);

  return chosen;
}
// Alcalde con varias palabras fuera del modo Múltiple: se elige UNA al azar (con su pista); no se hacen grupos.
function alcaldeElegirUna(words, hints) {
const i = Math.floor(Math.random() * words.length);
return { words: [words[i]], hints: (hints && hints[i] !== undefined) ? [hints[i]] : [] };
}
// Si el jugador `seat` (1-based) salió impostor, lo cambia por un civil al azar y corrige el historial.
// Alcalde según la opción: al azar, o «sin repetir» (nadie repite hasta que todos los posibles han sido Alcalde).
function elegirAlcalde(candidatos) {
if (state.alcaldeMode !== 'rotate') return fisherYates(candidatos)[0];
const h = state.alcaldeHist;
if (h.n !== state.numPlayers) { h.n = state.numPlayers; h.vistos = []; }
const clave = i => (typeof Online !== 'undefined' && Online.active) ? Online.seatId(i) : 'p' + i;
let libres = candidatos.filter(i => !h.vistos.includes(clave(i)));
if (!libres.length) { h.vistos = []; libres = candidatos.slice(); }
const elegido = fisherYates(libres)[0];
h.vistos.push(clave(elegido));
return elegido;
}
function sacarDeImpostores(set, seat, numPlayers) {
if (!set.has(seat)) return set;
const civiles = []; for (let i = 1; i <= numPlayers; i++) if (!set.has(i) && i !== seat) civiles.push(i);
if (!civiles.length) return set;
const nuevo = fisherYates(civiles)[0], h = _getHistory(numPlayers);
set.delete(seat); set.add(nuevo);
h.counts[seat] = Math.max(0, (h.counts[seat] || 1) - 1); h.counts[nuevo] = (h.counts[nuevo] || 0) + 1;
h.lastImpostors = new Set(set);
return set;
}
function showScreen(id) {
document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
$(id).classList.add('active');
window.scrollTo({ top: 0, behavior: 'instant' });
const bi = document.getElementById('btn-info-toggle');
if (bi) bi.style.display = id === 'screen-setup' ? 'flex' : 'none';
const ftr = document.getElementById('info-footer');
if (ftr && id !== 'screen-setup') ftr.classList.remove('visible');
}
let playerNames = ['', '', '', '']; // nombres (índice 0-based), length = nº jugadores
function getNumPlayers() { return playerNames.length; }
function buildPlayersTable() {
const tbody = $('players-table');
if (!tbody) return;
tbody.innerHTML = '';
const n = playerNames.length;
playerNames.forEach((name, i) => {
const tr = document.createElement('tr');
tr.innerHTML =
`<td class="td-num" style="color:var(--text-faded);font-size:0.8rem;font-weight:600;white-space:nowrap;padding-right:6px;width:70px;">Jugador ${i+1}</td>` +
`<td class="td-inp"><input type="text" class="player-name-inp" placeholder="Nombre (opcional)" value="${name.replace(/"/g,'&quot;')}" data-idx="${i}" maxlength="24"></td>` +
`<td class="td-order" style="width:22px;">` +
`<button class="btn-order btn-up" data-idx="${i}" title="Subir" ${i===0?'style="opacity:0.2;pointer-events:none;"':''}>▲</button>` +
`<button class="btn-order btn-dn" data-idx="${i}" title="Bajar" ${i===n-1?'style="opacity:0.2;pointer-events:none;"':''}>▼</button>` +
`</td>` +
`<td class="td-del"><button class="btn-del-player" data-idx="${i}" title="Eliminar">✕</button></td>`;
tbody.appendChild(tr);
});
tbody.querySelectorAll('.player-name-inp').forEach(inp => {
inp.addEventListener('input', e => { playerNames[parseInt(e.target.dataset.idx)] = e.target.value; });
inp.addEventListener('click', e => e.stopPropagation());
});
tbody.querySelectorAll('.btn-up').forEach(btn => {
btn.addEventListener('click', () => {
const i = parseInt(btn.dataset.idx);
if (i === 0) return;
[playerNames[i-1], playerNames[i]] = [playerNames[i], playerNames[i-1]];
buildPlayersTable(); vibrate(10);
});
});
tbody.querySelectorAll('.btn-dn').forEach(btn => {
btn.addEventListener('click', () => {
const i = parseInt(btn.dataset.idx);
if (i >= playerNames.length - 1) return;
[playerNames[i], playerNames[i+1]] = [playerNames[i+1], playerNames[i]];
buildPlayersTable(); vibrate(10);
});
});
tbody.querySelectorAll('.btn-del-player').forEach(btn => {
btn.addEventListener('click', () => {
const i = parseInt(btn.dataset.idx);
if (playerNames.length <= 3) return;
playerNames.splice(i, 1);
syncStepperToNames();
buildPlayersTable(); vibrate(15);
});
});
const addBtn = $('btn-add-player');
if (addBtn) {
addBtn.onclick = () => {
playerNames.push('');
syncStepperToNames();
buildPlayersTable();
const inputs = tbody.querySelectorAll('.player-name-inp');
if (inputs.length) inputs[inputs.length-1].focus();
vibrate(10);
};
}
}
function syncStepperToNames() {
state.numPlayers = playerNames.length;
$('inp-players').value = playerNames.length;
updateImpostorCap();
if (typeof updateModeUI === 'function') updateModeUI();
}
function setPlayers(v) {
v = Math.max(3, v || 3);
// El historial se mantiene separado por nº de jugadores, no necesita reset
while (playerNames.length < v) playerNames.push('');
while (playerNames.length > v) playerNames.pop();
state.numPlayers = v;
$('inp-players').value = v;
buildPlayersTable();
updateImpostorCap();
if (typeof updateModeUI === 'function') updateModeUI();
}
$('btn-players-minus').addEventListener('click', () => { setPlayers(getNumPlayers() - 1); vibrate(10); });
$('btn-players-plus').addEventListener('click', () => { setPlayers(getNumPlayers() + 1); vibrate(10); });
$('inp-players').addEventListener('change', e => { setPlayers(parseInt(e.target.value)); });
$('inp-players').addEventListener('blur', e => { setPlayers(parseInt(e.target.value)); });
$('names-collapsible-header').addEventListener('click', () => {
$('names-collapsible').classList.toggle('names-collapsible-open');
vibrate(10);
});
function clampImpostors(v) { const n = getNumPlayers(), tope = state.gameMode === 'bandos' ? Math.max(1, Math.floor((n - 1) / 2)) : n; return Math.max(1, Math.min(tope, v || 1)); }
function updateImpostorCap() {
const cap = state.gameMode === 'bandos' ? Math.max(1, Math.floor((getNumPlayers() - 1) / 2)) : getNumPlayers();
if (state.numImpostors > cap) setImpostors(cap);
}
function setImpostors(v) {
v = clampImpostors(v);
state.numImpostors = v;
$('inp-impostors').value = v;
if (typeof updateModeUI === 'function') updateModeUI();
}
var MODE_DESCS = {
normal: {
title: 'Modo Normal',
text: 'Todos los jugadores ven la misma palabra excepto los impostores, que deben pasar desapercibidos.',
bullets: ['Un impostor sin palabra', 'Los demás deben descubrirle', 'El impostor gana si no es votado']
},
multiple: {
title: 'Palabras Múltiples',
text: 'Los no-impostores se dividen en grupos, cada uno ve una palabra diferente. Los impostores solo saben cuántos grupos hay.',
bullets: ['Requiere 8+ jugadores', 'Los grupos no saben qué ven los demás', 'El impostor intenta adivinar alguna de las palabras', 'Con 12+ jugadores puedes elegir más palabras']
},
bandos: {
title: 'Bandos',
text: 'Dos bandos con palabras parecidas de la misma categoría. Nadie sabe de qué bando es: cada uno cree que tiene la palabra «normal» y que los otros se equivocan.',
bullets: ['Requiere 4+ jugadores', 'Los jugadores del bando B son siempre menos que los del A', 'Nadie dice su palabra: hay que descubrir quién tiene otra', 'Gana el bando que elimina al otro (el B también gana si iguala en número)']
},
escondite: {
title: 'Escondite',
text: 'Los impostores conocen la palabra común y además tienen una clave secreta para reconocerse entre ellos sin ser descubiertos.',
bullets: ['Requiere 2+ impostores', 'Los impostores conocen la palabra', 'Deben encontrarse usando su clave sin ser pillados', 'Los demás no saben que los impostores se comunican']
}
};
function renderModeDesc() {
var box = $('mode-desc-box');
if (!box) return;
var d = MODE_DESCS[state.gameMode];
if (!d) { box.innerHTML = ''; return; }
var cls = state.gameMode;
box.innerHTML = '<div class="mode-desc ' + cls + '"><div class="mode-desc-title">' + d.title + '</div><div class="mode-desc-text">' + d.text + '</div><ul class="mode-desc-bullets">' + d.bullets.map(function(b){ return '<li>' + b + '</li>'; }).join('') + '</ul></div>';
}
function updateModeUI() {
if (state.gameMode === 'bandos' && state.customOn) setCustomOn(false);
const lblImp = $('lbl-impostors'); if (lblImp) lblImp.textContent = state.gameMode === 'bandos' ? 'Jugadores del bando B (los menos)' : 'Impostores';
const n = state.numPlayers;
const imp = state.numImpostors;
const canMultiple = n >= 8;
const canEscondite = imp >= 2;
// Múltiple: marcar como unavailable si no cumple requisitos, pero sin bloquear clicks
const modeMultiple = $('mode-multiple');
if (!canMultiple) {
modeMultiple.classList.add('unavailable');
} else {
modeMultiple.classList.remove('unavailable');
}
// Escondite: igual
const modeEscondite = $('mode-escondite');
if (!canEscondite) {
modeEscondite.classList.add('unavailable');
} else {
modeEscondite.classList.remove('unavailable');
}
const filaAlc = $('alcalde-mode-row');
if (filaAlc) {
const esAnf = typeof Online !== 'undefined' && Online.active && Online.isHost;
filaAlc.style.display = state.customOn ? 'block' : 'none';
$('alc-host').style.display = esAnf ? '' : 'none';
if (!esAnf && state.alcaldeMode === 'host') state.alcaldeMode = 'random';
$('alc-rand').classList.toggle('selected', state.alcaldeMode === 'random');
$('alc-rot').classList.toggle('selected', state.alcaldeMode === 'rotate');
$('alc-host').classList.toggle('selected', state.alcaldeMode === 'host');
}
document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
$('mode-' + state.gameMode).classList.add('selected');
// Abrir panel de detalles solo si el modo seleccionado no cumple requisitos y NO ha sido abierto manualmente
const wrap = $('mode-details-wrap');
const modeHasReqs = (state.gameMode === 'multiple' && !canMultiple) || (state.gameMode === 'escondite' && !canEscondite);
const isManuallyOpened = wrap && wrap.dataset.manuallyOpened === 'true';
if (modeHasReqs && !isManuallyOpened && wrap) {
wrap.classList.add('mode-details-open');
}
updateEscCfg();
const multiCfg = $('multi-word-config');
if (state.gameMode === 'multiple') {
if (n >= 12) {
multiCfg.style.display = 'block';
renderMultiWordBtns();
} else {
multiCfg.style.display = 'none';
state.multiWordCount = 2;
}
} else {
multiCfg.style.display = 'none';
}
renderModeDesc();
const lbl = $('mode-details-label');
if (lbl) { const names = {normal:'Normal',multiple:'Múltiple',escondite:'Escondite'}; lbl.textContent = 'Ver detalles · ' + (names[state.gameMode] || ''); }
}
setPlayers(4);
setImpostors(1);
$('btn-impostors-minus').addEventListener('click', () => { setImpostors(state.numImpostors - 1); vibrate(10); });
$('btn-impostors-plus').addEventListener('click', () => { setImpostors(state.numImpostors + 1); vibrate(10); });
$('inp-impostors').addEventListener('change', e => { setImpostors(parseInt(e.target.value)); });
$('inp-impostors').addEventListener('blur', e => { setImpostors(parseInt(e.target.value)); });
function bindSwitch(elId, key, onChange) {
const el = $(elId);
el.addEventListener('click', () => {
state[key] = !state[key];
el.classList.toggle('on', state[key]);
if (state[key]) vibrate(15);
if (onChange) onChange(state[key]);
});
}
bindSwitch('sw-hint', 'hintOn', () => updateHintUI());
function updateHintUI() {
$('hint-mode-row').style.display = state.hintOn && !state.hintStaged ? 'block' : 'none';
document.querySelectorAll('[data-hm]').forEach(b => b.classList.toggle('selected', b.dataset.hm === state.hintMode));
}
document.querySelectorAll('[data-hm]').forEach(b => b.addEventListener('click', () => { state.hintMode = b.dataset.hm; updateHintUI(); vibrate(10); }));
bindSwitch('sw-images', 'imagesOn');
bindSwitch('sw-vibrate', 'vibrateOn');
try { if (localStorage.getItem('impostor.sound') === '0') { state.soundOn = false; $('sw-sound').classList.remove('on'); } } catch (e) { /* nada */ }
bindSwitch('sw-sound', 'soundOn', on => { try { localStorage.setItem('impostor.sound', on ? '1' : '0'); } catch (e) { /* nada */ } if (on) sfx('reveal'); });
bindSwitch('sw-vote', 'voteOn');
bindSwitch('sw-traitor', 'traitorOn');
bindSwitch('sw-quick', 'quickOn', () => updateQuickUI());
function updateQuickUI() {
$('quick-secs-row').style.display = state.quickOn ? 'block' : 'none';
document.querySelectorAll('[data-qs]').forEach(b => b.classList.toggle('selected', Number(b.dataset.qs) === state.quickSecs));
}
document.querySelectorAll('[data-qs]').forEach(b => b.addEventListener('click', () => { state.quickSecs = Number(b.dataset.qs); updateQuickUI(); vibrate(10); }));
bindSwitch('sw-staged', 'hintStaged', () => updateHintUI());
bindSwitch('sw-mission', 'missionOn', () => updateMissionUI());
bindSwitch('sw-spicy', 'missionSpicy');
function updateMissionUI() {
$('mission-who-row').style.display = state.missionOn ? 'block' : 'none';
document.querySelectorAll('[data-mw]').forEach(b => b.classList.toggle('selected', b.dataset.mw === state.missionWho));
}
document.querySelectorAll('[data-mw]').forEach(b => b.addEventListener('click', () => { state.missionWho = b.dataset.mw; updateMissionUI(); vibrate(10); }));
bindSwitch('sw-timer', 'timerOn', on => { $('timer-config').style.display = on ? 'block' : 'none'; });
$('inp-timer').addEventListener('input', e => {
let v = parseInt(e.target.value) || 10;
if (v < 10) v = 10; if (v > 3600) v = 3600;
state.timerSeconds = v;
});
$('mode-details-toggle').addEventListener('click', () => {
const wrap = $('mode-details-wrap');
wrap.classList.toggle('mode-details-open');
wrap.dataset.manuallyOpened = 'true';
vibrate(10);
});
$('opts-header').addEventListener('click', () => {
const section = $('opts-header').closest('.section');
section.classList.toggle('collapsible-open');
vibrate(10);
});
function renderMultiWordBtns() {
const max = state.numPlayers < 12 ? 2 : Math.min(5, 2 + Math.floor((state.numPlayers - 8) / 4));
const container = $('multi-word-btns');
container.innerHTML = '';
for (let i = 2; i <= max; i++) {
const btn = document.createElement('button');
btn.className = 'multi-word-btn' + (state.multiWordCount === i ? ' selected' : '');
btn.textContent = i;
btn.addEventListener('click', () => {
state.multiWordCount = i;
container.querySelectorAll('.multi-word-btn').forEach(b => b.classList.remove('selected'));
btn.classList.add('selected');
vibrate(10);
});
container.appendChild(btn);
}
if (state.multiWordCount > max) state.multiWordCount = max;
}
document.querySelectorAll('.mode-btn').forEach(btn => {
btn.addEventListener('click', () => {
const mode = btn.dataset.mode;
state.gameMode = mode;
updateImpostorCap();
updateModeUI();
vibrate(15);
});
});
updateModeUI();
function isCatBlocked(cat) { return !!cat.blocked; }
function buildCatGrid() {
const catGrid = $('cat-grid');
catGrid.innerHTML = '';
CATEGORIES.forEach(cat => {
const blocked = isCatBlocked(cat);
const isSelected = state.selectedCats.has(cat.id);
let cls = 'cat-btn';
if (blocked) cls += ' blocked';
if (isSelected) cls += ' selected';
const btn = document.createElement('button');
btn.className = cls;
btn.textContent = cat.name;
btn.dataset.id = cat.id;
btn.addEventListener('click', () => {
if (state.customOn) return;
if (state.selectedCats.has(cat.id)) {
state.selectedCats.delete(cat.id);
btn.classList.remove('selected');
} else {
state.selectedCats.add(cat.id);
btn.classList.add('selected');
}
updateAllBtn();
vibrate(10);
});
catGrid.appendChild(btn);
});
}
function updateAllBtn() {
const nonBlocked = CATEGORIES.filter(cat => !isCatBlocked(cat));
const allSelected = nonBlocked.length > 0 && nonBlocked.every(cat => state.selectedCats.has(cat.id));
$('btn-all').classList.toggle('active', allSelected && !state.customOn);
}
$('btn-all').addEventListener('click', () => {
if (state.customOn) {
setCustomOn(false);
const nonBlocked = CATEGORIES.filter(cat => !isCatBlocked(cat));
nonBlocked.forEach(cat => state.selectedCats.add(cat.id));
document.querySelectorAll('.cat-btn').forEach(b => {
const cat = CATEGORIES.find(cc => cc.id === b.dataset.id);
if (cat && !isCatBlocked(cat)) b.classList.add('selected');
});
updateAllBtn();
vibrate(20);
return;
}
const nonBlocked = CATEGORIES.filter(cat => !isCatBlocked(cat));
const allSelected = nonBlocked.every(cat => state.selectedCats.has(cat.id));
if (allSelected) {
state.selectedCats.clear();
document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
} else {
nonBlocked.forEach(cat => state.selectedCats.add(cat.id));
document.querySelectorAll('.cat-btn').forEach(b => {
const cat = CATEGORIES.find(cc => cc.id === b.dataset.id);
if (cat && !isCatBlocked(cat)) b.classList.add('selected');
});
}
updateAllBtn();
vibrate(20);
});
function setCustomOn(on) {
state.customOn = on;
$('btn-custom').classList.toggle('active', on);
if (on) {
state.selectedCats.clear();
document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
$('btn-all').classList.remove('active');
$('cat-collapsible').style.display = 'none';
state.alcaldePlayer = null;
} else {
$('cat-collapsible').style.display = 'block';
state.alcaldePlayer = null;
}
updateModeUI();
}
$('btn-custom').addEventListener('click', () => {
if (state.gameMode === 'bandos') { $('setup-error').textContent = 'El modo Bandos usa las categorías: no se combina con Personalizada.'; return; }
setCustomOn(!state.customOn);
vibrate(20);
});
$('cat-collapsible-header').addEventListener('click', () => {
$('cat-collapsible').classList.toggle('cat-collapsible-open');
vibrate(10);
});
$('btn-start').addEventListener('click', () => {
const err = $('setup-error'); err.textContent = '';
if (typeof Online !== 'undefined' && Online.active && !Online.prepareStart(err)) return;
state.numPlayers = getNumPlayers();
// Validar requisitos del modo seleccionado
if (state.gameMode === 'multiple' && state.numPlayers < 8) {
err.textContent = 'El modo Múltiple requiere 8 o más jugadores.';
return;
}
if (state.gameMode === 'bandos' && (state.numPlayers < 4 || state.numImpostors > Math.floor((state.numPlayers - 1) / 2))) {
err.textContent = 'Bandos necesita 4 o más jugadores y que el bando B sea menor que el A (máx. ' + Math.max(1, Math.floor((state.numPlayers - 1) / 2)) + ' en el bando B).';
return;
}
if (state.gameMode === 'escondite' && state.numImpostors < 2) {
err.textContent = 'El modo Escondite requiere 2 o más impostores.';
return;
}
state.impostorSet = pickImpostors(state.numPlayers, state.numImpostors);
const alcaldeAnfitrion = state.customOn && state.alcaldeMode === 'host' && typeof Online !== 'undefined' && Online.active && Online.isHost;
if (alcaldeAnfitrion) sacarDeImpostores(state.impostorSet, Online.hostSeat(), state.numPlayers);
if (state.customOn) {
const nonImps = [];
for (let i = 1; i <= state.numPlayers; i++) { if (!state.impostorSet.has(i)) nonImps.push(i); }
state.alcaldePlayer = alcaldeAnfitrion ? Online.hostSeat() : elegirAlcalde(nonImps);
asignarTraidor(); asignarMisiones();
state.word = null; state.category = 'Personalizada';
state.words = []; state.playerWordIdx = {}; state.esconditeKey = null;
state.alcaldeWord = null;
state.currentPlayer = 1; state.revealed = false;
for (let i = 1; i <= state.numPlayers; i++) { if (state.impostorSet.has(i)) { state.firstImpostor = i; break; } }
state.esconditeKeyWritten = false; state.decoyDone = {};
vibrate(30);
if (typeof Online !== 'undefined' && Online.active) { Online.onAlcaldeChosen(); return; }
const alcNom = playerNames[state.alcaldePlayer - 1] || ('Jugador ' + state.alcaldePlayer);
$('alcalde-who-name').textContent = alcNom;
const alcNumW = (state.gameMode === 'multiple') ? state.multiWordCount : 1;
state.alcaldeNumWords = alcNumW;
$('inp-alcalde-numwords').value = alcNumW;
const stepperWrap = $('inp-alcalde-numwords').closest('.alcalde-num-words');
if (stepperWrap) stepperWrap.style.display = (state.gameMode === 'multiple') ? 'none' : 'block';
buildAlcaldeWordsList();
showScreen('screen-alcalde');
return;
}
if (state.selectedCats.size === 0) { err.textContent = 'Selecciona al menos una categoría.'; return; }
const pool = [];
CATEGORIES.forEach(cat => { if (state.selectedCats.has(cat.id)) cat.words.forEach(w => pool.push({ word: w, category: cat.name })); });
if (pool.length === 0) { err.textContent = 'Las categorías seleccionadas no tienen palabras.'; return; }
if (state.gameMode === 'normal') {
const chosen = pickBalancedWord(pool);
if (!chosen) { err.textContent = 'No se pudo elegir una palabra.'; return; }
state.word = chosen.word; state.category = chosen.category;
state.words = []; state.playerWordIdx = {};
} else if (state.gameMode === 'bandos') {
const par = pickBandosPair(pool);
if (!par) { err.textContent = 'No hay palabras suficientes para el modo Bandos.'; return; }
state.word = par.a.word; state.category = par.a.category; state.wordB = par.b.word; state.categoryB = par.b.category;
state.words = []; state.playerWordIdx = {};
} else if (state.gameMode === 'multiple') {
const n = state.multiWordCount;
const chosenWords = pickBalancedMultipleWords(pool, n);
if (!chosenWords || chosenWords.length < n) { err.textContent = 'No hay suficientes palabras distintas para este modo.'; return; }
state.words = chosenWords.map(p => p.word);
state.wordCategories = chosenWords.map(p => p.category);
state.category = chosenWords[0].category;
state.word = null;
const nonImpostors = [];
for (let i = 1; i <= state.numPlayers; i++) { if (!state.impostorSet.has(i)) nonImpostors.push(i); }
const shuffledNI = fisherYates(nonImpostors);
state.playerWordIdx = {};
shuffledNI.forEach((p, i) => { state.playerWordIdx[p] = i % n; });
} else if (state.gameMode === 'escondite') {
// Para escondite necesitamos 2 palabras distintas: la principal y la clave
const mainWord = pickBalancedWord(pool);
if (!mainWord) { err.textContent = 'No se pudo elegir una palabra.'; return; }
// Clave secreta: otra palabra distinta, preferiblemente de otra categoría
const remainingPool = pool.filter(w => w.word !== mainWord.word);
if (remainingPool.length < 1) { err.textContent = 'Se necesitan al menos 2 palabras para el modo Escondite.'; return; }
const mismas = remainingPool.filter(w => w.category === mainWord.category), otras = remainingPool.filter(w => w.category !== mainWord.category);
const preferidas = state.keyCat === 'misma' ? mismas : otras;
const keyWord = fisherYates(preferidas.length ? preferidas : remainingPool)[0];
state.word = mainWord.word; state.category = mainWord.category;
state.esconditeKey = state.customOn ? null : keyWord.word;
state.esconditeKeyWritten = !state.customOn; state.decoyDone = {};
state.words = []; state.playerWordIdx = {};
}
asignarTraidor(); asignarMisiones();
state.firstImpostor = null;
for (let i = 1; i <= state.numPlayers; i++) { if (state.impostorSet.has(i)) { state.firstImpostor = i; break; } }
state.esconditeKeyWritten = false; state.decoyDone = {};
state.currentPlayer = 1; state.revealed = false;
vibrate(30);
if (typeof Online !== 'undefined' && Online.active) { Online.dealRound(); return; }
goToTurn();
});
function buildAlcaldeWordsList() {
const n = state.alcaldeNumWords;
const list = $('alcalde-words-list');
list.innerHTML = '';
for (let i = 0; i < n; i++) {
const group = document.createElement('div');
group.className = 'alcalde-word-group';
const title = document.createElement('div');
title.className = 'alcalde-word-group-title';
title.textContent = n === 1 ? 'Palabra' : `Palabra ${i+1}`;
group.appendChild(title);
const wordRow = document.createElement('div');
wordRow.className = 'alcalde-field-row';
const wordLbl = document.createElement('div');
wordLbl.className = 'alcalde-field-label';
wordLbl.textContent = 'Palabra';
const wordInp = document.createElement('input');
wordInp.type = 'text';
wordInp.className = 'alcalde-field-inp';
wordInp.dataset.wordIdx = i;
wordInp.placeholder = n === 1 ? 'Escribe la palabra...' : `Palabra ${i+1}...`;
wordInp.maxLength = 60;
wordInp.autocomplete = 'off';
wordInp.addEventListener('click', e => e.stopPropagation());
wordRow.appendChild(wordLbl);
wordRow.appendChild(wordInp);
group.appendChild(wordRow);
if (state.hintOn) {
const hintRow = document.createElement('div');
hintRow.className = 'alcalde-field-row';
hintRow.style.marginTop = '8px';
const hintLbl = document.createElement('div');
hintLbl.className = 'alcalde-field-label';
hintLbl.textContent = 'Pista';
const hintInp = document.createElement('input');
hintInp.type = 'text';
hintInp.className = 'alcalde-field-inp';
hintInp.dataset.hintIdx = i;
hintInp.placeholder = 'Pista opcional...';
hintInp.maxLength = 60;
hintInp.style.borderColor = 'rgba(255,200,87,0.4)';
hintInp.autocomplete = 'off';
hintInp.addEventListener('click', e => e.stopPropagation());
hintRow.appendChild(hintLbl);
hintRow.appendChild(hintInp);
group.appendChild(hintRow);
}
list.appendChild(group);
}
}
function setAlcaldeNumWords(v) {
v = Math.max(1, v || 1);
state.alcaldeNumWords = v;
$('inp-alcalde-numwords').value = v;
buildAlcaldeWordsList();
}
$('btn-alcalde-words-minus').addEventListener('click', () => { setAlcaldeNumWords(state.alcaldeNumWords - 1); vibrate(10); });
$('btn-alcalde-words-plus').addEventListener('click', () => { setAlcaldeNumWords(state.alcaldeNumWords + 1); vibrate(10); });
$('inp-alcalde-numwords').addEventListener('change', e => { setAlcaldeNumWords(parseInt(e.target.value)); });
$('btn-alcalde-confirm').addEventListener('click', () => {
const list = $('alcalde-words-list');
const wordInps = list.querySelectorAll('[data-word-idx]');
let words = [];
let valid = true;
wordInps.forEach(inp => {
const v = inp.value.trim();
if (!v) { inp.focus(); valid = false; }
else words.push(v);
});
if (!valid) return;
const hintInps = list.querySelectorAll('[data-hint-idx]');
const hints = [];
hintInps.forEach(inp => hints.push(inp.value.trim()));
if (typeof Online !== 'undefined' && Online.active) { state.alcaldeHints = hints; Online.sendWords(words, hints); return; }
if (state.gameMode !== 'multiple' && words.length > 1) { const r = alcaldeElegirUna(words, hints); words = r.words; hints.length = 0; r.hints.forEach(h => hints.push(h)); }
state.alcaldeHints = hints;
if (words.length === 1) {
state.word = words[0];
state.words = [];
state.playerWordIdx = {};
} else {
state.word = null;
state.words = words;
state.multiWordCount = words.length;
const nonImpostors = [];
for (let i = 1; i <= state.numPlayers; i++) { if (!state.impostorSet.has(i)) nonImpostors.push(i); }
const shuffled = fisherYates(nonImpostors);
state.playerWordIdx = {};
shuffled.forEach((p, i) => { state.playerWordIdx[p] = i % words.length; });
}
state.alcaldeWord = words.join(' / ');
for (let i = 1; i <= state.numPlayers; i++) {
if (state.impostorSet.has(i)) { state.firstImpostor = i; break; }
}
state.esconditeKeyWritten = false; state.decoyDone = {};
vibrate(30); goToTurn();
});
function isCatNoPng(catName) {
const name = (catName || '').trim();
const cat = CATEGORIES.find(cat => cat.name.trim() === name);
return cat ? !!cat.noImages : false;
}
// ===== Imágenes de las palabras (Wikipedia / Wikimedia Commons) =====
const IMG_DEBUG = false;            // true = registra en consola cada consulta, la página elegida y el motivo del fallo
const IMG_TIMEOUT_MS = 4000;        // tiempo máximo de cada petición
const IMG_CACHE_KEY = 'impostor.imgcache.v1', IMG_CACHE_MAX = 400, IMG_MISS_MS = 120000;
// Palabras completas (con límites \b) que impiden mostrar una imagen. Se comparan con el título, la descripción y el nombre del archivo.
const IMG_BLOCK_RE = /\b(porn|porno|pornograf[ií]a|pornography|sex|sexo|sexual|nude|nudity|naked|desnud[oa]s?|erotic|erotica|er[óo]tic[oa]|xxx|nsfw|genitalia|genitals|vagina|penis|nipple|fetish|hentai|gore|corpse|cad[aá]ver|decapitation|decapitated|torture|tortura|terrorist|terrorista|racist)\b/i;
function imgLog() { if (IMG_DEBUG) console.debug('[imagen]', ...arguments); }
function isSafeImgSrc(src, alt) {
const check = decodeURIComponent((src || '').split('/').pop().split('?')[0]).replace(/[_.\-+]+/g, ' ') + ' ' + (alt || '');
return !IMG_BLOCK_RE.test(check);
}
function isTrustedSrc(src) {
return src.startsWith('https://upload.wikimedia.org') ||
src.startsWith('https://commons.wikimedia.org') ||
src.startsWith('https://upload.wikipedia.org');
}
function showImg(container, src, alt, retry) {
if (!isTrustedSrc(src) || !isSafeImgSrc(src, alt)) { container.innerHTML = ''; return; }
const img = document.createElement('img');
img.className = 'word-img'; img.alt = '';
img.onerror = () => {
if (!retry) { imgLog('error al cargar, reintento', src); setTimeout(() => showImg(container, src, alt, true), 1200); return; }
imgLog('error al cargar (definitivo)', src);
imgCacheForget(src);
container.innerHTML = '';
};
img.src = src;
container.innerHTML = ''; container.appendChild(img);
}
// Caché: en memoria + localStorage (solo aciertos). Los fallos se recuerdan unos minutos, no toda la sesión.
const _imgCache = {}, _imgMiss = {}, _imgPending = {};
let _imgStore = null;
function imgStore() {
if (_imgStore) return _imgStore;
try { _imgStore = JSON.parse(localStorage.getItem(IMG_CACHE_KEY)) || {}; } catch (e) { _imgStore = {}; }
if (typeof _imgStore !== 'object' || Array.isArray(_imgStore)) _imgStore = {};
return _imgStore;
}
function imgStoreSave() { try { localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(imgStore())); } catch (e) { /* sin almacenamiento */ } }
function imgCachePut(key, src) {
_imgCache[key] = src;
const st = imgStore(); st[key] = src;
const keys = Object.keys(st); if (keys.length > IMG_CACHE_MAX) keys.slice(0, keys.length - IMG_CACHE_MAX).forEach(k => { delete st[k]; });
imgStoreSave();
}
function imgCacheForget(src) {
const st = imgStore(); let ch = false;
Object.keys(st).forEach(k => { if (st[k] === src) { delete st[k]; ch = true; } });
Object.keys(_imgCache).forEach(k => { if (_imgCache[k] === src) delete _imgCache[k]; });
if (ch) imgStoreSave();
}
const imgNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();
function wikiFetch(lang, params) {
const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
const t = setTimeout(() => { if (ctl) ctl.abort(); }, IMG_TIMEOUT_MS);
const url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages|description|pageprops&ppprop=disambiguation&piprop=thumbnail&pithumbsize=300&pilicense=any&' + params;
imgLog('consulta', lang, url);
return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
.then(d => { clearTimeout(t); return d; }).catch(e => { clearTimeout(t); imgLog('fallo de red', lang, e && e.message); return null; });
}
function pageUsable(p) {
if (!p || p.missing !== undefined || !p.thumbnail || !p.thumbnail.source) return false;
if (p.pageprops && p.pageprops.disambiguation !== undefined) return false;
if (IMG_BLOCK_RE.test((p.title || '') + ' ' + (p.description || ''))) { imgLog('bloqueada', p.title); return false; }
return true;
}
// 1.ª fase: título exacto (una sola petición por idioma, con varios títulos candidatos por orden de preferencia).
function exactTitle(lang, titles) {
return wikiFetch(lang, 'redirects=1&titles=' + encodeURIComponent(titles.join('|'))).then(d => {
const q = d && d.query; if (!q || !q.pages) return null;
const map = {}; (q.normalized || []).forEach(n => { map[n.from] = n.to; }); (q.redirects || []).forEach(r => { map[r.from] = r.to; });
const byTitle = {}; Object.values(q.pages).forEach(p => { byTitle[p.title] = p; });
for (const t of titles) {
let x = map[t] || t; x = map[x] || x;
const p = byTitle[x];
if (pageUsable(p)) { imgLog('exacto', lang, t, '→', p.title); return p.thumbnail.source; }
}
return null;
});
}
// 2.ª fase (solo si no hay título exacto): búsqueda, aceptando únicamente páginas cuyo título coincide con la palabra.
// El título coincide si es igual a la palabra, o contiene todas sus palabras con a lo sumo 2 de más («Sancho Panza (personaje)»).
function titleCoincide(title, want) {
const t = imgNorm(title); if (t === want) return true;
const tw = t.split(' ').filter(Boolean), ww = want.split(' ').filter(Boolean);
return ww.length > 0 && ww.every(w => tw.includes(w)) && tw.length <= ww.length + 2;
}
// Variantes del título (la Wikipedia distingue mayúsculas salvo la primera letra): tal cual, con inicial mayúscula y en Title Case.
function variantesTitulo(word, ctx) {
const cap = s => s.charAt(0).toUpperCase() + s.slice(1), tc = s => s.split(' ').map(cap).join(' ');
const base = [...new Set([word, cap(word), tc(word)])];
return [...new Set((ctx ? base.map(w => w + ' (' + ctx + ')') : []).concat(base))];
}
// Último recurso: buscar el archivo directamente en Wikimedia Commons (el nombre del archivo debe contener la palabra).
function commonsFile(query, cleanWord) {
const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
const t = setTimeout(() => { if (ctl) ctl.abort(); }, IMG_TIMEOUT_MS);
const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=300&gsrsearch=' + encodeURIComponent(query + ' filetype:bitmap');
imgLog('consulta commons', url);
return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(r => r.ok ? r.json() : null).then(d => {
clearTimeout(t);
const pages = d && d.query && d.query.pages; if (!pages) return null;
const want = imgNorm(cleanWord).split(' ').filter(Boolean);
const p = Object.values(pages).sort((a, b) => (a.index || 99) - (b.index || 99)).find(x => {
const ii = x.imageinfo && x.imageinfo[0]; if (!ii || !ii.thumburl || !/^image\/(jpeg|png|webp|gif)$/.test(ii.mime || '')) return false;
const nombre = imgNorm(String(x.title).replace(/^(file|archivo):/i, '').replace(/\.[a-z0-9]+$/i, ''));
return want.length > 0 && want.every(w => nombre.split(' ').includes(w)) && !IMG_BLOCK_RE.test(nombre);
});
if (p) imgLog('commons', query, '→', p.title); else imgLog('commons sin coincidencia', query);
return p ? p.imageinfo[0].thumburl : null;
}).catch(e => { clearTimeout(t); imgLog('fallo commons', e && e.message); return null; });
}
function searchTitle(lang, query, cleanWord) {
return wikiFetch(lang, 'generator=search&gsrlimit=5&gsrsearch=' + encodeURIComponent(query)).then(d => {
const pages = d && d.query && d.query.pages; if (!pages) return null;
const want = imgNorm(cleanWord);
const p = Object.values(pages).sort((a, b) => (a.index || 99) - (b.index || 99)).find(x => titleCoincide(x.title, want) && pageUsable(x));
if (p) imgLog('búsqueda', lang, query, '→', p.title); else imgLog('sin coincidencia de título', lang, query);
return p ? p.thumbnail.source : null;
});
}
const firstOf = ps => new Promise(res => { let n = ps.length; ps.forEach(p => p.then(v => { if (v) res(v); else if (--n === 0) res(null); })); });
// Imagen manual del JSON: por palabra ("imagenes") o por categoría ("imagen"); es el nombre de un archivo de Wikimedia Commons.
function manualImage(word, catName) {
const cat = CATEGORIES.find(c => c.name.trim() === (catName || '').trim());
if (!cat) return null;
const file = (cat.images && cat.images[imgNorm(word)]) || cat.image;
return file ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=300' : null;
}
function findWordImage(word, catName) {
const parenMatch = word.match(/\(([^)]+)\)/);
const ctx = parenMatch ? parenMatch[1].trim() : '';
const cleanWord = word.split('(')[0].trim();
const cleanCat = (catName || '').replace(/_/g, ' ').trim();
if (/pa[ií]s/i.test(cleanCat) || /country/i.test(cleanCat)) {
// Países: primero la bandera
return firstOf([exactTitle('es', ['Bandera de ' + cleanWord]), exactTitle('en', ['Flag of ' + cleanWord])])
.then(src => src || findGeneral(cleanWord, ctx));
}
return findGeneral(cleanWord, ctx);
}
// Ronda 1: título exacto en es y en (en paralelo). Ronda 2: otros idiomas. Ronda 3: búsqueda por texto y archivo en Commons.
function findGeneral(cleanWord, ctx) {
const titles = variantesTitulo(cleanWord, ctx);
const q = ctx ? cleanWord + ' ' + ctx : cleanWord;
return firstOf([exactTitle('es', titles), exactTitle('en', titles)])
.then(src => src || firstOf(['fr', 'de', 'it', 'pt', 'ca'].map(l => exactTitle(l, titles))))
.then(src => src || firstOf([searchTitle('es', q, cleanWord), searchTitle('en', q, cleanWord), commonsFile(cleanWord, cleanWord)]));
}
function fetchWordImage(word, catName, container, online) {
if (!online && !state.imagesOn) return;
if (!online && isCatNoPng(catName)) return;
if (!word || !navigator.onLine) return;
const manual = manualImage(word, catName);
if (manual) { showImg(container, manual, ''); return; }
const key = word.toLowerCase().trim().replace(/\s+/g, ' ');
const cached = _imgCache[key] || imgStore()[key];
if (cached) { _imgCache[key] = cached; showImg(container, cached, ''); return; }
if (_imgMiss[key] && Date.now() - _imgMiss[key] < IMG_MISS_MS) return;
container.innerHTML = '<div class="word-img-loading">🔍 Buscando imagen...</div>';
const prom = _imgPending[key] || (_imgPending[key] = findWordImage(word, catName).finally(() => { delete _imgPending[key]; }));
prom.then(src => {
if (src) { imgCachePut(key, src); showImg(container, src, word.split('(')[0].trim()); }
else { _imgMiss[key] = Date.now(); imgLog('sin imagen', word); container.innerHTML = ''; }
}).catch(() => { container.innerHTML = ''; });
}
function goToTurn() { showScreen('screen-turns'); renderTurn(); }
function renderTurn() {
const label = playerNames[state.currentPlayer-1] || ('Jugador ' + state.currentPlayer);
const hasName = playerNames[state.currentPlayer - 1];
$('player-num').textContent = hasName ? label : `Jugador ${state.currentPlayer}`;
$('player-of').textContent = hasName
? `Jugador ${state.currentPlayer} · ${state.currentPlayer} de ${state.numPlayers}`
: `${state.currentPlayer} de ${state.numPlayers}`;
$('reveal-card').classList.remove('revealed');
state.revealed = false; $('reveal-shown').innerHTML = '';
if (state.currentPlayer === state.numPlayers) state.allSeen = true;
$('btn-go-game').style.display = (state.currentPlayer === state.numPlayers || state.allSeen) ? 'block' : 'none';
const badge = $('mode-badge-turns');
const modeNames = { normal: '🎭 Normal', multiple: '🔀 Múltiple', escondite: '🕵️ Escondite', bandos: '⚔️ Bandos' };
const modeLbl = modeNames[state.gameMode] || '🎭 Normal';
const isAlcNow = state.customOn && state.currentPlayer === state.alcaldePlayer;
badge.innerHTML = `<span class="mode-badge ${state.gameMode || 'normal'}">${modeLbl}</span>` +
(state.customOn ? `<span class="mode-badge personalizada" style="margin-left:6px;">👑 Personalizada</span>` : '') +
(isAlcNow ? `<span class="mode-badge" style="background:rgba(255,200,87,0.2);color:var(--gold);border-color:var(--gold);margin-left:6px;">Alcalde</span>` : '');
}
function renderWord(rawWord, shown) {
const match = rawWord.match(/^(.*?)\s*\((.+)\)\s*$/);
const w = document.createElement('div'); w.className = 'word-text';
if (match) { w.textContent = match[1].trim(); shown.appendChild(w); const d = document.createElement('div'); d.className = 'word-desc'; d.textContent = match[2].trim(); shown.appendChild(d); }
else { w.textContent = rawWord; shown.appendChild(w); }
}
function buildRevealContent() {
buildRevealContentBase();
const shown = $('reveal-shown');
if (!shown.querySelector('.escondite-input-wrap')) notasExtra(shown, state.currentPlayer);
}
function buildRevealContentBase() {
const isImpostor = state.impostorSet.has(state.currentPlayer);
const shown = $('reveal-shown'); shown.innerHTML = '';
if (state.gameMode === 'bandos') {
const w = isImpostor ? state.wordB : state.word, c = isImpostor ? state.categoryB : state.category;
renderWord(w, shown);
const cl = document.createElement('div'); cl.className = 'hint-line'; cl.textContent = 'Categoría · ' + c; shown.appendChild(cl);
const nt = document.createElement('div'); nt.className = 'impostor-sub'; nt.style.marginTop = '8px'; nt.style.fontSize = '.8rem'; nt.textContent = 'No digas tu palabra: puede que otros tengan una parecida pero distinta.'; shown.appendChild(nt);
const im = document.createElement('div'); im.className = 'word-img-wrap'; shown.appendChild(im); fetchWordImage(w, c, im);
return;
}
// Escondite con palabras personalizadas: el primer impostor escribe la clave. Para que no se note quién es, TODOS escriben una palabra
// (los demás es un señuelo que no se usa). En el modo normal de categorías no hace falta: la clave sale de la lista.
const modoClave = state.gameMode === 'escondite' && state.customOn;
const esFirstImp = isImpostor && state.currentPlayer === state.firstImpostor;
const esRealClave = modoClave && esFirstImp && !state.esconditeKeyWritten;
const esSenuelo = modoClave && !esFirstImp && !(state.decoyDone && state.decoyDone[state.currentPlayer]);
const needsKeyInput = esRealClave || esSenuelo;
if (needsKeyInput) {
const wrap = document.createElement('div'); wrap.className = 'escondite-input-wrap';
const lbl = document.createElement('div'); lbl.className = 'escondite-inp-label';
lbl.textContent = '✍️ Escribe una palabra. Si eres el impostor, será la clave secreta de tu equipo; si no, escribe cualquier cosa.';
const inp = document.createElement('input');
inp.type = 'text'; inp.className = 'escondite-inp';
inp.placeholder = 'Escribe una palabra...'; inp.maxLength = 60;
inp.autocomplete = 'off';
inp.addEventListener('click', e => e.stopPropagation());
const confirmBtn = document.createElement('button');
confirmBtn.className = 'btn-escondite-confirm';
confirmBtn.textContent = 'Confirmar';
confirmBtn.addEventListener('click', e => {
e.stopPropagation();
const val = inp.value.trim();
if (!val) { inp.focus(); return; }
if (esSenuelo) { state.decoyDone[state.currentPlayer] = true; vibrate(20); buildRevealContent(); return; }
state.esconditeKey = val;
state.esconditeKeyWritten = true;
vibrate(20);
shown.innerHTML = '';
const t2 = document.createElement('div'); t2.className = 'impostor-text'; t2.textContent = 'Eres el Impostor'; shown.appendChild(t2);
const s2 = document.createElement('div'); s2.className = 'impostor-sub'; s2.textContent = subImpEscondite(); shown.appendChild(s2);
if (state.word && state.impKnows) renderWord(state.word, shown);
const box2 = document.createElement('div'); box2.className = 'secret-key-box';
const lbl2 = document.createElement('div'); lbl2.className = 'secret-key-label'; lbl2.textContent = 'Clave secreta';
const kw2 = document.createElement('div'); kw2.className = 'secret-key-word'; kw2.textContent = val;
box2.appendChild(lbl2); box2.appendChild(kw2); shown.appendChild(box2);
if (state.hintOn && state.alcaldeHints.length > 0) {
state.alcaldeHints.forEach((hint, i) => {
if (!hint) return;
const h2 = document.createElement('div'); h2.className = 'hint-line';
h2.textContent = `Pista · ${hint}`; shown.appendChild(h2);
});
}
notasExtra(shown, state.currentPlayer);
});
wrap.appendChild(lbl); wrap.appendChild(inp); wrap.appendChild(confirmBtn);
shown.appendChild(wrap);
$('reveal-card').classList.add('revealed');
state.revealed = true;
return;
}
if (state.customOn) {
if (isImpostor) {
const t = document.createElement('div'); t.className = 'impostor-text'; t.textContent = 'Eres el Impostor'; shown.appendChild(t);
const numW = state.words.length > 1 ? state.words.length : 1;
const s = document.createElement('div'); s.className = 'impostor-sub';
if (state.gameMode === 'escondite') {
s.textContent = subImpEscondite();
} else {
s.textContent = numW > 1 ? `Hay ${numW} palabras distintas` : 'No conoces la palabra';
}
shown.appendChild(s);
if (state.gameMode === 'escondite' && state.word && state.impKnows) {
renderWord(state.word, shown);
}
if (state.gameMode === 'escondite' && state.esconditeKey) {
const box = document.createElement('div'); box.className = 'secret-key-box';
const lbl = document.createElement('div'); lbl.className = 'secret-key-label'; lbl.textContent = 'Clave secreta';
const kw = document.createElement('div'); kw.className = 'secret-key-word'; kw.textContent = state.esconditeKey;
box.appendChild(lbl); box.appendChild(kw); shown.appendChild(box);
}
if (state.hintOn && state.alcaldeHints.length > 0) {
state.alcaldeHints.forEach((hint, i) => {
if (!hint) return;
const h = document.createElement('div'); h.className = 'hint-line';
h.textContent = numW > 1 ? `Pista ${i+1} · ${hint}` : `Pista · ${hint}`;
shown.appendChild(h);
});
}
} else {
const alcalde = state.alcaldePlayer;
const isAlcalde = state.currentPlayer === alcalde;
if (isAlcalde) {
const badge = document.createElement('div'); badge.className = 'alcalde-badge'; badge.style.display='inline-flex'; badge.style.margin='0 auto 8px'; badge.textContent = '👑 Alcalde'; shown.appendChild(badge);
}
if (state.words.length > 1) {
const wIdx = state.playerWordIdx[state.currentPlayer] ?? 0;
renderWord(state.words[wIdx], shown);
if (state.hintOn && state.alcaldeHints[wIdx]) {
const h = document.createElement('div'); h.className = 'hint-line'; h.textContent = `Pista · ${state.alcaldeHints[wIdx]}`; shown.appendChild(h);
}
const g = document.createElement('div'); g.className = 'impostor-sub'; g.style.marginTop='8px'; g.style.color='var(--text-faded)'; g.textContent = `Grupo ${wIdx+1} de ${state.words.length}`; shown.appendChild(g);
} else {
const wEl = document.createElement('div'); wEl.className = 'word-text'; wEl.textContent = state.word || '—'; shown.appendChild(wEl);
if (state.hintOn && state.alcaldeHints[0]) {
const h = document.createElement('div'); h.className = 'hint-line'; h.textContent = `Pista · ${state.alcaldeHints[0]}`; shown.appendChild(h);
}
}
if (state.category && state.category !== 'Personalizada') { const catP=document.createElement('div');catP.className='hint-line';catP.textContent='Categoría · '+state.category;shown.appendChild(catP); }
if (isAlcalde) {
const s = document.createElement('div'); s.className = 'impostor-sub'; s.textContent = 'Tienes voto de gracia'; shown.appendChild(s);
}
}
return;
}
if (state.gameMode === 'normal') {
if (isImpostor) {
const t = document.createElement('div'); t.className = 'impostor-text'; t.textContent = 'Eres el Impostor'; shown.appendChild(t);
const s = document.createElement('div'); s.className = 'impostor-sub'; s.textContent = 'No reveles tu identidad'; shown.appendChild(s);
if (state.hintOn) { const h = document.createElement('div'); h.className = 'hint-line'; h.textContent = `Pista · ${pistaTexto(state.word, state.category)}`; shown.appendChild(h); }
} else {
renderWord(state.word, shown);
const catLine=document.createElement('div');catLine.className='hint-line';catLine.textContent='Categoría · '+state.category;shown.appendChild(catLine);
const imgN=document.createElement('div');imgN.className='word-img-wrap';shown.appendChild(imgN);fetchWordImage(state.word,state.category,imgN);
}
} else if (state.gameMode === 'multiple') {
if (isImpostor) {
const t = document.createElement('div'); t.className = 'impostor-text'; t.textContent = 'Eres el Impostor'; shown.appendChild(t);
const s = document.createElement('div'); s.className = 'impostor-sub'; s.textContent = `Hay ${state.multiWordCount} palabras distintas`; shown.appendChild(s);
if (state.hintOn) { const h = document.createElement('div'); h.className = 'hint-line'; h.textContent = `Pista · ${state.category}`; shown.appendChild(h); }
} else {
const wIdx = state.playerWordIdx[state.currentPlayer] ?? 0;
renderWord(state.words[wIdx], shown);
const catForWord=state.wordCategories[wIdx]||state.category;
const catLineM=document.createElement('div');catLineM.className='hint-line';catLineM.textContent='Categoría · '+catForWord;shown.appendChild(catLineM);
const imgM=document.createElement('div');imgM.className='word-img-wrap';shown.appendChild(imgM);fetchWordImage(state.words[wIdx],catForWord,imgM);
if (state.multiWordCount > 2) {
const g = document.createElement('div'); g.className = 'impostor-sub'; g.style.marginTop='8px'; g.style.color='var(--text-faded)'; g.textContent = `Grupo ${wIdx + 1} de ${state.multiWordCount}`; shown.appendChild(g);
}
}
} else if (state.gameMode === 'escondite') {
if (isImpostor) {
const t = document.createElement('div'); t.className = 'impostor-text'; t.textContent = 'Eres el Impostor'; shown.appendChild(t);
const s = document.createElement('div'); s.className = 'impostor-sub'; s.textContent = subImpEscondite(); shown.appendChild(s);
if (state.impKnows) renderWord(state.word, shown);
if (state.esconditeKey) {
const box = document.createElement('div'); box.className = 'secret-key-box';
const lbl = document.createElement('div'); lbl.className = 'secret-key-label'; lbl.textContent = 'Clave secreta';
const kw = document.createElement('div'); kw.className = 'secret-key-word'; kw.textContent = state.esconditeKey;
box.appendChild(lbl); box.appendChild(kw); shown.appendChild(box);
}
if (state.hintOn) { const h = document.createElement('div'); h.className = 'hint-line'; h.textContent = `Pista · ${pistaTexto(state.word, state.category)}`; shown.appendChild(h); }
} else {
renderWord(state.word, shown);
const catLineE=document.createElement('div');catLineE.className='hint-line';catLineE.textContent='Categoría · '+state.category;shown.appendChild(catLineE);
const imgE=document.createElement('div');imgE.className='word-img-wrap';shown.appendChild(imgE);fetchWordImage(state.word,state.category,imgE);
}
}
}
$('reveal-card').addEventListener('click', () => {
const card = $('reveal-card');
if (!state.revealed) { buildRevealContent(); card.classList.add('revealed'); state.revealed = true; vibrate(25); sfx(state.impostorSet.has(state.currentPlayer) ? 'impostor' : 'civil'); }
else { card.classList.remove('revealed'); state.revealed = false; vibrate(15); sfx('pass'); }
});
$('btn-next').addEventListener('click', () => { state.currentPlayer = state.currentPlayer < state.numPlayers ? state.currentPlayer + 1 : 1; renderTurn(); vibrate(20); sfx('pass'); });
$('btn-go-game').addEventListener('click', () => { vibrate(40); goToGame(); });
$('btn-back-setup').addEventListener('click', () => { resetRound(); showScreen('screen-setup'); });
function showStartingPlayerDialog(playerName) {
const overlay = document.createElement('div');
overlay.style.cssText = 'position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,0.82);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;animation:fadeIn .2s ease;';
overlay.innerHTML = `
<div style="background:var(--bg-card);border-radius:22px;padding:36px 28px;text-align:center;max-width:320px;width:100%;border:1.5px solid var(--border-strong);box-shadow:0 24px 60px rgba(0,0,0,.6);">
  <div style="font-size:2.6rem;margin-bottom:14px;">🎲</div>
  <div style="font-size:.72rem;color:var(--text-faded);letter-spacing:.25em;text-transform:uppercase;margin-bottom:8px;">Comienza la partida</div>
  <div style="font-family:'Bebas Neue',sans-serif;font-size:2.2rem;letter-spacing:.08em;color:var(--accent);text-shadow:0 0 20px var(--accent-glow);margin-bottom:6px;">${playerName}</div>
  <div style="font-size:.88rem;color:var(--text-dim);margin-bottom:24px;">empieza el juego</div>
  <button onclick="this.closest('[data-dialog]').remove();vibrate(20);" style="width:100%;background:linear-gradient(135deg,var(--accent) 0%,#e0264a 100%);border:none;border-radius:14px;color:white;font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:.15em;padding:16px;cursor:pointer;box-shadow:0 6px 24px var(--accent-glow);">¡A jugar!</button>
</div>`;
overlay.dataset.dialog = 'start';
overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); vibrate(20); } });
document.body.appendChild(overlay);
vibrate(40);
}
function goToGame() {
state.eliminated = new Set();
buildGamePlayersList('game-players-list');
showScreen('screen-game');
// Determinar quién comienza
let startingPlayer;
if (state.customOn && state.alcaldePlayer) {
startingPlayer = state.alcaldePlayer;
} else {
startingPlayer = Math.floor(Math.random() * state.numPlayers) + 1;
}
const startingName = playerNames[startingPlayer - 1] || ('Jugador ' + startingPlayer);
showStartingPlayerDialog(startingName);
if (state.timerOn || state.quickOn) {
$('timer-area').style.display = 'block'; $('no-timer-area').style.display = 'none';
state.timerRemaining = state.quickOn ? state.quickSecs : state.timerSeconds; state.timerRunning = false;
if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
renderTimer(); $('btn-timer-start').textContent = 'Iniciar';
if (state.quickOn) startTimer(); // modo rápido: el cronómetro arranca solo
} else { $('timer-area').style.display = 'none'; $('no-timer-area').style.display = 'block'; }
}
function fmtTime(s) { if (s<0)s=0; return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function renderTimer() {
const el = $('timer-time'); el.textContent = fmtTime(state.timerRemaining);
el.classList.remove('warning','danger','finished');
if (state.timerRemaining===0) { el.classList.add('finished'); $('timer-label').textContent='¡Tiempo terminado!'; }
else if (state.timerRemaining<=10) { el.classList.add('danger'); $('timer-label').textContent='Tiempo restante'; }
else if (state.timerRemaining<=30) { el.classList.add('warning'); $('timer-label').textContent='Tiempo restante'; }
else { $('timer-label').textContent = state.timerRunning ? 'Tiempo restante' : 'En pausa'; }
}
function startTimer() {
if (state.timerRunning || state.timerRemaining<=0) return;
state.timerRunning=true; $('btn-timer-start').textContent='Pausar'; renderTimer();
state.timerInterval = setInterval(()=>{
state.timerRemaining--;
if (state.timerRemaining<=10 && state.timerRemaining>0) { vibrate(40); sfx('tick'); }
if (state.timerRemaining<=0) { sfx('alarm'); state.timerRemaining=0; clearInterval(state.timerInterval); state.timerInterval=null; state.timerRunning=false; $('btn-timer-start').textContent='Iniciar'; vibrate([200,100,200,100,400]); }
renderTimer();
},1000);
}
function pauseTimer() {
state.timerRunning=false;
if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval=null; }
$('btn-timer-start').textContent='Iniciar'; renderTimer();
}
$('btn-timer-start').addEventListener('click', () => { if (state.timerRunning) pauseTimer(); else startTimer(); vibrate(15); });
$('btn-timer-reset').addEventListener('click', () => { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval=null; } state.timerRunning=false; state.timerRemaining=state.timerSeconds; $('btn-timer-start').textContent='Iniciar'; renderTimer(); vibrate(20); });
$('btn-timer-change').addEventListener('click', () => { const v=parseInt($('inp-timer-change').value); if (!v||v<10) return; pauseTimer(); state.timerSeconds=v; state.timerRemaining=v; $('inp-timer').value=v; $('inp-timer-change').value=''; renderTimer(); vibrate(20); });
$('btn-end-game').addEventListener('click', () => { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval=null; } state.timerRunning=false; resetRound(); showScreen('screen-setup'); vibrate(30); });
$('btn-ver-resultados').addEventListener('click', () => { showResultsModal(); vibrate(15); });
$('btn-ver-resultados-victoria').addEventListener('click', () => { showResultsModal(); vibrate(15); });
$('btn-end-victoria').addEventListener('click', () => { resetRound(); showScreen('screen-setup'); vibrate(30); });
function resetRound() { if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval=null; } state.timerRunning=false; state.timerRemaining=state.timerSeconds; state.word=null; state.category=null; state.impostorSet=new Set(); state.currentPlayer=0; state.revealed=false; state.words=[]; state.wordCategories=[]; state.playerWordIdx={}; state.esconditeKey=null; state.alcaldeWord=null; state.alcaldePlayer=null; state.alcaldeNumWords=1; state.alcaldeHints=[]; state.esconditeKeyWritten=false; state.firstImpostor=null; state.allSeen=false; state.eliminated=new Set(); resetWordHistory(); }
function getPlayerWord(playerNum) {
if (state.gameMode === 'bandos') return (state.impostorSet.has(playerNum) ? state.wordB : state.word || '—').replace(/\s*\(.*\)$/, '').trim();
if (state.customOn || state.gameMode === 'normal' || state.gameMode === 'escondite') {
return state.word ? state.word.replace(/\s*\(.*\)$/, '').trim() : '—';
}
if (state.gameMode === 'multiple') {
const idx = state.playerWordIdx[playerNum];
if (idx === undefined) return '—';
return state.words[idx] ? state.words[idx].replace(/\s*\(.*\)$/, '').trim() : '—';
}
return '—';
}
function buildGamePlayersList(containerId) {
const container = $(containerId);
if (!container) return;
container.innerHTML = '';
for (let i = 1; i <= state.numPlayers; i++) {
const name = playerNames[i-1] || ('Jugador ' + i);
const isElim = state.eliminated.has(i);
const row = document.createElement('div');
row.className = 'game-player-row' + (isElim ? ' eliminated' : '');
row.dataset.player = i;
const nameEl = document.createElement('div');
nameEl.className = 'game-player-name';
nameEl.textContent = name;
const btn = document.createElement('button');
btn.className = 'btn-ver-rol' + (isElim ? ' eliminated' : '');
btn.textContent = isElim ? 'Eliminado' : 'Ver rol';
btn.dataset.player = i;
btn.addEventListener('click', e => {
e.stopPropagation();
showRolModal(i);
});
row.appendChild(nameEl);
row.appendChild(btn);
container.appendChild(row);
}
}
function showRolModal(playerNum) {
const name = playerNames[playerNum-1] || ('Jugador ' + playerNum);
const isImpostor = state.impostorSet.has(playerNum);
const overlay = document.createElement('div');
overlay.className = 'rol-overlay'; sfx('elim');
const tx = textosRol(rolLocal(playerNum));
const verdictClass = tx.cls, icon = tx.icon, verdict = tx.verdict, msg = tx.msg;
overlay.innerHTML = `<div class="rol-card">
<div class="rol-player-label">Jugador ${playerNum}</div>
<div class="rol-player-name">${name}</div>
<div class="rol-icon">${icon}</div>
<div class="rol-verdict ${verdictClass}">${verdict}</div>
<div class="rol-sub">${msg}</div>
<div class="rol-tap-hint">Toca para cerrar</div>
</div>`;
overlay.addEventListener('click', () => {
state.eliminated.add(playerNum);
document.body.removeChild(overlay);
buildGamePlayersList('game-players-list');
buildGamePlayersList('victoria-players-list');
checkVictory();
});
document.body.appendChild(overlay);
vibrate(isImpostor ? [40,30,80] : [60,20,60]);
}
function checkVictory() {
const totalImpostors = state.impostorSet.size;
const impostorsAlive = [...state.impostorSet].filter(p => !state.eliminated.has(p)).length;
const traidorVivo = state.traitor && !state.eliminated.has(state.traitor) ? 1 : 0;
const civiles = state.numPlayers - totalImpostors - (state.traitor ? 1 : 0);
const civilesAlive = civiles - [...Array(state.numPlayers).keys()]
.map(i => i+1)
.filter(p => !state.impostorSet.has(p) && p !== state.traitor && state.eliminated.has(p)).length;
if (impostorsAlive === 0) {
showVictory('civiles');
return;
}
if (impostorsAlive + traidorVivo >= civilesAlive) {
showVictory('impostores');
return;
}
}
// Mensaje de victoria (Bandos usa «bando A/B»). `bandos` se indica a mano en online, donde el modo lo decide el anfitrión.
function htmlVictoria(winner, bandos) {
if (bandos === undefined ? esBandos() : bandos) return winner === 'civiles'
? '<div class="victory-emoji">🅰️</div><div class="victory-title civiles">Ha ganado el bando A</div><div class="victory-sub">El bando mayoritario ha eliminado al otro.</div>'
: '<div class="victory-emoji">🅱️</div><div class="victory-title impostores">Ha ganado el bando B</div><div class="victory-sub">Los menos han resistido hasta igualar.</div>';
return winner === 'civiles'
? '<div class="victory-emoji">🏆</div><div class="victory-title civiles">Han ganado los Civiles</div><div class="victory-sub">Ha ganado la verdad.</div>'
: '<div class="victory-emoji">🐄</div><div class="victory-title impostores">Ha ganado la mentira</div><div class="victory-sub">Vergüenza para tu vaca.</div>';
}
function showVictory(winner) {
if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
state.timerRunning = false;
const msg = $("victory-msg");
sfx(winner === 'civiles' ? 'win' : 'lose');
if (typeof Stats !== 'undefined') Stats.ronda({ modo: state.gameMode, ganador: winner, online: false });
msg.innerHTML = htmlVictoria(winner);
buildGamePlayersList('victoria-players-list');
showScreen('screen-victoria');
vibrate([100,50,100,50,200]);
}
function showResultsModal() {
const overlay = document.createElement('div');
overlay.className = 'results-overlay';
let rows = '';
for (let i = 1; i <= state.numPlayers; i++) {
const name = playerNames[i-1] || ('Jugador ' + i);
const isImp = state.impostorSet.has(i);
const isElim = state.eliminated.has(i);
const tr0 = textosRol(rolLocal(i));
const roleClass = tr0.cls === 'impostor' ? 'role-impostor' : 'role-civil';
const roleName = tr0.nombre;
const word = isImp && state.gameMode !== 'bandos'
? (state.gameMode === 'escondite'
? (state.word ? state.word.replace(/\s*\(.*\)$/,'').trim() : '—') + ' / 🔑 ' + (state.esconditeKey ? state.esconditeKey.replace(/\s*\(.*\)$/,'').trim() : '—')
: '—')
: getPlayerWord(i);
const elimMark = isElim ? ' <span class="elim-mark">✕</span>' : '';
rows += `<tr>
<td>${name}${elimMark}</td>
<td class="${roleClass}">${roleName}</td>
<td style="color:var(--text-faded);font-size:0.8rem;">${word}</td>
</tr>`;
}
overlay.innerHTML = `<div class="results-card">
<button class="results-close" id="results-close-btn">✕ Cerrar</button>
<div class="results-title">Resultados</div>
<table class="results-table">
<thead><tr><th>Jugador</th><th>Rol</th><th>Palabra</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</div>`;
overlay.querySelector('#results-close-btn').addEventListener('click', e => {
e.stopPropagation(); document.body.removeChild(overlay);
});
overlay.addEventListener('click', e => {
if (e.target === overlay) document.body.removeChild(overlay);
});
document.body.appendChild(overlay);
}
$('btn-open-archivo').addEventListener('click', () => { buildArchivoScreen(); showScreen('screen-archivo'); });
$('btn-save-main').addEventListener('click', () => { saveWordsJson('save-feedback-main'); });
$('btn-back-from-archivo').addEventListener('click', () => { showScreen('screen-setup'); });
function parseWordDesc(raw) {
const m = raw.match(/^(.*?)\s*\((.+)\)\s*$/);
if (m) return { word: m[1].trim(), desc: m[2].trim() };
return { word: raw.trim(), desc: '' };
}
function buildCrossMap() {
const map = {}; // palabra_norm -> [catIdx, ...]
CATEGORIES.forEach((cat, ci) => {
cat.words.forEach(w => {
const k = parseWordDesc(w).word.trim().toLowerCase();
if (!map[k]) map[k] = [];
if (!map[k].includes(ci)) map[k].push(ci);
});
});
return map;
}
// La pantalla «Archivo de palabras» la pinta js/editor.js (editar, mover, imágenes, deshacer…).
function buildArchivoScreen() { if (typeof Editor !== 'undefined') Editor.render(); }
// ===== Lista de palabras: formato JSON (bloque #palabras-json de index.html) =====
const WORDS_LIMITS = { maxFileBytes: 2 * 1024 * 1024, maxCats: 300, maxWordsPerCat: 5000, maxNameLen: 80, maxWordLen: 200 };
function escapeHtml(s) {
return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
// Valida la estructura y devuelve { categories, dupCount, dupInfo }. Lanza Error con mensaje en español.
// opts.dedupe: true = eliminar repetidas dentro de cada categoría (carga de archivo); false = dejarlas (lista de serie).
function parseWordsData(obj, opts) {
const dedupe = !opts || opts.dedupe !== false;
if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('El archivo no tiene el formato esperado (falta el objeto principal).');
if (!Array.isArray(obj.categorias)) throw new Error('Falta la lista "categorias".');
if (obj.categorias.length === 0) throw new Error('La lista "categorias" está vacía.');
if (obj.categorias.length > WORDS_LIMITS.maxCats) throw new Error('Demasiadas categorías (máximo ' + WORDS_LIMITS.maxCats + ').');
const ids = new Set(); const categories = []; let dupCount = 0; const dupInfo = [];
obj.categorias.forEach((c, i) => {
const where = 'Categoría nº ' + (i + 1);
if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(where + ': no es un objeto válido.');
if (typeof c.id !== 'string' || !c.id.trim()) throw new Error(where + ': falta "id" (texto).');
const id = c.id.trim();
const label = 'Categoría "' + id.slice(0, 40) + '"';
if (id.length > WORDS_LIMITS.maxNameLen) throw new Error(label + ': "id" demasiado largo.');
if (ids.has(id)) throw new Error(label + ': el "id" está repetido.');
ids.add(id);
if (typeof c.nombre !== 'string' || !c.nombre.trim()) throw new Error(label + ': falta "nombre" (texto).');
const nombre = c.nombre.trim();
if (nombre.length > WORDS_LIMITS.maxNameLen) throw new Error(label + ': "nombre" demasiado largo.');
if (c.bloqueada !== undefined && typeof c.bloqueada !== 'boolean') throw new Error(label + ': "bloqueada" debe ser true o false.');
if (c.sinImagenes !== undefined && typeof c.sinImagenes !== 'boolean') throw new Error(label + ': "sinImagenes" debe ser true o false.');
const okFile = f => typeof f === 'string' && f.trim().length > 0 && f.length <= 200 && !/[\n\r<>|#\\]/.test(f);
if (c.imagen !== undefined && !okFile(c.imagen)) throw new Error(label + ': "imagen" debe ser el nombre de un archivo de Wikimedia Commons.');
if (c.imagenes !== undefined) {
if (!c.imagenes || typeof c.imagenes !== 'object' || Array.isArray(c.imagenes)) throw new Error(label + ': "imagenes" debe ser un objeto {"palabra": "Archivo.jpg"}.');
Object.keys(c.imagenes).forEach(k => { if (!okFile(c.imagenes[k])) throw new Error(label + ': imagen no válida para "' + k.slice(0, 40) + '".'); });
}
if (!Array.isArray(c.palabras)) throw new Error(label + ': falta la lista "palabras".');
if (c.palabras.length > WORDS_LIMITS.maxWordsPerCat) throw new Error(label + ': demasiadas palabras (máximo ' + WORDS_LIMITS.maxWordsPerCat + ').');
const seen = new Set(); const words = [];
c.palabras.forEach((w, j) => {
if (typeof w !== 'string') throw new Error(label + ': la palabra nº ' + (j + 1) + ' no es texto.');
const t = w.trim();
if (!t) return;
if (t.length > WORDS_LIMITS.maxWordLen) throw new Error(label + ': la palabra nº ' + (j + 1) + ' es demasiado larga.');
const key = t.toLowerCase().replace(/\s+/g, ' ');
if (seen.has(key)) {
dupCount++; dupInfo.push(nombre + ': ' + t);
if (dedupe) return;
}
seen.add(key); words.push(t);
});
const images = {}; Object.keys(c.imagenes || {}).forEach(k => { images[imgNorm(k)] = c.imagenes[k].trim().replace(/^(file|archivo):/i, ''); });
categories.push({ id, name: nombre, words, blocked: c.bloqueada === true, noImages: c.sinImagenes === true, image: c.imagen ? c.imagen.trim().replace(/^(file|archivo):/i, '') : '', images, unsorted: false });
});
let misiones = null;
if (obj.misiones !== undefined) {
if (!obj.misiones || typeof obj.misiones !== 'object' || Array.isArray(obj.misiones)) throw new Error('"misiones" debe ser un objeto con las listas palabras, acciones, impostor y civil.');
misiones = {};
['palabras', 'acciones', 'impostor', 'civil', 'picante'].forEach(k => {
if (obj.misiones[k] === undefined) return;
if (!Array.isArray(obj.misiones[k]) || obj.misiones[k].some(x => typeof x !== 'string')) throw new Error('Misiones: la lista "' + k + '" debe ser una lista de textos.');
misiones[k] = obj.misiones[k];
});
}
return { categories, dupCount, dupInfo, misiones };
}
function applyCategories(cats) {
CATEGORIES = cats;
state.selectedCats.clear();
CATEGORIES.forEach(cat => { if (!isCatBlocked(cat)) state.selectedCats.add(cat.id); });
buildCatGrid();
updateAllBtn();
}
// Exporta la lista actual como palabras.json (mismo formato que el bloque de index.html)
function buildWordsJson() {
const lines = ['{', '  "version": 2,', '  "categorias": ['];
CATEGORIES.forEach((cat, i) => {
lines.push('    {');
lines.push('      "id": ' + JSON.stringify(cat.id) + ',');
lines.push('      "nombre": ' + JSON.stringify(cat.name) + ',');
lines.push('      "bloqueada": ' + (cat.blocked ? 'true' : 'false') + ',');
lines.push('      "sinImagenes": ' + (cat.noImages ? 'true' : 'false') + ',');
if (cat.image) lines.push('      "imagen": ' + JSON.stringify(cat.image) + ',');
if (cat.images && Object.keys(cat.images).length) lines.push('      "imagenes": ' + JSON.stringify(cat.images) + ',');
lines.push('      "palabras": [');
cat.words.forEach((w, j) => { lines.push('        ' + JSON.stringify(w) + (j < cat.words.length - 1 ? ',' : '')); });
lines.push('      ]');
lines.push('    }' + (i < CATEGORIES.length - 1 ? ',' : ''));
});
const mis = (typeof Misiones !== 'undefined' && Misiones.personalizadas()) ? Misiones.get() : null;
lines.push('  ]' + (mis ? ',' : ''));
if (mis) {
lines.push('  "misiones": {');
Misiones.CLAVES.forEach((k, i, arr) => lines.push('    ' + JSON.stringify(k) + ': ' + JSON.stringify(mis[k]) + (i < arr.length - 1 ? ',' : '')));
lines.push('  }');
}
lines.push('}');
return lines.join('\n') + '\n';
}
function saveWordsJson(feedbackId) {
const blob = new Blob([buildWordsJson()], { type: 'application/json;charset=utf-8' });
const blobUrl = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = blobUrl; a.download = 'palabras.json';
document.body.appendChild(a); a.click(); document.body.removeChild(a);
setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
const fb = $(feedbackId);
if (fb) { fb.style.display = 'block'; setTimeout(() => { fb.style.display = 'none'; }, 3000); }
vibrate(30);
}
$('btn-save-html').addEventListener('click', () => { saveWordsJson('save-feedback'); });
// Carga una lista guardada (.json). Solo vive en este dispositivo y en esta sesión.
function showLoadFeedback(msg, kind) {
const fb = $('load-feedback');
if (!fb) return;
fb.textContent = msg;
fb.style.color = kind === 'error' ? 'var(--accent)' : (kind === 'warn' ? 'var(--gold)' : 'var(--blue)');
fb.style.display = 'block';
clearTimeout(showLoadFeedback._t);
showLoadFeedback._t = setTimeout(() => { fb.style.display = 'none'; }, kind === 'ok' ? 3500 : 7000);
}
function loadWordsFromText(text) {
if (!text || !text.trim()) { showLoadFeedback('El archivo está vacío.', 'error'); return; }
let result;
try {
result = parseWordsData(JSON.parse(text), { dedupe: true });
} catch (err) {
const msg = err instanceof SyntaxError
? 'El archivo no es un JSON válido (' + err.message + ').'
: err.message;
showLoadFeedback('No se cargó: ' + msg + ' Se mantiene la lista actual.', 'error');
return;
}
applyCategories(result.categories);
if (typeof Misiones !== 'undefined' && result.misiones) Misiones.set(result.misiones);
if (typeof Editor !== "undefined") Editor.guardar();
buildArchivoScreen(new Set());
const nWords = result.categories.reduce((a, c) => a + c.words.length, 0);
let msg = '✓ Lista cargada — ' + result.categories.length + ' categorías, ' + nWords + ' palabras (solo en este dispositivo)';
if (result.dupCount > 0) {
msg += '. Aviso: ' + result.dupCount + ' palabra' + (result.dupCount > 1 ? 's repetidas omitidas' : ' repetida omitida') + ' (' + result.dupInfo.slice(0, 3).join(' · ') + (result.dupCount > 3 ? ' …' : '') + ')';
}
showLoadFeedback(msg, result.dupCount > 0 ? 'warn' : 'ok');
vibrate(30);
}
$('btn-load-html').addEventListener('click', () => { $('inp-load-file').click(); });
$('inp-load-file').addEventListener('change', (e) => {
const file = e.target.files && e.target.files[0];
if (!file) return;
if (file.size > WORDS_LIMITS.maxFileBytes) {
showLoadFeedback('No se cargó: el archivo es demasiado grande (máximo 2 MB).', 'error');
e.target.value = '';
return;
}
const reader = new FileReader();
reader.onload = (ev) => { loadWordsFromText(String(ev.target.result || '')); };
reader.onerror = () => { showLoadFeedback('No se pudo leer el archivo.', 'error'); };
reader.readAsText(file);
e.target.value = ''; // permite recargar el mismo archivo otra vez
});
$('btn-info-toggle').addEventListener('click', () => {
const footer = $('info-footer');
footer.classList.toggle('visible');
vibrate(10);
});
document.addEventListener('click', e => {
const footer = $('info-footer');
if (footer.classList.contains('visible') && !footer.contains(e.target) && e.target.id !== 'btn-info-toggle') {
footer.classList.remove('visible');
}
});
// La lista de serie vive en el bloque <script id="palabras-json" type="application/json"> de index.html.
// Se lee con JSON.parse(textContent): sin fetch ni archivos externos, así funciona también con doble clic (file://).
function loadSeedWords() {
const el = document.getElementById('palabras-json');
let ok = false;
try {
if (!el) throw new Error('no se encontró el bloque "palabras-json" en index.html.');
const res = parseWordsData(JSON.parse(el.textContent), { dedupe: false });
applyCategories(res.categories);
if (typeof Misiones !== 'undefined') Misiones.set(res.misiones || null);
ok = true;
if (res.dupCount > 0) console.warn('Palabras repetidas en la lista de serie (revisa index.html):', res.dupInfo);
} catch (err) {
console.error('Lista de palabras de serie no válida:', err);
alert('No se pudo leer la lista de palabras de index.html (bloque palabras-json): ' + err.message);
}
return ok;
}
loadSeedWords();
$('btn-restore-seed').addEventListener('click', () => {
if (!confirm('¿Restaurar la lista de serie? Se perderán los cambios hechos o cargados en esta sesión.')) return;
if (loadSeedWords()) { if (typeof Editor !== "undefined") Editor.olvidar(); const eb = $('archivo-lista-estado'); if (eb) eb.textContent = ''; buildArchivoScreen(new Set()); showLoadFeedback('✓ Lista de serie restaurada', 'ok'); vibrate(30); }
});

// ===== Pantalla de inicio: un solo móvil u online =====
$('btn-home-local').addEventListener('click', () => { showScreen('screen-setup'); vibrate(15); });
$('btn-setup-home').addEventListener('click', () => { showScreen('screen-home'); });
showScreen('screen-home');

$('alc-rand').addEventListener('click', () => { state.alcaldeMode = 'random'; updateModeUI(); vibrate(10); });
$('alc-host').addEventListener('click', () => { state.alcaldeMode = 'host'; updateModeUI(); vibrate(10); });

// Palabra propuesta por un jugador (online): se guarda en la categoría «Propuestas» de la lista del anfitrión.
function anadirPalabraPropuesta(w) {
let cat = CATEGORIES.find(c => c.id === 'PROPUESTAS');
if (!cat) { cat = { id: 'PROPUESTAS', name: 'Propuestas', words: [], blocked: false, noImages: false, image: '', images: {}, unsorted: false }; CATEGORIES.push(cat); }
const key = w.toLowerCase().replace(/\s+/g, ' ');
if (cat.words.some(x => x.toLowerCase().replace(/\s+/g, ' ') === key)) return false;
cat.words.push(w); state.selectedCats.add(cat.id);
buildCatGrid(); updateAllBtn();
if (typeof Editor !== 'undefined') Editor.guardar();
return true;
}

// ===== PWA: registro del service worker y botón de instalar =====
(function () {
let evInstalar = null;
const instalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
if ('serviceWorker' in navigator && window.isSecureContext) {
window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* sin service worker: el juego funciona igual */ }); });
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evInstalar = e; if (!instalada()) $('btn-install').style.display = 'flex'; });
window.addEventListener('appinstalled', () => { evInstalar = null; $('btn-install').style.display = 'none'; });
$('btn-install').addEventListener('click', () => { if (!evInstalar) return; evInstalar.prompt(); evInstalar.userChoice.finally(() => { evInstalar = null; $('btn-install').style.display = 'none'; }); });
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !instalada()) $('install-hint').style.display = 'block';
})();

document.querySelectorAll('[data-ik]').forEach(b => b.addEventListener('click', () => { state.impKnows = b.dataset.ik === '1'; updateEscCfg(); vibrate(10); }));
document.querySelectorAll('[data-kc]').forEach(b => b.addEventListener('click', () => { state.keyCat = b.dataset.kc; updateEscCfg(); vibrate(10); }));
$('alc-rot').addEventListener('click', () => { state.alcaldeMode = 'rotate'; updateModeUI(); vibrate(10); });
