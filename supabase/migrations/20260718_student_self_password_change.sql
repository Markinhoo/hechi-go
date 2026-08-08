create or replace function hechi.cambiar_password_propia(
  p_token text,
  p_alumno_id uuid,
  p_password_actual text,
  p_password_nueva text
)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
begin
  if length(coalesce(p_password_nueva, '')) < 3 then
    raise exception 'La nueva contrasena debe tener al menos 3 caracteres';
  end if;

  select * into v_clase
  from hechi.clases
  where token = upper(trim(p_token))
    and estado = 'activa';

  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno
  from hechi.alumnos
  where id = p_alumno_id
    and clase_id = v_clase.id;

  if not found or v_alumno.password <> p_password_actual then
    raise exception 'Credenciales de alumno incorrectas';
  end if;

  update hechi.alumnos
  set password = p_password_nueva,
      updated_at = now()
  where id = v_alumno.id;

  return hechi.estado_clase(v_clase.id) || jsonb_build_object('alumno_id', v_alumno.id);
end;
$$;
