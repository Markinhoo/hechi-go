create extension if not exists pgcrypto;

create table if not exists public.hechi_clases (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Clase HECHI GO',
  estado text not null default 'activa' check (estado in ('activa', 'cerrada')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.hechi_alumnos (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references public.hechi_clases(id) on delete cascade,
  nombre text not null,
  puntos integer not null default 0 check (puntos >= 0),
  cartas integer[] not null default '{}',
  participaciones integer not null default 0 check (participaciones >= 0),
  activo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint hechi_cartas_validas check (
    cartas <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28]
  )
);

create table if not exists public.hechi_participaciones (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references public.hechi_clases(id) on delete cascade,
  alumno_id uuid not null references public.hechi_alumnos(id) on delete cascade,
  puntos integer not null check (puntos >= 0 and puntos <= 100),
  carta integer not null check (carta between 1 and 28),
  carta_nueva boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

create index if not exists hechi_clases_created_by_estado_idx on public.hechi_clases(created_by, estado, created_at desc);
create index if not exists hechi_alumnos_clase_idx on public.hechi_alumnos(clase_id, activo, created_at);
create index if not exists hechi_participaciones_clase_idx on public.hechi_participaciones(clase_id, created_at desc);

alter table public.hechi_clases enable row level security;
alter table public.hechi_alumnos enable row level security;
alter table public.hechi_participaciones enable row level security;

drop policy if exists hechi_clases_select on public.hechi_clases;
create policy hechi_clases_select on public.hechi_clases for select to authenticated using (created_by = auth.uid());

drop policy if exists hechi_clases_insert on public.hechi_clases;
create policy hechi_clases_insert on public.hechi_clases for insert to authenticated with check (created_by = auth.uid());

drop policy if exists hechi_clases_update on public.hechi_clases;
create policy hechi_clases_update on public.hechi_clases for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists hechi_alumnos_select on public.hechi_alumnos;
create policy hechi_alumnos_select on public.hechi_alumnos for select to authenticated using (exists (select 1 from public.hechi_clases c where c.id = clase_id and c.created_by = auth.uid()));

drop policy if exists hechi_alumnos_insert on public.hechi_alumnos;
create policy hechi_alumnos_insert on public.hechi_alumnos for insert to authenticated with check (exists (select 1 from public.hechi_clases c where c.id = clase_id and c.created_by = auth.uid()));

drop policy if exists hechi_alumnos_update on public.hechi_alumnos;
create policy hechi_alumnos_update on public.hechi_alumnos for update to authenticated using (exists (select 1 from public.hechi_clases c where c.id = clase_id and c.created_by = auth.uid())) with check (exists (select 1 from public.hechi_clases c where c.id = clase_id and c.created_by = auth.uid()));

drop policy if exists hechi_participaciones_select on public.hechi_participaciones;
create policy hechi_participaciones_select on public.hechi_participaciones for select to authenticated using (exists (select 1 from public.hechi_clases c where c.id = clase_id and c.created_by = auth.uid()));

drop policy if exists hechi_participaciones_insert on public.hechi_participaciones;
create policy hechi_participaciones_insert on public.hechi_participaciones for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.hechi_clases c where c.id = clase_id and c.created_by = auth.uid()));