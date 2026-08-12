-- Testing reset: clear long-term bestiary/galleon progress without touching class scores.

create or replace function hechi.reiniciar_bestiario_galeones(p_token text)
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

  update hechi.alumnos
  set galeones = 0,
      bestiario = '[]'::jsonb,
      updated_at = now()
  where clase_id = v_clase.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.reiniciar_bestiario_galeones(text) to authenticated;
