begin;
create or replace function hechi.editar_galeones_alumno(p_token text,p_alumno_id uuid,p_galeones integer,p_saldo_anterior integer)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare v_clase uuid; v_saldo integer;
begin
 if auth.uid() is null then raise exception 'Debes iniciar sesión como maestro'; end if;
 if p_galeones is null or p_galeones<0 or p_saldo_anterior is null then raise exception 'El saldo debe ser un entero de cero o más'; end if;
 select id into v_clase from hechi.clases where token=upper(trim(p_token)) and created_by=auth.uid() and estado='activa' for update;
 if not found then raise exception 'No autorizado como maestro'; end if;
 select galeones into v_saldo from hechi.alumnos where id=p_alumno_id and clase_id=v_clase for update;
 if not found then raise exception 'Alumno no encontrado en esta clase'; end if;
 if v_saldo is distinct from p_saldo_anterior then
  raise exception 'El saldo cambió a % galeones. Cancela y vuelve a abrir la edición con el saldo actualizado.',v_saldo;
 end if;
 update hechi.alumnos set galeones=p_galeones,updated_at=now() where id=p_alumno_id and clase_id=v_clase;
 return hechi.estado_clase(v_clase);
end;
$$;
revoke all on function hechi.editar_galeones_alumno(text,uuid,integer,integer) from public,anon;
grant execute on function hechi.editar_galeones_alumno(text,uuid,integer,integer) to authenticated;
commit;
