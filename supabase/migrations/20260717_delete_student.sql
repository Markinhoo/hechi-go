-- Incremental migration for deleting students from a class.
-- Safe for existing HECHI GO data.

drop function if exists hechi.eliminar_alumno(text, uuid);

create or replace function hechi.eliminar_alumno(p_token text, p_alumno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_positivos integer;
  v_negativos integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  v_positivos := greatest(0, coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0)) - v_alumno.puntos);
  v_negativos := coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0);

  delete from hechi.solicitudes where alumno_id = v_alumno.id and clase_id = v_clase.id;
  delete from hechi.participaciones where alumno_id = v_alumno.id and clase_id = v_clase.id;
  delete from hechi.alumnos where id = v_alumno.id and clase_id = v_clase.id;

  update hechi.clases
  set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivos),
      puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_positivos - v_negativos),
      updated_at = now()
  where id = v_clase.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.eliminar_alumno(text, uuid) to authenticated;
