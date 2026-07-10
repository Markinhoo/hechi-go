create extension if not exists pgcrypto;
create schema if not exists hechi;

grant usage on schema hechi to anon, authenticated;

create table if not exists hechi.clases (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Clase HECHI GO',
  estado text not null default 'activa' check (estado in ('activa', 'cerrada')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists hechi.alumnos (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references hechi.clases(id) on delete cascade,
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

create table if not exists hechi.participaciones (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  alumno_id uuid not null references hechi.alumnos(id) on delete cascade,
  puntos integer not null check (puntos >= 0 and puntos <= 100),
  carta integer not null check (carta between 1 and 28),
  carta_nueva boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now()
);

create index if not exists hechi_clases_created_by_estado_idx on hechi.clases(created_by, estado, created_at desc);
create index if not exists hechi_alumnos_clase_idx on hechi.alumnos(clase_id, activo, created_at);
create index if not exists hechi_participaciones_clase_idx on hechi.participaciones(clase_id, created_at desc);

grant select, insert, update, delete on all tables in schema hechi to authenticated;
grant usage, select on all sequences in schema hechi to authenticated;

alter default privileges in schema hechi grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema hechi grant usage, select on sequences to authenticated;

alter table hechi.clases enable row level security;
alter table hechi.alumnos enable row level security;
alter table hechi.participaciones enable row level security;

drop policy if exists clases_select on hechi.clases;
create policy clases_select on hechi.clases
for select to authenticated
using (created_by = auth.uid());

drop policy if exists clases_insert on hechi.clases;
create policy clases_insert on hechi.clases
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists clases_update on hechi.clases;
create policy clases_update on hechi.clases
for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists alumnos_select on hechi.alumnos;
create policy alumnos_select on hechi.alumnos
for select to authenticated
using (
  exists (
    select 1
    from hechi.clases c
    where c.id = clase_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists alumnos_insert on hechi.alumnos;
create policy alumnos_insert on hechi.alumnos
for insert to authenticated
with check (
  exists (
    select 1
    from hechi.clases c
    where c.id = clase_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists alumnos_update on hechi.alumnos;
create policy alumnos_update on hechi.alumnos
for update to authenticated
using (
  exists (
    select 1
    from hechi.clases c
    where c.id = clase_id
      and c.created_by = auth.uid()
  )
)
with check (
  exists (
    select 1
    from hechi.clases c
    where c.id = clase_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists participaciones_select on hechi.participaciones;
create policy participaciones_select on hechi.participaciones
for select to authenticated
using (
  exists (
    select 1
    from hechi.clases c
    where c.id = clase_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists participaciones_insert on hechi.participaciones;
create policy participaciones_insert on hechi.participaciones
for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from hechi.clases c
    where c.id = clase_id
      and c.created_by = auth.uid()
  )
);