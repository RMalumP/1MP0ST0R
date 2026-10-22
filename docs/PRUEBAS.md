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
- Las reglas de Firebase se probaron con un evaluador propio, no con el motor real: verifica con el Simulador de reglas (GUIA, paso 2).
- Todo lo online se probó contra Firebase y PeerJS simulados, no contra los servicios reales.
