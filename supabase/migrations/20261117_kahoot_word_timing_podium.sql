-- Importación de Word, avance controlado por servidor y fotos pequeñas para el podio.
create table if not exists hechi.perfil_fotos (
  alumno_id uuid primary key references hechi.alumnos(id) on delete cascade,
  foto text not null,
  updated_at timestamptz not null default now()
);
alter table hechi.perfil_fotos enable row level security;

-- Conserva fotos si ya se ejecutó la primera versión de esta migración.
do $$ begin
  if to_regclass('hechi.kahoot_fotos_perfil') is not null then
    insert into hechi.perfil_fotos(alumno_id,foto,updated_at)
    select alumno_id,foto,updated_at from hechi.kahoot_fotos_perfil
    on conflict (alumno_id) do nothing;
  end if;
end $$;

create or replace function hechi.perfil_guardar_foto(p_token text, p_alumno_id uuid, p_password text, p_foto text)
returns void language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
begin
  if not exists (
    select 1 from hechi.alumnos a join hechi.clases c on c.id = a.clase_id
    where a.id = p_alumno_id and a.password = p_password and c.token = upper(trim(p_token)) and c.estado = 'activa'
  ) then raise exception 'Credenciales de alumno incorrectas'; end if;
  if p_foto !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' or length(p_foto) > 140000 then
    raise exception 'La foto debe ser JPEG y pesar menos de 100 KB';
  end if;
  insert into hechi.perfil_fotos(alumno_id, foto) values (p_alumno_id, p_foto)
  on conflict (alumno_id) do update set foto = excluded.foto, updated_at = now();
end; $$;

create or replace function hechi.kahoot_listar_fotos(p_token text, p_alumno_id uuid default null, p_password text default null)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_clase hechi.clases%rowtype;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then raise exception 'Clase no encontrada'; end if;
  if auth.uid() is distinct from v_clase.created_by and not exists (
    select 1 from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id and password = p_password
  ) then raise exception 'No autorizado'; end if;
  return coalesce((select jsonb_object_agg(f.alumno_id, f.foto)
    from hechi.perfil_fotos f join hechi.alumnos a on a.id = f.alumno_id
    where a.clase_id = v_clase.id), '{}'::jsonb);
end; $$;

create or replace function hechi.perfil_obtener_foto(p_token text, p_alumno_id uuid, p_password text)
returns text language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_foto text;
begin
  if not exists (select 1 from hechi.alumnos a join hechi.clases c on c.id = a.clase_id
    where a.id = p_alumno_id and a.password = p_password and c.token = upper(trim(p_token)) and c.estado = 'activa')
  then raise exception 'Credenciales de alumno incorrectas'; end if;
  select foto into v_foto from hechi.perfil_fotos where alumno_id = p_alumno_id;
  return v_foto;
end; $$;

create or replace function hechi.perfil_cambiar_nombre(p_token text, p_alumno_id uuid, p_password text, p_nombre text)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_clase hechi.clases%rowtype; v_nombre text := trim(coalesce(p_nombre,''));
begin
  if length(v_nombre) < 2 or length(v_nombre) > 70 then
    raise exception 'El nombre debe tener entre 2 y 70 caracteres'; end if;
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found or not exists(select 1 from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id and password = p_password)
  then raise exception 'Credenciales de alumno incorrectas'; end if;
  if exists(select 1 from hechi.alumnos where clase_id = v_clase.id and id <> p_alumno_id and lower(nombre) = lower(v_nombre))
  then raise exception 'Ya existe otro alumno con ese nombre en la clase'; end if;
  update hechi.alumnos set nombre = v_nombre, updated_at = now() where id = p_alumno_id;
  return hechi.estado_clase_vista(v_clase.id,p_alumno_id);
end; $$;

drop function if exists hechi.kahoot_importar_word(text,jsonb);
create or replace function hechi.kahoot_importar_word(p_token text, p_preguntas jsonb, p_alumno_id uuid default null, p_password text default null)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_clase hechi.clases%rowtype; v_alumno hechi.alumnos%rowtype; v_kahoot_id uuid; v_orden integer; v_item jsonb; v_es_maestro boolean;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then raise exception 'Clase no encontrada'; end if;
  v_es_maestro := coalesce(p_alumno_id is null and auth.uid() is not null and v_clase.created_by = auth.uid(), false);
  if not v_es_maestro then
    select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id and password = p_password;
    if not found then raise exception 'Credenciales de alumno incorrectas'; end if;
  end if;
  if jsonb_typeof(p_preguntas) <> 'array' or jsonb_array_length(p_preguntas) < 1 or jsonb_array_length(p_preguntas) > 100 then
    raise exception 'El Word debe contener entre 1 y 100 preguntas'; end if;
  if exists (select 1 from hechi.kahoots where clase_id = v_clase.id and estado = 'activa') then
    raise exception 'Termina el Kahoot activo antes de importar'; end if;
  select id into v_kahoot_id from hechi.kahoots where clase_id = v_clase.id and estado = 'borrador'
    and (v_es_maestro or creator_alumno_id = v_alumno.id)
    order by updated_at desc, created_at desc limit 1 for update;
  if v_kahoot_id is null then
    insert into hechi.kahoots(clase_id, creator_user_id, creator_alumno_id, creador_nombre)
    values (v_clase.id, case when v_es_maestro then auth.uid() else null end,
      case when v_es_maestro then null else v_alumno.id end,
      case when v_es_maestro then 'Maestro' else v_alumno.nombre end) returning id into v_kahoot_id;
  end if;
  select coalesce(max(orden), -1) + 1 into v_orden from hechi.kahoot_preguntas where kahoot_id = v_kahoot_id;
  for v_item in select value from jsonb_array_elements(p_preguntas) loop
    if length(trim(coalesce(v_item->>'texto',''))) < 5 or jsonb_typeof(v_item->'opciones') <> 'array'
      or jsonb_array_length(v_item->'opciones') <> 4 or (v_item->>'correcta') not in ('0','1','2','3')
      or exists(select 1 from jsonb_array_elements_text(v_item->'opciones') as opciones(valor) where length(trim(opciones.valor)) = 0) then
      raise exception 'Una pregunta del Word está incompleta'; end if;
    insert into hechi.kahoot_preguntas(kahoot_id,pregunta,opcion_a,opcion_b,opcion_c,opcion_d,correcta,orden)
    values(v_kahoot_id,trim(v_item->>'texto'),trim(v_item->'opciones'->>0),trim(v_item->'opciones'->>1),
      trim(v_item->'opciones'->>2),trim(v_item->'opciones'->>3),
      substr('abcd',(v_item->>'correcta')::integer + 1,1),v_orden);
    v_orden := v_orden + 1;
  end loop;
  update hechi.kahoots set updated_at = now() where id = v_kahoot_id;
  return hechi.estado_clase_vista(v_clase.id,case when v_es_maestro then null else v_alumno.id end);
end; $$;

create or replace function hechi.kahoot_avanzar_si_listo(p_token text, p_alumno_id uuid default null, p_password text default null)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_clase hechi.clases%rowtype; v_kahoot hechi.kahoots%rowtype; v_pregunta_id uuid;
  v_total integer; v_respondieron integer; v_preguntas integer;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then raise exception 'Clase no encontrada'; end if;
  if auth.uid() is distinct from v_clase.created_by and not exists (
    select 1 from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id and password = p_password
  ) then raise exception 'No autorizado'; end if;
  select * into v_kahoot from hechi.kahoots where clase_id = v_clase.id and estado = 'activa'
    order by updated_at desc, created_at desc limit 1 for update;
  if not found then return hechi.estado_clase_vista(v_clase.id,p_alumno_id); end if;
  select id into v_pregunta_id from hechi.kahoot_preguntas where kahoot_id = v_kahoot.id
    and orden = v_kahoot.pregunta_actual;
  select count(*) into v_total from hechi.alumnos where clase_id = v_clase.id;
  select count(*) into v_respondieron from hechi.kahoot_respuestas where pregunta_id = v_pregunta_id;
  if v_pregunta_id is not null and now() < v_kahoot.iniciada_at + interval '20 seconds'
    and (v_total = 0 or v_respondieron < v_total) then
    return hechi.estado_clase_vista(v_clase.id,p_alumno_id);
  end if;
  select count(*) into v_preguntas from hechi.kahoot_preguntas where kahoot_id = v_kahoot.id;
  if v_kahoot.pregunta_actual + 1 < v_preguntas then
    update hechi.kahoots set pregunta_actual = pregunta_actual + 1, iniciada_at = now(), updated_at = now()
    where id = v_kahoot.id;
  else
    with ranking as (
      select r.alumno_id, count(*) filter (where r.correcta)::integer aciertos,
        sum(case when r.correcta then greatest(0,20000-r.tiempo_ms) else 0 end)::integer puntos_rapidez,
        sum(r.tiempo_ms)::integer tiempo
      from hechi.kahoot_respuestas r where r.kahoot_id = v_kahoot.id group by r.alumno_id
    ), lugares as (
      select alumno_id, row_number() over(order by aciertos desc,puntos_rapidez desc,tiempo asc,alumno_id) lugar
      from ranking where aciertos > 0
    )
    update hechi.alumnos a set oportunidades = a.oportunidades +
      case lugares.lugar when 1 then 3 when 2 then 2 when 3 then 1 else 0 end, updated_at = now()
    from lugares where a.id = lugares.alumno_id and lugares.lugar <= 3;
    update hechi.kahoots set estado = 'finalizada', finalizada_at = now(), updated_at = now()
    where id = v_kahoot.id;
  end if;
  return hechi.estado_clase_vista(v_clase.id,p_alumno_id);
end; $$;

grant execute on function hechi.perfil_guardar_foto(text,uuid,text,text) to anon,authenticated;
grant execute on function hechi.perfil_obtener_foto(text,uuid,text) to anon,authenticated;
grant execute on function hechi.perfil_cambiar_nombre(text,uuid,text,text) to anon,authenticated;
grant execute on function hechi.kahoot_listar_fotos(text,uuid,text) to anon,authenticated;
grant execute on function hechi.kahoot_importar_word(text,jsonb,uuid,text) to anon,authenticated;
grant execute on function hechi.kahoot_avanzar_si_listo(text,uuid,text) to anon,authenticated;

-- El cierre manual de recuperación usa el mismo desempate que el avance automático.
create or replace function hechi.kahoot_finalizar(p_token text)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_clase hechi.clases%rowtype; v_kahoot hechi.kahoots%rowtype;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then raise exception 'No autorizado como maestro'; end if;
  select * into v_kahoot from hechi.kahoots where clase_id = v_clase.id and estado = 'activa'
    order by updated_at desc, created_at desc limit 1 for update;
  if not found then raise exception 'No hay Kahoot activo'; end if;
  with ranking as (
    select r.alumno_id, count(*) filter (where r.correcta)::integer aciertos,
      sum(case when r.correcta then greatest(0,20000-r.tiempo_ms) else 0 end)::integer puntos_rapidez,
      sum(r.tiempo_ms)::integer tiempo
    from hechi.kahoot_respuestas r where r.kahoot_id = v_kahoot.id group by r.alumno_id
  ), lugares as (
    select alumno_id, row_number() over(order by aciertos desc,puntos_rapidez desc,tiempo asc,alumno_id) lugar
    from ranking where aciertos > 0
  )
  update hechi.alumnos a set oportunidades = a.oportunidades +
    case lugares.lugar when 1 then 3 when 2 then 2 when 3 then 1 else 0 end, updated_at = now()
  from lugares where a.id = lugares.alumno_id and lugares.lugar <= 3;
  update hechi.kahoots set estado = 'finalizada', finalizada_at = now(), updated_at = now()
    where id = v_kahoot.id;
  return hechi.estado_clase_vista(v_clase.id,null);
end; $$;
grant execute on function hechi.kahoot_finalizar(text) to authenticated;

-- Durante la pregunta activa, la vista del alumno no expone la clave ni los aciertos.
create or replace function hechi.kahoot_estado(p_clase_id uuid, p_alumno_id uuid)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_es_maestro boolean; v_kahoot_id uuid;
begin
  select exists(select 1 from hechi.clases where id = p_clase_id and created_by = auth.uid()) into v_es_maestro;
  select id into v_kahoot_id from hechi.kahoots where clase_id = p_clase_id and estado = 'activa'
    order by updated_at desc,created_at desc limit 1;
  if v_kahoot_id is null and v_es_maestro then
    select id into v_kahoot_id from hechi.kahoots where clase_id = p_clase_id and estado = 'borrador'
      order by updated_at desc,created_at desc limit 1;
  end if;
  if v_kahoot_id is null and p_alumno_id is not null then
    select id into v_kahoot_id from hechi.kahoots where clase_id = p_clase_id and estado = 'borrador'
      and creator_alumno_id = p_alumno_id order by updated_at desc,created_at desc limit 1;
  end if;
  if v_kahoot_id is null then
    select id into v_kahoot_id from hechi.kahoots where clase_id = p_clase_id and estado = 'finalizada'
      order by updated_at desc,created_at desc limit 1;
  end if;
  if v_kahoot_id is null then return null::jsonb; end if;
  return (select jsonb_build_object(
    'id',k.id,'estado',k.estado,'preguntaActual',k.pregunta_actual,
    'iniciadaAt',k.iniciada_at,'finalizadaAt',k.finalizada_at,
    'creadorAlumnoId',k.creator_alumno_id,'creadorUserId',k.creator_user_id,'creadorNombre',k.creador_nombre,
    'preguntas',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'pregunta',p.pregunta,
      'opciones',jsonb_build_object('a',p.opcion_a,'b',p.opcion_b,'c',p.opcion_c,'d',p.opcion_d),
      'correcta',case when v_es_maestro or k.estado <> 'activa' or p.orden < k.pregunta_actual then p.correcta else null end,
      'orden',p.orden,
      'respuestas',coalesce((select jsonb_agg(jsonb_build_object(
        'alumnoId',r.alumno_id,'alumno',a.nombre,'casaId',a.casa_id,'opcion',r.opcion,
        'correcta',case when v_es_maestro or k.estado <> 'activa' or p.orden < k.pregunta_actual then r.correcta else null end,
        'tiempoMs',r.tiempo_ms) order by r.tiempo_ms)
        from hechi.kahoot_respuestas r join hechi.alumnos a on a.id = r.alumno_id
        where r.pregunta_id = p.id), '[]'::jsonb)
    ) order by p.orden,p.created_at) from hechi.kahoot_preguntas p where p.kahoot_id = k.id),'[]'::jsonb)
  ) from hechi.kahoots k where k.id = v_kahoot_id);
end; $$;
