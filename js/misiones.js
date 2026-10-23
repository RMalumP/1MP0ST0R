// js/misiones.js — Misiones secretas (sabotaje): cada jugador recibe una misión en su tarjeta. Mezcla palabras y acciones (sin alcohol).
// Se cumplen «de palabra»: nadie las comprueba, la gracia es disimular. Se reparten sin repetir dentro de la ronda mientras haya misiones.
const Misiones = (function () {
'use strict';
const PALABRAS_DEF = [
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
  'Mete en una frase un animal sin que venga a cuento.',
  'Habla como un pirata durante toda la ronda.',
  'Habla como si cantaras ópera (un poquito, que se note).',
  'Narra en voz alta lo que haces, como en un documental de la naturaleza.',
  'Mete un refrán en cada intervención.',
  'Di «con todo el respeto del mundo» antes de cada comentario.',
  'Empieza una frase con «según mi abuela…» y termínala como quieras.',
  'Habla en rima en tu primera intervención.',
  'Di tu primera frase como si fueras un robot.',
  'Cada vez que alguien te dé la razón, di «lo sabía».',
  'Llama «campeón» o «campeona» a todo el que te hable.',
  'Empieza a hablar con «última hora:» como en un noticiero.',
  'Termina tus frases con «o eso dicen».',
  'Cada vez que digas «bueno», pon voz de villano de película.',
  'Describe a alguien sin decir su nombre, como una adivinanza, y que los demás lo adivinen.'
];
const ACCIONES_DEF = [
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
  'Cada vez que cuenten un número, golpea suavemente la mesa ese número de veces.',
  'Al terminar de hablar, haz el gesto de soltar un micrófono.',
  'Tose una vez antes de cada acusación que hagas.',
  'Haz el signo de la paz cada vez que hables.',
  'Pon cara de detective (ceño fruncido) cuando alguien hable.',
  'Bosteza de forma exagerada una vez, y que se note que es teatro.',
  'Cada vez que alguien se levante o cambie de sitio, haz tú lo mismo.',
  'Abre mucho los ojos cada vez que alguien diga «verdad».',
  'Haz un mini baile (3 segundos) cuando alguien diga tu nombre.',
  'Da dos golpecitos en la mesa antes de cada intervención.',
  'Cuando alguien acuse a otro, ponte la mano en la boca como si fuera un escándalo.',
  'Mantén una sonrisa de oreja a oreja mientras hablas.',
  'Señala a alguien con dos dedos («te vigilo») antes de contestarle.',
  'Haz como si tomaras notas en una libreta imaginaria mientras hablan los demás.',
  'Aplaude una sola vez, fuerte, cuando alguien diga algo gracioso.'
];
const IMPOSTOR_DEF = [
  'Defiende a un jugador concreto aunque nadie lo acuse.',
  'Sé el primero en acusar a alguien, con una razón inventada pero creíble.',
  'Consigue que alguien repita una palabra que has dicho tú.',
  'Propón votar a alguien que casi no ha hablado.',
  'Sugiere un tema de conversación que no tenga nada que ver con la palabra y haz que lo sigan.',
  'Haz que dos jugadores discutan entre sí sin que se note que lo has provocado.',
  'Elogia la respuesta de otra persona y luego duda de ella.',
  'Cambia de opinión una vez sobre a quién votar, con una buena excusa.',
  'Pide a alguien que explique con más detalle lo que ha dicho.',
  'Intenta que te pregunten tu opinión y responde con mucha seguridad.',
  'Haz creer que has visto algo sospechoso en otro jugador (sin concretar).',
  'Pide que se repita la última frase «porque no la has oído bien».',
  'Consigue que alguien diga «seguro» o «lo juro» y recuérdaselo después.',
  'Acusa a quien te acuse con la misma frase que usó contra ti.',
  'Ofrécete para dirigir el debate y reparte los turnos.',
  'Haz una pregunta trampa a alguien y observa su cara al contestar.',
  'Propón una «prueba»: que cada uno diga una palabra relacionada, y aprovecha para copiar a los demás.',
  'Cuando te señalen, di «¡me siento atacado/a!» con mucho dramatismo, aunque sea suave.'
];
const PICANTE_DEF = [
  'Confiesa en voz alta una manía rara que tengas (real o inventada, tú decides).',
  'Cuenta una anécdota vergonzosa (real o inventada) sin que se note cuál de las dos es.',
  'Imita a otro jugador sin decir a quién; que los demás adivinen quién es.',
  'Hazle un cumplido exagerado a alguien, con voz de presentador de gala.',
  'Ponle un apodo ridículo a otro jugador y úsalo toda la ronda.',
  'Acusa a alguien con mucho dramatismo, como en una telenovela.',
  'Pide perdón a alguien por algo que no has hecho, muy en serio.',
  'Habla con un acento exagerado (el que quieras) hasta que alguien lo adivine.',
  'Reta a alguien a aguantar la mirada 5 segundos sin reírse; quien se ría bebe agua.',
  'Dile a alguien «sé lo que hiciste» con cara seria y no des más explicaciones.',
  'Echa la culpa de todo lo que pase en la ronda al jugador que tengas a tu derecha.',
  'Interrumpe a alguien una vez con «¡mentira!» y luego pide perdón con educación.',
  'Responde a la próxima pregunta que te hagan con un chiste malo.',
  'Reta a alguien a piedra, papel o tijera: quien pierda habla con voz de pito el resto de la ronda.',
  'Haz una predicción dramática de lo que va a pasar esta ronda, como un adivino.',
  'Susurra algo inofensivo al oído de otro jugador y haz que parezca un secreto importante.',
  'Pregunta a alguien qué haría si fuera impostor… y no le creas la respuesta.',
  'Defiende a quien menos lo merezca con un discurso de 10 segundos.',
  'Si alguien se ríe, señálalo y di «¡ese es culpable!».',
  'Cuenta algo que nunca has hecho como si lo hubieras hecho, y que nadie sepa que es mentira.',
  'Di cuál es el mayor defecto (gracioso, nada hiriente) de otro jugador.',
  'Haz que dos jugadores se den la mano «en señal de paz» antes de votar.',
  'Confiesa unos «pecados» inventados y pide que los demás confiesen los suyos.',
  'Brinda con agua cada vez que alguien diga algo muy obvio.',
  'Pon nota (del 1 al 10) a la actuación de cada jugador que hable.',
  'Cambia de opinión a mitad de ronda con una excusa ridícula.',
  'Pregunta a alguien a quién votaría ahora mismo y comenta su respuesta con ironía.',
  'Aplaude con ironía a quien diga algo que suene a excusa.'
];
const CIVIL_DEF = [
  'Consigue que dos personas se pongan de acuerdo en algo.',
  'Pregunta a alguien por qué ha dicho lo que ha dicho.',
  'Pide que cada uno diga una palabra relacionada y fíjate en quién duda.',
  'Resume en voz alta lo que se ha dicho hasta ahora.',
  'Propón un orden de turnos y consigue que se respete.',
  'Elige a un jugador y hazle tres preguntas seguidas.',
  'Haz que alguien repita lo que ha dicho para ver si lo cuenta igual.',
  'Defiende a alguien a quien nadie esté defendiendo (aunque no estés seguro).',
  'Organiza una ronda rápida: cada uno dice una palabra relacionada y tú señalas la más rara.',
  'Premia con un aplauso al jugador que te parezca más convincente.',
  'Pide a alguien que se justifique con un ejemplo concreto.',
  'Haz una pregunta absurda para ver quién se ríe o se pone nervioso.',
  'Propón un «turno de defensa»: cada acusado tiene 10 segundos para hablar.',
  'Cuenta algo cierto y corto sobre ti para dar confianza y observa las reacciones.'
];
// Listas en uso: las de serie o las personalizadas (editor de palabras, JSON). Se guardan en el JSON de la lista en el bloque «misiones».
const CLAVES = ['palabras', 'acciones', 'impostor', 'civil', 'picante'];
const DEF = { palabras: PALABRAS_DEF, acciones: ACCIONES_DEF, impostor: IMPOSTOR_DEF, civil: CIVIL_DEF, picante: PICANTE_DEF };
const clonar = o => { const r = {}; CLAVES.forEach(k => { r[k] = o[k].slice(); }); return r; };
let cur = clonar(DEF);
const limpiar = l => [...new Set((Array.isArray(l) ? l : []).map(x => String(x).trim().slice(0, 160)).filter(Boolean))].slice(0, 200);
function get() { return clonar(cur); }
// o = { palabras, acciones, impostor, civil } (las que falten se quedan como las de serie) o null para volver a las de serie.
function set(o) {
  if (!o || typeof o !== 'object') { cur = clonar(DEF); return; }
  const n = {}; CLAVES.forEach(k => { n[k] = Array.isArray(o[k]) ? limpiar(o[k]) : DEF[k].slice(); }); cur = n;
}
const personalizadas = () => JSON.stringify(cur) !== JSON.stringify(DEF);
const serie = k => DEF[k].slice();
const contar = () => CLAVES.reduce((a, k) => a + cur[k].length, 0);
// rol: 'impostor' | 'civil' | 'traidor'; bandos: no hay impostores ni civiles, solo misiones neutras.
function pool(rol, bandos, picante) {
  const base = cur.palabras.concat(cur.acciones, picante ? cur.picante : []);
  if (bandos) return base;
  return base.concat(rol === 'civil' ? cur.civil : cur.impostor);
}
// Reparte una misión a cada asiento. asientos: [{ id, rol }]; quien: 'todos' | 'civiles' | 'impostores'.
function repartir(asientos, quien, bandos, picante) {
  const usadas = new Set(), out = {};
  asientos.forEach(a => {
    const lado = a.rol === 'civil' ? 'civiles' : 'impostores';
    if (quien !== 'todos' && quien !== lado) return;
    const p = pool(a.rol, bandos, picante); if (!p.length) return;
    let libres = p.filter(t => !usadas.has(t));
    if (!libres.length) { usadas.clear(); libres = p.slice(); }
    const t = libres[Math.floor(Math.random() * libres.length)];
    usadas.add(t); out[a.id] = t;
  });
  return out;
}
return { repartir, get, set, personalizadas, serie, contar, CLAVES, limpiar };
})();
