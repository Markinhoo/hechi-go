-- Pending jokes are private; only authenticated class owners can resolve them.
begin;
create table if not exists hechi.chistes_pendientes (
  alumno_id uuid primary key references hechi.alumnos(id) on delete cascade,
  clase_id uuid not null references hechi.clases(id) on delete cascade,
  historial_id uuid not null references hechi.participaciones(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table hechi.chistes_pendientes enable row level security;
revoke all on hechi.chistes_pendientes from anon, authenticated;

create or replace function hechi.riddikulus_solicitar(p_token text, p_alumno_id uuid, p_password text)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_historial uuid;
begin
  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa' for update;
  if not found then raise exception 'Clase no encontrada'; end if;
  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id for update;
  if not found or v_alumno.password is distinct from p_password then raise exception 'Credenciales incorrectas'; end if;
  if exists(select 1 from hechi.chistes_pendientes where alumno_id = p_alumno_id) then
    raise exception 'Ya tienes un chiste pendiente de revision del maestro';
  end if;
  if v_alumno.oportunidades <= 0 then raise exception 'Necesitas autorizacion del maestro'; end if;
  update hechi.alumnos set oportunidades = oportunidades - 1, cartas = array_append(cartas, 15), updated_at = now() where id = p_alumno_id;
  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values(v_clase.id, p_alumno_id, 15, 0, v_alumno.casa_id, 'Riddikulus', 'Pendiente de decision del maestro') returning id into v_historial;
  insert into hechi.chistes_pendientes(alumno_id, clase_id, historial_id) values(p_alumno_id,v_clase.id,v_historial);
  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.riddikulus_pendientes(p_token text)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare v_clase uuid; v_resultado jsonb;
begin
  if auth.uid() is null then raise exception 'Solo el maestro puede revisar chistes'; end if;
  select id into v_clase from hechi.clases where token=upper(trim(p_token)) and created_by=auth.uid();
  if not found then raise exception 'No autorizado como maestro'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('alumnoId',a.id,'alumno',a.nombre,'casaId',a.casa_id) order by p.created_at),'[]'::jsonb)
  into v_resultado from hechi.chistes_pendientes p join hechi.alumnos a on a.id=p.alumno_id where p.clase_id=v_clase;
  return v_resultado;
end;
$$;

-- Keep the old signature but remove student authorization from the old endpoint too.
create or replace function hechi.riddikulus_decision_chiste(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_acepta boolean)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_historial uuid;
  v_puntos integer;
  v_positivos integer;
  v_negativos integer;
begin
  if auth.uid() is null then raise exception 'Solo el maestro puede decidir Riddikulus'; end if;
  if p_numero is distinct from 15 or p_acepta is null then raise exception 'Decision invalida'; end if;
  select * into v_clase from hechi.clases where token=upper(trim(p_token)) and created_by=auth.uid() and estado='activa' for update;
  if not found then raise exception 'No autorizado como maestro'; end if;
  select * into v_alumno from hechi.alumnos where id=p_alumno_id and clase_id=v_clase.id for update;
  if not found then raise exception 'Alumno no encontrado'; end if;
  delete from hechi.chistes_pendientes where alumno_id=p_alumno_id and clase_id=v_clase.id returning historial_id into v_historial;
  if not found then raise exception 'Este chiste ya fue resuelto o no esta pendiente'; end if;
  v_puntos := case when p_acepta then 2 else -2 end;
  update hechi.alumnos set puntos=greatest(0,puntos+v_puntos),updated_at=now() where id=p_alumno_id;
  v_positivos := coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer,0)+greatest(v_puntos,0);
  v_negativos := abs(coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer,0))+greatest(-v_puntos,0);
  update hechi.clases set puntajes_positivos=puntajes_positivos||jsonb_build_object(v_alumno.casa_id,v_positivos),
    puntajes_negativos=puntajes_negativos||jsonb_build_object(v_alumno.casa_id,v_negativos),
    puntajes=puntajes||jsonb_build_object(v_alumno.casa_id,v_positivos-v_negativos),updated_at=now() where id=v_clase.id;
  update hechi.participaciones set puntos=v_puntos, descripcion=case when p_acepta then 'El maestro confirmo que conto el chiste' else 'El maestro indico que no conto el chiste' end where id=v_historial;
  return hechi.estado_clase(v_clase.id);
end;
$$;
revoke all on function hechi.riddikulus_solicitar(text,uuid,text) from public;
grant execute on function hechi.riddikulus_solicitar(text,uuid,text) to anon,authenticated;
revoke all on function hechi.riddikulus_pendientes(text) from public,anon;
grant execute on function hechi.riddikulus_pendientes(text) to authenticated;
revoke all on function hechi.riddikulus_decision_chiste(text,uuid,text,integer,text,text,boolean) from public,anon;
grant execute on function hechi.riddikulus_decision_chiste(text,uuid,text,integer,text,text,boolean) to authenticated;
commit;
