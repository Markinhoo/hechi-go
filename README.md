# La Copa de las Casas UTD

Aplicación web independiente para usar cartas mágicas como juego de participación en clase.

## Funciones

- Login y registro con Supabase Auth.
- Clases por maestro y token por grupo.
- Registro de alumnos con nombre, contraseña y casa asignada.
- Autorización de participaciones por parte del maestro.
- Cartas aleatorias con efectos sobre alumnos y casas.
- Ranking por casas y alumnos.
- Mochila de cartas guardables.
- Historial de hechizos y puntajes en Supabase.

## Desarrollo local

```bash
npm install
npm run dev
```

Copia `.env.example` a `.env` y configura:

```text
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon_publica
```

## Supabase

La app usa el schema `hechi` de Supabase. No cambies ese nombre sin migrar también las funciones, tablas y políticas.

Aplica las migraciones en el SQL editor de Supabase o con Supabase CLI.

## Vercel

En Vercel agrega estas variables de entorno:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

El archivo `vercel.json` incluye el rewrite necesario para una app Vite/React.

## Comandos de verificación

```bash
npm run lint
npm run build
```


## Historial de puntos y deshacer

Aplica 20260924_z_score_audit_and_undo.sql después de
20260924_student_score_ledger_and_editor.sql. Registra cambios nuevos de alumnos
y casas, con autor, destinatario y desglose anterior/posterior. Los registros
anteriores permanecen en el historial de cartas; no se inventan saldos pasados.

El maestro puede deshacer el último ajuste manual o guardado de tabla únicamente
si no hubo cambios posteriores de puntaje. La reversión conserva ambos registros
y restaura los contadores; no modifica oportunidades, cartas ni galeones.
Las RPC que cambian puntos se instrumentan con contexto de auditoría. Si una
migración posterior reemplaza alguna de esas funciones, debe conservar la llamada
a iniciar_operacion_puntaje (o volver a aplicar la migración de auditoría).

## Protección de rachas

La selección usa el historial persistido de cada alumno. La distribución inicial
es 45/30/15/10 para común/especial/épica/legendaria. Cada común consecutiva transfiere
3 puntos porcentuales desde comunes: uno a cada categoría superior, hasta cinco
comunes. Después de tres aperturas sin épica/legendaria se agregan 2 puntos por
apertura a épicas (máximo 10); después de cinco sin legendaria se agregan 1.5 por
apertura a legendarias (máximo 15). Estos bonos salen de comunes. Una legendaria
reinicia los bonos; una épica reinicia la racha común y la de cartas altas.

Son porcentajes previos a excluir cartas no elegibles y ajustar repeticiones.
La primera apertura permite legendarias. Los bonos nunca fuerzan un resultado.

## Pruebas de puntajes en PostgreSQL temporal

Las pruebas SQL usan PGlite en memoria; no se conectan a Supabase.
Instala @electric-sql/pglite en un directorio temporal y configura PGLITE_MODULE
con la ruta absoluta de su dist/index.js. Luego ejecuta:

    node --test supabase/tests/score_ledger.test.mjs supabase/tests/score_audit.test.mjs
    node --test src/utils/cardRandom.test.js src/utils/cardRoulette.test.js src/utils/backpackCards.test.js


## Cierre seguro y respaldo del parcial

Aplica 20260924_zz_period_backups.sql después de la migración de auditoría.
El reinicio guarda primero una copia en Supabase con puntajes, alumnos, cartas
e historial completo. Ambas operaciones están en la misma transacción. Una
solicitud repetida con el mismo identificador devuelve el respaldo anterior sin
reiniciar otra vez. Solo el maestro propietario puede listar o descargar copias.

Respaldos permite descargar un resumen HTML imprimible o los datos completos en
JSON. El resumen se intenta descargar al terminar el reinicio; si el navegador
bloquea la descarga automática, la copia sigue disponible desde Respaldos.

Las tablas editadas avisan antes de cerrar, cambiar de casa o salir. Guardar y
salir conserva la tabla abierta si falla el guardado. La recarga/cierre del
navegador usa el aviso nativo de cambios pendientes cuando el navegador lo permite.

La cabecera distingue conexión, reconexión, guardado en curso y guardado confirmado.
Las escrituras idénticas simultáneas comparten una solicitud; no se reintentan
escrituras automáticamente. Los sondeos viejos no reemplazan respuestas de cambios
más recientes.

Pruebas adicionales:

    node --test supabase/tests/period_backup.test.mjs
    node --test src/utils/periodBackup.test.js src/services/connectionStore.test.js

La prueba de interfaz usa Playwright temporal (PLAYWRIGHT_MODULE: ruta a su
index.mjs; EDGE_PATH: ejecutable local de Edge) y un fixture sin datos reales:

    node --test tests/ui/scores.test.mjs

## Arena del bestiario

Aplicar, después de las migraciones de puntajes, auditoría y respaldos:

1. supabase/migrations/20260924_zzz_duel_arena.sql
2. supabase/migrations/20260924_zzz_duel_catalog.sql

Publicar después el frontend. En la pestaña Arena, el maestro abre o cierra los
retos. Los alumnos usan todas las criaturas sin comprarlas. Cada jugador recibe
un mazo independiente de 61 cartas: 4 copias por común, 3 por especial (rareza
interna rara), 2 por épica y 1 por legendaria. Puede haber duplicados en la mano.

Reglas de esta primera versión: 4,000 de vida, cinco espacios, mano de cinco
que se repone al iniciar turno, una invocación o fusión de dos cartas de la mano
por turno, ataque/defensa, cartas ocultas y seis afinidades con ventaja de 300.
La primera invocación termina el primer turno sin atacar. Desde el segundo turno, un ataque termina el turno automáticamente. Las recetas están visibles en la guía.
Gana quien agota la vida rival o impide que complete su mano; tras 60 turnos
hay empate. No se incluyen trampas ni equipos.

Victoria: +3 puntos personales y para la casa, sin modificar compras, galeones,
oportunidades ni historial de sorteos. Tres partidas con recompensa por alumno
al día y una por pareja de rivales; cuentan desde que se acepta, gane o pierda.
Los límites usan la fecha de Ciudad de México. Si cualquiera no tiene cupo,
ambos juegan práctica. Rendirse cancela sin premio y no devuelve cupos. Cada turno dura hasta 90 segundos; el servidor pasa los turnos vencidos al consultar la arena. Cerrar la arena permite terminar partidas
activas; reiniciar el parcial las cancela.

El servidor valida credenciales, clase, versión, turnos, cartas y objetivos.
Las manos/mazos rivales y cartas ocultas no se devuelven al navegador.
Las escrituras bloquean la clase para reservar cupos y entregar premios
atómicamente. Las tablas internas no están expuestas a anon/authenticated.

Balance: src/data/duelCatalog.json es la fuente del catálogo; ejecutar
node scripts/generate-duel-catalog.mjs para regenerar su SQL antes del primer
despliegue. Para cambios posteriores crear una nueva migración.

Pruebas (mismos PGLITE_MODULE, PLAYWRIGHT_MODULE y EDGE_PATH descritos arriba):

    node --test supabase/tests/duel_arena.test.mjs
    node --test tests/ui/arena.test.mjs
### Actualización de interfaz y turnos (25 de septiembre)

Aplicar supabase/migrations/20260925_arena_automatic_turns.sql sobre la arena
existente antes de publicar el frontend actualizado. No requiere volver a
ejecutar las migraciones del día 24. Conserva partidas y recompensas existentes.

El turno pasa al invocar en el primer turno, después de un ataque o al vencer
90 segundos desde el inicio del turno. Invocar o cambiar posición no reinicia
el reloj. La victoria se resuelve antes de pasar el turno. Se mantiene la opción
Pasar sin atacar. El servidor avanza turnos vencidos mediante las consultas de
la arena; el cliente consulta también al llegar a cero. Si no hay nadie
conectado, se resuelve al volver a consultar, sin otorgar premios por abandono.

La pestaña Arena aprovecha el espacio de la cabecera de la copa en ambos roles,
muestra el reverso real y anuncia cada cambio de turno con un aviso translúcido
que se desvanece. La navegación a las otras pestañas sigue disponible.

    node --test supabase/tests/duel_automatic_turns.test.mjs
    node --test tests/ui/arena.test.mjs