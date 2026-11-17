-- Asistencia por parcial, independiente de los puntos y de las cartas.
alter table hechi.clases add column if not exists asistencia_periodo integer not null default 1;

create table if not exists hechi.asistencia_dias (
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  periodo integer not null,
  fecha date not null,
  primary key (clase_id, periodo, fecha)
);
create table if not exists hechi.asistencia_registros (
  clase_id uuid not null,
  periodo integer not null,
  fecha date not null,
  alumno_id uuid not null references hechi.alumnos(id) on delete cascade,
  estado text not null check (estado in ('presente','falta','justificada')),
  nota text,
  updated_at timestamptz not null default now(),
  primary key (clase_id, periodo, fecha, alumno_id),
  foreign key (clase_id, periodo, fecha) references hechi.asistencia_dias(clase_id, periodo, fecha) on delete cascade
);
create index if not exists asistencia_registros_alumno_idx on hechi.asistencia_registros(alumno_id,periodo,fecha);
alter table hechi.asistencia_dias enable row level security;
alter table hechi.asistencia_registros enable row level security;

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
      where r.clase_id=c.id and r.periodo=c.asistencia_periodo and (maestro or r.alumno_id=p_alumno_id)),'[]'::jsonb)
  );
end; $$;

create or replace function hechi.asistencia_guardar_fechas(p_token text,p_fechas date[])
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare c hechi.clases%rowtype;
begin
  select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' and created_by=auth.uid();
  if not found then raise exception 'Solo el maestro puede preparar el calendario'; end if;
  if coalesce(array_length(p_fechas,1),0) < 1 or array_length(p_fechas,1)>60 or array_position(p_fechas,null) is not null
  then raise exception 'Selecciona entre 1 y 60 fechas válidas'; end if;
  insert into hechi.asistencia_dias(clase_id,periodo,fecha)
  select c.id,c.asistencia_periodo,fecha from unnest(p_fechas) fecha on conflict do nothing;
  return hechi.asistencia_estado(p_token);
end; $$;

create or replace function hechi.asistencia_marcar(p_token text,p_alumno_id uuid,p_fecha date,p_estado text,p_nota text default null)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare c hechi.clases%rowtype;
begin
  select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' and created_by=auth.uid();
  if not found then raise exception 'Solo el maestro puede pasar lista'; end if;
  if not exists(select 1 from hechi.alumnos where id=p_alumno_id and clase_id=c.id)
  then raise exception 'Alumno ajeno a la clase'; end if;
  if not exists(select 1 from hechi.asistencia_dias where clase_id=c.id and periodo=c.asistencia_periodo and fecha=p_fecha)
  then raise exception 'Fecha fuera del calendario de este parcial'; end if;
  if p_estado is null then
    delete from hechi.asistencia_registros where clase_id=c.id and periodo=c.asistencia_periodo
      and fecha=p_fecha and alumno_id=p_alumno_id;
  elsif p_estado in ('presente','falta','justificada') then
    insert into hechi.asistencia_registros(clase_id,periodo,fecha,alumno_id,estado,nota)
    values(c.id,c.asistencia_periodo,p_fecha,p_alumno_id,p_estado,
      case when p_estado='justificada' then nullif(left(trim(coalesce(p_nota,'')),300),'') else null end)
    on conflict (clase_id,periodo,fecha,alumno_id) do update
      set estado=excluded.estado,nota=excluded.nota,updated_at=now();
  else raise exception 'Estado de asistencia no válido'; end if;
  return hechi.asistencia_estado(p_token);
end; $$;

create or replace function hechi.asistencia_importar(p_token text,p_registros jsonb)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare c hechi.clases%rowtype; item jsonb; alumno uuid; dia date; marca text;
begin
  select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' and created_by=auth.uid();
  if not found then raise exception 'Solo el maestro puede importar asistencias'; end if;
  if jsonb_typeof(p_registros)<>'array' or jsonb_array_length(p_registros)<1 or jsonb_array_length(p_registros)>2000
  then raise exception 'La lista debe contener entre 1 y 2000 marcas'; end if;
  for item in select value from jsonb_array_elements(p_registros) loop
    begin
      alumno:=(item->>'alumnoId')::uuid;
      dia:=(item->>'fecha')::date;
      marca:=item->>'estado';
    exception when others then raise exception 'Una marca de asistencia es inválida'; end;
    if marca not in ('presente','falta','justificada')
      or not exists(select 1 from hechi.alumnos where id=alumno and clase_id=c.id)
      or not exists(select 1 from hechi.asistencia_dias where clase_id=c.id and periodo=c.asistencia_periodo and fecha=dia)
    then raise exception 'La lista contiene un alumno, fecha o estado inválido'; end if;
    insert into hechi.asistencia_registros(clase_id,periodo,fecha,alumno_id,estado)
    values(c.id,c.asistencia_periodo,dia,alumno,marca)
    on conflict (clase_id,periodo,fecha,alumno_id) do update
      set estado=excluded.estado,nota=null,updated_at=now();
  end loop;
  return hechi.asistencia_estado(p_token);
end; $$;

create or replace function hechi.asistencia_justificar_carta(p_token text,p_alumno_id uuid,p_fecha date,p_carta_id text)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare c hechi.clases%rowtype; a hechi.alumnos%rowtype;
begin
  select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' and created_by=auth.uid();
  if not found then raise exception 'Solo el maestro puede aceptar el justificante'; end if;
  select * into a from hechi.alumnos where id=p_alumno_id and clase_id=c.id for update;
  if not found then raise exception 'Alumno ajeno a la clase'; end if;
  if not exists(select 1 from hechi.asistencia_registros where clase_id=c.id and periodo=c.asistencia_periodo
    and fecha=p_fecha and alumno_id=a.id and estado='falta')
  then raise exception 'Primero registra una falta sin justificar en esa fecha'; end if;
  if not exists(select 1 from jsonb_array_elements(a.cartas_guardadas) carta
    where carta->>'id'=p_carta_id and carta->>'numero'='18')
  then raise exception 'No hay Crecehuesos guardada para justificar'; end if;
  update hechi.alumnos set cartas_guardadas=coalesce((select jsonb_agg(carta)
    from jsonb_array_elements(a.cartas_guardadas) carta where carta->>'id'<>p_carta_id),'[]'::jsonb),updated_at=now()
    where id=a.id;
  update hechi.asistencia_registros set estado='justificada',nota='Crecehuesos',updated_at=now()
    where clase_id=c.id and periodo=c.asistencia_periodo and fecha=p_fecha and alumno_id=a.id;
  return hechi.asistencia_estado(p_token);
end; $$;

-- El reinicio de parcial cambia el periodo mostrado; los anteriores siguen guardados.
do $periodo$
declare f regprocedure; definicion text;
begin
  f:=coalesce(to_regprocedure('hechi.reiniciar_clase_sin_respaldo(text)'),to_regprocedure('hechi.reiniciar_clase(text)'));
  if f is not null then
    select pg_get_functiondef(f) into definicion;
    if position('asistencia_periodo' in definicion)=0
      and position('delete from hechi.participaciones where clase_id = v_clase.id;' in definicion)>0 then
      definicion:=replace(definicion,'delete from hechi.participaciones where clase_id = v_clase.id;',
        E'update hechi.clases set asistencia_periodo=asistencia_periodo+1 where id=v_clase.id;\n  delete from hechi.participaciones where clase_id = v_clase.id;');
      execute definicion;
    end if;
  end if;
end; $periodo$;

revoke all on function hechi.asistencia_estado(text,uuid,text),hechi.asistencia_guardar_fechas(text,date[]),
  hechi.asistencia_marcar(text,uuid,date,text,text),hechi.asistencia_importar(text,jsonb),
  hechi.asistencia_justificar_carta(text,uuid,date,text) from public;
grant execute on function hechi.asistencia_estado(text,uuid,text) to anon,authenticated;
grant execute on function hechi.asistencia_guardar_fechas(text,date[]),hechi.asistencia_marcar(text,uuid,date,text,text),
  hechi.asistencia_importar(text,jsonb),hechi.asistencia_justificar_carta(text,uuid,date,text) to authenticated;
