-- Student can read only whether their own joke still awaits a teacher decision.
create or replace function hechi.riddikulus_sigue_pendiente(p_token text, p_alumno_id uuid, p_password text)
returns boolean language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare
  v_clase uuid;
  v_alumno hechi.alumnos%rowtype;
begin
  select id into v_clase from hechi.clases where token=upper(trim(p_token));
  if not found then raise exception 'Clase no encontrada'; end if;
  select * into v_alumno from hechi.alumnos where id=p_alumno_id and clase_id=v_clase;
  if not found or v_alumno.password is distinct from p_password then raise exception 'Credenciales incorrectas'; end if;
  return exists(select 1 from hechi.chistes_pendientes where alumno_id=p_alumno_id and clase_id=v_clase);
end;
$$;
revoke all on function hechi.riddikulus_sigue_pendiente(text,uuid,text) from public;
grant execute on function hechi.riddikulus_sigue_pendiente(text,uuid,text) to anon,authenticated;
