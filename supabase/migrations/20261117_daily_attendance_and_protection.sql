-- Teacher's daily roll call uses the real roster name and saves the whole day atomically.
create or replace function hechi.asistencia_estado(p_token text, p_alumno_id uuid default null, p_password text default null)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare c hechi.clases%rowtype; maestro boolean;
begin
  select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa';
  if not found then raise exception 'Clase no encontrada'; end if;
  maestro := coalesce(p_alumno_id is null and auth.uid() is not null and c.created_by=auth.uid(),false);
  if not maestro and not exists(select 1 from hechi.alumnos a where a.id=p_alumno_id and a.clase_id=c.id and a.password=p_password)
  then raise exception 'Credenciales de alumno incorrectas'; end if;
  return jsonb_build_object(
    'periodo',c.asistencia_periodo,
    'fechas',coalesce((select jsonb_agg(d.fecha order by d.fecha) from hechi.asistencia_dias d
      where d.clase_id=c.id and d.periodo=c.asistencia_periodo),'[]'::jsonb),
    'registros',coalesce((select jsonb_agg(jsonb_build_object(
      'alumnoId',r.alumno_id,'fecha',r.fecha,'estado',r.estado,'nota',r.nota,'updatedAt',r.updated_at)
      order by r.fecha,r.alumno_id) from hechi.asistencia_registros r
      where r.clase_id=c.id and r.periodo=c.asistencia_periodo and (maestro or r.alumno_id=p_alumno_id)),'[]'::jsonb),
    'alumnos',case when maestro then coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'nombreReal',a.nombre_real,'usuario',a.nombre) order by a.nombre_real,a.id)
      from hechi.alumnos a where a.clase_id=c.id),'[]'::jsonb) else '[]'::jsonb end
  );
end; $$;

create or replace function hechi.asistencia_pasar_lista(p_token text,p_presentes uuid[])
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare c hechi.clases%rowtype; dia date := timezone('America/Mexico_City',now())::date;
begin
  select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' and created_by=auth.uid() for update;
  if not found then raise exception 'Solo el maestro puede pasar lista'; end if;
  if p_presentes is null or array_position(p_presentes,null) is not null or
    exists(select 1 from unnest(p_presentes) as selected(student_id) where not exists(
      select 1 from hechi.alumnos a where a.id=selected.student_id and a.clase_id=c.id))
  then raise exception 'La lista contiene un alumno inválido'; end if;
  insert into hechi.asistencia_dias(clase_id,periodo,fecha) values(c.id,c.asistencia_periodo,dia)
  on conflict do nothing;
  insert into hechi.asistencia_registros(clase_id,periodo,fecha,alumno_id,estado)
  select c.id,c.asistencia_periodo,dia,a.id,
    case when a.id=any(p_presentes) then 'presente' else 'falta' end
  from hechi.alumnos a where a.clase_id=c.id
  on conflict (clase_id,periodo,fecha,alumno_id) do update set
    estado=excluded.estado,nota=null,updated_at=now()
    where hechi.asistencia_registros.estado is distinct from 'justificada'
      or excluded.estado='presente';
  return hechi.asistencia_estado(p_token);
end; $$;
revoke all on function hechi.asistencia_pasar_lista(text,uuid[]) from public;
grant execute on function hechi.asistencia_pasar_lista(text,uuid[]) to authenticated;

-- Expecto Patronum protects a house only until the next Mexico City calendar day.
alter table hechi.clases add column if not exists casa_protegida_dia date;
-- The activation day of existing protections is unknown, so start all houses equally.
update hechi.clases set casa_protegida=null where casa_protegida is not null and casa_protegida_dia is null;
create or replace function hechi.proteccion_fecha_actual()
returns trigger language plpgsql set search_path=hechi,public,pg_catalog as $$
begin
  if new.casa_protegida is distinct from old.casa_protegida then
    new.casa_protegida_dia := case when new.casa_protegida is null then null
      else timezone('America/Mexico_City',now())::date end;
  end if;
  return new;
end; $$;
drop trigger if exists proteccion_fecha_actual on hechi.clases;
create trigger proteccion_fecha_actual before update on hechi.clases
for each row execute function hechi.proteccion_fecha_actual();

create or replace function hechi.protecciones_vencidas_limpiar()
returns integer language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare cantidad integer;
begin
  update hechi.clases set casa_protegida=null
  where casa_protegida is not null
    and (casa_protegida_dia is null or casa_protegida_dia < timezone('America/Mexico_City',now())::date);
  get diagnostics cantidad=row_count;
  return cantidad;
end; $$;

create or replace function hechi.estado_clase_vista(p_clase_id uuid,p_alumno_id uuid default null)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
begin
  perform hechi.protecciones_vencidas_limpiar();
  return hechi.estado_clase(p_clase_id) || jsonb_build_object('kahoot',hechi.kahoot_estado(p_clase_id,p_alumno_id));
end; $$;
do $schedule$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute $sql$select cron.schedule('hechi-proteccion-diaria','* * * * *',
      'select hechi.protecciones_vencidas_limpiar()')$sql$;
  end if;
end; $schedule$;
notify pgrst,'reload schema';
