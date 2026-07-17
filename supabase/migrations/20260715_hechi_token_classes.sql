create extension if not exists pgcrypto;
create schema if not exists hechi;

grant usage on schema hechi to anon, authenticated;

-- Clean up previous HECHI function signatures before recreating them.
-- Supabase/Postgres does not allow changing parameter names or arity with CREATE OR REPLACE.
drop function if exists hechi.calcular_objetivos(integer);
drop function if exists hechi.estado_clase(uuid);
drop function if exists hechi.crear_clase(text, integer, text);
drop function if exists hechi.crear_clase(text, integer, text, text);
drop function if exists hechi.listar_clases_maestro();
drop function if exists hechi.login_maestro(text);
drop function if exists hechi.login_maestro(text, text);
drop function if exists hechi.cargar_clase(text);
drop function if exists hechi.elegir_casa(uuid);
drop function if exists hechi.entrar_alumno(text, text, text);
drop function if exists hechi.solicitar_carta(text, uuid, text);
drop function if exists hechi.autorizar_participacion(text, uuid);
drop function if exists hechi.autorizar_participacion(text, text, uuid);
drop function if exists hechi.cambiar_password_alumno(text, uuid, text);
drop function if exists hechi.cambiar_password_alumno(text, text, uuid, text);
drop function if exists hechi.abrir_carta(text, uuid, text, integer, integer, text, text);
drop function if exists hechi.abrir_carta(text, uuid, text, integer, integer, text, text, text);
drop function if exists hechi.intercambiar_alumnos(text, uuid, text, integer, text, text, uuid, uuid);
drop function if exists hechi.intercambiar_puntos_alumnos(text, uuid, text, integer, text, text, uuid);
drop function if exists hechi.sumar_puntos_companero(text, uuid, text, integer, text, text, uuid);
drop function if exists hechi.reiniciar_clase(text);
drop function if exists hechi.reiniciar_clase(text, text);
drop function if exists hechi.eliminar_clase(text);
drop function if exists hechi.eliminar_clase(text, text);

drop table if exists hechi.participaciones cascade;
drop table if exists hechi.solicitudes cascade;
drop table if exists hechi.alumnos cascade;
drop table if exists hechi.clases cascade;

create table hechi.clases (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  nombre text not null default 'Clase HECHI GO',
  token text not null unique,
  total integer not null check (total between 4 and 120),
  objetivos jsonb not null,
  puntajes jsonb not null default '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}',
  casa_protegida text check (casa_protegida in ('gryffindor','slytherin','ravenclaw','hufflepuff')),
  casa_multiplicador text check (casa_multiplicador in ('gryffindor','slytherin','ravenclaw','hufflepuff')),
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

create table hechi.solicitudes (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  alumno_id uuid not null references hechi.alumnos(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente','autorizada','cancelada')),
  created_at timestamptz not null default now()
);

create table hechi.participaciones (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  alumno_id uuid not null references hechi.alumnos(id) on delete cascade,
  carta integer not null check (carta between 1 and 28),
  puntos integer not null check (puntos between -100 and 100),
  casa_objetivo text check (casa_objetivo in ('gryffindor','slytherin','ravenclaw','hufflepuff')),
  titulo text not null,
  descripcion text not null,
  created_at timestamptz not null default now()
);

create index hechi_clases_token_idx on hechi.clases(token);
create index hechi_alumnos_clase_idx on hechi.alumnos(clase_id, puntos desc, created_at);
create index hechi_solicitudes_clase_idx on hechi.solicitudes(clase_id, estado, created_at);
create unique index hechi_solicitudes_pendiente_unique on hechi.solicitudes(clase_id, alumno_id) where estado = 'pendiente';
create index hechi_participaciones_clase_idx on hechi.participaciones(clase_id, created_at desc);

alter table hechi.clases enable row level security;
alter table hechi.alumnos enable row level security;
alter table hechi.solicitudes enable row level security;
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
  v_solicitudes jsonb;
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
      'casaId', coalesce(p.casa_objetivo, a.casa_id),
      'casaAlumno', a.casa_id,
      'casaObjetivo', p.casa_objetivo,
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

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_solicitudes
  from (
    select jsonb_build_object(
      'id', s.id,
      'alumnoId', a.id,
      'alumno', a.nombre,
      'casaId', a.casa_id,
      'createdAt', s.created_at
    ) as item
    from hechi.solicitudes s
    join hechi.alumnos a on a.id = s.alumno_id
    where s.clase_id = p_clase_id and s.estado = 'pendiente'
    order by s.created_at asc
  ) pendientes;

  return jsonb_build_object(
    'id', v_clase.id,
    'token', v_clase.token,
    'nombre', v_clase.nombre,
    'total', v_clase.total,
    'estado', v_clase.estado,
    'objetivos', v_clase.objetivos,
    'puntajes', v_clase.puntajes,
    'casaProtegida', v_clase.casa_protegida,
    'casaMultiplicador', v_clase.casa_multiplicador,
    'conteos', v_conteos,
    'alumnos', v_alumnos,
    'historial', v_historial,
    'solicitudes', v_solicitudes,
    'sobreActivo', v_clase.sobre_activo
  );
end;
$$;

create or replace function hechi.crear_clase(p_token text, p_total integer, p_nombre text default 'Clase HECHI GO')
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_id uuid;
  v_total integer := greatest(4, least(120, coalesce(p_total, 30)));
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Escribe el nombre del grupo';
  end if;


  insert into hechi.clases(created_by, nombre, token, total, objetivos)
  values (auth.uid(), trim(p_nombre), upper(trim(p_token)), v_total, hechi.calcular_objetivos(v_total))
  returning id into v_id;

  return hechi.estado_clase(v_id);
exception when unique_violation then
  raise exception 'Ese token ya existe, intenta crear otra clase';
end;
$$;


create or replace function hechi.listar_clases_maestro()
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'nombre', c.nombre,
      'token', c.token,
      'total', c.total,
      'alumnos', coalesce(a.alumnos, 0),
      'puntos', coalesce((c.puntajes->>'gryffindor')::integer, 0)
        + coalesce((c.puntajes->>'slytherin')::integer, 0)
        + coalesce((c.puntajes->>'ravenclaw')::integer, 0)
        + coalesce((c.puntajes->>'hufflepuff')::integer, 0),
      'createdAt', c.created_at
    ) order by c.created_at desc)
    from hechi.clases c
    left join (
      select clase_id, count(*)::integer alumnos
      from hechi.alumnos
      group by clase_id
    ) a on a.clase_id = c.id
    where c.created_by = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function hechi.login_maestro(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'Token de maestro incorrecto';
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


create or replace function hechi.solicitar_carta(p_token text, p_alumno_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
  if not found or v_alumno.password <> p_password then
    raise exception 'Credenciales de alumno incorrectas';
  end if;

  if v_alumno.oportunidades > 0 then
    return hechi.estado_clase(v_clase.id);
  end if;

  insert into hechi.solicitudes(clase_id, alumno_id, estado)
  values (v_clase.id, v_alumno.id, 'pendiente')
  on conflict do nothing;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.autorizar_participacion(p_token text, p_alumno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_actualizados integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades + 1, updated_at = now()
  where id = p_alumno_id and clase_id = v_clase.id;

  get diagnostics v_actualizados = row_count;
  if v_actualizados = 0 then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  update hechi.solicitudes
  set estado = 'autorizada'
  where clase_id = v_clase.id and alumno_id = p_alumno_id and estado = 'pendiente';

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.cambiar_password_alumno(p_token text, p_alumno_id uuid, p_password text)
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

  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
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

create or replace function hechi.abrir_carta(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_puntos integer, p_titulo text, p_descripcion text, p_casa_objetivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_casa_objetivo text;
  v_puntos_efectivos integer;
  v_nuevos_puntos integer;
  v_consumir_multiplicador boolean := false;
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

  if p_numero = 2 then
    update hechi.alumnos
    set oportunidades = oportunidades - 1,
        cartas = array_append(cartas, p_numero),
        updated_at = now()
    where id = v_alumno.id;

    update hechi.clases
    set casa_protegida = v_alumno.casa_id,
        casa_multiplicador = v_alumno.casa_id,
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;

    insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
    values (v_clase.id, v_alumno.id, p_numero, 0, v_alumno.casa_id, p_titulo, p_descripcion);

    return hechi.estado_clase(v_clase.id);
  end if;

  v_puntos_efectivos := p_puntos;
  if p_puntos <> 0 and v_clase.casa_multiplicador = v_alumno.casa_id then
    v_puntos_efectivos := p_puntos * 2;
    v_consumir_multiplicador := true;
  end if;

  if v_puntos_efectivos < 0 then
    v_casa_objetivo := lower(trim(coalesce(p_casa_objetivo, '')));
    if v_casa_objetivo not in ('gryffindor','slytherin','ravenclaw','hufflepuff') then
      raise exception 'Selecciona una casa rival valida';
    end if;
    if v_casa_objetivo = v_alumno.casa_id then
      raise exception 'No puedes restarle puntos a tu propia casa';
    end if;
    if v_casa_objetivo = v_clase.casa_protegida then
      raise exception 'Esa casa esta protegida por Expecto Patronus';
    end if;
  else
    v_casa_objetivo := v_alumno.casa_id;
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      puntos = puntos + greatest(v_puntos_efectivos, 0),
      cartas = array_append(cartas, p_numero),
      updated_at = now()
  where id = v_alumno.id;

  v_nuevos_puntos := greatest(0, coalesce((v_clase.puntajes->>v_casa_objetivo)::integer, 0) + v_puntos_efectivos);

  update hechi.clases
  set puntajes = puntajes || jsonb_build_object(v_casa_objetivo, v_nuevos_puntos),
      casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos_efectivos, v_casa_objetivo, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;


create or replace function hechi.intercambiar_alumnos(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_origen_id uuid, p_destino_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_origen hechi.alumnos%rowtype;
  v_destino hechi.alumnos%rowtype;
  v_puntos_origen integer;
  v_puntos_destino integer;
begin
  if p_numero <> 6 then
    raise exception 'Carta de intercambio invalida';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'Debes elegir dos alumnos diferentes';
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

  select * into v_origen from hechi.alumnos where id = p_origen_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Alumno origen no encontrado';
  end if;

  select * into v_destino from hechi.alumnos where id = p_destino_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Alumno destino no encontrado';
  end if;

  if v_origen.casa_id <> v_alumno.casa_id then
    raise exception 'Solo puedes intercambiarte tu o elegir a alguien de tu casa';
  end if;
  if v_destino.casa_id = v_alumno.casa_id then
    raise exception 'El segundo alumno debe ser de otra casa';
  end if;
  if v_clase.casa_protegida is not null and (v_origen.casa_id = v_clase.casa_protegida or v_destino.casa_id = v_clase.casa_protegida) then
    raise exception 'Una de las casas esta protegida por Expecto Patronus';
  end if;

  v_puntos_origen := greatest(0, coalesce((v_clase.puntajes->>v_origen.casa_id)::integer, 0) - v_origen.puntos + v_destino.puntos);
  v_puntos_destino := greatest(0, coalesce((v_clase.puntajes->>v_destino.casa_id)::integer, 0) - v_destino.puntos + v_origen.puntos);

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      updated_at = now()
  where id = v_alumno.id;

  update hechi.alumnos
  set casa_id = case
        when id = v_origen.id then v_destino.casa_id
        when id = v_destino.id then v_origen.casa_id
        else casa_id
      end,
      updated_at = now()
  where id in (v_origen.id, v_destino.id);

  update hechi.clases
  set puntajes = puntajes || jsonb_build_object(v_origen.casa_id, v_puntos_origen, v_destino.casa_id, v_puntos_destino),
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, 0, v_destino.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;


create or replace function hechi.intercambiar_puntos_alumnos(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_objetivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_objetivo hechi.alumnos%rowtype;
  v_es_lider boolean;
  v_nuevo_alumno integer;
  v_nuevo_objetivo integer;
  v_delta_alumno integer;
  v_delta_objetivo integer;
  v_puntaje_casa_alumno integer;
  v_puntaje_casa_objetivo integer;
begin
  if p_numero <> 4 then
    raise exception 'Carta de intercambio de puntos invalida';
  end if;
  if p_alumno_id = p_objetivo_id then
    raise exception 'Debes elegir otro alumno';
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

  select * into v_objetivo from hechi.alumnos where id = p_objetivo_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Alumno objetivo no encontrado';
  end if;

  select not exists (
    select 1 from hechi.alumnos
    where clase_id = v_clase.id
      and id <> v_alumno.id
      and puntos >= v_alumno.puntos
  ) into v_es_lider;

  if v_es_lider then
    v_nuevo_alumno := v_alumno.puntos + v_objetivo.puntos;
    v_nuevo_objetivo := 0;
  else
    v_nuevo_alumno := v_objetivo.puntos;
    v_nuevo_objetivo := v_alumno.puntos;
  end if;

  v_delta_alumno := v_nuevo_alumno - v_alumno.puntos;
  v_delta_objetivo := v_nuevo_objetivo - v_objetivo.puntos;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      puntos = v_nuevo_alumno,
      updated_at = now()
  where id = v_alumno.id;

  update hechi.alumnos
  set puntos = v_nuevo_objetivo,
      updated_at = now()
  where id = v_objetivo.id;

  if v_alumno.casa_id = v_objetivo.casa_id then
    v_puntaje_casa_alumno := greatest(0, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + v_delta_alumno + v_delta_objetivo);
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_casa_alumno),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  else
    v_puntaje_casa_alumno := greatest(0, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + v_delta_alumno);
    v_puntaje_casa_objetivo := greatest(0, coalesce((v_clase.puntajes->>v_objetivo.casa_id)::integer, 0) + v_delta_objetivo);
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_casa_alumno, v_objetivo.casa_id, v_puntaje_casa_objetivo),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  end if;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_delta_alumno, v_objetivo.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;


create or replace function hechi.sumar_puntos_companero(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_companero_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_companero hechi.alumnos%rowtype;
  v_puntos integer := 2;
  v_consumir_multiplicador boolean := false;
  v_puntaje_alumno integer;
  v_puntaje_companero integer;
begin
  if p_numero <> 16 then
    raise exception 'Carta de companero invalida';
  end if;
  if p_alumno_id = p_companero_id then
    raise exception 'Debes elegir otro companero';
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

  select * into v_companero from hechi.alumnos where id = p_companero_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Companero no encontrado';
  end if;

  if v_clase.casa_multiplicador = v_alumno.casa_id then
    v_puntos := 4;
    v_consumir_multiplicador := true;
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      puntos = puntos + v_puntos,
      updated_at = now()
  where id = v_alumno.id;

  update hechi.alumnos
  set puntos = puntos + v_puntos,
      updated_at = now()
  where id = v_companero.id;

  if v_alumno.casa_id = v_companero.casa_id then
    v_puntaje_alumno := coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + (v_puntos * 2);
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_alumno),
        casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  else
    v_puntaje_alumno := coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + v_puntos;
    v_puntaje_companero := coalesce((v_clase.puntajes->>v_companero.casa_id)::integer, 0) + v_puntos;
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_alumno, v_companero.casa_id, v_puntaje_companero),
        casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  end if;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos, v_companero.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;


create or replace function hechi.reiniciar_clase(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  delete from hechi.participaciones where clase_id = v_clase.id;
  delete from hechi.solicitudes where clase_id = v_clase.id;
  delete from hechi.alumnos where clase_id = v_clase.id;
  update hechi.clases
  set puntajes = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb,
      casa_protegida = null,
      casa_multiplicador = null,
      sobre_activo = 0,
      updated_at = now()
  where id = v_clase.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.eliminar_clase(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  delete from hechi.clases where id = v_clase.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on all tables in schema hechi from anon, authenticated;
grant execute on all functions in schema hechi to anon, authenticated;
alter default privileges in schema hechi grant execute on functions to anon, authenticated;