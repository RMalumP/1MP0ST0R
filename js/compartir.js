// js/compartir.js — Compartir la lista de palabras por código QR / enlace y leer QR con la cámara.
// El QR contiene un enlace «…#lista=IMP1:<datos>»: cualquier cámara lo abre en el juego y ofrece importar. Los datos son el JSON de la lista
// (solo las categorías elegidas) comprimido con deflate cuando el navegador lo permite. Librerías cargadas solo al usarlas:
// js/qrcode.js (qrcode-generator, MIT) para dibujar y js/jsqr.js (jsQR, Apache-2.0) para leer cuando el navegador no trae BarcodeDetector.
const Compartir = (function () {
'use strict';
const MAX_QR = 2300;   // caracteres máximos de datos para que el QR siga siendo legible
const q = id => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const b64u = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const deb64u = s => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u; };
async function flujo(tipo, u8) { const f = new tipo('deflate-raw'), w = f.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(f.readable).arrayBuffer()); }
async function empaquetar(obj) {
  const u8 = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return 'IMP0:' + b64u(u8);
  return 'IMP1:' + b64u(await flujo(CompressionStream, u8));
}
async function desempaquetar(txt) {
  const m = /^IMP([01]):([A-Za-z0-9_-]+)$/.exec(txt.trim()); if (!m) throw new Error('El código no es una lista de palabras de este juego.');
  let u8 = deb64u(m[2]);
  if (m[1] === '1') { if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede leer listas comprimidas. Prueba con otro.'); u8 = await flujo(DecompressionStream, u8); }
  if (u8.length > WORDS_LIMITS.maxFileBytes) throw new Error('La lista es demasiado grande.');
  return JSON.parse(new TextDecoder().decode(u8));
}
const objetoLista = cats => ({ version: 2, categorias: cats.map(c => { const o = { id: c.id, nombre: c.name, bloqueada: !!c.blocked, sinImagenes: !!c.noImages, palabras: c.words.slice() }; if (c.image) o.imagen = c.image; if (c.images && Object.keys(c.images).length) o.imagenes = c.images; return o; }) });
function cerrable(contenido) {
  const ov = el('div', 'rol-overlay'); ov.style.zIndex = 1200; ov.style.alignItems = 'flex-start'; ov.style.overflowY = 'auto';
  const card = el('div', 'rol-card'); card.style.textAlign = 'left'; card.style.margin = 'auto'; card.appendChild(contenido);
  const x = el('button', 'btn-secondary btn-ghost', 'Cerrar'); x.addEventListener('click', () => { ov.remove(); if (ov.__stop) ov.__stop(); }); card.appendChild(x);
  ov.appendChild(card); document.body.appendChild(ov); return ov;
}
function aviso(m) { const a = q('editor-msg'); if (a) { a.textContent = m; clearTimeout(aviso._t); aviso._t = setTimeout(() => { a.textContent = ''; }, 5000); } }
function cargarScript(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); }); }

// ---------- compartir ----------
function abrirCompartir() {
  const cont = el('div'); cont.appendChild(el('div', 'rol-player-label', 'Compartir por QR'));
  cont.appendChild(el('div', 'on-msg', 'Elige las categorías. Un QR admite unas decenas de palabras: si es demasiado grande, elige menos.'));
  const lista = el('div'); lista.style.cssText = 'max-height:38vh;overflow-y:auto;margin:8px 0;';
  CATEGORIES.forEach((c, i) => { const f = el('label'); f.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px 2px;font-size:.88rem;color:var(--text)'; const cb = el('input'); cb.type = 'checkbox'; cb.value = i; f.append(cb, el('span', '', c.name + ' (' + c.words.length + ')')); lista.appendChild(f); });
  cont.appendChild(lista);
  const res = el('div'); const gen = el('button', 'btn-primary', 'Generar QR'); gen.style.fontSize = '1.1rem'; gen.style.padding = '12px';
  gen.addEventListener('click', async () => {
    const sel = [...lista.querySelectorAll('input:checked')].map(c => CATEGORIES[Number(c.value)]); res.innerHTML = '';
    if (!sel.length) { res.appendChild(el('div', 'error-msg', 'Elige al menos una categoría.')); return; }
    const datos = await empaquetar(objetoLista(sel)), url = location.href.split('#')[0] + '#lista=' + datos;
    res.appendChild(el('div', 'on-msg', 'Tamaño: ' + datos.length + ' caracteres (máximo para QR: ' + MAX_QR + ').'));
    if (datos.length <= MAX_QR) {
      try { await cargarScript('js/qrcode.js?v=1'); const qr = window.qrcode(0, 'L'); qr.addData(url); qr.make(); const b = el('div'); b.style.cssText = 'background:#fff;padding:6px;border-radius:10px;max-width:300px;margin:8px auto;'; b.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); const svg = b.querySelector('svg'); if (svg) { svg.style.width = '100%'; svg.style.height = 'auto'; } res.appendChild(b); }
      catch (e) { res.appendChild(el('div', 'error-msg', 'No se pudo dibujar el QR: ' + e.message)); }
    } else res.appendChild(el('div', 'error-msg', 'Demasiado grande para un QR. Elige menos categorías, o comparte el enlace.'));
    const cp = el('button', 'btn-secondary', navigator.share ? 'Compartir enlace' : 'Copiar enlace'); cp.addEventListener('click', () => { if (navigator.share) navigator.share({ title: 'Lista de palabras', url }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => aviso('Enlace copiado.'), () => prompt('Copia este enlace:', url)); else prompt('Copia este enlace:', url); });
    res.appendChild(cp);
  });
  cont.append(gen, res); cerrable(cont);
}

// ---------- importar ----------
async function importarTexto(txt) {
  txt = String(txt || '').trim(); const i = txt.indexOf('#lista='); if (i >= 0) txt = txt.slice(i + 7);
  const obj = await desempaquetar(txt), r = parseWordsData(obj, { dedupe: true });
  const nPal = r.categories.reduce((a, c) => a + c.words.length, 0);
  if (!confirm('Se han recibido ' + r.categories.length + ' categoría(s) con ' + nPal + ' palabras:\n' + r.categories.map(c => '· ' + c.name + ' (' + c.words.length + ')').join('\n').slice(0, 400) + '\n\n¿Añadirlas a tu lista? (si una categoría ya existe, se le añaden las palabras nuevas)')) return false;
  const res = Editor.fusionar(r.categories);
  aviso('Importado: ' + res.nuevas + ' categoría(s) nuevas, ' + res.palabras + ' palabra(s) añadidas.');
  return true;
}
// Decodifica un QR de un fotograma/imagen con BarcodeDetector o, si no existe, con jsQR.
let detector = null;
async function leerImagen(fuente, w, h) {
  if (detector === null) detector = ('BarcodeDetector' in window) ? await BarcodeDetector.getSupportedFormats().then(f => f.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : false).catch(() => false) : false;
  if (detector) { const r = await detector.detect(fuente).catch(() => []); return r.length ? r[0].rawValue : null; }
  if (!window.jsQR) await cargarScript('js/jsqr.js?v=1');
  const c = el('canvas'); const k = Math.min(1, 800 / Math.max(w, h)); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(fuente, 0, 0, c.width, c.height);
  const d = cx.getImageData(0, 0, c.width, c.height), r = window.jsQR(d.data, d.width, d.height);
  return r ? r.data : null;
}
function abrirEscaner() {
  const cont = el('div'); cont.appendChild(el('div', 'rol-player-label', 'Escanear QR'));
  const msg = el('div', 'on-msg', 'Apunta la cámara al código QR de la lista.');
  const video = el('video'); video.setAttribute('playsinline', ''); video.muted = true; video.style.cssText = 'width:100%;border-radius:12px;background:#000;max-height:50vh;';
  const foto = el('input'); foto.type = 'file'; foto.accept = 'image/*'; foto.style.cssText = 'margin-top:10px;width:100%;font-size:.8rem;color:var(--text-dim);';
  cont.append(msg, video, el('div', 'on-msg', 'Si no funciona la cámara, elige una foto del QR:'), foto);
  const ov = cerrable(cont); let activo = true, stream = null, ocupado = false;
  ov.__stop = () => { activo = false; if (stream) stream.getTracks().forEach(t => t.stop()); };
  const exito = async txt => { ov.__stop(); ov.remove(); try { await importarTexto(txt); } catch (e) { aviso(e.message); } };
  foto.addEventListener('change', async () => {
    const f = foto.files && foto.files[0]; if (!f) return; msg.textContent = 'Leyendo la foto…';
    try { const bmp = await createImageBitmap(f), t = await leerImagen(bmp, bmp.width, bmp.height); if (t) exito(t); else msg.textContent = 'No se ha encontrado ningún QR en esa foto.'; } catch (e) { msg.textContent = 'No se pudo leer la foto.'; }
  });
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'Este navegador no permite usar la cámara. Elige una foto del QR.'; return; }
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(async s => {
    if (!activo) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s; video.srcObject = s; await video.play().catch(() => {});
    const paso = async () => {
      if (!activo) return;
      if (!ocupado && video.videoWidth) { ocupado = true; try { const t = await leerImagen(video, video.videoWidth, video.videoHeight); if (t && activo) { exito(t); return; } } catch (e) { /* siguiente fotograma */ } ocupado = false; }
      setTimeout(paso, 250);
    };
    paso();
  }).catch(() => { msg.textContent = 'No se pudo usar la cámara (permiso denegado o no disponible). Elige una foto del QR.'; });
}
// Enlace «…#lista=…» abierto desde la cámara del móvil
function revisarEnlace() {
  if (!/^#lista=/.test(location.hash || '')) return;
  const txt = location.hash; try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nada */ }
  setTimeout(async () => { try { showScreen('screen-archivo'); Editor.render(); await importarTexto(txt); } catch (e) { alert(e.message); } }, 300);
}
function enlazar() {
  if (!q('btn-share-list')) return;
  q('btn-share-list').addEventListener('click', abrirCompartir);
  q('btn-scan-list').addEventListener('click', abrirEscaner);
  revisarEnlace();
}
enlazar();
return { importarTexto, empaquetar, desempaquetar, leerImagen };
})();
