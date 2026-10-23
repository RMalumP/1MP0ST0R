# 1MP0ST0R — El Impostor (local + online)

Juego del impostor para móvil. Dos formas de jugar:

- **Modo local**: un solo móvil que se pasa de mano en mano. Funciona abriendo `index.html` con doble clic.
- **Modo online**: cada jugador entra desde su móvil con el nombre de la sala y la contraseña. Solo funciona desde una página `https` (GitHub Pages).

Sin npm, sin bundler, sin backend propio. Todo el interfaz y los mensajes están en español.

## Estructura

```
index.html                  Interfaz + lista de palabras de serie (bloque <script id="palabras-json">)
css/styles.css              Estilos
js/script.js                Lógica del juego (modo local), lista de palabras, Guardar/Cargar JSON, imágenes de Wikipedia
js/editor.js             Editor de palabras (renombrar, editar palabra y descripción, imágenes, mover, deshacer, guardado en el navegador)
js/online.js                Modo online: sala, lobby, reparto de roles, eliminaciones, cronómetro, expulsar jugadores
js/transport.js             Fachada de transporte: elige Firebase o PeerJS automáticamente
js/transport-firebase.js    Transporte principal (Firebase Realtime Database + Auth anónima). Aquí va firebaseConfig
sw.js, manifest.webmanifest, icons/  App instalable (PWA) y modo local sin conexión
js/misiones.js, js/stats.js, js/compartir.js  Misiones secretas, estadísticas, lista por QR (js/qrcode.js MIT y js/jsqr.js Apache-2.0 se cargan solo al usarlos)
js/transport-peer.js        Transporte de respaldo (PeerJS/WebRTC). Aquí va TURN_PROXY_URL
firebase/database.rules.json  Reglas de seguridad de Realtime Database (se pegan en la consola de Firebase)
cloudflare/worker.js        Worker de Cloudflare que reparte las credenciales TURN sin ponerlas en el repo
docs/GUIA.md                Guía paso a paso de toda la configuración (para no programadores)
docs/PRUEBAS.md             Lista de pruebas con 2–3 móviles + limitaciones conocidas
docs/prompt-original.md     Prompt original del proyecto y resumen de lo hecho en cada fase
```

## Puesta en marcha en 6 pasos

Detalle completo en [`docs/GUIA.md`](docs/GUIA.md).

1. Crear el proyecto de Firebase y copiar `firebaseConfig` → pegarlo en `js/transport-firebase.js`.
2. Publicar `firebase/database.rules.json` en Realtime Database → Reglas.
3. Autorizar el dominio `rmalump.github.io` en Firebase → Authentication → Settings.
4. (Respaldo PeerJS) Cuenta gratuita de Metered + Worker de Cloudflare con `cloudflare/worker.js`.
5. Pegar la URL del Worker en `TURN_PROXY_URL` de `js/transport-peer.js`.
6. Activar GitHub Pages (rama `main`, carpeta `/ (root)`) y probar con 2–3 móviles.

Sin los pasos 4–5 el juego funciona igualmente con Firebase; sin 1–3 solo funcionará el respaldo PeerJS (solo STUN) y el modo local.

## Cómo cambiar las palabras

Desde el móvil: «Archivo de palabras» (un único editor: renombrar, editar palabra y descripción, imagen por palabra o categoría, mover entre categorías, quitar repetidas, ordenar, buscar y deshacer). Los cambios se guardan en el navegador de ese dispositivo.


Se editan en el bloque `palabras-json` de `index.html`. Cada categoría tiene `id`, `nombre`, `bloqueada` (desmarcada por defecto), `sinImagenes` y `palabras` (admiten descripción entre paréntesis: `"Mercurio (planeta)"`).
Opcional por categoría: `"imagen": "Archivo.jpg"` (imagen de Wikimedia Commons para todas las palabras) o `"imagenes": { "pizza": "Pizza.jpg" }` (por palabra; la clave va en minúsculas y sin acentos). Si existe, se usa siempre y no se busca en Wikipedia.
En pantalla, «Archivo de palabras» permite **Guardar** (descarga `palabras.json`) y **Cargar** una lista solo para ese dispositivo; en modo online solo cuenta la lista del anfitrión.

## Modo online en breve

- La sala se identifica por SHA-256(nombre + contraseña): no hay listado de salas y la contraseña nunca se guarda ni se envía.
- El anfitrión reparte los roles; cada móvil recibe solo su tarjeta ya resuelta.
- Un móvil puede servir para **dos jugadores** (el anfitrión pulsa «👥 +1»); ese móvil alterna las tarjetas con un botón «Pasar». El anfitrión también puede cambiar nombres (✏️).
- **Relevo de anfitrión** (Firebase): si el anfitrión desaparece, pasa automáticamente al siguiente jugador de la lista. El anfitrión aguanta 10 minutos en segundo plano (pantalla bloqueada) antes del relevo; los jugadores sin conexión del lobby se quitan solos a los 10 minutos.
- **Votación integrada** (opcional), **palabras propuestas** por los jugadores, **resumen final** para todos, hasta 2 invitados por móvil y orden de jugadores editable.
- **Ronda rápida**, **historial de rondas** y **pista** con tres niveles (categoría, inicial y letras, descripción).
- **Escondite configurable**: los impostores pueden conocer o no la palabra de la gente, y su palabra común puede ser de la misma categoría o de otra.
- **Más modalidades** (todas opcionales): modo **Bandos**, **Traidor**, **Misiones secretas**, **Pista escalonada**, **Modo rápido**, Alcalde **sin repetir** con desempate por voto de gracia, **estadísticas** y **lista de palabras por QR** (con lector de cámara).
- **Compartir sala** con un enlace o **código QR**; **sonidos** (se pueden apagar en Opciones); app **instalable** y modo local **sin conexión**.
- El anfitrión puede **expulsar** a un jugador desde el panel de la sala (en el lobby).
- Si Firebase no responde en ~5 s, el anfitrión crea la sala por PeerJS (su móvil hace de servidor: no debe cerrar ni recargar la pestaña).
