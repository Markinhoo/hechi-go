drop function if exists hechi.kahoot_nueva_actividad(text);

create or replace function hechi.kahoot_nueva_actividad(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;

  select * into v_clase
  from hechi.clases
  where token = upper(trim(p_token)) and created_by = auth.uid();

  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  update hechi.kahoots
  set estado = 'finalizada', finalizada_at = coalesce(finalizada_at, now()), updated_at = now()
  where clase_id = v_clase.id and estado in ('borrador','activa');

  insert into hechi.kahoots(clase_id, creator_user_id, creador_nombre)
  values (v_clase.id, auth.uid(), 'Maestro');

  return hechi.estado_clase_vista(v_clase.id, null);
end;
$$;

grant execute on function hechi.kahoot_nueva_actividad(text) to authenticated;
