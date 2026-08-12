-- Camera flash signals for opened cards and selected students.

alter table hechi.alumnos
  add column if not exists flash_signal integer not null default 0;

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
  v_puntajes jsonb;
begin
  select * into v_clase from hechi.clases where id = p_clase_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  v_puntajes := jsonb_build_object(
    'gryffindor', coalesce((v_clase.puntajes_positivos->>'gryffindor')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'gryffindor')::integer, 0),
    'slytherin', coalesce((v_clase.puntajes_positivos->>'slytherin')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'slytherin')::integer, 0),
    'ravenclaw', coalesce((v_clase.puntajes_positivos->>'ravenclaw')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'ravenclaw')::integer, 0),
    'hufflepuff', coalesce((v_clase.puntajes_positivos->>'hufflepuff')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'hufflepuff')::integer, 0)
  );

  select jsonb_build_object(
    'gryffindor', count(*) filter (where casa_id = 'gryffindor'),
    'slytherin', count(*) filter (where casa_id = 'slytherin'),
    'ravenclaw', count(*) filter (where casa_id = 'ravenclaw'),
    'hufflepuff', count(*) filter (where casa_id = 'hufflepuff')
  ) into v_conteos
  from hechi.alumnos
  where clase_id = p_clase_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'nombre', a.nombre,
    'casaId', a.casa_id,
    'puntos', a.puntos,
    'puntosPositivos', coalesce(p.resumen_positivos, greatest(a.puntos, 0)),
    'puntosNegativos', coalesce(p.resumen_negativos, 0),
    'cartas', a.cartas,
    'cartasGuardadas', a.cartas_guardadas,
    'galeones', a.galeones,
    'bestiario', a.bestiario,
    'eleccionesLegendarias', a.elecciones_legendarias,
    'flashSignal', a.flash_signal,
    'oportunidades', a.oportunidades
  ) order by a.puntos desc, a.created_at), '[]'::jsonb)
  into v_alumnos
  from hechi.alumnos a
  left join (
    select
      alumno_id,
      sum(greatest(puntos, 0))::integer as resumen_positivos,
      sum(greatest(-puntos, 0))::integer as resumen_negativos
    from hechi.participaciones
    where clase_id = p_clase_id
    group by alumno_id
  ) p on p.alumno_id = a.id
  where a.clase_id = p_clase_id;

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
    limit 100
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
    'puntajes', v_puntajes,
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

create or replace function hechi.marcar_flash_alumnos_elegidos(p_token text, p_alumno_id uuid, p_password text, p_objetivo_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
begin
  if coalesce(array_length(p_objetivo_ids, 1), 0) = 0 then
    raise exception 'No hay alumnos para marcar';
  end if;

  if coalesce(array_length(p_objetivo_ids, 1), 0) > 5 then
    raise exception 'Demasiados alumnos seleccionados';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
  if not found or v_alumno.password <> p_password then
    raise exception 'Credenciales de alumno incorrectas';
  end if;

  update hechi.alumnos
  set flash_signal = flash_signal + 1,
      updated_at = now()
  where clase_id = v_clase.id
    and id = any(p_objetivo_ids);

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.marcar_flash_alumnos_elegidos(text, uuid, text, uuid[]) to anon, authenticated;
