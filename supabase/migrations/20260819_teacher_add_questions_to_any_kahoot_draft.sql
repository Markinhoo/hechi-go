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
      v_es_maestro
      or creator_alumno_id = v_alumno.id
    )
  order by updated_at desc, created_at desc
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

grant execute on function hechi.kahoot_crear_pregunta(text, uuid, text, text, text, text, text, text, text) to anon, authenticated;
