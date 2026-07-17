-- Incremental migration for positive/negative/effective house scoreboards and Elixir de Vida.
-- Safe for existing HECHI GO data.

alter table hechi.clases
  add column if not exists puntajes_positivos jsonb not null default '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb;

alter table hechi.clases
  add column if not exists puntajes_negativos jsonb not null default '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb;

update hechi.clases
set puntajes_positivos = case
      when puntajes_positivos = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb then puntajes
      else puntajes_positivos
    end,
    puntajes_negativos = coalesce(puntajes_negativos, '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb);

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
    'cartasGuardadas', cartas_guardadas,
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
    'puntajesPositivos', v_clase.puntajes_positivos,
    'puntajesNegativos', v_clase.puntajes_negativos,
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

drop function if exists hechi.abrir_carta(text, uuid, text, integer, integer, text, text);
drop function if exists hechi.abrir_carta(text, uuid, text, integer, integer, text, text, text);

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
  v_positivos integer;
  v_negativos integer;
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

  if p_numero = 17 then
    v_casa_objetivo := v_alumno.casa_id;
    v_positivos := coalesce((v_clase.puntajes_positivos->>v_casa_objetivo)::integer, coalesce((v_clase.puntajes->>v_casa_objetivo)::integer, 0));
    v_negativos := floor(coalesce((v_clase.puntajes_negativos->>v_casa_objetivo)::integer, 0) / 2.0)::integer;

    update hechi.alumnos
    set oportunidades = oportunidades - 1,
        cartas = array_append(cartas, p_numero),
        updated_at = now()
    where id = v_alumno.id;

    update hechi.clases
    set puntajes_negativos = puntajes_negativos || jsonb_build_object(v_casa_objetivo, v_negativos),
        puntajes = puntajes || jsonb_build_object(v_casa_objetivo, v_positivos - v_negativos),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;

    insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
    values (v_clase.id, v_alumno.id, p_numero, 0, v_casa_objetivo, p_titulo, p_descripcion);

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
      cartas_guardadas = case when p_numero = 18 then cartas_guardadas || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'numero', p_numero, 'titulo', p_titulo, 'descripcion', p_descripcion, 'createdAt', now())) else cartas_guardadas end,
      updated_at = now()
  where id = v_alumno.id;

  v_positivos := coalesce((v_clase.puntajes_positivos->>v_casa_objetivo)::integer, coalesce((v_clase.puntajes->>v_casa_objetivo)::integer, 0));
  v_negativos := coalesce((v_clase.puntajes_negativos->>v_casa_objetivo)::integer, 0);

  if v_puntos_efectivos >= 0 then
    v_positivos := v_positivos + v_puntos_efectivos;
  else
    v_negativos := v_negativos + abs(v_puntos_efectivos);
  end if;

  update hechi.clases
  set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_casa_objetivo, v_positivos),
      puntajes_negativos = puntajes_negativos || jsonb_build_object(v_casa_objetivo, v_negativos),
      puntajes = puntajes || jsonb_build_object(v_casa_objetivo, v_positivos - v_negativos),
      casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos_efectivos, v_casa_objetivo, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

drop function if exists hechi.intercambiar_alumnos(text, uuid, text, integer, text, text, uuid, uuid);

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
  v_positivos_origen integer;
  v_positivos_destino integer;
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

  v_positivos_origen := greatest(0, coalesce((v_clase.puntajes_positivos->>v_origen.casa_id)::integer, coalesce((v_clase.puntajes->>v_origen.casa_id)::integer, 0)) - v_origen.puntos + v_destino.puntos);
  v_positivos_destino := greatest(0, coalesce((v_clase.puntajes_positivos->>v_destino.casa_id)::integer, coalesce((v_clase.puntajes->>v_destino.casa_id)::integer, 0)) - v_destino.puntos + v_origen.puntos);
  v_puntos_origen := v_positivos_origen - coalesce((v_clase.puntajes_negativos->>v_origen.casa_id)::integer, 0);
  v_puntos_destino := v_positivos_destino - coalesce((v_clase.puntajes_negativos->>v_destino.casa_id)::integer, 0);

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
  set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_origen.casa_id, v_positivos_origen, v_destino.casa_id, v_positivos_destino),
      puntajes = puntajes || jsonb_build_object(v_origen.casa_id, v_puntos_origen, v_destino.casa_id, v_puntos_destino),
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, 0, v_destino.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

drop function if exists hechi.intercambiar_puntos_alumnos(text, uuid, text, integer, text, text, uuid);

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
  v_positivo_casa_alumno integer;
  v_positivo_casa_objetivo integer;
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
    v_positivo_casa_alumno := greatest(0, coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0)) + v_delta_alumno + v_delta_objetivo);
    v_puntaje_casa_alumno := v_positivo_casa_alumno - coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0);
    update hechi.clases
    set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivo_casa_alumno),
        puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_casa_alumno),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  else
    v_positivo_casa_alumno := greatest(0, coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0)) + v_delta_alumno);
    v_positivo_casa_objetivo := greatest(0, coalesce((v_clase.puntajes_positivos->>v_objetivo.casa_id)::integer, coalesce((v_clase.puntajes->>v_objetivo.casa_id)::integer, 0)) + v_delta_objetivo);
    v_puntaje_casa_alumno := v_positivo_casa_alumno - coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0);
    v_puntaje_casa_objetivo := v_positivo_casa_objetivo - coalesce((v_clase.puntajes_negativos->>v_objetivo.casa_id)::integer, 0);
    update hechi.clases
    set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivo_casa_alumno, v_objetivo.casa_id, v_positivo_casa_objetivo),
        puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_casa_alumno, v_objetivo.casa_id, v_puntaje_casa_objetivo),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  end if;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_delta_alumno, v_objetivo.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

drop function if exists hechi.sumar_puntos_companero(text, uuid, text, integer, text, text, uuid);

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
  v_positivo_alumno integer;
  v_positivo_companero integer;
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
    v_positivo_alumno := coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0)) + (v_puntos * 2);
    v_puntaje_alumno := v_positivo_alumno - coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0);
    update hechi.clases
    set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivo_alumno),
        puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_alumno),
        casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  else
    v_positivo_alumno := coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0)) + v_puntos;
    v_positivo_companero := coalesce((v_clase.puntajes_positivos->>v_companero.casa_id)::integer, coalesce((v_clase.puntajes->>v_companero.casa_id)::integer, 0)) + v_puntos;
    v_puntaje_alumno := v_positivo_alumno - coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0);
    v_puntaje_companero := v_positivo_companero - coalesce((v_clase.puntajes_negativos->>v_companero.casa_id)::integer, 0);
    update hechi.clases
    set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivo_alumno, v_companero.casa_id, v_positivo_companero),
        puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_alumno, v_companero.casa_id, v_puntaje_companero),
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

grant execute on function hechi.abrir_carta(text, uuid, text, integer, integer, text, text, text) to anon, authenticated;
grant execute on function hechi.intercambiar_alumnos(text, uuid, text, integer, text, text, uuid, uuid) to anon, authenticated;
grant execute on function hechi.intercambiar_puntos_alumnos(text, uuid, text, integer, text, text, uuid) to anon, authenticated;
grant execute on function hechi.sumar_puntos_companero(text, uuid, text, integer, text, text, uuid) to anon, authenticated;
