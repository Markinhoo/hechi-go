# HECHI GO

Aplicacion web independiente para usar las cartas HECHI como juego de participacion en clase.

## Funciones

- Login y registro con Supabase Auth.
- Clases HECHI por usuario.
- Registro de alumnos.
- Puntos definidos por el maestro en cada participacion.
- Carta aleatoria estilo coleccion, evitando repetir cartas hasta completar las 28.
- Ranking por puntos.
- Coleccion individual por alumno.
- Historial de participaciones en Supabase.
- Modo local temporal si la migracion aun no esta aplicada.

## Desarrollo local

`ash
npm install
npm run dev
`

Copia .env.example a .env y configura:

`	ext
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon_publica
`

## Supabase

Aplica esta migracion en el SQL editor de Supabase o con Supabase CLI:

`	ext
supabase/migrations/20260710_hechi_go.sql
`

Crea las tablas:

- hechi_clases
- hechi_alumnos
- hechi_participaciones

Todas tienen RLS activo. Cada usuario autenticado solo ve y modifica sus propias clases.

## Vercel

En Vercel agrega estas variables de entorno:

`	ext
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
`

El archivo ercel.json ya incluye el rewrite necesario para una app Vite/React.

## Comandos de verificacion

`ash
npm run lint
npm run build
`