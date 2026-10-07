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
### Magia, trampas e invocación directa

Aplicar 20260925_b_arena_spells.sql después de 20260925_arena_automatic_turns.sql
y publicar el frontend. Los duelos nuevos usan 75 cartas: las 61 criaturas
más 14 hechizos. Las partidas ya iniciadas conservan su mazo.

Seleccionar una criatura (o dos ingredientes válidos) y tocar un espacio vacío
la invoca inmediatamente. Afinidad, posición y boca abajo se eligen antes de
tocar el tablero. Engorgio se aplica tocando una criatura propia; los demás
hechizos se juegan tocando un espacio libre de la zona Magia / trampa.

Se permite un hechizo por turno, además de una invocación. Las trampas se
colocan ocultas; ante un ataque válido, la primera trampa de izquierda a derecha
se activa y se consume, cancelando ese ataque. El turno del atacante termina.
Efectos exclusivos del duelo, independientes de los efectos escolares:

| Carta | Tipo | Copias | Efecto |
| --- | --- | --- | --- |
| Incendio | Magia | 4 | 600 de daño al rival |
| Engorgio | Magia | 4 | +500 ATQ a una criatura propia mientras siga en el campo |
| Elixir de Vida | Magia | 2 | Recuperar 800 de vida, máximo 4000 |
| Expecto Patronus | Trampa | 1 | Cancelar ataque y reflejar 400 de daño |
| Confundo | Trampa | 2 | Cancelar ataque y poner atacante en defensa |
| Invisibilidad | Trampa | 1 | Cancelar ataque |

El catálogo visual está en duelCatalog.json; el generador anterior sigue siendo
para criaturas y fusiones. Los hechizos del servidor están en la migración nueva,
y la prueba verifica que las cantidades coincidan. El fondo proporcionado por el
usuario está en public/backgrounds/arena-castle.png.

    node --test supabase/tests/duel_spells.test.mjs
    node --test tests/ui/arena.test.mjs
### Tablero y ataques por criatura

Aplicar 20260925_c_arena_battlefield.sql después de la migración de hechizos,
y publicar el frontend. Amplía las zonas de magia/trampa de tres a cinco
espacios, conservando las trampas existentes. La actualización de partidas es
idempotente y aumenta su versión para rechazar acciones enviadas desde una
vista anterior al cambio.

Cada criatura en ataque puede atacar una vez por turno. Después de atacar,
el turno continúa si queda otra criatura en ataque sin usar; de lo contrario,
pasa automáticamente. Terminar turno permite cederlo antes y el reloj de
90 segundos sigue vigente. Las trampas consumen el ataque de la criatura
afectada; las demás pueden continuar.

El marcador de vida y cartas restantes encabeza el tablero. La información
del catálogo y las recompensas queda al pie. La defensa se muestra horizontal.
Al seleccionar una carta de la mano, su vista ampliada permite deslizar a
izquierda/derecha o pulsar el botón para elegir boca arriba/abajo antes de
invocar. Las fusiones se mantienen boca arriba y las trampas boca abajo.
Cerrar la vista ampliada conserva la selección y no invoca. Las cartas ya
colocadas se pueden inspeccionar sin cambiar su estado oculto.
Para atacar directamente, seleccionar una criatura atacante y tocar cualquiera
de los cinco espacios vacíos del campo rival.

    node --test supabase/tests/duel_battlefield.test.mjs
    node --test tests/ui/arena.test.mjs
### Giro con flechas y postura al tocar

Aplicar 20260925_d_arena_postures.sql después de la migración del tablero.
La vista previa usa flechas laterales y conserva el gesto horizontal para
voltear antes de invocar. Tocar una criatura propia alterna su postura en el
servidor y la deja seleccionada para atacar; tocarla de nuevo la vuelve a cambiar.
No hace falta abrir una vista previa ni confirmar la postura.

Una criatura puede atacar desde ataque o defensa; al iniciar el combate pasa
a ataque. Esto también permite que una trampa Confundo la vuelva a poner en
defensa durante la resolución. Cada criatura conserva el límite de un ataque
por turno: cambiar de postura no reinicia ese límite. El turno automático
considera también las criaturas en defensa que todavía no hayan atacado.

    node --test supabase/tests/duel_postures.test.mjs
### Presentación de combate (28 de septiembre)

Aplicar 20260928_arena_combat_events.sql después de las migraciones anteriores
y publicar el frontend. El servidor conserva los últimos 12 eventos públicos
de combate/fusión dentro de la partida. Incluyen daño real, valores de combate,
destrucciones y trampas activadas. Nunca contienen manos ni mazos; un objetivo
oculto de un ataque cancelado por trampa conserva su reverso en el evento.

Ambos jugadores ven una secuencia de 2.6 segundos (pueden omitirla con Continuar):
atacante y objetivo, impacto/trampa, daño y resultado. Las fusiones presentan
ingredientes y criatura resultante. El sondeo añade solo eventos nuevos a la
cola; al abrir una partida no reproduce eventos históricos. Durante la secuencia
los controles del tablero quedan inactivos. Se respeta movimiento reducido.

El tablero y la mano comparten una superficie compacta. En pantallas de altura
muy reducida se conserva el desplazamiento para no reducir controles en exceso.

    node --test supabase/tests/duel_combat_events.test.mjs
    node --test tests/ui/arena-combat.test.mjs tests/ui/arena.test.mjs

### Refuerzo antes de invocar y combinaciones de la mano

Aplicar `20260928_b_arena_hand_boost.sql` después de
`20260928_arena_combat_events.sql`, antes de publicar este frontend.
Engorgio y una criatura de la mano se pueden seleccionar en cualquier orden:
la invocación consume ambas cartas y los usos de criatura y magia del turno,
y coloca la criatura boca arriba con +500 ATQ. La acción es atómica, incluido
el primer turno, y el aumento participa en el combate. Engorgio conserva su
uso sobre una criatura que ya está en el campo.

El borde dorado identifica combinaciones disponibles. Al seleccionar una carta,
se resaltan sus parejas válidas; las cartas incompatibles reemplazan la selección.
La defensa gira únicamente el marco completo, sin volver a girar la imagen.

    node --test supabase/tests/duel_hand_boost.test.mjs

### Balance y catálogo completo (29 de septiembre)

Aplicar `supabase/migrations/20260929_arena_balance.sql` después de
`20260928_b_arena_hand_boost.sql`, y después publicar el frontend.
La migración y el frontend deben actualizarse juntos: las magias nuevas necesitan
los nuevos destinos de selección y las reglas del servidor.

El catálogo tiene 24 criaturas y los 20 hechizos activos del álbum (14 magias
y 6 trampas). Los mazos nuevos contienen 75 cartas: 49 criaturas y 26 hechizos.
Los duelos activos conservan sus manos, mazos y reloj; reciben las estadísticas
actualizadas y un cambio de versión para refrescar la vista. Para probar la
distribución completa hay que iniciar una partida nueva.

Dragón queda en 2500 ATQ / 1700 DEF y Troll en 2400 / 1800. Las criaturas de
menor rareza suben y las nuevas magias ofrecen reducción de estadísticas,
cambio de postura y destrucción con coste. La ventaja elemental sigue en +300.
Los aumentos netos tienen un máximo de +1000 ATQ y +1000 DEF por criatura;
las estadísticas efectivas no bajan de cero. Se mantiene una magia o trampa
por turno, antes de atacar. Engorgio conserva su combinación previa a invocar.

Las magias de objetivo rival requieren criaturas boca arriba. Alohomora puede
retirar una trampa oculta sin revelar su identidad. Las mejoras y reducciones
duran mientras la criatura permanezca en el campo. Este balance es una primera
versión: conviene observar victorias y duración de partidas antes de reajustarlo.

    node --test --test-concurrency=1 supabase/tests/duel*.test.mjs
    node --test --test-concurrency=1 tests/ui/arena*.test.mjs

Los tests históricos usan `supabase/tests/fixtures/duelCatalog-v1.json` para
comprobar las migraciones anteriores; `duel_balance.test.mjs` comprueba el
catálogo actual, los 20 efectos y sus límites, privacidad y respuestas a las
criaturas legendarias.

### Galeones por duelos (5 de octubre)

Aplicar `supabase/migrations/20261005_arena_galleon_rewards.sql` después de
`20260929_arena_balance.sql` y publicar el frontend actualizado.
Los duelos con recompensa entregan 80 galeones al ganador y 30 al perdedor;
un empate entrega 50 a cada jugador. El servidor abona ambos saldos y registra
el recibo en la misma transacción, sin modificar puntos personales, puntajes
de casa, participaciones u oportunidades de cartas. La vista muestra el importe
real del recibo; las recompensas históricas no se reinterpretan como galeones.

Se mantienen tres duelos premiados por día y uno por rival. Práctica, rendición
y cancelación no pagan. Autorizar una participación conserva la oportunidad
de carta, pero deja de dar los 37 galeones y el bono del bestiario. Los saldos
y registros históricos se conservan; no hay pagos retroactivos.

    node --test supabase/tests/duel_rewards.test.mjs

### Precios del bestiario (5 de octubre)

Aplicar `supabase/migrations/20261005_b_bestiary_prices.sql` y publicar el
frontend actualizado. Cada criatura común cuesta 100 galeones, rara 250,
épica 500 y legendaria 1000. Las 24 criaturas suman 10,250 galeones.
Las compras anteriores conservan sus criaturas y saldos. Se mantiene la
elección de hechizo por compra legendaria. La compra bloquea la fila del alumno
para validar el saldo y evitar cobros simultáneos sobre el mismo saldo.

    node --test supabase/tests/bestiary_prices.test.mjs

### Bonos del bestiario por duelo

Aplicar `supabase/migrations/20261005_c_bestiary_duel_bonus.sql` después de
las migraciones de recompensas y precios del 5 de octubre, y publicar el frontend.
Cada criatura comprada añade galeones a los duelos con recompensa: común +1,
rara +2, épica +3, legendaria +5. La colección completa suma +63 por duelo.
Se abona el bono propio de cada jugador, tanto por victoria como por derrota
o empate, además de su premio base. Prácticas, rendiciones y cancelaciones
no pagan; se mantienen los cupos diarios y por rival.

La colección se consulta al liquidar el duelo, con bloqueo de los alumnos
para coordinar compras simultáneas. El total y el bono se guardan juntos en el
recibo: compras posteriores no cambian un premio anterior. No hay pagos
retroactivos, bonos por participación ni cambios en puntos o estadísticas de
combate. La tienda muestra el beneficio individual y el bono acumulado; el
resultado del duelo muestra el desglose del pago.

    node --test supabase/tests/duel_rewards.test.mjs supabase/tests/bestiary_prices.test.mjs

### Sonidos de la arena

La arena sintetiza sonidos breves con Web Audio para recorrer y seleccionar la
mano, girar cartas, colocarlas tras confirmación del servidor, fusionar y atacar.
La destrucción reproduce un corte de sable a los 900 ms de la animación, o a
los 1500 ms cuando el atacante recibe un contraataque. Los ataques directos
usan un barrido breve junto al destello del campo.

El menú del duelo incluye «Sonido: activado / silenciado» y conserva la elección
en el navegador. El audio se habilita con la primera interacción, se detiene al
ocultar la pestaña o salir del componente y cancela los sonidos pendientes al
omitir el combate. No necesita archivos de audio ni migración de base de datos;
requiere publicar el frontend. Si el navegador no permite audio, el duelo sigue.

    node --test tests/ui/arena-sounds.test.mjs

### Confundo, rendición y fusiones (6 de octubre)

Aplicar `supabase/migrations/20261006_arena_confundo_surrender.sql` después de
`20261005_c_bestiary_duel_bonus.sql` y publicar el frontend.
Confundo deja al atacante en defensa y bloqueado hasta el comienzo de su
siguiente turno. La interfaz impide seleccionarlo; el servidor rechaza cambios
de postura, ataques y magias propias dirigidas a esa criatura mientras dure
el bloqueo. El resto de criaturas sigue disponible.

Rendirse ahora finaliza el duelo con victoria del oponente. En un duelo con
recompensa, quien se rinde cobra cero (también cero bono); el ganador cobra 80
más su bono del bestiario. Prácticas no pagan y se mantienen los cupos existentes.
No se modifican rendiciones ya resueltas ni participaciones o puntajes de clase.

Solo quien fusiona ve la animación y oye su efecto; el rival recibe el tablero
actualizado. Seleccionar dos cartas compatibles muestra nombre, ATQ y DEF del
resultado en la cinta inferior, incluyendo el refuerzo de Engorgio. La amplitud
de los efectos de audio sube a 2.5 veces la anterior (aproximadamente +8 dB).

    node --test supabase/tests/duel_confundo_lock.test.mjs supabase/tests/duel_rewards.test.mjs
    node --test tests/ui/arena-fusion-preview.test.mjs tests/ui/arena-sounds.test.mjs

### Galeones en el perfil del maestro

Aplicar `supabase/migrations/20261006_b_teacher_galleons.sql` y publicar el
frontend. La pestaña «Galeones» del maestro muestra todos los alumnos de la
clase con su saldo, permite buscar por nombre y reemplazar el saldo de uno
por un entero de cero o más. La edición no cambia puntos, participaciones,
cartas ni bestias. Está disponible en móvil y escritorio.

La función exige sesión autenticada del propietario de la clase activa y
verifica que el alumno pertenezca a esa clase. Bloquea las filas y comprueba
el saldo que vio el maestro al abrir la edición: si cambió por una compra,
un premio u otra edición, rechaza el guardado para evitar sobrescribirlo.
Solo el rol authenticated puede ejecutar la función.

    node --test supabase/tests/teacher_galleons.test.mjs
    node --test tests/ui/galleons.test.mjs

### Protección de Patronus frente a Confundo

Aplicar `supabase/migrations/20261006_c_patronus_confundo.sql` y publicar el
frontend. Confundo omitía la comprobación de `casa_protegida`, por lo que podía
intercambiar o quitar puntos a alumnos protegidos. La migración añade esa
validación conservando la función instalada y su auditoría; el selector de
Confundo también excluye alumnos de la casa protegida. Un rechazo no consume
la oportunidad ni modifica puntos. La migración no corrige historiales pasados.

La prueba reproduce el fallo anterior y comprueba la corrección, activación de
Patronus, multiplicador de la siguiente acción y protección contra Avada,
Crucio y Sectumsempra. Se mantiene la regla existente de una sola casa protegida:
otro Patronus transfiere la protección a la casa que lo obtiene.

    node --test supabase/tests/patronus.test.mjs

### Bestias con beneficios de un solo uso y exención del parcial

Aplicar `supabase/migrations/20261006_d_bestiary_single_use.sql` después de
las migraciones anteriores y publicar el frontend en la misma actualización.
Reemplaza los bonos permanentes de galeones del bestiario: cada común aporta
+1 punto, rara +2 y épica +3 en una única participación; cada legendaria permite
elegir una carta una sola vez y no añade puntos. El alumno elige una bestia
disponible, o continuar sin bestia, antes de abrir su carta autorizada.

La selección se guarda sin consumirla. La función del hechizo consume el
beneficio dentro de la misma transacción, después de aplicar el efecto y
descontar la oportunidad. Un error conserva el beneficio. El bono se añade al
alumno y a su casa una vez, después del cálculo del hechizo, sin multiplicarlo
con Patronus ni convertirlo en daño o en una participación adicional. Las
acciones con varios destinatarios también consumen una sola bestia.

Las criaturas usadas siguen en la colección como «Beneficio utilizado».
Al migrar, las comunes/raras/épicas compradas reciben un uso; las elecciones
legendarias pendientes se conservan y se asignan por ID a las legendarias
compradas. Los usos anteriores se deducen del contador existente, ya que el
sistema anterior no guardaba qué criatura había originado cada elección.

Completar las 24 criaturas permite solicitar exención del parcial desde el
bestiario. El alumno muestra la solicitud al maestro y este la autoriza en
Galeones → Exenciones del bestiario. El servidor verifica colección completa,
credenciales y propiedad de la clase; completar el álbum no aprueba por sí
solo la exención. El reinicio de parcial limpia la solicitud/autorización,
pero conserva la colección y los usos gastados. Los premios de duelo vuelven
a sus importes base; los recibos de pagos anteriores se conservan.

    node --test supabase/tests/bestiary_single_use.test.mjs
    node --test tests/ui/bestiary-benefits.test.mjs

### Galeones, respaldo Excel y Crecehuesos (7 de octubre)

El editor de galeones usa texto blanco sobre controles azules y ordena alumnos
de mayor a menor saldo, con nombre como desempate. Los respaldos se descargan
como `.xlsx` con Resumen, Casas, Alumnos, Mochila, Historial y Auditoría; usan
el historial completo cuando está disponible. Se mantiene la descarga JSON.
ExcelJS se carga solo al exportar. Los textos se escriben como valores literales,
los puntajes y galeones como números. Las fechas se muestran en Ciudad de México.

Aplicar `supabase/migrations/20261007_crecehuesos_choice.sql` después de
`20261006_d_bestiary_single_use.sql` y publicar el frontend. Al obtener
Crecehuesos, el alumno elige sumar un punto o guardar la carta para justificar
una falta. Sumar puntos no guarda carta; justificar guarda la carta con cero
puntos. La opción de puntos conserva el multiplicador de Patronus y el beneficio
de bestia elegido. Justificar conserva sin gastar las bestias de puntos; una
legendaria usada para elegir el hechizo sí se consume. El servidor rechaza
justificantes duplicados y el endpoint anterior que aplicaba ambos efectos.
Las cartas guardadas anteriormente se conservan.

    node --test supabase/tests/crecehuesos_choice.test.mjs tests/period-backup-excel.test.mjs
    node --test tests/ui/galleons.test.mjs tests/ui/crecehuesos.test.mjs
