-- Exams belong to the same partial period as attendance. Older attempts remain in storage.
alter table hechi.examenes add column if not exists periodo integer;
update hechi.examenes e set periodo=c.asistencia_periodo from hechi.clases c where e.clase_id=c.id and e.periodo is null;
alter table hechi.examenes alter column periodo set not null;
create index if not exists examenes_clase_periodo on hechi.examenes(clase_id,periodo,updated_at desc);
create or replace function hechi.examen_maestro(p_token text,p_titulo text default null,p_preguntas jsonb default null,p_id uuid default null,p_publicado boolean default null,p_autorizar uuid default null)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c hechi.clases%rowtype; e hechi.examenes%rowtype; q jsonb; item jsonb; ix integer;
begin
 select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' for update;
 if not found or auth.uid() is distinct from c.created_by then raise exception 'Solo el maestro puede administrar exámenes'; end if;
 perform hechi.examen_revisar_inactivos(c.id);
 if p_preguntas is not null then
  if jsonb_typeof(p_preguntas)<>'array' or jsonb_array_length(p_preguntas) not between 1 and 100 then raise exception 'Se necesitan entre 1 y 100 preguntas'; end if;
  for item in select value from jsonb_array_elements(p_preguntas) loop
   if length(trim(coalesce(item->>'texto','')))<5 or jsonb_typeof(item->'opciones')<>'array' or jsonb_array_length(item->'opciones')<>4 or
      jsonb_typeof(item->'correcta')<>'number' or (item->>'correcta')::integer not between 0 and 3 then raise exception 'Cada pregunta necesita texto, cuatro opciones y respuesta correcta'; end if;
   for ix in 0..3 loop
    if trim(coalesce(item->'opciones'->>ix,''))='' then raise exception 'No puede haber opciones vacías'; end if;
   end loop;
  end loop;
  if trim(coalesce(p_titulo,''))='' then raise exception 'El examen necesita título'; end if;
  if p_id is null then
   insert into hechi.examenes(clase_id,periodo,titulo,preguntas,publicado) values(c.id,c.asistencia_periodo,trim(p_titulo),p_preguntas,coalesce(p_publicado,false)) returning * into e;
  else
   select * into e from hechi.examenes where id=p_id and clase_id=c.id and periodo=c.asistencia_periodo for update;
   if not found then raise exception 'Examen no encontrado'; end if;
   if exists(select 1 from hechi.intentos_examen where examen_id=e.id and estado<>'disponible') then raise exception 'No se pueden cambiar preguntas después de iniciar el examen'; end if;
   update hechi.examenes set titulo=trim(p_titulo),preguntas=p_preguntas,publicado=coalesce(p_publicado,e.publicado),updated_at=now() where id=e.id;
  end if;
 elsif p_id is not null and p_autorizar is not null then
  select * into e from hechi.examenes where id=p_id and clase_id=c.id and periodo=c.asistencia_periodo for update;
  if not found or not e.publicado or not exists(select 1 from hechi.alumnos where id=p_autorizar and clase_id=c.id) then raise exception 'Examen o alumno no válido'; end if;
  if exists(select 1 from hechi.intentos_examen where examen_id=e.id and alumno_id=p_autorizar and estado in('disponible','en_curso')) then raise exception 'El alumno ya tiene un intento disponible'; end if;
  insert into hechi.intentos_examen(examen_id,alumno_id) values(e.id,p_autorizar);
 elsif p_id is not null and p_publicado is not null then
  update hechi.examenes set publicado=p_publicado,updated_at=now() where id=p_id and clase_id=c.id and periodo=c.asistencia_periodo;
  if not found then raise exception 'Examen no encontrado'; end if;
 end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'titulo',x.titulo,'preguntas',x.preguntas,'publicado',x.publicado,
  'intentos',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'alumnoId',a.id,'nombre',a.nombre_real,'usuario',a.nombre,'estado',coalesce(i.estado,'disponible'),'aciertos',coalesce(i.aciertos,0),'total',jsonb_array_length(x.preguntas),'motivo',i.motivo,'fecha',i.created_at) order by a.nombre_real,a.id),'[]'::jsonb)
    from hechi.alumnos a left join lateral (select * from hechi.intentos_examen i where i.examen_id=x.id and i.alumno_id=a.id order by i.created_at desc,i.id desc limit 1) i on true where a.clase_id=c.id)) order by x.updated_at desc),'[]'::jsonb)
 from hechi.examenes x where x.clase_id=c.id and x.periodo=c.asistencia_periodo);
end;$$;

create or replace function hechi.examen_alumno(p_token text,p_alumno_id uuid,p_password text,p_accion text default 'ver',p_examen uuid default null,p_respuestas jsonb default null)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; periodo_actual integer; e hechi.examenes%rowtype; i hechi.intentos_examen%rowtype; item jsonb; n integer:=0; k integer:=0; safe_questions jsonb; list jsonb;
begin
 c:=hechi.arena_autenticar(p_token,p_alumno_id,p_password);
 if p_alumno_id is null then raise exception 'Solo alumnos'; end if;
 select asistencia_periodo into periodo_actual from hechi.clases where id=c for update;
 perform hechi.examen_revisar_inactivos(c);
 if p_accion<>'ver' then
  select * into e from hechi.examenes where id=p_examen and clase_id=c and periodo=periodo_actual and publicado for update;
  if not found then raise exception 'Examen no disponible'; end if;
  select * into i from hechi.intentos_examen where examen_id=e.id and alumno_id=p_alumno_id order by created_at desc,id desc limit 1 for update;
  if not found then
   insert into hechi.intentos_examen(examen_id,alumno_id) values(e.id,p_alumno_id) returning * into i;
  end if;
  if p_accion='iniciar' then
   if i.estado<>'disponible' then raise exception 'El examen ya se inició o requiere autorización del maestro'; end if;
   update hechi.intentos_examen set estado='en_curso',iniciado_at=now(),pulso_at=now() where id=i.id;
  elsif p_accion='incidente' then
   if i.estado='en_curso' then update hechi.intentos_examen set estado='bloqueado',aciertos=0,motivo='Se cambió de ventana, pestaña o se cerró la app',terminado_at=now() where id=i.id; end if;
  elsif p_accion in('pulso','finalizar') then
   if i.estado<>'en_curso' then raise exception 'El intento quedó bloqueado o terminó'; end if;
   if p_accion='pulso' then
    if p_respuestas is not null then
     if jsonb_typeof(p_respuestas)<>'object' then raise exception 'Respuestas no válidas'; end if;
     for k in 0..jsonb_array_length(e.preguntas)-1 loop
      if p_respuestas ? k::text and (jsonb_typeof(p_respuestas->k::text)<>'number' or (p_respuestas->>k::text)::integer not between 0 and 3) then raise exception 'Respuesta no válida'; end if;
     end loop;
     if exists(select 1 from jsonb_object_keys(p_respuestas) key where key !~ '^[0-9]+$' or key::integer>=jsonb_array_length(e.preguntas)) then raise exception 'Pregunta no válida'; end if;
     update hechi.intentos_examen set respuestas=p_respuestas,pulso_at=now() where id=i.id;
    else update hechi.intentos_examen set pulso_at=now() where id=i.id; end if;
   else
    for item in select value from jsonb_array_elements(e.preguntas) loop
     if i.respuestas->>n::text=(item->>'correcta') then k:=k+1; end if;
     n:=n+1;
    end loop;
    update hechi.intentos_examen set estado='finalizado',aciertos=k,terminado_at=now() where id=i.id;
   end if;
  else raise exception 'Acción no válida'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'titulo',x.titulo,'total',jsonb_array_length(x.preguntas),
  'preguntas',case when t.estado='finalizado' then x.preguntas else (select jsonb_agg(value-'correcta' order by ord) from jsonb_array_elements(x.preguntas) with ordinality p(value,ord)) end,
  'intento',case when t.id is null then null else jsonb_build_object('estado',t.estado,'respuestas',t.respuestas,'aciertos',t.aciertos,'motivo',t.motivo) end) order by x.created_at desc),'[]'::jsonb) into list
 from hechi.examenes x left join lateral (select * from hechi.intentos_examen t where t.examen_id=x.id and t.alumno_id=p_alumno_id order by created_at desc,id desc limit 1) t on true
 where x.clase_id=c and x.periodo=periodo_actual and x.publicado;
 return list;
end;$$;
notify pgrst,'reload schema';
