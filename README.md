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
