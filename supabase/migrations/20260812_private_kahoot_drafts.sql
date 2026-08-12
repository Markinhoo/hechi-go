alter table hechi.kahoots
  add column if not exists creator_alumno_id uuid references hechi.alumnos(id) on delete set null,
  add column if not exists creator_user_id uuid,
  add column if not exists creador_nombre text;

create index if not exists hechi_kahoots_creator_alumno_idx on hechi.kahoots(clase_id, creator_alumno_id, created_at desc);
create index if not exists hechi_kahoots_creator_user_idx on hechi.kahoots(clase_id, creator_user_id, created_at desc);

create or replace function hechi.kahoot_estado(p_clase_id uuid, p_alumno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_es_maestro boolean := false;
  v_kahoot_id uuid;
begin
  select exists(
    select 1
    from hechi.clases c
    where c.id = p_clase_id and c.created_by = auth.uid()
  ) into v_es_maestro;

  select k.id into v_kahoot_id
  from hechi.kahoots k
  where k.clase_id = p_clase_id and k.estado = 'activa'
  order by k.updated_at desc, k.created_at desc
  limit 1;

  if v_kahoot_id is null and v_es_maestro then
    select k.id into v_kahoot_id
    from hechi.kahoots k
    where k.clase_id = p_clase_id and k.estado = 'borrador'
    order by k.updated_at desc, k.created_at desc
    limit 1;
  end if;

  if v_kahoot_id is null and p_alumno_id is not null then
    select k.id into v_kahoot_id
    from hechi.kahoots k
    where k.clase_id = p_clase_id
      and k.estado = 'borrador'
      and k.creator_alumno_id = p_alumno_id
    order by k.updated_at desc, k.created_at desc
    limit 1;
  end if;

  if v_kahoot_id is null then
    select k.id into v_kahoot_id
    from hechi.kahoots k
    where k.clase_id = p_clase_id and k.estado = 'finalizada'
    order by k.updated_at desc, k.created_at desc
    limit 1;
  end if;

  if v_kahoot_id is null then
    return null::jsonb;
  end if;

  return (
    select jsonb_build_object(
      'id', k.id,
      'estado', k.estado,
      'preguntaActual', k.pregunta_actual,
      'iniciadaAt', k.iniciada_at,
      'finalizadaAt', k.finalizada_at,
      'creadorAlumnoId', k.creator_alumno_id,
      'creadorUserId', k.creator_user_id,
      'creadorNombre', k.creador_nombre,
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
    from hechi.kahoots k
    where k.id = v_kahoot_id
  );
end;
$$;

create or replace function hechi.kahoot_estado(p_clase_id uuid)
returns jsonb
language sql
security definer
set search_path = hechi, public, pg_catalog
as $$
  select hechi.kahoot_estado(p_clase_id, null::uuid);
$$;

create or replace function hechi.estado_clase_vista(p_clase_id uuid, p_alumno_id uuid default null)
returns jsonb
language sql
security definer
set search_path = hechi, public, pg_catalog
as $$
  select hechi.estado_clase(p_clase_id) || jsonb_build_object('kahoot', hechi.kahoot_estado(p_clase_id, p_alumno_id));
$$;

create or replace function hechi.cargar_clase_vista(p_token text, p_alumno_id uuid default null, p_password text default null)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token));
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  if p_alumno_id is not null then
    select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
    if not found or v_alumno.password <> p_password then
      raise exception 'Credenciales de alumno incorrectas';
    end if;
  end if;

  return hechi.estado_clase_vista(v_clase.id, p_alumno_id);
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
  v_creador_nombre text;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  v_es_maestro := p_alumno_id is null and auth.uid() is not null and v_clase.created_by = auth.uid();
  if v_es_maestro then
    v_creador_nombre := 'Maestro';
  else
    select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
    if not found or v_alumno.password <> p_password then
      raise exception 'Credenciales de alumno incorrectas';
    end if;
    v_creador_nombre := v_alumno.nombre;
  end if;

  if length(trim(coalesce(p_pregunta, ''))) < 5 then
    raise exception 'Escribe una pregunta más completa';
  end if;
  if p_correcta not in ('a','b','c','d') then
    raise exception 'Elige la respuesta correcta';
  end if;
  if exists(select 1 from hechi.kahoots where clase_id = v_clase.id and estado = 'activa') then
    raise exception 'Termina el Kahoot activo antes de agregar preguntas';
  end if;

  select id into v_kahoot_id
  from hechi.kahoots
  where clase_id = v_clase.id
    and estado = 'borrador'
    and (
      (v_es_maestro and creator_user_id = auth.uid())
      or (not v_es_maestro and creator_alumno_id = v_alumno.id)
    )
  order by created_at desc
  limit 1;

  if v_kahoot_id is null then
    insert into hechi.kahoots(clase_id, creator_user_id, creator_alumno_id, creador_nombre)
    values (v_clase.id, case when v_es_maestro then auth.uid() else null end, case when v_es_maestro then null else v_alumno.id end, v_creador_nombre)
    returning id into v_kahoot_id;
  end if;

  select coalesce(max(orden), -1) + 1 into v_orden
  from hechi.kahoot_preguntas
  where kahoot_id = v_kahoot_id;

  insert into hechi.kahoot_preguntas(kahoot_id, pregunta, opcion_a, opcion_b, opcion_c, opcion_d, correcta, orden)
  values (v_kahoot_id, trim(p_pregunta), trim(p_opcion_a), trim(p_opcion_b), trim(p_opcion_c), trim(p_opcion_d), p_correcta, v_orden);

  update hechi.kahoots set updated_at = now() where id = v_kahoot_id;

  return hechi.estado_clase_vista(v_clase.id, case when v_es_maestro then null else v_alumno.id end);
end;
$$;

create or replace function hechi.kahoot_modificar_pregunta(p_token text, p_alumno_id uuid, p_password text, p_pregunta_id uuid, p_pregunta text, p_opcion_a text, p_opcion_b text, p_opcion_c text, p_opcion_d text, p_correcta text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_kahoot hechi.kahoots%rowtype;
  v_es_maestro boolean := false;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  v_es_maestro := p_alumno_id is null and auth.uid() is not null and v_clase.created_by = auth.uid();
  if not v_es_maestro then
    select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
    if not found or v_alumno.password <> p_password then
      raise exception 'Credenciales de alumno incorrectas';
    end if;
  end if;

  select k.* into v_kahoot
  from hechi.kahoots k
  join hechi.kahoot_preguntas p on p.kahoot_id = k.id
  where p.id = p_pregunta_id and k.clase_id = v_clase.id and k.estado = 'borrador'
  limit 1;
  if not found then
    raise exception 'Pregunta no encontrada o Kahoot ya iniciado';
  end if;
  if not v_es_maestro and v_kahoot.creator_alumno_id is distinct from v_alumno.id then
    raise exception 'Solo el creador puede modificar este Kahoot';
  end if;
  if length(trim(coalesce(p_pregunta, ''))) < 5 then
    raise exception 'Escribe una pregunta más completa';
  end if;
  if p_correcta not in ('a','b','c','d') then
    raise exception 'Elige la respuesta correcta';
  end if;

  update hechi.kahoot_preguntas
  set pregunta = trim(p_pregunta),
      opcion_a = trim(p_opcion_a),
      opcion_b = trim(p_opcion_b),
      opcion_c = trim(p_opcion_c),
      opcion_d = trim(p_opcion_d),
      correcta = p_correcta
  where id = p_pregunta_id;

  update hechi.kahoots set updated_at = now() where id = v_kahoot.id;
  return hechi.estado_clase_vista(v_clase.id, case when v_es_maestro then null else v_alumno.id end);
end;
$$;

create or replace function hechi.kahoot_eliminar_pregunta(p_token text, p_alumno_id uuid, p_password text, p_pregunta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_kahoot hechi.kahoots%rowtype;
  v_es_maestro boolean := false;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  v_es_maestro := p_alumno_id is null and auth.uid() is not null and v_clase.created_by = auth.uid();
  if not v_es_maestro then
    select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
    if not found or v_alumno.password <> p_password then
      raise exception 'Credenciales de alumno incorrectas';
    end if;
  end if;

  select k.* into v_kahoot
  from hechi.kahoots k
  join hechi.kahoot_preguntas p on p.kahoot_id = k.id
  where p.id = p_pregunta_id and k.clase_id = v_clase.id and k.estado = 'borrador'
  limit 1;
  if not found then
    raise exception 'Pregunta no encontrada o Kahoot ya iniciado';
  end if;
  if not v_es_maestro and v_kahoot.creator_alumno_id is distinct from v_alumno.id then
    raise exception 'Solo el creador puede eliminar preguntas de este Kahoot';
  end if;

  delete from hechi.kahoot_preguntas where id = p_pregunta_id;
  update hechi.kahoots set updated_at = now() where id = v_kahoot.id;
  return hechi.estado_clase_vista(v_clase.id, case when v_es_maestro then null else v_alumno.id end);
end;
$$;

create or replace function hechi.kahoot_reiniciar(p_token text, p_alumno_id uuid default null, p_password text default null)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_kahoot hechi.kahoots%rowtype;
  v_es_maestro boolean := false;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  v_es_maestro := p_alumno_id is null and auth.uid() is not null and v_clase.created_by = auth.uid();
  if not v_es_maestro then
    select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
    if not found or v_alumno.password <> p_password then
      raise exception 'Credenciales de alumno incorrectas';
    end if;
  end if;

  select * into v_kahoot
  from hechi.kahoots
  where clase_id = v_clase.id
    and (
      (v_es_maestro and estado in ('borrador','activa'))
      or (not v_es_maestro and estado = 'borrador' and creator_alumno_id = v_alumno.id)
    )
  order by updated_at desc, created_at desc
  limit 1;
  if not found then
    raise exception 'No hay Kahoot para reiniciar';
  end if;

  delete from hechi.kahoot_respuestas where kahoot_id = v_kahoot.id;
  delete from hechi.kahoot_preguntas where kahoot_id = v_kahoot.id;
  update hechi.kahoots
  set estado = 'borrador', pregunta_actual = 0, iniciada_at = null, finalizada_at = null, updated_at = now()
  where id = v_kahoot.id;

  return hechi.estado_clase_vista(v_clase.id, case when v_es_maestro then null else v_alumno.id end);
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
  order by updated_at desc, created_at desc
  limit 1;

  if not found then
    raise exception 'Primero crea preguntas';
  end if;

  select count(*) into v_total from hechi.kahoot_preguntas where kahoot_id = v_kahoot.id;
  if v_total = 0 then
    raise exception 'Primero crea preguntas';
  end if;

  update hechi.kahoots
  set estado = 'activa', pregunta_actual = 0, iniciada_at = now(), finalizada_at = null, updated_at = now()
  where id = v_kahoot.id;

  return hechi.estado_clase_vista(v_clase.id, null);
end;
$$;

grant execute on function hechi.kahoot_estado(uuid) to anon, authenticated;
grant execute on function hechi.kahoot_estado(uuid, uuid) to anon, authenticated;
grant execute on function hechi.estado_clase_vista(uuid, uuid) to anon, authenticated;
grant execute on function hechi.cargar_clase_vista(text, uuid, text) to anon, authenticated;
grant execute on function hechi.kahoot_modificar_pregunta(text, uuid, text, uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function hechi.kahoot_eliminar_pregunta(text, uuid, text, uuid) to anon, authenticated;
grant execute on function hechi.kahoot_reiniciar(text, uuid, text) to anon, authenticated;
