-- Incremental migration for Expecto Patronus protection + x2.
-- Safe for an existing HECHI GO database: it does not drop class/student tables.

alter table hechi.clases
  add column if not exists casa_protegida text;

alter table hechi.clases
  add column if not exists casa_multiplicador text;

alter table hechi.clases
  drop constraint if exists clases_casa_protegida_check;

alter table hechi.clases
  add constraint clases_casa_protegida_check
  check (casa_protegida is null or casa_protegida in ('gryffindor','slytherin','ravenclaw','hufflepuff'));

alter table hechi.clases
  drop constraint if exists clases_casa_multiplicador_check;

alter table hechi.clases
  add constraint clases_casa_multiplicador_check
  check (casa_multiplicador is null or casa_multiplicador in ('gryffindor','slytherin','ravenclaw','hufflepuff'));

alter table hechi.participaciones
  add column if not exists casa_objetivo text;

alter table hechi.participaciones
  drop constraint if exists participaciones_puntos_check;

alter table hechi.participaciones
  add constraint participaciones_puntos_check check (puntos between -100 and 100);

alter table hechi.participaciones
  drop constraint if exists participaciones_casa_objetivo_check;

alter table hechi.participaciones
  add constraint participaciones_casa_objetivo_check
  check (casa_objetivo is null or casa_objetivo in ('gryffindor','slytherin','ravenclaw','hufflepuff'));

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
