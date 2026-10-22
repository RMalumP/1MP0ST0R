# Prompt: modo multijugador online para mi juego del impostor

> Instrucciones de uso: pega este texto en un chat nuevo de Claude y adjunta los archivos del juego (la carpeta del repo, o al menos `index.html`, `js/script.js` y `css/styles.css`). No hace falta rellenar nada: la URL ya está incluida.

---

## Contexto

Tengo un juego tipo "el impostor" alojado en **GitHub Pages**: https://rmalump.github.io/1MP0ST0R/ (dominio para Firebase y CORS: `https://rmalump.github.io`). Ahora funciona con **un solo móvil que se pasa de mano en mano**.

Quiero añadir un **modo online multidispositivo**: cada jugador entra desde su propio móvil, **cada uno desde su red (datos móviles o wifi distinta)**, abriendo la URL de GitHub Pages. El modo actual de un solo móvil debe seguir funcionando tal cual, como **"modo local"**.

### Estructura actual del repo (verificada)

```
index.html          → marcado de la interfaz y, en el repo actual, la carpeta de scripts
css/styles.css      → estilos
js/script.js        → toda la lógica del juego
data/palabras.js    → lista de palabras de serie en el repo actual (se migrará a index.html)
favicon.svg
README.md
```

### Cómo funciona hoy (verificado en el código)

- **Modos de juego:** Normal, Palabras Múltiples (requiere 8+ jugadores), Escondite (dos palabras: la principal y una clave secreta) y Alcalde (define las palabras de la ronda, con voto de gracia en empate).
- **Pista:** opción que muestra la categoría al impostor. Cronómetro opcional y vibración (`navigator.vibrate`).
- **Palabras (repo actual):** `data/palabras.js` tiene una línea por categoría: `NOMBRE,palabra1,palabra2,...`. Un nombre que empieza por `_BLOCK_` es una categoría bloqueada por defecto. `_NOPNG_` en el nombre **desactiva la búsqueda de imágenes** para esa categoría (función `isNoPng`). Las palabras admiten descripciones entre paréntesis, como `Pizza (Italia)`, y comas dentro de paréntesis (`parseLine` lo tiene en cuenta).
- **Botones de la pantalla "Archivo de palabras":**
  - "Nueva categoría" añade una categoría con palabras separadas por comas.
  - **Guardar** (`saveHtml()`) descarga un `palabras.js` con la lista actual (en el repo actual).
  - **Cargar** (`inp-load-file`) acepta un `palabras.js` o un `.txt` con una categoría por línea. La lista cargada solo vive en ese dispositivo.
- **Aleatoriedad (no cambiar la lógica salvo que lo pida):**
  - `fisherYates()` para barajar.
  - `pickImpostors()` con el historial `_impostorHistory`, que reparte los impostores equitativamente por número de jugadores y evita repetir al impostor de la ronda anterior.
  - El historial **no se reinicia al volver al menú** (`btn-back-setup`, `btn-end-game`, `resetRound()`), solo al recargar la página.
  - El jugador que empieza la ronda se elige con `Math.floor(Math.random() * numPlayers) + 1`, sin memoria de la ronda anterior.
- **Imágenes:** `fetchWordImage()` consulta la API de Wikipedia para cada palabra, salvo en categorías `_NOPNG_`.

## Funcionalidad online requerida

1. **Crear sala:** el anfitrión escribe un nombre de sala y una contraseña. La sala **no es pública**: no aparece en ningún listado, solo entra quien conoce el nombre exacto y la contraseña.
2. **Unirse:** los demás escriben nombre de sala y contraseña. Contraseña incorrecta = rechazo con mensaje claro.
3. **Lobby en tiempo real:** todos ven quién está dentro. El anfitrión puede iniciar la partida.
4. **Reparto de roles:** al empezar, el anfitrión elige impostor(es), categoría y palabra con la lógica existente (`pickImpostors`, `fisherYates`, historial, `startingPlayer`). **Cada móvil recibe solo su propio rol/palabra.** Ningún jugador debe poder ver el de otro desde la interfaz ni desde las reglas de la base de datos.
5. **Reconexión:** si un jugador recarga la página o pierde conexión, debe poder volver a la sala y recuperar su rol.
6. **Nueva ronda** sin tener que recrear la sala.
7. **Modos Normal, Múltiple, Escondite y Alcalde** deben funcionar online con la misma lógica que en local. No cambies las mecánicas, solo adáptalas al reparto por red.
8. Mantener las reglas y el aspecto del juego tal como están. No cambies la lógica del modo local salvo lo estrictamente necesario.

## Arquitectura pedida: transporte con respaldo automático

El juego **no debe hablar directamente** con Firebase ni con PeerJS, sino con una **capa de transporte** con una interfaz común:

```
crearSala(nombre, password) -> Promise
unirse(nombre, password, nombreJugador) -> Promise
enviar(destino, mensaje)
alRecibir(callback)
alCambiarJugadores(callback)
salir()
```

Debajo, dos implementaciones intercambiables, en archivos nuevos dentro de `js/` (por ejemplo `js/transport-firebase.js`, `js/transport-peer.js` y `js/transport.js`).

### Transporte 1 (principal): Firebase Realtime Database + Auth anónima

- SDK cargado por **módulos ES desde `https://www.gstatic.com/firebasejs/10.12.2/...`** (sin npm, sin build).
- Login con `signInAnonymously`.
- ID de sala derivado de un **hash (SHA-256 vía `crypto.subtle`) de nombre + contraseña**, de modo que la contraseña nunca se guarda en claro y las salas no se pueden listar.
- Estructura sugerida: `rooms/{roomId}/meta`, `rooms/{roomId}/players/{uid}`, `rooms/{roomId}/roles/{uid}`, `rooms/{roomId}/state`.
- **Reglas de seguridad de Realtime Database** (entregármelas listas para pegar y publicar) que garanticen:
  - No se puede leer `rooms` en bloque (sin listado de salas).
  - Solo el anfitrión puede escribir los roles y cambiar el estado de la partida.
  - Cada jugador solo puede leer **su propio** `roles/{uid}`.
  - Cada jugador solo puede escribir su propia entrada en `players/{uid}`.
  - Validación básica de tipos y longitudes.
- Estas reglas **no caducan** (no usar "modo de prueba").

### Transporte 2 (respaldo): PeerJS (WebRTC peer-to-peer)

- PeerJS cargado por `<script>` desde CDN, con la versión fijada.
- El ID del peer del anfitrión es `miJuego-` + nombre de sala (o su hash).
- El anfitrión valida la contraseña, acepta o cierra la conexión, y actúa de "servidor": reparte los roles y envía a cada jugador solo lo suyo.
- Configurar **STUN y TURN (Open Relay de Metered, plan gratuito)** para redes 4G/5G con CGNAT.
- **La credencial TURN NO debe aparecer en el repositorio público.** Para ello, usar un **proxy en Cloudflare Workers (plan gratuito, sin tarjeta)**:
  - La API key de Metered y el nombre de la app de Metered viven como **secretos/variables del Worker**, nunca en el código del repo.
  - El Worker, al recibir una petición, llama a la API de Metered (`https://NOMBRE-APP.metered.live/api/v1/turn/credentials?apiKey=...`) y devuelve el array `iceServers` en JSON.
  - El Worker debe **restringir el origen (CORS)** para que solo responda a `https://rmalump.github.io`, y devolver error 403 al resto.
  - Opcional: cachear la respuesta unos minutos para no gastar peticiones.
  - El juego pide las credenciales al Worker **solo cuando necesita el respaldo** (no al cargar la página si Firebase funciona), y las pasa a `new Peer(id, { config: { iceServers } })`.
  - Si el Worker no responde, el juego sigue intentando con **solo STUN** y avisa de que algunas redes móviles podrían fallar.
  - La URL del Worker va en una constante visible al principio de `js/transport-peer.js`: `const TURN_PROXY_URL = "PEGA_AQUI_LA_URL_DEL_WORKER";`.

### Lógica de selección

- **Anfitrión:** intenta Firebase (login anónimo + escritura de prueba) con **timeout de ~5 s**. Si falla o se agota el tiempo, crea la sala por PeerJS.
- **Jugador que se une:** busca la sala en Firebase **y, en paralelo**, intenta conectar por PeerJS. Se queda con el que responda primero con éxito.
- **Todos los jugadores de una misma sala deben acabar en el mismo transporte.**
- Mostrar en la interfaz, discretamente, qué transporte se está usando (útil para depurar).
- Si ambos fallan, mensaje de error claro en español con posibles causas.

## Gestión de palabras: una sola fuente, dentro de index.html

Quiero que la lista de palabras viva en **un único sitio: `index.html`** (migrando desde `data/palabras.js`), para que solo haya que tocar un archivo. Así funciona igual abriendo el juego en local (`file://`) y en GitHub Pages, porque no hace falta `fetch()` ni archivos externos.

Cómo debe quedar:

1. **Lista de serie:** dentro de `index.html`, en un bloque JSON que el navegador no ejecuta, pero que el script puede leer:

```html
<script id="palabras-json" type="application/json">
{
  "version": 2,
  "categorias": [
    {
      "id": "COMIDAS_BEBIDAS",
      "nombre": "Comidas y bebidas",
      "bloqueada": false,
      "sinImagenes": false,
      "palabras": ["Pizza (Italia)", "Paella (España)"]
    }
  ]
}
</script>
```

   El código lo lee con `JSON.parse(document.getElementById('palabras-json').textContent)`. Así no hay `fetch()` ni archivo separado.
2. **Guardar:** descarga un `.json` con la lista actual (Blob + `<a download>`), en el mismo formato que el bloque. Funciona en local y online.
3. **Cargar:** abre el `<input type="file">` existente, lee el `.json` con `FileReader`, valida la estructura y sustituye la lista en uso para esa sesión (solo en ese dispositivo). Si el archivo está mal formado, mostrar un mensaje de error en español sin romper el juego. Si una palabra aparece repetida dentro de su categoría, avisar y no duplicarla. Eliminar la carga de `.txt` y de `palabras.js` antiguos, y el archivo `data/palabras.js` del repo.
4. **Opcional:** recordar la última lista cargada en `localStorage` (con `try/catch`), con una opción para restaurar la lista de serie.

**Cómo cambiar las palabras:** se editan en el bloque `palabras-json` de `index.html`, directamente en GitHub. Así el repo solo tiene un archivo con la lista. Guardar sirve para hacer una copia de seguridad o para pasar una lista a otro dispositivo.

Los campos `bloqueada` y `sinImagenes` sustituyen a los antiguos prefijos `_BLOCK_` y `_NOPNG_`, y las descripciones entre paréntesis se mantienen dentro de cada palabra. Revisa en el código que `bloqueada` deje la categoría desmarcada por defecto y que `sinImagenes` desactive la búsqueda de imágenes, igual que hoy.

**En el modo online, regla estricta: se utiliza ÚNICAMENTE la lista de palabras del anfitrión** (la predefinida o la que él haya cargado).
- Los demás jugadores **no tienen** selector de categorías, ni botones Cargar/Guardar, ni acceso a su propia lista mientras estén en una sala online. Su lista local se ignora por completo.
- El anfitrión elige categoría y palabra, y envía a cada jugador **solo lo que le corresponde ya resuelto** (rol y palabra, o solo la categoría si el modo "Pista" está activo). Nunca se envía la lista completa a los jugadores.
- Los ajustes de la partida (número de impostores, modo de juego, cronómetro, pista) también los decide solo el anfitrión; los demás los ven en modo lectura.
- Así nunca hay desajustes por versiones distintas de la lista o de la caché.

## Fase final: arreglar la búsqueda de imágenes de Wikipedia

Las imágenes de cada palabra fallan con frecuencia. Causas detectadas en el código actual (`js/script.js`, función `fetchWordImage`, `wikiSearch` y `IMG_BLOCK_PATTERNS`):

1. **Falsos positivos en la lista de bloqueo:** `IMG_BLOCK_PATTERNS` busca subcadenas sin límites de palabra. `"sex"` bloquea `Sexto Doctor`, `Sussex` y `Essex`. Hay que comparar palabras completas (con límites) y revisar la lista.
2. **Sin comprobar relevancia:** `wikiSearch` acepta la primera página de la búsqueda que tenga miniatura, aunque no tenga nada que ver con la palabra (el logo de un club, un mapa, un personaje homónimo). Hay que exigir que el título de la página coincida con la palabra limpia o con su contexto entre paréntesis.
3. **Demasiadas consultas y en serie:** para una palabra se prueban hasta 6 consultas en español y luego en inglés, una tras otra. Es lento y, cuando todo falla, la palabra queda marcada como "sin imagen" para toda la sesión (`_imgCache[...] = null`).
4. **Consultas genéricas con sufijos:** `palabra + " objeto"`, `+ " definición"`, `+ " ilustración"` traen páginas que no son la palabra.
5. **Fallo silencioso:** si la imagen falla al cargar (`onerror`), el hueco se borra sin avisar ni reintentar.

Requisitos para esta fase:

- **Coincidencia exacta primero:** intentar la página con el título exacto (`titles=`) de la palabra limpia en es.wikipedia.org y, si no existe, en en.wikipedia.org. Solo buscar (`generator=search`) si no hay coincidencia exacta, y aceptar el resultado solo si el título coincide con la palabra.
- **Menos peticiones:** máximo 2 o 3 consultas por palabra, en paralelo cuando sea posible, con timeout corto (por ejemplo 4 s).
- **Lista de bloqueo con palabras completas** (regex con `\b`) y revisada, para no bloquear palabras normales.
- **Caché persistente opcional** en `localStorage` (con `try/catch`) para no repetir búsquedas entre partidas.
- **Imagen manual opcional:** permitir un campo `"imagen"` opcional por palabra o categoría en el bloque JSON de `index.html`, con el nombre de un archivo de Wikimedia Commons. Si existe, se usa siempre y no se busca.
- **Diagnóstico visible en desarrollo:** un registro en consola (`console.debug`) con la consulta, la página elegida y el motivo de fallo, desactivable con una constante.
- **Sin cambiar el aspecto:** si no hay imagen, la tarjeta sigue igual que hoy, sin hueco visible ni mensaje de error.

Entrega esta fase al final, después del modo online, como archivos completos de `js/script.js` (y `index.html` si cambia el bloque JSON) con una nota breve de qué ha cambiado.

## Requisitos técnicos

- **Sin npm, sin bundler, sin backend propio.** El juego debe funcionar al subir los archivos al repo y activar GitHub Pages. La única pieza externa propia es el Worker de Cloudflare (un solo archivo que pegaré desde el panel web de Cloudflare, sin instalar Wrangler ni usar terminal).
- **Estructura de archivos:** mantener `index.html`, `css/styles.css` y `js/script.js`. No debe haber `data/palabras.js` ni `data/palabras.json`: la lista vive solo en `index.html`. Los archivos nuevos de transporte van en `js/`. Indica claramente qué archivo es cada uno y cuáles cambian respecto a los actuales.
- **Mobile-first**: botones grandes, texto legible, que funcione bien en Chrome/Safari móvil. Mantener el diseño actual.
- **Evitar que la pantalla se bloquee** en el anfitrión si es posible (Wake Lock API, con fallback silencioso), y avisar de que el anfitrión no debe cerrar la pestaña en modo PeerJS.
- Toda la interfaz y los mensajes en **español**.
- La configuración de Firebase va en un objeto `firebaseConfig` bien visible al principio de `js/transport-firebase.js`, con marcadores `"PEGA_AQUI"`. Yo pegaré mis valores reales (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`).

## Qué quiero que me entregues

1. **Archivos completos y listos para pegar** en el repo (no fragmentos sueltos): los que cambian (`index.html` con el bloque de palabras, `js/script.js`, `css/styles.css` si hace falta) y los nuevos de transporte.
2. **Código completo del Worker de Cloudflare** (un único archivo, listo para pegar en el editor web de Cloudflare), con CORS restringido a `https://rmalump.github.io` y lectura de secretos desde variables de entorno.
3. **Reglas de Realtime Database** listas para publicar, con una breve explicación de qué protege cada una.
4. **Guía paso a paso de TODA la configuración**, escrita **una vez terminados los cambios de código**, pensada para alguien que no es programador y que lo hará todo desde el navegador. Numerada, sin saltarse pasos y indicando dónde hacer clic. Debe cubrir, en este orden:
   1. **Firebase:** crear el proyecto (sin Analytics), crear Realtime Database en **modo bloqueado**, activar **Authentication → Anónimo**, registrar la app web y copiar `firebaseConfig`.
   2. **Firebase:** pegar las reglas en **Realtime Database → Reglas** y publicar.
   3. **Firebase:** añadir `rmalump.github.io` (solo el dominio, sin la ruta `/1MP0ST0R/`) en **Authentication → Settings → Dominios autorizados**.
   4. **Metered (Open Relay):** crear cuenta gratuita, crear una app, generar la credencial TURN y localizar el nombre de la app y la API key.
   5. **Cloudflare Workers:** crear cuenta gratuita, crear un Worker, pegar el código, guardar la API key y el nombre de la app de Metered como **secretos/variables**, configurar el dominio permitido (CORS), desplegar y copiar la URL del Worker. Incluir cómo probar el Worker abriendo su URL.
   6. **Código del juego:** dónde pegar `firebaseConfig` (en `js/transport-firebase.js`) y `TURN_PROXY_URL` (en `js/transport-peer.js`), indicando la línea aproximada.
   7. **GitHub:** subir o editar los archivos desde la web del repo (Add file → Upload files, o lápiz ✏️ → Commit changes) y comprobar **Settings → Pages** (rama `main`, carpeta `/ (root)`). Indicar cuánto esperar hasta que se publique. Los archivos deben quedar en la raíz del repo, respetando las carpetas `css/` y `js/`. La carpeta `data/` debe desaparecer al migrar la lista.
   8. **Primera prueba** y **qué hacer si algo falla**: tabla corta de errores típicos y su causa (`auth/unauthorized-domain`, `permission denied`, error de CORS del Worker, fallo de TURN, página en caché antigua).
   9. **Mantenimiento:** qué caduca y qué no (reglas en modo bloqueado no caducan; qué hacer si hay que regenerar la API key de Metered y dónde cambiarla sin tocar el repo).
5. **Lista de pruebas** para verificar con dos o tres móviles (uno con datos móviles): crear sala, contraseña incorrecta, unirse, repartir roles, recargar y reconectar, cada modo de juego, cargar y guardar JSON, comprobar que la lista de serie carga en local (`file://`) y que se puede editar en el bloque de `index.html`, forzar el respaldo PeerJS (por ejemplo bloqueando Firebase) y comprobar que se piden credenciales al Worker.
6. **Limitaciones conocidas** y puntos débiles de seguridad, dichos con honestidad: un hash de nombre + contraseña débil puede adivinarse por fuerza bruta; en PeerJS el móvil del anfitrión técnicamente conoce todos los roles; las credenciales TURN siguen siendo visibles en las herramientas de red del navegador de cada jugador aunque no estén en el repo; y el historial de impostores (`_impostorHistory`) vive solo en la memoria del anfitrión, así que se pierde si recarga la página.

## Cómo quiero que trabajes

- **Antes de escribir código, lee `index.html` y `js/script.js` completos** y resúmeme en pocas líneas cómo funciona el juego ahora, para confirmar que lo has entendido bien.
- Si falta algún dato imprescindible, **hazme todas las preguntas juntas en un solo mensaje**; si no es crítico, asume lo razonable y dime qué has asumido.
- No cambies `pickImpostors` ni el reparto de impostores en modo local salvo que yo lo pida explícitamente.
- Si ves una forma más simple o robusta de cumplir un requisito, dímela brevemente, pero implementa lo que he pedido salvo que sea inviable.
- Entrega primero la versión que funciona con **solo Firebase** (con la lista de palabras en JSON dentro de `index.html` y el Guardar/Cargar nuevos), y después añade el respaldo PeerJS con el Worker de Cloudflare, para que pueda probarlo por fases.
- **La búsqueda de imágenes es la última fase**, después del modo online y del respaldo PeerJS.
- **Deja la guía paso a paso completa para el final**, cuando el código ya esté terminado, para que refleje exactamente los archivos y nombres de variables definitivos.


## Conversacion hasta el momento
He leído completos index.html (275 líneas) y js/script.js (1564 líneas). No he escrito código todavía. Aquí va el resumen, el plan y las preguntas.

Cómo funciona el juego hoy

Todo vive en un único script.js con un objeto global state. No hay framework: la interfaz se construye con document.createElement y innerHTML.

Setup: número de jugadores (mínimo 3, con nombres opcionales y orden editable), número de impostores, categorías (Todas / Personalizada / individuales), modo de juego, y opciones (pista, cronómetro, imágenes, vibración).
Reparto de roles: pickImpostors() reparte por historial en memoria por número de jugadores. pickBalancedWord() rota categorías y evita repetir palabra. Ambas funciones son puras respecto al estado y se pueden reutilizar tal cual en el host.
Turnos: cada jugador toca la carta para ver su rol. El estado de la carta se construye en buildRevealContent(), que depende de state.impostorSet, state.word, state.words y state.playerWordIdx.
Modo Personalizada (Alcalde): no es un modo independiente, sino un interruptor (customOn) que se combina con Normal, Múltiple o Escondite. Un jugador no impostor escribe las palabras en la pantalla screen-alcalde.
Partida: cronómetro local, lista de jugadores con “Ver rol” para cada uno (abre el rol de cualquiera), marcado de eliminados, comprobación de victoria y modal de resultados con todos los roles.
Archivo de palabras: crear, borrar, bloquear categorías y palabras, y Guardar/Cargar en formato palabras.js.
Imágenes: fetchWordImage() consulta Wikipedia con wikiSearch() y una cadena de consultas secuenciales.
Problemas que he visto en el código
“Ver rol” y “Ver resultados” revelan roles de todos. En online esto rompe el secreto. Hay que deshabilitarlos o restringirlos al anfitrión, o a la pantalla final de partida.
Escondite en Personalizada: el impostor que escribe la clave debe pasársela al resto de impostores. Online eso requiere un relevo a través del host.
Contradicción en el requisito de contraseña. Si el ID de sala es hash(nombre + contraseña), un error de contraseña produce “sala no encontrada”, no “contraseña incorrecta”. Si quieres el mensaje claro, la sala debe identificarse solo por el nombre y verificar un hash de la contraseña, pero entonces ese hash queda expuesto a fuerza bruta offline. Hay que elegir una de las dos.
Falsos positivos reales en la lista de bloqueo. He comprobado en data/palabras.js que hay palabras con “sex” en categorías legítimas (Sextans, Sussex, El sexto sentido). Confirma que la lista debe usar límites de palabra.
La búsqueda de imágenes es más lenta de lo que dice el prompt. wikiSearch prueba es.wikipedia y luego en.wikipedia dentro de cada consulta, así que hasta 6 consultas pueden acabar en 12 peticiones secuenciales.
Alcalde no es un modo. El prompt lo lista como modo, pero en el código es la opción “Personalizada”. Lo tomo como combinable con los demás modos.
Carga de .js en file://. Las importaciones ES desde gstatic deben cargarse solo cuando se entra en modo online, para que el modo local no las toque.
Plan propuesto por fases
Fase 0, cambios de base: mover la lista a index.html (bloque JSON), nuevos Guardar/Cargar en JSON, eliminar data/palabras.js y el <script> correspondiente. Esta fase no cambia la lógica del juego.
Fase 1, online con Firebase: capa de transporte (transport.js + transport-firebase.js), lobby, reparto host → jugadores con solo lo suyo, reconexión, nueva ronda, reglas de Realtime Database y restricciones de “Ver rol” y resultados.
Fase 2, respaldo PeerJS: transport-peer.js, Worker de Cloudflare con CORS restringido, selección de transporte con timeout de 5 s.
Fase 3, imágenes: coincidencia exacta de título, consultas paralelas con timeout, lista de bloqueo con límites de palabra, caché opcional, imagen manual opcional y diagnóstico en consola.
Al final: guía paso a paso y lista de pruebas.
Lo que necesito que decidas

Te pido todo en un solo mensaje, como indica tu prompt:

Contraseña: ¿aceptas que el error diga “sala no encontrada o contraseña incorrecta” (más simple y seguro), o prefieres el mensaje exacto con la verificación de hash en el servidor?
Escondite online con Alcalde: ¿el primer impostor escribe la clave en su móvil y el host la reenvía a los demás impostores?
Cronómetro online: ¿el host envía la hora de inicio y cada móvil cuenta localmente, o prefieres que el host controle el tiempo?
Resultados y “Ver rol” online: ¿solo el anfitrión los ve, o también cada jugador al terminar la partida?
Historial de impostores: ¿te basta con que se pierda al recargar la página del anfitrión, como indicaste?

Mientras esperas, guardé una nota del proyecto en memoria para que lo retomemos en otra sesión.

Building an online multiplayer version from the existing game script.

Releo las partes de script.js que voy a reutilizar (modal de rol, victoria, resultados, arranque y Alcalde) para copiar su comportamiento exacto.

Todo claro. Escribo online.js: la lógica de sala del anfitrión y de los jugadores, con tarjetas, Alcalde, clave de Escondite, eliminaciones, cronómetro y reconexión.

La fase 1 está hecha con Firebase solo, y el botón «Restaurar lista de serie» ya está en el Archivo de palabras. No lo he probado con Firebase real ni en móviles reales: sin red solo pude probarlo contra un Firebase simulado.

Pruebas

Online completo: 87 comprobaciones sin fallos, con host y varios jugadores, modos Normal, Múltiple (8 jugadores), Escondite y Alcalde, eliminaciones, victoria, cronómetro y recarga de página.
Modo local: 194 comprobaciones sin cambios.
Reglas de seguridad: 58 comprobaciones del transporte contra ellas.
Lo que garantizan:
Nadie puede leer el rol de otro jugador.
Los jugadores no pueden escribir en el estado de la sala.
Las salas no se pueden listar.
No se puede entrar a una partida empezada.
Dos fallos que las pruebas destaparon, ya corregidos:
Los primeros datos de la sala, incluido tu rol, se descartaban si llegaban antes de terminar de entrar.
El Alcalde podía volver a la pantalla de espera con la partida ya empezada.

Qué hace

Entrar: el botón «Jugar online» abre el menú para crear o unirse a una sala. Errores de contraseña: «Sala no encontrada o contraseña incorrecta».
Anfitrión: reutiliza la pantalla de ajustes de siempre, sin los controles de número de jugadores, que salen de la sala. Los demás ven esos ajustes en solo lectura.
Tarjetas: cada jugador recibe solo su tarjeta ya resuelta.
Escondite con Alcalde: el primer impostor escribe la clave y el anfitrión se la reenvía a sus aliados.
Eliminaciones (tus decisiones):
Aviso al eliminar: sale en todos los móviles hasta que se toque o el anfitrión pulse «Quitar aviso a todos».
«Ver rol» y resultados: solo los ve el anfitrión.
Cronómetro: lo controla el anfitrión.
Reconexión: si recargas, vuelves a la sala y recuperas tu rol.

Decisiones mías, dime si quieres otra

El anfitrión también juega.
Nombre de sala de al menos 3 caracteres y contraseña de al menos 4.
Máximo 20 jugadores.
Una sala abandonada más de 6 horas puede ocuparse de nuevo.
Las pantallas de resultados completos al acabar siguen siendo solo del anfitrión.
No guardé la lista cargada en el navegador, por lo que ya dije antes.

Dos avisos

Reglas sin validar en Firebase: las probé con mi evaluador, no con el motor real de Firebase. En el Simulador de reglas de la consola (pestaña Reglas), comprueba al menos que un jugador no puede leer rooms/.../roles/OTRO y que no puede escribir state.
Limitaciones conocidas:
Si el anfitrión recarga mientras el Alcalde escribe, la ronda vuelve al lobby.
Si un jugador borra los datos del navegador, pierde su identidad en la sala.
La búsqueda de imágenes de Wikipedia sigue sin arreglar (fase 3).

Para probarlo ya (la guía completa irá al final)

En Firebase, crea un proyecto y una Realtime Database.
Activa Authentication → Anónimo.
Añade tu dominio de GitHub Pages en Authentication → Configuración → Dominios autorizados.
Registra una app web y pega sus valores en firebaseConfig de transport-firebase.js, donde ahora pone PEGA_AQUI.
Pega database.rules.json en la pestaña Reglas y publícalo.
Sube los archivos a GitHub Pages y ábrelo en 2 o 3 móviles. Online no funciona abriendo el archivo con doble clic; el modo local sí.

¿Sigo con la fase 2 (respaldo PeerJS con TURN)?

1mp0st0r fase1
ZIP 
Database.rules
Código·JSON 
Transport firebase
JS 
Online
JS 
Transport
JS 
Script
JS 
Index
Código·HTML 
Styles
Código·CSS 

Sala abandonada por todos más de 5 minutos libre. Haz fase 2

Cambio la regla de sala libre y, antes de tocar nada, releo los requisitos exactos de tu prompt para la fase 2.

Continuar

Continúo con la fase 2. Primero la regla de «sala libre tras 5 minutos» (latido de presencia en la base de datos) y la prueba de escritura que usará la selección de transporte.

Dos fallos de mi harness, no del código: el reloj falso del servidor no coincidía con el reloj del cliente, y mi desconexión simulada mataba los oyentes de otro jugador. Los corrijo en la prueba.

Ahora la fachada transport.js con la lógica de selección: el anfitrión prueba Firebase (5 s) y cae a PeerJS; quien se une busca en Firebase y, en paralelo, por PeerJS, y gana el primero.

Continuar

Pasada completa de todas las pruebas y empaquetado.

La fase 2 está hecha: el respaldo PeerJS, el Worker de Cloudflare para TURN y la selección automática de transporte. Lo he probado contra un Firebase y un PeerJS simulados, no contra los servicios reales ni en móviles. Sin red no pude hacerlo de otra forma.

Qué hace ahora

Anfitrión: prueba Firebase (login anónimo y una escritura de prueba) con un límite de 5 s. Si falla, crea la sala por PeerJS y le dice por qué Firebase no sirvió: reglas sin publicar, dominio no autorizado o sin configurar.
Quien se une: busca en Firebase y, en paralelo, por PeerJS, y gana el primero que responde. Todos acaban en el mismo transporte que eligió el anfitrión.
Matiz sobre «en paralelo»: PeerJS arranca con 0,8 s de retraso respecto a Firebase. Así, si Firebase responde enseguida, no se piden credenciales TURN ni se gasta cuota del Worker.
PeerJS: el móvil del anfitrión hace de servidor: valida la contraseña, acepta o rechaza a cada jugador y envía a cada uno solo su rol.
Si ambos transportes fallan: el mensaje enumera causas posibles y el detalle técnico.
Sala libre (tu regla): una sala sin nadie conectado durante más de 5 minutos queda libre. Cada móvil conectado marca un latido cada minuto, y al desconectarse el último empieza la cuenta de 5 minutos. La regla del servidor lo aplica, y quien se une a una sala así recibe «no encontrada». En PeerJS el ID se libera al cerrarse la pestaña del anfitrión.
Aviso al anfitrión en PeerJS: el panel le recuerda que no cierre ni recargue la pestaña. Aun así, si recarga, la sala se recupera (guarda el estado en su móvil) y los jugadores se reconectan solos.

Pruebas

Resultado: más de 300 comprobaciones sin fallos.
Juego completo: pasó entero sobre Firebase (87 de 87) y sobre PeerJS (88 de 88), con Normal, Múltiple, Escondite, Alcalde, eliminaciones, cronómetro y recargas.
Seguridad en PeerJS:
Se probó que ni suplantando a otro jugador ni con una contraseña falsa se entra.
La contraseña no viaja por la red.
Los roles privados no llegan a nadie más.
Worker: 23 comprobaciones. Responde solo a https://rmalump.github.io (403 al resto) y nunca muestra tu clave.
Fallo encontrado por las pruebas: al seleccionar el transporte, un error definitivo de Firebase (como «nombre repetido») lanzaba PeerJS igualmente. Ya está corregido.

Qué debes hacer tú

Volver a publicar database.rules.json (ha cambiado: latido y prueba). Si no lo haces, Firebase fallará y el juego usará el respaldo sin que parezca un error.
Crear el Worker con cloudflare-worker.js. Necesita el secreto METERED_API_KEY y la variable METERED_APP (el nombre de tu app en Metered). Abre /estado en su URL para comprobar que está desplegado.
Pegar la URL del Worker en TURN_PROXY_URL de transport-peer.js. Si no lo haces, PeerJS funciona solo con STUN y avisa de que algunas redes móviles podrían fallar.

Limitaciones que conviene conocer

Salir sin pulsar «Salir»: un jugador que cierra la pestaña sin salir sigue en la lista como «sin conexión» y entra en el reparto. El anfitrión no puede expulsarlo. Es fácil de añadir si lo quieres.
PeerJS depende de tres servicios externos: el servidor de señalización público de PeerJS, los STUN de Google/Cloudflare y el TURN de Metered. Si los tres no están disponibles, el respaldo no conecta.
Una pestaña recargada no es un servidor 24 h: en PeerJS, si el anfitrión tarda más de unos 20 s en volver, la sala puede perder su ID.
Credenciales TURN visibles: alguien que falsee la cabecera Origin desde fuera de un navegador podría pedir las credenciales. Convendría poner un límite de peticiones en Cloudflare; lo detallo en la guía.
Sigue sin hacer: la búsqueda de imágenes de Wikipedia (fase 3).

¿Sigo con la fase 3 (imágenes) y luego la guía completa paso a paso?

1mp0st0r fase2
ZIP 
Cloudflare worker
JS 
Database.rules
Código·JSON 
Transport
JS 
Transport peer
JS 
Transport firebase
JS 
Online
JS 
Index
Código·HTML 
Styles
Código·CSS 

añade boton de eliminr jugador. planifica las fases que quedan en varias partes y sacame un md con el pront a segir en una nuevo chat, pero teniendo en cuenta todo lo que has hecho, queda y que sea lo mas optimo posible de tokens al leerlo todo
