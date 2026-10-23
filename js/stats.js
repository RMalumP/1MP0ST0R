// js/stats.js — Estadísticas simples guardadas en este navegador (sin marcador de partida ni servidor).
const Stats = (function () {
'use strict';
const KEY = 'impostor.stats.v1';
const base = () => ({ rondas: 0, local: 0, online: 0, civiles: 0, impostores: 0, bandoA: 0, bandoB: 0, comoImpostor: 0, comoCivil: 0, comoTraidor: 0, victorias: 0, porModo: {}, desde: Date.now() });
let S = null;
function leer() { if (S) return S; try { S = Object.assign(base(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { S = base(); } return S; }
function guardar() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ } }
// info: { modo, ganador: 'civiles'|'impostores', online: bool, miRol?: 'impostor'|'civil'|'traidor' }
function ronda(info) {
  const s = leer(); s.rondas++; info.online ? s.online++ : s.local++;
  const bandos = info.modo === 'bandos';
  if (info.ganador === 'civiles') bandos ? s.bandoA++ : s.civiles++; else bandos ? s.bandoB++ : s.impostores++;
  s.porModo[info.modo] = (s.porModo[info.modo] || 0) + 1;
  if (info.miRol) {
    if (info.miRol === 'impostor') s.comoImpostor++; else if (info.miRol === 'traidor') s.comoTraidor++; else s.comoCivil++;
    const ladoImp = info.miRol === 'impostor' || info.miRol === 'traidor';
    if (ladoImp === (info.ganador === 'impostores')) s.victorias++;
  }
  guardar();
}
function pintar() {
  const s = leer(), box = document.getElementById('stats-body'); if (!box) return;
  box.innerHTML = '';
  const fila = (a, b) => { const d = document.createElement('div'); d.className = 'on-setting'; d.style.display = 'flex'; d.style.justifyContent = 'space-between'; const x = document.createElement('span'), y = document.createElement('strong'); x.textContent = a; y.textContent = b; d.append(x, y); box.appendChild(d); };
  const pct = (a, b) => b ? Math.round(a * 100 / b) + ' %' : '—';
  const MODOS = { normal: 'Normal', multiple: 'Múltiple', escondite: 'Escondite', bandos: 'Bandos' };
  fila('Rondas jugadas', s.rondas); fila('· en un solo móvil', s.local); fila('· online', s.online);
  fila('Han ganado los civiles', s.civiles + ' (' + pct(s.civiles, s.civiles + s.impostores) + ')'); fila('Han ganado los impostores', s.impostores + ' (' + pct(s.impostores, s.civiles + s.impostores) + ')');
  if (s.bandoA + s.bandoB) { fila('Bandos: ganó el bando A', s.bandoA); fila('Bandos: ganó el bando B', s.bandoB); }
  fila('Veces que fuiste impostor (online)', s.comoImpostor); fila('Veces que fuiste civil (online)', s.comoCivil); if (s.comoTraidor) fila('Veces que fuiste traidor (online)', s.comoTraidor);
  fila('Rondas ganadas por ti (online)', s.victorias + ' (' + pct(s.victorias, s.comoImpostor + s.comoCivil + s.comoTraidor) + ')');
  Object.keys(s.porModo).forEach(m => fila('Modo ' + (MODOS[m] || m), s.porModo[m]));
  fila('Desde', new Date(s.desde).toLocaleDateString('es-ES'));
}
function reiniciar() { if (!confirm('¿Borrar todas las estadísticas de este navegador?')) return; S = base(); guardar(); pintar(); }
function enlazar() {
  const q = id => document.getElementById(id); if (!q('btn-home-stats')) return;
  q('btn-home-stats').addEventListener('click', () => { pintar(); showScreen('screen-stats'); });
  q('btn-stats-back').addEventListener('click', () => showScreen('screen-home'));
  q('btn-stats-reset').addEventListener('click', reiniciar);
}
enlazar();
return { ronda };
})();
