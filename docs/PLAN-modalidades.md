# Plan: nuevas modalidades y opciones (rama `modalidades`)

Todas las opciones nuevas se activan desde los ajustes del anfitrión (o de la partida local) y están **apagadas por defecto**, salvo cuando se indica.

| Fase | Contenido | Notas |
|---|---|---|
| 1 | Alcalde **sin repetición** (opción), **desempate de votación** (voto de gracia del Alcalde; sin Alcalde, segunda vuelta), **limpieza de salas vacías**, **estadísticas simples** | Reglas de Firebase: sin cambios en esta fase |
| 2 | **Traidor** (opción en todos los modos): un civil secreto que cuenta para el bando de los impostores | Reglas: `roles/$uid/tr`, `popup/role = traidor` |
| 3 | **Misiones / sabotaje** (opción): cada jugador recibe una misión secreta (palabras y acciones; para civiles e impostores) | Lista amplia en `js/misiones.js` |
| 4 | **Pista escalonada** (opción, online): la pista del impostor se amplía con el tiempo | Solo online (en local las tarjetas se miran una vez) |
| 5 | **Bandos** (modalidad nueva): dos bandos con palabras parecidas de la misma categoría | Cuidado con las palabras: emparejado por parecido (descripción y nombre) |
| 6 | **Modo rápido** (opción): cronómetro, votación y siguiente ronda automáticos | |
| 7 | **Lista compartida por QR** + **lector de QR** con la cámara (y por enlace) | Librería `jsQR` (MIT), carga bajo demanda |
| 8 | Pruebas, documentación y empaquetado | |

No se hace: modo equipos, dificultad por categorías (se explica aparte), mejoras de experiencia de juego, resto de contenido.
