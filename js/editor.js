// js/editor.js — Editor de palabras: renombrar, editar palabra y descripción, imágenes, mover entre categorías, deshacer y guardado en el navegador.
// Usa lo que define js/script.js (CATEGORIES, state, parseLine, buildWordsJson, parseWordsData, applyCategories, buildCatGrid…).
const Editor = (function () {
'use strict';
const KEY = 'impostor.lista.v1', PAGE = 40, MAX_UNDO = 25;
const undo = [], abiertas = new Set(), pagina = {};
let guardarT = null;
const q = id => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function partir(w) { const m = String(w).match(/^(.*?)\s*\((.+)\)\s*$/); return m ? { p: m[1].trim(), d: m[2].trim() } : { p: String(w).trim(), d: '' }; }
const unir = (p, d) => d ? p + ' (' + d + ')' : p;
const clave = w => imgNorm(partir(w).p);
function ls(fn) { try { return fn(localStorage); } catch (e) { return null; } }
function firmaSerie() { const e = document.getElementById('palabras-json'); let h = 5381; const t = e ? e.textContent : ''; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h); }

// ---------- guardado en el navegador ----------
function guardar() {
  clearTimeout(guardarT);
  guardarT = setTimeout(() => {
    const ok = ls(s => { s.setItem(KEY, JSON.stringify({ firma: firmaSerie(), t: Date.now(), json: buildWordsJson() })); return true; });
    estado(ok ? 'Guardado en este navegador ✓' : 'No se pudo guardar en el navegador (sin espacio o bloqueado).');
  }, 400);
}
function olvidar() { ls(s => s.removeItem(KEY)); estado(''); }
function estado(txt) { const b = q('archivo-lista-estado'); if (b) b.textContent = txt || ''; }
function cargarGuardada() {
  const raw = ls(s => s.getItem(KEY)); if (!raw) return false;
  try {
    const d = JSON.parse(raw), r = parseWordsData(JSON.parse(d.json), { dedupe: false });
    applyCategories(r.categories);
    const b = q('archivo-lista-estado');
    if (b) b.textContent = 'Usando tu lista guardada en este navegador' + (d.firma !== firmaSerie() ? ' (la lista de serie ha cambiado desde entonces: pulsa «Restaurar lista de serie» para usar la nueva)' : '') + '.';
    return true;
  } catch (e) { olvidar(); return false; }
}

// ---------- deshacer ----------
const plano = () => JSON.stringify(CATEGORIES.map(c => ({ id: c.id, name: c.name, words: c.words.slice(), blocked: !!c.blocked, noImages: !!c.noImages, image: c.image || '', images: Object.assign({}, c.images || {}) })));
function snap() { undo.push(plano()); if (undo.length > MAX_UNDO) undo.shift(); q('editor-undo').disabled = false; }
function deshacer() {
  const s = undo.pop(); if (!s) return;
  CATEGORIES = JSON.parse(s).map(c => Object.assign(c, { unsorted: false }));
  const ids = new Set(CATEGORIES.map(c => c.id)); [...state.selectedCats].forEach(id => { if (!ids.has(id)) state.selectedCats.delete(id); });
  buildCatGrid(); updateAllBtn(); render(); guardar(); vibrate(15);
  q('editor-undo').disabled = undo.length === 0;
}
function cambio(opts) { guardar(); if (opts && opts.grid) { buildCatGrid(); updateAllBtn(); } }

// ---------- pintado ----------
function repetidas(cat) { const v = new Map(); cat.words.forEach(w => { const k = clave(w); v.set(k, (v.get(k) || 0) + 1); }); return v; }
function render() {
  const lista = q('editor-list'), f = norm(q('editor-search').value); lista.innerHTML = '';
  let visibles = 0;
  CATEGORIES.forEach((cat, ci) => {
    const coincideCat = !f || norm(cat.name).includes(f);
    const coincidePal = !!f && cat.words.some(w => norm(w).includes(f));
    if (f && !coincideCat && !coincidePal) return;
    visibles++;
    const card = el('div', 'cat-card' + (abiertas.has(cat.id) || (f && coincidePal && !coincideCat) ? ' open' : ''));
    const h = el('div', 'cat-card-header');
    h.append(el('span', 'cat-card-name', cat.name), el('span', 'cat-card-count', (cat.blocked ? '🔒 ' : '') + (cat.noImages ? '🚫🖼 ' : '') + cat.words.length));
    h.appendChild(el('span', 'cat-card-chevron', '▼'));
    h.addEventListener('click', () => { if (abiertas.has(cat.id)) abiertas.delete(cat.id); else abiertas.add(cat.id); render(); });
    card.appendChild(h);
    if (card.classList.contains('open')) { const b = el('div', 'cat-card-body'); cuerpo(b, ci, f); card.appendChild(b); }
    lista.appendChild(card);
  });
  if (!visibles) lista.appendChild(el('div', 'on-msg', f ? 'Nada coincide con «' + q('editor-search').value + '».' : 'No hay categorías.'));
}
function interruptor(texto, ayuda, on, fn) {
  const row = el('div', 'toggle-row'), lab = el('div', 'toggle-label', texto), sw = el('div', 'switch' + (on ? ' on' : ''));
  if (ayuda) lab.appendChild(el('small', '', ayuda));
  sw.addEventListener('click', () => { const v = !sw.classList.contains('on'); sw.classList.toggle('on', v); fn(v); });
  row.append(lab, sw); return row;
}
function cuerpo(b, ci, f) {
  const cat = CATEGORIES[ci]; b.style.padding = '12px';
  const nom = el('input', 'field-inp'); nom.value = cat.name; nom.maxLength = 80; nom.placeholder = 'Nombre de la categoría';
  nom.addEventListener('change', () => {
    const v = nom.value.trim();
    if (!v) { nom.value = cat.name; return; }
    if (CATEGORIES.some((c, i) => i !== ci && norm(c.name) === norm(v))) { aviso('Ya existe una categoría con ese nombre.'); nom.value = cat.name; return; }
    snap(); cat.name = v; cambio({ grid: true }); render();
  });
  b.appendChild(nom);
  b.appendChild(interruptor('Bloqueada por defecto', 'Aparece desmarcada al empezar', !!cat.blocked, v => { snap(); cat.blocked = v; if (v) state.selectedCats.delete(cat.id); cambio({ grid: true }); render(); }));
  b.appendChild(interruptor('Sin imágenes', 'No busca imagen en Wikipedia', !!cat.noImages, v => { snap(); cat.noImages = v; cambio(); render(); }));
  const im = el('input', 'field-inp'); im.value = cat.image || ''; im.placeholder = 'Imagen de toda la categoría (archivo de Commons, opcional)'; im.style.marginTop = '8px'; im.maxLength = 200;
  im.addEventListener('change', () => { snap(); cat.image = im.value.trim().replace(/^(file|archivo):/i, ''); cambio(); });
  b.appendChild(im);
  // añadir palabras en bloque
  const ta = el('textarea', 'field-inp'); ta.rows = 3; ta.placeholder = 'Añadir palabras: una por línea o separadas por comas. Descripción entre paréntesis: Pizza (Italia)'; ta.style.cssText = 'margin-top:10px;resize:vertical;user-select:text;-webkit-user-select:text;';
  const add = el('button', 'btn-add-cat', 'Añadir palabras'); add.addEventListener('click', () => {
    const nuevas = ta.value.split('\n').flatMap(l => parseLine(l)).map(s => s.trim()).filter(Boolean).map(s => s.slice(0, WORDS_LIMITS.maxWordLen));
    if (!nuevas.length) return;
    const ya = new Set(cat.words.map(clave)); let dup = 0; snap();
    nuevas.forEach(w => { if (ya.has(clave(w))) { dup++; return; } ya.add(clave(w)); cat.words.push(w); });
    if (cat.words.length > WORDS_LIMITS.maxWordsPerCat) cat.words.length = WORDS_LIMITS.maxWordsPerCat;
    pagina[cat.id] = Infinity; cambio(); render(); if (dup) aviso(dup + ' repetida' + (dup > 1 ? 's' : '') + ' omitida' + (dup > 1 ? 's' : '') + '.');
  });
  b.append(ta, add);
  // herramientas
  const hr = el('div', 'timer-controls'); hr.style.marginTop = '10px';
  const ord = el('button', 'btn-secondary btn-ghost', 'Ordenar A-Z'), dd = el('button', 'btn-secondary btn-ghost', 'Quitar repetidas');
  ord.addEventListener('click', () => { snap(); cat.words.sort((a, b2) => partir(a).p.localeCompare(partir(b2).p, 'es')); cambio(); render(); });
  dd.addEventListener('click', () => { const ya = new Set(), antes = cat.words.length; snap(); cat.words = cat.words.filter(w => { const k = clave(w); if (ya.has(k)) return false; ya.add(k); return true; }); cambio(); render(); aviso((antes - cat.words.length) + ' repetida(s) quitada(s).'); });
  hr.append(ord, dd); b.appendChild(hr);
  const rep = repetidas(cat), nrep = [...rep.values()].filter(n => n > 1).length;
  if (nrep) b.appendChild(el('div', 'on-warn', '⚠ ' + nrep + ' palabra(s) repetida(s) en esta categoría (marcadas con ⚠).'));
  // palabras
  const idx = cat.words.map((w, i) => i).filter(i => !f || norm(cat.words[i]).includes(f) || norm(cat.name).includes(f));
  const lim = pagina[cat.id] || PAGE, ver = idx.slice(0, lim);
  b.appendChild(el('div', 'section-title', 'Palabras (' + idx.length + ')')).style.marginTop = '14px';
  ver.forEach(i => b.appendChild(fila(cat, ci, i, rep)));
  if (idx.length > ver.length) { const m = el('button', 'btn-secondary btn-ghost', 'Mostrar más (' + (idx.length - ver.length) + ' restantes)'); m.addEventListener('click', () => { pagina[cat.id] = lim + PAGE; render(); }); b.appendChild(m); }
  const del = el('button', 'btn-del-cat-body', '🗑 Eliminar categoría'); del.style.cssText = 'margin:14px 0 0;width:100%;';
  del.addEventListener('click', () => { if (!confirm('¿Eliminar la categoría «' + cat.name + '»? Se puede deshacer con ↶.')) return; snap(); state.selectedCats.delete(cat.id); CATEGORIES.splice(ci, 1); abiertas.delete(cat.id); cambio({ grid: true }); render(); });
  b.appendChild(del);
}
function fila(cat, ci, i, rep) {
  const w = cat.words[i], { p, d } = partir(w), box = el('div', 'ed-word');
  const r1 = el('div', 'ed-row');
  const ip = el('input', 'field-inp'); ip.value = p; ip.placeholder = 'Palabra'; ip.maxLength = 120;
  const idd = el('input', 'field-inp'); idd.value = d; idd.placeholder = 'Descripción (opcional)'; idd.maxLength = 120;
  const dup = rep.get(clave(w)) > 1; if (dup) ip.classList.add('ed-dup'), ip.title = 'Repetida';
  const mas = el('button', 'on-kick', '⋯'), x = el('button', 'on-kick', '✕'); mas.type = x.type = 'button'; mas.style.marginLeft = '0'; x.style.marginLeft = '0';
  const guardarPal = () => {
    const np = ip.value.trim(), nd = idd.value.trim(); if (!np) { ip.value = p; return; }
    const nuevo = unir(np, nd); if (nuevo === w) return;
    snap(); const k0 = clave(w); cat.words[i] = nuevo;
    if (cat.images && cat.images[k0] && clave(nuevo) !== k0) { cat.images[clave(nuevo)] = cat.images[k0]; delete cat.images[k0]; }
    cambio(); render();
  };
  ip.addEventListener('change', guardarPal); idd.addEventListener('change', guardarPal);
  x.addEventListener('click', () => { snap(); delete (cat.images || {})[clave(w)]; cat.words.splice(i, 1); cambio(); render(); });
  r1.append(ip, idd, mas, x); box.appendChild(r1);
  const r2 = el('div', 'ed-row ed-more'); r2.style.display = 'none';
  const ii = el('input', 'field-inp'); ii.placeholder = 'Imagen (archivo de Commons)'; ii.value = (cat.images && cat.images[clave(w)]) || ''; ii.maxLength = 200;
  ii.addEventListener('change', () => { snap(); cat.images = cat.images || {}; const v = ii.value.trim().replace(/^(file|archivo):/i, ''); if (v) cat.images[clave(w)] = v; else delete cat.images[clave(w)]; cambio(); });
  const mv = el('select', 'field-inp'); mv.appendChild(el('option', '', 'Mover a…')).value = '';
  CATEGORIES.forEach((c, j) => { if (j !== ci) { const o = el('option', '', c.name); o.value = j; mv.appendChild(o); } });
  mv.addEventListener('change', () => { if (mv.value === '') return; const dest = CATEGORIES[+mv.value]; snap(); const ya = new Set(dest.words.map(clave)); if (!ya.has(clave(w))) dest.words.push(w); cat.words.splice(i, 1); cambio(); render(); aviso('Movida a «' + dest.name + '».'); });
  r2.append(ii, mv); box.appendChild(r2);
  mas.addEventListener('click', () => { r2.style.display = r2.style.display === 'none' ? 'flex' : 'none'; });
  return box;
}
function aviso(m) { const a = q('editor-msg'); a.textContent = m; clearTimeout(aviso._t); aviso._t = setTimeout(() => { a.textContent = ''; }, 3500); }

// ---------- nueva categoría ----------
function nueva() {
  const n = q('editor-new-name').value.trim(); if (!n) { aviso('Escribe un nombre.'); return; }
  if (CATEGORIES.some(c => norm(c.name) === norm(n))) { aviso('Ya existe una categoría con ese nombre.'); return; }
  let id = n.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_ÁÉÍÓÚÑÜ]/g, '') || 'CATEGORIA'; while (CATEGORIES.some(c => c.id === id)) id += '_';
  snap(); CATEGORIES.push({ id, name: n, words: [], blocked: false, noImages: false, image: '', images: {}, unsorted: false }); abiertas.add(id);
  q('editor-new-name').value = ''; cambio({ grid: true }); render();
}

// ---------- pantalla ----------
function enlazar() {
  q('editor-undo').addEventListener('click', deshacer);
  q('editor-search').addEventListener('input', render);
  q('editor-new-btn').addEventListener('click', nueva);
  q('editor-undo').disabled = true;
}
cargarGuardada();
enlazar();
// Fusiona categorías recibidas (por QR/enlace): si ya existe una con el mismo nombre se le añaden las palabras nuevas; si no, se crea.
function fusionar(cats) {
  snap(); let nuevas = 0, palabras = 0;
  cats.forEach(c => {
    let dest = CATEGORIES.find(x => norm(x.name) === norm(c.name));
    if (!dest) {
      let id = c.id || 'IMPORTADA'; while (CATEGORIES.some(x => x.id === id)) id += '_';
      dest = { id, name: c.name, words: [], blocked: !!c.blocked, noImages: !!c.noImages, image: c.image || '', images: Object.assign({}, c.images || {}), unsorted: false };
      CATEGORIES.push(dest); nuevas++; if (!dest.blocked) state.selectedCats.add(dest.id);
    }
    const ya = new Set(dest.words.map(clave));
    c.words.forEach(w => { if (!ya.has(clave(w))) { ya.add(clave(w)); dest.words.push(w); palabras++; } });
    Object.keys(c.images || {}).forEach(k => { dest.images = dest.images || {}; if (!dest.images[k]) dest.images[k] = c.images[k]; });
  });
  cambio({ grid: true }); render();
  return { nuevas, palabras };
}
return { guardar, olvidar, render, fusionar };
})();
