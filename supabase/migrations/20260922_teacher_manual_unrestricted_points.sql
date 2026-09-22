-- Allow manual penalties beyond the current balance and beyond 100 points.
begin;
alter table hechi.alumnos drop constraint if exists alumnos_puntos_check;
alter table hechi.participaciones drop constraint if exists participaciones_puntos_check;
-- Preserve the existing spell limit while allowing larger manual adjustments.
alter table hechi.participaciones add constraint participaciones_puntos_check
  check (puntos between -100 and 100 or titulo = 'Ajuste manual');

-- Signed manual adjustments; only the owner of the active class may apply them.
create or replace function hechi.ajustar_puntos_alumno(p_token text, p_alumno_id uuid, p_puntos integer)
returns jsonb language plpgsql security definer set search_path = hechi, public, pg_catalog as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_positivos integer;
  v_negativos integer;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion como maestro'; end if;
  if p_puntos is null or p_puntos = 0 then
    raise exception 'El ajuste debe ser un entero distinto de cero';
  end if;
  select * into v_clase from hechi.clases
  where token=upper(trim(p_token)) and created_by=auth.uid() and estado='activa' for update;
  if not found then raise exception 'No autorizado como maestro'; end if;
  select * into v_alumno from hechi.alumnos where id=p_alumno_id and clase_id=v_clase.id for update;
  if not found then raise exception 'Alumno no encontrado en esta clase'; end if;
  v_positivos := coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, (v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + greatest(p_puntos,0);
  v_negativos := abs(coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer,0)) + greatest(-p_puntos,0);
  update hechi.alumnos set puntos=puntos+p_puntos,updated_at=now() where id=p_alumno_id;
  update hechi.clases set puntajes_positivos=puntajes_positivos||jsonb_build_object(v_alumno.casa_id,v_positivos),
    puntajes_negativos=puntajes_negativos||jsonb_build_object(v_alumno.casa_id,v_negativos),
    puntajes=puntajes||jsonb_build_object(v_alumno.casa_id,v_positivos-v_negativos),updated_at=now() where id=v_clase.id;
  insert into hechi.participaciones(clase_id,alumno_id,carta,puntos,casa_objetivo,titulo,descripcion)
  values(v_clase.id,p_alumno_id,1,p_puntos,v_alumno.casa_id,'Ajuste manual','El maestro ajusto ' || p_puntos || ' puntos');
  return hechi.estado_clase(v_clase.id);
end;
$$;
revoke all on function hechi.ajustar_puntos_alumno(text,uuid,integer) from public,anon;
grant execute on function hechi.ajustar_puntos_alumno(text,uuid,integer) to authenticated;

commit;
