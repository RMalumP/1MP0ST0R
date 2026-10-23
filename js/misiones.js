// js/misiones.js — Misiones secretas (sabotaje): cada jugador recibe una misión en su tarjeta. Mezcla palabras y acciones (sin alcohol).
// Se cumplen «de palabra»: nadie las comprueba, la gracia es disimular. Se reparten sin repetir dentro de la ronda mientras haya misiones.
const Misiones = (function () {
'use strict';
const PALABRAS = [
  'Cada vez que digas «sí», bebe un sorbo de agua.',
  'Cada vez que digas «no», bebe un sorbo de agua.',
  'Empieza cada intervención con «Bueno, bueno…».',
  'Termina cada frase con «¿verdad?».',
  'Habla de ti en tercera persona, usando tu nombre.',
  'No digas el nombre de nadie: usa apodos para todos.',
  'Nombra un color en cada intervención.',
  'Cada vez que oigas tu nombre, responde «presente».',
  'Di una frase que rime con lo que acaba de decir el jugador anterior.',
  'Pregunta «¿tú crees?» al menos tres veces.',
  'Usa la palabra «obviamente» en todas tus frases.',
  'No uses la palabra «yo» (ni «me», «mi»): rodéala.',
  'Cada vez que alguien te pregunte algo, contesta con otra pregunta.',
  'Habla como un presentador de televisión.',
  'Habla como si estuvieras contando un secreto, en voz baja.',
  'Cuenta algo de lo que dices con un número exacto («tres veces», «cinco minutos»…).',
  'Acaba una frase con «y eso es todo».',
  'Cada vez que dudes, di «déjame pensar» y cuenta hasta tres en silencio.',
  'Empieza tus frases con el nombre de la persona a la que te diriges.',
  'Cada vez que digas una pregunta, levanta una ceja.',
  'Habla más despacio de lo normal durante toda la ronda.',
  'Di «exacto» cada vez que alguien más diga algo, aunque no coincidas.',
  'Evita decir «es» y «está»: busca otras formas de decirlo.',
  'Mete en una frase un animal sin que venga a cuento.'
];
const ACCIONES = [
  'Antes de hablar, tócate la oreja.',
  'Cruza los brazos mientras habla otra persona.',
  'Cada vez que alguien se ría, bebe un sorbo de agua.',
  'Cuando acusen a alguien, levántate y da una vuelta a tu silla.',
  'Choca el puño con quien te dé la razón.',
  'Pon cara de sorpresa cada vez que se diga «sospechoso».',
  'Aplaude suavemente cuando alguien diga algo acertado.',
  'Mira fijamente a un jugador mientras habla, sin parpadear mucho.',
  'Cambia de postura cada vez que respires hondo (que se note).',
  'Cada vez que digas una palabra de más de seis letras, bebe un sorbo de agua.',
  'Guiña un ojo a alguien una vez sin que te pillen (y sin explicarlo).',
  'Cuando te señalen, pon la mano en el pecho como si te ofendieran.',
  'Mientras otro habla, asiente despacio con la cabeza.',
  'Levanta la mano para pedir turno cada vez que quieras hablar.',
  'Da un sorbo de agua cada vez que alguien diga «palabra».',
  'Apoya la barbilla en la mano mientras piensas (que se note).',
  'Cada vez que cambien de tema, bebe un sorbo de agua.',
  'Haz un gesto con la mano (el que quieras) cada vez que estés de acuerdo.',
  'Sonríe cada vez que alguien te mire, aunque no tenga gracia.',
  'Mira el techo un segundo antes de contestar.',
  'Cada vez que cuenten un número, golpea suavemente la mesa ese número de veces.'
];
const IMPOSTOR = [
  'Defiende a un jugador concreto aunque nadie lo acuse.',
  'Sé el primero en acusar a alguien, con una razón inventada pero creíble.',
  'Consigue que alguien repita una palabra que has dicho tú.',
  'Propón votar a alguien que casi no ha hablado.',
  'Sugiere un tema de conversación que no tenga nada que ver con la palabra y haz que lo sigan.',
  'Haz que dos jugadores discutan entre sí sin que se note que lo has provocado.',
  'Elogia la respuesta de otra persona y luego duda de ella.',
  'Cambia de opinión una vez sobre a quién votar, con una buena excusa.',
  'Pide a alguien que explique con más detalle lo que ha dicho.',
  'Intenta que te pregunten tu opinión y responde con mucha seguridad.'
];
const CIVIL = [
  'Consigue que dos personas se pongan de acuerdo en algo.',
  'Pregunta a alguien por qué ha dicho lo que ha dicho.',
  'Pide que cada uno diga una palabra relacionada y fíjate en quién duda.',
  'Resume en voz alta lo que se ha dicho hasta ahora.',
  'Propón un orden de turnos y consigue que se respete.',
  'Elige a un jugador y hazle tres preguntas seguidas.',
  'Haz que alguien repita lo que ha dicho para ver si lo cuenta igual.',
  'Defiende a alguien a quien nadie esté defendiendo (aunque no estés seguro).'
];
// rol: 'impostor' | 'civil' | 'traidor'; bandos: no hay impostores ni civiles, solo misiones neutras.
function pool(rol, bandos) {
  const base = PALABRAS.concat(ACCIONES);
  if (bandos) return base;
  return base.concat(rol === 'civil' ? CIVIL : IMPOSTOR);
}
// Reparte una misión a cada asiento. asientos: [{ id, rol }]; quien: 'todos' | 'civiles' | 'impostores'.
function repartir(asientos, quien, bandos) {
  const usadas = new Set(), out = {};
  asientos.forEach(a => {
    const lado = a.rol === 'civil' ? 'civiles' : 'impostores';
    if (quien !== 'todos' && quien !== lado) return;
    const p = pool(a.rol, bandos); let libres = p.filter(t => !usadas.has(t));
    if (!libres.length) { usadas.clear(); libres = p.slice(); }
    const t = libres[Math.floor(Math.random() * libres.length)];
    usadas.add(t); out[a.id] = t;
  });
  return out;
}
return { repartir, total: PALABRAS.length + ACCIONES.length + IMPOSTOR.length + CIVIL.length };
})();
