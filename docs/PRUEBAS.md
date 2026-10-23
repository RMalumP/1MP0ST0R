# Pruebas con 2–3 móviles y limitaciones

Usa al menos un móvil con **datos móviles** y otro con wifi. Online solo funciona desde `https` (GitHub Pages), no con doble clic.

## Lista de pruebas

1. **Local (`file://`)**: abre `index.html` con doble clic; la lista de serie carga, el modo local funciona y «Jugar online» no rompe nada.
2. **Editar la lista**: cambia una palabra en el bloque `palabras-json` de `index.html`, súbela y comprueba que aparece.
3. **Guardar / Cargar**: Archivo de palabras → Guardar (descarga `palabras.json`); cárgalo; prueba un JSON mal formado (mensaje de error en español, la lista no cambia) y uno con palabras repetidas (aviso, sin duplicar). «Restaurar lista de serie» vuelve a la original.
4. **Crear sala** en el móvil A; la pantalla muestra el transporte (🔥 Firebase).
5. **Contraseña incorrecta** en el móvil B → «Sala no encontrada o contraseña incorrecta».
6. **Unirse** B y C: aparecen en el lobby de todos. Nombre repetido → rechazo.
7. **Repartir roles**: cada móvil ve solo su tarjeta. Prueba los modos **Normal**, **Múltiple** (8+ jugadores), **Escondite** y **Alcalde** (y Alcalde + Escondite: el primer impostor escribe la clave y le llega a sus aliados).
7b. **Espera inicial**: tras repartir, cada móvil ve su tarjeta y un botón «Comenzar»; el anfitrión tiene además «Comenzar para todos». Cuando todos los conectados pulsan (o el anfitrión fuerza), aparece la pantalla de partida y los roles siguen visibles tocando la tarjeta.
7c. **Alcalde**: en modo Normal/Escondite, si el Alcalde escribe varias palabras se elige UNA al azar (con su pista); los grupos solo existen en Múltiple. Online: el anfitrión elige «Aleatorio» o «Siempre el anfitrión» (en ese caso nunca es impostor).
7d. **Móvil compartido**: en el lobby, el anfitrión pulsa «👥 +1» junto a un jugador y escribe el nombre del segundo; ese móvil muestra la tarjeta oculta con el nombre y un botón «Pasar el móvil a …». ✏️ cambia nombres; «Quitar» elimina al invitado. Máx. 1 invitado por móvil.
7e. **Relevo de anfitrión (solo Firebase)**: cierra la pestaña del anfitrión; el anfitrión puede pasar hasta 10 minutos con la pantalla bloqueada o la pestaña en segundo plano sin perder la sala. Si lleva más de 10 minutos sin conexión, pasa solo al siguiente jugador conectado de la lista (a los 2 minutos más aparece el botón manual); recupera los roles y sigue la partida. En PeerJS no existe: sin anfitrión no hay sala.
7f. **Jugadores fantasma**: quien lleva 10 min sin conexión en el lobby se quita solo (el anfitrión ve un aviso).
7g. **Votación integrada** (opción en Opciones, solo anfitrión online): «Iniciar votación», cada móvil vota (un voto por jugador, también por cada invitado), se cierra sola cuando votan todos o el anfitrión la cierra; el anfitrión confirma «Eliminar al más votado» (empate: nadie).
7h. **Varios invitados y orden**: hasta 2 invitados por móvil; ▲▼ reordenan a todos.
7i. **Palabras propuestas**: un jugador envía una palabra en el lobby; el anfitrión la añade (categoría «Propuestas») o la descarta.
7j. **Resumen final**: al ganar un bando, todos los móviles ven la tabla de roles y palabras.
7k. **Compartir sala**: «📨 Compartir sala» envía un enlace; al abrirlo se rellenan nombre y contraseña.
7p. **Segundo plano**: el botón «🔒 Seguir activo con la pantalla bloqueada» del panel del anfitrión (activado por defecto) reproduce un audio silencioso para que el móvil no congele la pestaña. Prueba: bloquea el móvil del anfitrión 5–10 min y comprueba que los demás siguen jugando y que al volver todo está al día. Es experimental (puede mostrar una notificación de reproducción, gasta algo de batería y en iPhone es menos fiable).
7l. **Instalar y sin conexión**: en Chrome/Android aparece «Instalar la app»; en iPhone, Compartir → Añadir a pantalla de inicio. Instalada (o ya visitada) el modo local funciona sin internet.
7m. **Escondite con Alcalde**: antes de ver su rol, TODOS los jugadores escriben una palabra (la del primer impostor es la clave secreta; las demás son señuelo), para que no se note quién es el impostor. En el modo normal de categorías no se pide nada.
7n. **Pista**: los civiles siempre ven la categoría; el impostor solo si Pista está activada, con tipo a elegir: Categoría, «Inicial y letras» o «Descripción» (la que va entre paréntesis en la lista).
7ñ. **Ronda rápida**: botón «🔁 Otra ronda (mismos ajustes)» del anfitrión; **Historial** de rondas visible para todos (lobby y partida); **QR** de la sala en el panel del anfitrión; aviso de que el anfitrión coordina la partida y botón «Mantener la pantalla encendida».
7o. **Errores**: los fallos de conexión muestran un mensaje corto y un botón «Ver detalles» con la causa técnica.
7q. **Editor de palabras** (pantalla «Archivo de palabras», que es el único editor): renombra una categoría, edita una palabra y su descripción, añade varias a la vez (las repetidas se omiten), mueve una a otra categoría, pon una imagen de Commons, ↶ Deshacer, busca; recarga la página y comprueba que tu lista sigue ahí; «Restaurar lista de serie» la descarta.
7r. **Escondite: opciones nuevas** (debajo de los modos, al elegir Escondite): «Los impostores… conocen la palabra de la gente / solo conocen la suya» y «Palabra común de los impostores (la clave): de otra categoría / de la misma categoría». Funcionan igual en local y online; con «Personalizada» la clave la escribe el primer impostor y la categoría no influye.
7s. **Modalidades nuevas (rama `modalidades`)** — todas son opciones apagadas por defecto:
   - **Alcalde**: «Aleatorio», «Sin repetir» (nadie repite hasta que todos han sido Alcalde; también en local) y, online, «Siempre el anfitrión». En un empate de votación decide el **voto de gracia del Alcalde**; sin Alcalde (o si votó a otro) hay una **segunda vuelta** entre los empatados.
   - **Traidor** (Opciones): un civil secreto que juega para los impostores (cuenta para el bando de los impostores en el empate de número). Necesita 3+ civiles; no aplica a Bandos.
   - **Misiones secretas** (Opciones): cada jugador (todos / solo civiles / solo impostores) recibe una misión con palabras y acciones (51 misiones; sin alcohol: se bebe agua).
   - **Editar misiones**: Palabras → pestaña «📋 Misiones»: editar, añadir y borrar misiones por grupos (palabras / acciones / solo impostores / solo civiles), restaurar las de serie y ↶ deshacer. Se guardan en el bloque `"misiones"` del JSON (Guardar/Cargar y la lista del navegador); en `index.html` también pueden ponerse en el bloque `palabras-json`. Online usa las del anfitrión.
   - **Pista escalonada** (online, con Pista): categoría → inicial y letras → descripción, un paso cada tercio del cronómetro (o 90 s sin cronómetro).
   - **Bandos**: dos bandos (A mayoría, B minoría) con palabras **parecidas de la misma categoría** (se puntúa el parecido por palabras en común del nombre y de la descripción). Nadie sabe de qué bando es. No se combina con Personalizada.
   - **Modo rápido** (Opciones, 45/60/90 s): el cronómetro arranca solo; online abre la votación al acabar el tiempo, la cierra a los 30 s, elimina al más votado, reinicia el tiempo y, si acaba la partida, empieza otra a los 12 s.
   - **Estadísticas** (Inicio → 📊): rondas, victorias por bando, veces como impostor/civil/traidor, rondas ganadas por ti; se guardan en el navegador.
   - **Lista por QR** (Palabras → «📱 Compartir QR» / «📷 Escanear QR»): comparte categorías por QR o enlace y las importa con la cámara (o con una foto del QR). Un QR admite unas ~200 palabras; más → comparte menos categorías.
   - **Salas abandonadas**: al volver a abrir el juego se borran las salas que creaste y dejaste abandonadas más de 10 minutos (no hay servidor que lo haga por nosotros).
8. **Eliminar / resultados**: «Ver rol» y resultados solo en el anfitrión; el aviso de eliminado sale en todos; la victoria se calcula bien.
9. **Cronómetro**: lo controla el anfitrión; todos lo ven.
10. **Recargar y reconectar**: recarga B en plena partida → vuelve a la sala y recupera su rol. Recarga también el anfitrión.
11. **Nueva ronda** sin recrear la sala.
12. **Expulsar**: en el lobby, el anfitrión pulsa «Expulsar» en un jugador → ese móvil sale con aviso y desaparece de la lista.
13. **Sala vacía**: salen todos, espera >10 min: otra persona puede crear una sala con el mismo nombre y contraseña.
14. **Forzar PeerJS**: bloquea Firebase (p. ej. en el navegador, DevTools → Network → bloquear `firebaseio.com` y `googleapis.com`, o deja `PEGA_AQUI` en una copia) y crea sala: debe usar «🔗 PeerJS (respaldo)» y avisar de por qué. Comprueba en Network que se pide el TURN al Worker solo en este caso.
15. **Imágenes** (ahora con título exacto en 7 idiomas, imágenes con licencia no libre de la Wikipedia y búsqueda de archivos en Commons; prueba «Sancho Panza»): activa imágenes y prueba palabras con paréntesis («Mercurio (planeta)»), países (bandera), una palabra rara (sin imagen: la tarjeta queda igual, sin hueco). Cambia `IMG_DEBUG` a `true` en `js/script.js` para ver en consola la consulta, la página elegida y el motivo del fallo.

## Limitaciones conocidas (dichas con honestidad)

- **Fuerza bruta**: el ID de sala es SHA-256(nombre + contraseña). Con nombres y contraseñas débiles puede adivinarse. Usa contraseñas largas.
- **PeerJS**: el móvil del anfitrión conoce todos los roles y es el servidor; si cierra la pestaña o se bloquea la pantalla, la sala se pierde (si recarga, se recupera en ~20 s). Depende del servidor público de PeerJS, de los STUN de Google/Cloudflare y del TURN de Metered.
- **TURN visible**: las credenciales TURN se ven en las herramientas de red de cada jugador aunque no estén en el repo; alguien que falsee la cabecera `Origin` fuera de un navegador podría pedirlas. Conviene un límite de peticiones en Cloudflare.
- **Historial de impostores** (`_impostorHistory`): vive en la memoria del anfitrión; se pierde si recarga.
- Si el anfitrión recarga mientras el Alcalde escribe, la ronda vuelve al lobby.
- Si un jugador borra los datos del navegador, pierde su identidad en la sala.
- Un jugador que cierra la pestaña sin pulsar «Salir» sigue en la lista como «sin conexión» (en el lobby se quita solo a los 10 min) y entra en el reparto; el anfitrión puede **expulsarlo** desde el lobby.
- Un jugador expulsado puede volver a entrar si conoce nombre y contraseña (mientras la partida esté en el lobby).
- Las reglas de Firebase se probaron con el emulador oficial de Realtime Database (28 comprobaciones: nadie lista salas, cada jugador solo lee su rol, solo el anfitrión escribe estado y roles, expulsar y relevo de anfitrión). Aun así, comprueba con el Simulador de reglas de la consola.
- Todo lo online se probó contra Firebase y PeerJS simulados, no contra los servicios reales.
