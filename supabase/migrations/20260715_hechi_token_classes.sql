create extension if not exists pgcrypto;
create schema if not exists hechi;

grant usage on schema hechi to anon, authenticated;

drop table if exists hechi.participaciones cascade;
drop table if exists hechi.alumnos cascade;
drop table if exists hechi.clases cascade;

create table hechi.clases (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  total integer not null check (total between 4 and 120),
  objetivos jsonb not null,
  puntajes jsonb not null default '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}',
  maestro_pin text not null,
  sobre_activo integer not null default 0,
  estado text not null default 'activa' check (estado in ('activa', 'cerrada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hechi.alumnos (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  nombre text not null,
  password text not null,
  casa_id text not null check (casa_id in ('gryffindor','slytherin','ravenclaw','hufflepuff')),
  puntos integer not null default 0 check (puntos >= 0),
  cartas integer[] not null default '{}',
  oportunidades integer not null default 0 check (oportunidades >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clase_id, nombre)
);

create table hechi.participaciones (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  alumno_id uuid not null references hechi.alumnos(id) on delete cascade,
  carta integer not null check (carta between 1 and 28),
  puntos integer not null check (puntos between 0 and 100),
  titulo text not null,
  descripcion text not null,
  created_at timestamptz not null default now()
);

create index hechi_clases_token_idx on hechi.clases(token);
create index hechi_alumnos_clase_idx on hechi.alumnos(clase_id, puntos desc, created_at);
create index hechi_participaciones_clase_idx on hechi.participaciones(clase_id, created_at desc);

alter table hechi.clases enable row level security;
alter table hechi.alumnos enable row level security;
alter table hechi.participaciones enable row level security;

create or replace function hechi.calcular_objetivos(p_total integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'gryffindor', (p_total / 4) + case when mod(p_total, 4) > 0 then 1 else 0 end,
    'slytherin', (p_total / 4) + case when mod(p_total, 4) > 1 then 1 else 0 end,
    'ravenclaw', (p_total / 4) + case when mod(p_total, 4) > 2 then 1 else 0 end,
    'hufflepuff', (p_total / 4)
  )
$$;

create or replace function hechi.estado_clase(p_clase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_conteos jsonb;
  v_alumnos jsonb;
  v_historial jsonb;
begin
  select * into v_clase from hechi.clases where id = p_clase_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  select jsonb_build_object(
    'gryffindor', count(*) filter (where casa_id = 'gryffindor'),
    'slytherin', count(*) filter (where casa_id = 'slytherin'),
    'ravenclaw', count(*) filter (where casa_id = 'ravenclaw'),
    'hufflepuff', count(*) filter (where casa_id = 'hufflepuff')
  ) into v_conteos
  from hechi.alumnos
  where clase_id = p_clase_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'nombre', nombre,
    'casaId', casa_id,
    'puntos', puntos,
    'cartas', cartas,
    'oportunidades', oportunidades
  ) order by puntos desc, created_at), '[]'::jsonb)
  into v_alumnos
  from hechi.alumnos
  where clase_id = p_clase_id;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_historial
  from (
    select jsonb_build_object(
      'id', p.id,
      'alumno', a.nombre,
      'casaId', a.casa_id,
      'carta', p.carta,
      'puntos', p.puntos,
      'titulo', p.titulo,
      'descripcion', p.descripcion,
      'createdAt', p.created_at
    ) as item
    from hechi.participaciones p
    join hechi.alumnos a on a.id = p.alumno_id
    where p.clase_id = p_clase_id
    order by p.created_at desc
    limit 8
  ) recientes;

  return jsonb_build_object(
    'id', v_clase.id,
    'token', v_clase.token,
    'total', v_clase.total,
    'estado', v_clase.estado,
    'objetivos', v_clase.objetivos,
    'puntajes', v_clase.puntajes,
    'conteos', v_conteos,
    'alumnos', v_alumnos,
    'historial', v_historial,
    'sobreActivo', v_clase.sobre_activo
  );
end;
$$;

create or replace function hechi.crear_clase(p_token text, p_total integer, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_id uuid;
  v_total integer := greatest(4, least(120, coalesce(p_total, 30)));
begin
  if length(trim(coalesce(p_pin, ''))) < 3 then
    raise exception 'El PIN del maestro debe tener al menos 3 caracteres';
  end if;

  insert into hechi.clases(token, total, objetivos, maestro_pin)
  values (upper(trim(p_token)), v_total, hechi.calcular_objetivos(v_total), p_pin)
  returning id into v_id;

  return hechi.estado_clase(v_id);
exception when unique_violation then
  raise exception 'Ese token ya existe, intenta crear otra clase';
end;
$$;

create or replace function hechi.login_maestro(p_token text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token));
  if not found or v_clase.maestro_pin <> p_pin then
    raise exception 'Token o PIN de maestro incorrecto';
  end if;
  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.cargar_clase(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_id uuid;
begin
  select id into v_id from hechi.clases where token = upper(trim(p_token));
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;
  return hechi.estado_clase(v_id);
end;
$$;

create or replace function hechi.elegir_casa(p_clase_id uuid)
returns text
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_obj jsonb;
  v_casa text;
begin
  select objetivos into v_obj from hechi.clases where id = p_clase_id;

  with casas as (
    select 'gryffindor'::text as id, (v_obj->>'gryffindor')::integer as meta union all
    select 'slytherin', (v_obj->>'slytherin')::integer union all
    select 'ravenclaw', (v_obj->>'ravenclaw')::integer union all
    select 'hufflepuff', (v_obj->>'hufflepuff')::integer
  ), conteos as (
    select c.id, c.meta, count(a.id)::integer as alumnos
    from casas c
    left join hechi.alumnos a on a.clase_id = p_clase_id and a.casa_id = c.id
    group by c.id, c.meta
  )
  select id into v_casa
  from conteos
  where alumnos < meta
  order by (alumnos::numeric / nullif(meta, 0)), alumnos, random()
  limit 1;

  if v_casa is null then
    raise exception 'La clase ya esta completa';
  end if;
  return v_casa;
end;
$$;

create or replace function hechi.entrar_alumno(p_token text, p_nombre text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_nombre text := trim(p_nombre);
  v_casa text;
  v_estado jsonb;
begin
  if length(v_nombre) < 2 then
    raise exception 'Escribe tu nombre';
  end if;
  if length(coalesce(p_password, '')) < 3 then
    raise exception 'La contrasena debe tener al menos 3 caracteres';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where clase_id = v_clase.id and lower(nombre) = lower(v_nombre);
  if found then
    if v_alumno.password <> p_password then
      raise exception 'Contrasena incorrecta';
    end if;
    v_estado := hechi.estado_clase(v_clase.id);
    return v_estado || jsonb_build_object('alumno_id', v_alumno.id);
  end if;

  if (select count(*) from hechi.alumnos where clase_id = v_clase.id) >= v_clase.total then
    raise exception 'La clase ya esta completa';
  end if;

  v_casa := hechi.elegir_casa(v_clase.id);
  insert into hechi.alumnos(clase_id, nombre, password, casa_id)
  values (v_clase.id, v_nombre, p_password, v_casa)
  returning * into v_alumno;

  v_estado := hechi.estado_clase(v_clase.id);
  return v_estado || jsonb_build_object('alumno_id', v_alumno.id);
end;
$$;

create or replace function hechi.autorizar_participacion(p_token text, p_pin text, p_alumno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token));
  if not found or v_clase.maestro_pin <> p_pin then
    raise exception 'No autorizado como maestro';
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades + 1, updated_at = now()
  where id = p_alumno_id and clase_id = v_clase.id;

  if not found then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.cambiar_password_alumno(p_token text, p_pin text, p_alumno_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if length(coalesce(p_password, '')) < 3 then
    raise exception 'La nueva contrasena debe tener al menos 3 caracteres';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token));
  if not found or v_clase.maestro_pin <> p_pin then
    raise exception 'No autorizado como maestro';
  end if;

  update hechi.alumnos
  set password = p_password, updated_at = now()
  where id = p_alumno_id and clase_id = v_clase.id;

  if not found then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.abrir_carta(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_puntos integer, p_titulo text, p_descripcion text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_nuevos_puntos integer;
begin
  if not (p_numero between 1 and 28) then
    raise exception 'Carta invalida';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
  if not found or v_alumno.password <> p_password then
    raise exception 'Credenciales de alumno incorrectas';
  end if;
  if v_alumno.oportunidades <= 0 then
    raise exception 'Necesitas autorizacion del maestro para abrir carta';
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      puntos = puntos + p_puntos,
      cartas = array_append(cartas, p_numero),
      updated_at = now()
  where id = v_alumno.id;

  v_nuevos_puntos := coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + p_puntos;

  update hechi.clases
  set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_nuevos_puntos),
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, p_puntos, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

revoke all on all tables in schema hechi from anon, authenticated;
grant execute on all functions in schema hechi to anon, authenticated;
alter default privileges in schema hechi grant execute on functions to anon, authenticated;