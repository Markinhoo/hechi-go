-- Legendary bestiary creatures grant one pending card choice each.

alter table hechi.alumnos
  add column if not exists elecciones_legendarias integer not null default 0;

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

create or replace function hechi.comprar_bestia(p_token text, p_alumno_id uuid, p_password text, p_bestia_id text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_precio integer;
begin
  v_precio := case p_bestia_id
    when 'bowtruckle' then 30
    when 'doxy' then 30
    when 'duendecillo' then 30
    when 'elfo' then 30
    when 'lechuza' then 30
    when 'acromantula' then 60
    when 'centauro' then 60
    when 'demiguise' then 60
    when 'dugbog' then 60
    when 'escarbato' then 60
    when 'fwooper' then 60
    when 'grindylow' then 60
    when 'basilisco' then 90
    when 'cerbero' then 90
    when 'dementor' then 90
    when 'gigante' then 90
    when 'hipogrifo' then 90
    when 'hombre-lobo' then 90
    when 'inferi' then 90
    when 'thestral' then 90
    when 'dragon' then 140
    when 'fenix' then 140
    when 'troll' then 140
    when 'unicornio' then 140
    else null
  end;

  if v_precio is null then
    raise exception 'Bestia no encontrada';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
  if not found or v_alumno.password <> p_password then
    raise exception 'Credenciales de alumno incorrectas';
  end if;

  if v_alumno.bestiario ? p_bestia_id then
    raise exception 'Ya tienes esta bestia en tu Bestiario Magico';
  end if;

  if v_alumno.galeones < v_precio then
    raise exception 'No tienes suficientes galeones';
  end if;

  update hechi.alumnos
  set galeones = galeones - v_precio,
      bestiario = bestiario || jsonb_build_array(p_bestia_id),
      elecciones_legendarias = elecciones_legendarias + case when p_bestia_id in ('dragon','fenix','troll','unicornio') then 1 else 0 end,
      updated_at = now()
  where id = v_alumno.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.consumir_eleccion_legendaria(p_token text, p_alumno_id uuid, p_password text)
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

  if v_alumno.oportunidades <= 0 then
    raise exception 'Necesitas autorizacion del maestro para abrir carta';
  end if;

  if v_alumno.elecciones_legendarias <= 0 then
    raise exception 'No tienes elecciones legendarias pendientes';
  end if;

  update hechi.alumnos
  set elecciones_legendarias = elecciones_legendarias - 1,
      updated_at = now()
  where id = v_alumno.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.reiniciar_bestiario_galeones(p_token text)
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

  select * into v_clase
  from hechi.clases
  where token = upper(trim(p_token)) and created_by = auth.uid();

  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  update hechi.alumnos
  set galeones = 0,
      bestiario = '[]'::jsonb,
      elecciones_legendarias = 0,
      updated_at = now()
  where clase_id = v_clase.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.comprar_bestia(text, uuid, text, text) to anon, authenticated;
grant execute on function hechi.consumir_eleccion_legendaria(text, uuid, text) to anon, authenticated;
grant execute on function hechi.reiniciar_bestiario_galeones(text) to authenticated;
