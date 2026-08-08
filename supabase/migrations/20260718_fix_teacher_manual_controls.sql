alter table hechi.participaciones
  drop constraint if exists participaciones_puntos_check;

alter table hechi.participaciones
  add constraint participaciones_puntos_check check (puntos between -100 and 100);

create or replace function hechi.cambiar_password_alumno(p_token text, p_alumno_id uuid, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if length(coalesce(p_password, '')) < 3 then
    raise exception 'La nueva contrasena debe tener al menos 3 caracteres';
  end if;

  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase
  from hechi.clases
  where token = upper(trim(p_token))
    and created_by = auth.uid();

  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  update hechi.alumnos
  set password = p_password,
      updated_at = now()
  where id = p_alumno_id
    and clase_id = v_clase.id;

  if not found then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  return hechi.estado_clase(v_clase.id);
end;
$$;

create or replace function hechi.quitar_puntos_alumno(p_token text, p_alumno_id uuid, p_puntos integer)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_puntos integer;
  v_positivos integer;
  v_negativos integer;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  if coalesce(p_puntos, 0) <= 0 then
    raise exception 'Los puntos a quitar deben ser mayores a cero';
  end if;

  select * into v_clase
  from hechi.clases
  where token = upper(trim(p_token))
    and created_by = auth.uid();

  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  select * into v_alumno
  from hechi.alumnos
  where id = p_alumno_id
    and clase_id = v_clase.id;

  if not found then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  v_puntos := least(p_puntos, greatest(v_alumno.puntos, 0));

  if v_puntos <= 0 then
    raise exception 'Ese alumno no tiene puntos para quitar';
  end if;

  update hechi.alumnos
  set puntos = greatest(0, puntos - v_puntos),
      updated_at = now()
  where id = v_alumno.id;

  v_positivos := coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0));
  v_negativos := coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0) + v_puntos;
  v_total := v_positivos - v_negativos;

  update hechi.clases
  set puntajes_negativos = puntajes_negativos || jsonb_build_object(v_alumno.casa_id, v_negativos),
      puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_total),
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, 1, -v_puntos, v_alumno.casa_id, 'Quita manual', 'EL MAESTRO QUITO PUNTOS MANUALMENTE');

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.cambiar_password_alumno(text, uuid, text) to authenticated;
grant execute on function hechi.quitar_puntos_alumno(text, uuid, integer) to authenticated;
