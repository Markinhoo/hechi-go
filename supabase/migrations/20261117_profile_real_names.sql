-- Keep the class roster name stable when a student changes their display/login name.
alter table hechi.alumnos add column if not exists nombre_real text;
update hechi.alumnos set nombre_real=nombre where nombre_real is null;
create or replace function hechi.alumno_nombre_real_inicial()
returns trigger language plpgsql set search_path=hechi,public,pg_catalog as $$
begin
  new.nombre_real:=coalesce(nullif(trim(new.nombre_real),''),new.nombre);
  return new;
end; $$;
drop trigger if exists alumno_nombre_real_inicial on hechi.alumnos;
create trigger alumno_nombre_real_inicial before insert on hechi.alumnos
for each row execute function hechi.alumno_nombre_real_inicial();
alter table hechi.alumnos alter column nombre_real set not null;

create or replace function hechi.perfil_obtener_identidad(p_token text,p_alumno_id uuid,p_password text)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare a hechi.alumnos%rowtype;
begin
  select alumno.* into a from hechi.alumnos alumno join hechi.clases c on c.id=alumno.clase_id
  where c.token=upper(trim(p_token)) and c.estado='activa' and alumno.id=p_alumno_id and alumno.password=p_password;
  if not found then raise exception 'Credenciales de alumno incorrectas'; end if;
  return jsonb_build_object('nombreReal',a.nombre_real,'usuario',a.nombre);
end; $$;

-- The old RPC name remains available for older clients; it now explicitly edits only the username.
create or replace function hechi.perfil_cambiar_nombre(p_token text,p_alumno_id uuid,p_password text,p_nombre text)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c hechi.clases%rowtype; v_usuario text:=trim(coalesce(p_nombre,''));
begin
  if length(v_usuario)<2 or length(v_usuario)>70 then raise exception 'El usuario debe tener entre 2 y 70 caracteres'; end if;
  select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa';
  if not found or not exists(select 1 from hechi.alumnos where id=p_alumno_id and clase_id=c.id and password=p_password)
    then raise exception 'Credenciales de alumno incorrectas'; end if;
  if exists(select 1 from hechi.alumnos where clase_id=c.id and id<>p_alumno_id and lower(nombre)=lower(v_usuario))
    then raise exception 'Ese nombre de usuario ya está en uso'; end if;
  update hechi.alumnos set nombre=v_usuario,updated_at=now() where id=p_alumno_id;
  return hechi.estado_clase_vista(c.id,p_alumno_id);
end; $$;

revoke all on function hechi.perfil_obtener_identidad(text,uuid,text) from public;
grant execute on function hechi.perfil_obtener_identidad(text,uuid,text) to anon,authenticated;
notify pgrst, 'reload schema';
