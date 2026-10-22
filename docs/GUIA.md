# Guía paso a paso de la configuración

Pensada para hacerlo todo desde el navegador, sin terminal. Cuenta unos 30–40 minutos la primera vez. Los pasos 4 y 5 (respaldo PeerJS) son opcionales pero recomendables.

URL de tu juego: `https://rmalump.github.io/NOMBRE-DEL-REPOSITORIO/` · Dominio para Firebase y para el Worker: `rmalump.github.io` (solo el dominio, sin la ruta).

## 1. Firebase: proyecto, base de datos, autenticación y `firebaseConfig`

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google → **Crear un proyecto** (o «Add project»).
2. Nombre del proyecto: el que quieras (p. ej. `impostor`). Pulsa **Continuar**.
3. Cuando pregunte por **Google Analytics**, desactívalo (interruptor a la izquierda) y pulsa **Crear proyecto**. Espera y pulsa **Continuar**.
4. Menú izquierdo → **Compilación (Build)** → **Realtime Database** → **Crear base de datos**.
5. Elige la ubicación más cercana (p. ej. `europe-west1`) → **Siguiente**.
6. Elige **Iniciar en modo bloqueado** → **Habilitar**. (No uses el «modo de prueba»: caduca a los 30 días.)
7. Apunta la URL que aparece arriba de la base de datos (`https://….firebasedatabase.app`): es tu `databaseURL`.
8. Menú izquierdo → **Compilación** → **Authentication** → **Comenzar** → pestaña **Sign-in method** → **Anónimo** → activa el interruptor → **Guardar**.
9. Rueda dentada ⚙️ (arriba a la izquierda) → **Configuración del proyecto** → baja a **Tus apps** → icono **`</>` (Web)**.
10. Ponle un apodo (p. ej. `impostor-web`), **no** marques «Firebase Hosting» → **Registrar app**.
11. Aparecerá un bloque `const firebaseConfig = { apiKey: "…", authDomain: "…", databaseURL: "…", projectId: "…", appId: "…" }`. Cópialo. Si falta `databaseURL`, añade el del paso 7.

> La `apiKey` de Firebase para web **no es un secreto**: las reglas del paso 2 son lo que protege los datos.

## 2. Firebase: publicar las reglas

1. **Realtime Database** → pestaña **Reglas**.
2. Borra todo lo que hay, pega el contenido de `firebase/database.rules.json` y pulsa **Publicar**.
3. (Recomendado) Pestaña **Reglas → Simulador de reglas**: comprueba que un usuario autenticado **no puede leer** `rooms/<id>/roles/OTRO-UID` y que **no puede escribir** `rooms/<id>/state` si no es el anfitrión.

Qué protege cada bloque de reglas:

| Regla | Qué garantiza |
|---|---|
| `.read/.write: false` en la raíz y `rooms/.read: false` | No se puede leer `rooms` en bloque: no hay listado de salas. |
| `$roomId` validado con `^[0-9a-f]{64}$` | Solo existen salas con ID SHA-256 (nombre + contraseña). |
| `meta` | Solo el anfitrión crea/modifica la sala; una sala abandonada más de 5 min puede ocuparse de nuevo. |
| `players/$uid` | Cada jugador escribe solo su ficha; el anfitrión solo puede **borrar** fichas (expulsar). No se entra con la partida empezada. |
| `state` | Solo el anfitrión escribe el estado público de la partida. |
| `roles/$uid` | Solo el anfitrión escribe los roles; cada jugador **solo lee el suyo**. |
| `inbox` | Los jugadores solo pueden dejar mensajes propios (clave del Escondite, palabras del Alcalde); solo el anfitrión los lee. |
| `beat`, `probe` | Latido de presencia y prueba de escritura para elegir transporte. |

## 3. Firebase: dominio autorizado

1. **Authentication** → pestaña **Settings (Configuración)** → **Dominios autorizados** → **Añadir dominio**.
2. Escribe `rmalump.github.io` (sin `https://` ni ruta) → **Añadir**.

## 4. Metered (Open Relay): credencial TURN

1. Entra en <https://www.metered.ca/tools/openrelay/> → **Sign up** (cuenta gratuita).
2. En el panel, crea una **app**; su nombre forma tu dirección `NOMBRE.metered.live`. Apunta ese `NOMBRE`: es `METERED_APP`.
3. Menú **TURN Server** → **Credentials** (o **Developers → API key**) → copia la **API Key**: es `METERED_API_KEY`.
4. Prueba en el navegador `https://NOMBRE.metered.live/api/v1/turn/credentials?apiKey=TU_CLAVE`: debe mostrar una lista JSON de servidores. **No compartas esa dirección.**

## 5. Cloudflare Workers: el proxy de las credenciales

1. <https://dash.cloudflare.com/sign-up> → crea una cuenta gratuita (sin tarjeta).
2. Menú **Workers & Pages** → **Create** → **Create Worker** → nombre (p. ej. `impostor-turn`) → **Deploy**.
3. **Edit code**: borra el contenido, pega `cloudflare/worker.js` entero → **Deploy**.
4. Vuelve al Worker → **Settings** → **Variables and Secrets** → **Add**:
   - Tipo **Secret**, nombre `METERED_API_KEY`, valor tu API key.
   - Tipo **Text**, nombre `METERED_APP`, valor `NOMBRE` (solo la parte antes de `.metered.live`).
   - (Opcional) Tipo **Text**, nombre `ALLOWED_ORIGIN`, valor `https://rmalump.github.io`. Si no existe, se usa ese mismo valor.
5. **Deploy** de nuevo para aplicar las variables.
6. Copia la URL del Worker (`https://impostor-turn.TU-USUARIO.workers.dev`).
7. **Probar**: abre `https://…workers.dev/estado` → debe mostrar `{"ok":true,"configurado":{"METERED_API_KEY":true,"METERED_APP":true},…}`. Abrir la URL principal directamente da **403**: es lo correcto (solo responde a la web permitida).
8. (Recomendado) Cloudflare → tu Worker → **Security / Rate limiting** o una regla de límite de peticiones, para que nadie pueda gastar tu cuota desde fuera de un navegador.

## 6. Pegar la configuración en el código

- `js/transport-firebase.js`, líneas ~6–12: sustituye cada `"PEGA_AQUI"` por el valor de tu `firebaseConfig`.
- `js/transport-peer.js`, línea ~7: `const TURN_PROXY_URL = "https://…workers.dev";` (la URL del paso 5.6).

Edítalos en GitHub: abre el archivo → lápiz ✏️ → pega → **Commit changes**.

## 7. GitHub Pages

1. Sube los archivos **respetando carpetas** (`css/`, `js/`, `firebase/`, `cloudflare/`, `docs/`) a la raíz del repositorio: **Add file → Upload files** o edita con el lápiz ✏️ → **Commit changes**.
2. **Settings → Pages** → *Build and deployment* → **Source: Deploy from a branch** → rama `main`, carpeta **`/ (root)`** → **Save**.
3. Espera 1–3 minutos y abre `https://rmalump.github.io/NOMBRE-DEL-REPOSITORIO/`. Si ves una versión vieja, recarga forzando (Ctrl+F5 / en el móvil, abre en pestaña privada).

## 8. Primera prueba y errores típicos

Sigue [`PRUEBAS.md`](PRUEBAS.md). Errores habituales:

| Mensaje / síntoma | Causa y solución |
|---|---|
| `auth/unauthorized-domain` / «dominio no autorizado» | Falta el paso 3 (`rmalump.github.io` en dominios autorizados). |
| `permission denied` / «rechazado por las reglas» | No publicaste las reglas (paso 2) o están desactualizadas: vuelve a publicar `database.rules.json`. |
| «La autenticación anónima no está activada» | Paso 1.8. |
| «Falta configurar Firebase» | Quedan `PEGA_AQUI` en `transport-firebase.js`. El juego usa el respaldo PeerJS y te avisa. |
| Error de CORS en consola al pedir TURN | El Worker solo acepta `https://rmalump.github.io` exacto (sin `/` final ni ruta). Revisa `ALLOWED_ORIGIN`. |
| «No se pudieron obtener las credenciales TURN» | `TURN_PROXY_URL` sin pegar, Worker sin variables (`/estado` lo dice) o API key mala. Funciona solo con STUN; algunas redes 4G/5G fallarán. |
| La página no cambia tras subir cambios | Caché: espera 2–3 min y recarga forzando. |
| «Sala no encontrada o contraseña incorrecta» | Nombre/contraseña distintos (se distingue la contraseña, no mayúsculas del nombre) o la sala lleva >5 min vacía. |

## 9. Mantenimiento

- Las reglas en modo bloqueado **no caducan**. El «modo de prueba» sí (por eso no se usa).
- Si regeneras la API key de Metered: Cloudflare → Worker → **Settings → Variables and Secrets** → edita `METERED_API_KEY` → **Deploy**. No hay que tocar el repositorio.
- Si cambias el nombre de la app de Metered: edita `METERED_APP` igual.
- Si cambias la URL del Worker: actualiza `TURN_PROXY_URL`.
