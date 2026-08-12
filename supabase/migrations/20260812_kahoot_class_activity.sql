-- Kahoot-style class activity: shared questions, timed answers, result charts, and card-opportunity awards.

create table if not exists hechi.kahoots (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  estado text not null default 'borrador' check (estado in ('borrador','activa','finalizada')),
  pregunta_actual integer not null default 0,
  iniciada_at timestamptz,
  finalizada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hechi.kahoot_preguntas (
  id uuid primary key default gen_random_uuid(),
  kahoot_id uuid not null references hechi.kahoots(id) on delete cascade,
  pregunta text not null,
  opcion_a text not null,
  opcion_b text not null,
  opcion_c text not null,
  opcion_d text not null,
  correcta text not null check (correcta in ('a','b','c','d')),
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists hechi.kahoot_respuestas (
  id uuid primary key default gen_random_uuid(),
  kahoot_id uuid not null references hechi.kahoots(id) on delete cascade,
  pregunta_id uuid not null references hechi.kahoot_preguntas(id) on delete cascade,
  alumno_id uuid not null references hechi.alumnos(id) on delete cascade,
  opcion text not null check (opcion in ('a','b','c','d')),
  correcta boolean not null default false,
  tiempo_ms integer not null default 0,
  created_at timestamptz not null default now(),
  unique (pregunta_id, alumno_id)
);

create index if not exists hechi_kahoots_clase_idx on hechi.kahoots(clase_id, created_at desc);
create index if not exists hechi_kahoot_preguntas_kahoot_idx on hechi.kahoot_preguntas(kahoot_id, orden);
create index if not exists hechi_kahoot_respuestas_pregunta_idx on hechi.kahoot_respuestas(pregunta_id, created_at);

alter table hechi.kahoots enable row level security;
alter table hechi.kahoot_preguntas enable row level security;
alter table hechi.kahoot_respuestas enable row level security;

drop function if exists hechi.kahoot_estado(uuid);

create or replace function hechi.kahoot_estado(p_clase_id uuid)
returns jsonb
language sql
security definer
set search_path = hechi, public, pg_catalog
as $$
  with actual as (
    select *
    from hechi.kahoots
    where clase_id = p_clase_id
    order by created_at desc
    limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'id', k.id,
      'estado', k.estado,
      'preguntaActual', k.pregunta_actual,
      'iniciadaAt', k.iniciada_at,
      'finalizadaAt', k.finalizada_at,
      'preguntas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'pregunta', p.pregunta,
          'opciones', jsonb_build_object('a', p.opcion_a, 'b', p.opcion_b, 'c', p.opcion_c, 'd', p.opcion_d),
          'correcta', p.correcta,
          'orden', p.orden,
          'respuestas', coalesce((
            select jsonb_agg(jsonb_build_object(
              'alumnoId', r.alumno_id,
              'alumno', a.nombre,
              'casaId', a.casa_id,
              'opcion', r.opcion,
              'correcta', r.correcta,
              'tiempoMs', r.tiempo_ms
            ) order by r.created_at)
            from hechi.kahoot_respuestas r
            join hechi.alumnos a on a.id = r.alumno_id
            where r.pregunta_id = p.id
          ), '[]'::jsonb)
        ) order by p.orden, p.created_at)
        from hechi.kahoot_preguntas p
        where p.kahoot_id = k.id
      ), '[]'::jsonb)
    )
    from actual k
  ), null::jsonb);
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
    'sobreActivo', v_clase.sobre_activo,
    'kahoot', hechi.kahoot_estado(v_clase.id)
  );
end;
$$;

create or replace function hechi.kahoot_crear_pregunta(p_token text, p_alumno_id uuid, p_password text, p_pregunta text, p_opcion_a text, p_opcion_b text, p_opcion_c text, p_opcion_d text, p_correcta text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_kahoot_id uuid;
  v_orden integer;
  v_es_maestro boolean := false;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  v_es_maestro := auth.uid() is not null and v_clase.created_by = auth.uid();
  if not v_es_maestro then
    select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
    if not found or v_alumno.password <> p_password then
      raise exception 'Credenciales de alumno incorrectas';
    end if;
  end if;

  if length(trim(coalesce(p_pregunta, ''))) < 5 then
    raise exception 'Escribe una pregunta más completa';
  end if;
  if p_correcta not in ('a','b','c','d') then
    raise exception 'Elige la respuesta correcta';
  end if;

  select id into v_kahoot_id
  from hechi.kahoots
  where clase_id = v_clase.id and estado = 'borrador'
  order by created_at desc
  limit 1;

  if v_kahoot_id is null then
    insert into hechi.kahoots(clase_id) values (v_clase.id) returning id into v_kahoot_id;
  end if;

  select coalesce(max(orden), -1) + 1 into v_orden
  from hechi.kahoot_preguntas
  where kahoot_id = v_kahoot_id;

  insert into hechi.kahoot_preguntas(kahoot_id, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, correcta, orden)
  values (v_kahoot_id, trim(p_pregunta), trim(p_opcion_a), trim(p_opcion_b), trim(p_opcion_c), trim(p_opcion_d), p_correcta, v_orden);

  update hechi.kahoots set updated_at = now() where id = v_kahoot_id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.kahoot_iniciar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_kahoot hechi.kahoots%rowtype;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  select * into v_kahoot
  from hechi.kahoots
  where clase_id = v_clase.id and estado = 'borrador'
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Primero crea preguntas';
  end if;

  select count(*) into v_total from hechi.kahoot_preguntas where kahoot_id = v_kahoot.id;
  if v_total = 0 then
    raise exception 'Primero crea preguntas';
  end if;

  update hechi.kahoots
  set estado = 'activa', pregunta_actual = 0, iniciada_at = now(), updated_at = now()
  where id = v_kahoot.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.kahoot_responder(p_token text, p_alumno_id uuid, p_password text, p_pregunta_id uuid, p_opcion text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_kahoot hechi.kahoots%rowtype;
  v_pregunta hechi.kahoot_preguntas%rowtype;
  v_tiempo integer;
begin
  if p_opcion not in ('a','b','c','d') then
    raise exception 'Elige una opción válida';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
  if not found or v_alumno.password <> p_password then
    raise exception 'Credenciales de alumno incorrectas';
  end if;

  select * into v_kahoot
  from hechi.kahoots
  where clase_id = v_clase.id and estado = 'activa'
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'No hay Kahoot activo';
  end if;

  select * into v_pregunta
  from hechi.kahoot_preguntas
  where id = p_pregunta_id and kahoot_id = v_kahoot.id and orden = v_kahoot.pregunta_actual;
  if not found then
    raise exception 'La pregunta activa cambió';
  end if;

  v_tiempo := greatest(0, floor(extract(epoch from (now() - v_kahoot.iniciada_at)) * 1000)::integer);
  if v_tiempo > 20000 then
    raise exception 'Se acabó el tiempo';
  end if;

  insert into hechi.kahoot_respuestas(kahoot_id, pregunta_id, alumno_id, opcion, correcta, tiempo_ms)
  values (v_kahoot.id, v_pregunta.id, v_alumno.id, p_opcion, p_opcion = v_pregunta.correcta, v_tiempo)
  on conflict (pregunta_id, alumno_id) do nothing;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.kahoot_siguiente_pregunta(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_kahoot hechi.kahoots%rowtype;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;
  select * into v_kahoot from hechi.kahoots where clase_id = v_clase.id and estado = 'activa' order by created_at desc limit 1;
  if not found then
    raise exception 'No hay Kahoot activo';
  end if;
  select count(*) into v_total from hechi.kahoot_preguntas where kahoot_id = v_kahoot.id;
  if v_kahoot.pregunta_actual + 1 >= v_total then
    raise exception 'Ya no hay más preguntas';
  end if;
  update hechi.kahoots
  set pregunta_actual = pregunta_actual + 1, iniciada_at = now(), updated_at = now()
  where id = v_kahoot.id;
  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.kahoot_finalizar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_kahoot hechi.kahoots%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;
  select * into v_kahoot from hechi.kahoots where clase_id = v_clase.id and estado = 'activa' order by created_at desc limit 1;
  if not found then
    raise exception 'No hay Kahoot activo';
  end if;

  with ranking as (
    select
      r.alumno_id,
      sum(case when r.correcta then 1 else 0 end)::integer as aciertos,
      sum(case when r.correcta then r.tiempo_ms else 20000 end)::integer as tiempo,
      row_number() over (
        order by sum(case when r.correcta then 1 else 0 end) desc,
                 sum(case when r.correcta then r.tiempo_ms else 20000 end) asc
      ) as lugar
    from hechi.kahoot_respuestas r
    where r.kahoot_id = v_kahoot.id
    group by r.alumno_id
  ),
  premios as (
    select alumno_id,
           case lugar when 1 then 3 when 2 then 2 when 3 then 1 else 0 end as oportunidades
    from ranking
    where aciertos > 0 and lugar <= 3
  )
  update hechi.alumnos a
  set oportunidades = oportunidades + premios.oportunidades,
      updated_at = now()
  from premios
  where a.id = premios.alumno_id and premios.oportunidades > 0;

  update hechi.kahoots
  set estado = 'finalizada', finalizada_at = now(), updated_at = now()
  where id = v_kahoot.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.kahoot_nueva_actividad(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  update hechi.kahoots
  set estado = 'finalizada', finalizada_at = coalesce(finalizada_at, now()), updated_at = now()
  where clase_id = v_clase.id and estado in ('borrador','activa');

  insert into hechi.kahoots(clase_id) values (v_clase.id);
  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.kahoot_estado(uuid) to anon, authenticated;
grant execute on function hechi.kahoot_crear_pregunta(text, uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function hechi.kahoot_iniciar(text) to authenticated;
grant execute on function hechi.kahoot_responder(text, uuid, text, uuid, text) to anon, authenticated;
grant execute on function hechi.kahoot_siguiente_pregunta(text) to authenticated;
grant execute on function hechi.kahoot_finalizar(text) to authenticated;
grant execute on function hechi.kahoot_nueva_actividad(text) to authenticated;
