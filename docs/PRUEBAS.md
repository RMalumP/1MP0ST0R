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
7e. **Relevo de anfitrión (solo Firebase)**: cierra la pestaña del anfitrión; tras ~1 min sin conexión y 25 s más, los demás ven «Ser el nuevo anfitrión». Quien lo pulsa recupera los roles y sigue la partida. En PeerJS no existe: sin anfitrión no hay sala.
7f. **Jugadores fantasma**: quien lleva 3 min sin conexión en el lobby se quita solo (el anfitrión ve un aviso).
7g. **Votación integrada** (opción en Opciones, solo anfitrión online): «Iniciar votación», cada móvil vota (un voto por jugador, también por cada invitado), se cierra sola cuando votan todos o el anfitrión la cierra; el anfitrión confirma «Eliminar al más votado» (empate: nadie).
7h. **Varios invitados y orden**: hasta 2 invitados por móvil; ▲▼ reordenan a todos.
7i. **Palabras propuestas**: un jugador envía una palabra en el lobby; el anfitrión la añade (categoría «Propuestas») o la descarta.
7j. **Resumen final**: al ganar un bando, todos los móviles ven la tabla de roles y palabras.
7k. **Compartir sala**: «📨 Compartir sala» envía un enlace; al abrirlo se rellenan nombre y contraseña.
7l. **Instalar y sin conexión**: en Chrome/Android aparece «Instalar la app»; en iPhone, Compartir → Añadir a pantalla de inicio. Instalada (o ya visitada) el modo local funciona sin internet.
8. **Eliminar / resultados**: «Ver rol» y resultados solo en el anfitrión; el aviso de eliminado sale en todos; la victoria se calcula bien.
9. **Cronómetro**: lo controla el anfitrión; todos lo ven.
10. **Recargar y reconectar**: recarga B en plena partida → vuelve a la sala y recupera su rol. Recarga también el anfitrión.
11. **Nueva ronda** sin recrear la sala.
12. **Expulsar**: en el lobby, el anfitrión pulsa «Expulsar» en un jugador → ese móvil sale con aviso y desaparece de la lista.
13. **Sala vacía**: salen todos, espera >5 min: otra persona puede crear una sala con el mismo nombre y contraseña.
14. **Forzar PeerJS**: bloquea Firebase (p. ej. en el navegador, DevTools → Network → bloquear `firebaseio.com` y `googleapis.com`, o deja `PEGA_AQUI` en una copia) y crea sala: debe usar «🔗 PeerJS (respaldo)» y avisar de por qué. Comprueba en Network que se pide el TURN al Worker solo en este caso.
15. **Imágenes**: activa imágenes y prueba palabras con paréntesis («Mercurio (planeta)»), países (bandera), una palabra rara (sin imagen: la tarjeta queda igual, sin hueco). Cambia `IMG_DEBUG` a `true` en `js/script.js` para ver en consola la consulta, la página elegida y el motivo del fallo.

## Limitaciones conocidas (dichas con honestidad)

- **Fuerza bruta**: el ID de sala es SHA-256(nombre + contraseña). Con nombres y contraseñas débiles puede adivinarse. Usa contraseñas largas.
- **PeerJS**: el móvil del anfitrión conoce todos los roles y es el servidor; si cierra la pestaña o se bloquea la pantalla, la sala se pierde (si recarga, se recupera en ~20 s). Depende del servidor público de PeerJS, de los STUN de Google/Cloudflare y del TURN de Metered.
- **TURN visible**: las credenciales TURN se ven en las herramientas de red de cada jugador aunque no estén en el repo; alguien que falsee la cabecera `Origin` fuera de un navegador podría pedirlas. Conviene un límite de peticiones en Cloudflare.
- **Historial de impostores** (`_impostorHistory`): vive en la memoria del anfitrión; se pierde si recarga.
- Si el anfitrión recarga mientras el Alcalde escribe, la ronda vuelve al lobby.
- Si un jugador borra los datos del navegador, pierde su identidad en la sala.
- Un jugador que cierra la pestaña sin pulsar «Salir» sigue en la lista como «sin conexión» y entra en el reparto; el anfitrión puede **expulsarlo** desde el lobby.
- Un jugador expulsado puede volver a entrar si conoce nombre y contraseña (mientras la partida esté en el lobby).
- Las reglas de Firebase se probaron con el emulador oficial de Realtime Database (28 comprobaciones: nadie lista salas, cada jugador solo lee su rol, solo el anfitrión escribe estado y roles, expulsar y relevo de anfitrión). Aun así, comprueba con el Simulador de reglas de la consola.
- Todo lo online se probó contra Firebase y PeerJS simulados, no contra los servicios reales.
