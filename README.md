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
