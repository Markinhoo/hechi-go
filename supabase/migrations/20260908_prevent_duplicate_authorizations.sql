-- One teacher approval per pending request. Kahoot rewards remain unchanged.
create or replace function hechi.autorizar_participacion(p_token text, p_alumno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_bonus_galeones integer := 0;
  v_actualizados integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  -- Claim the pending request atomically: repeated clicks cannot grant extra cards.
  update hechi.solicitudes
  set estado = 'autorizada'
  where clase_id = v_clase.id and alumno_id = p_alumno_id and estado = 'pendiente';
  get diagnostics v_actualizados = row_count;
  if v_actualizados = 0 then
    return hechi.estado_clase(v_clase.id);
  end if;

  select coalesce(sum(case bestia
    when 'bowtruckle' then 1
    when 'doxy' then 1
    when 'duendecillo' then 1
    when 'elfo' then 1
    when 'lechuza' then 1
    when 'acromantula' then 2
    when 'centauro' then 2
    when 'demiguise' then 2
    when 'dugbog' then 2
    when 'escarbato' then 2
    when 'fwooper' then 2
    when 'grindylow' then 2
    when 'basilisco' then 3
    when 'cerbero' then 3
    when 'dementor' then 3
    when 'gigante' then 3
    when 'hipogrifo' then 3
    when 'hombre-lobo' then 3
    when 'inferi' then 3
    when 'thestral' then 3
    when 'dragon' then 5
    when 'fenix' then 5
    when 'troll' then 5
    when 'unicornio' then 5
    else 0
  end), 0)::integer into v_bonus_galeones
  from hechi.alumnos a
  cross join lateral jsonb_array_elements_text(a.bestiario) as bestia
  where a.id = p_alumno_id and a.clase_id = v_clase.id;

  update hechi.alumnos
  set oportunidades = oportunidades + 1,
      galeones = galeones + 37 + v_bonus_galeones,
      updated_at = now()
  where id = p_alumno_id and clase_id = v_clase.id;

  get diagnostics v_actualizados = row_count;
  if v_actualizados = 0 then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.autorizar_participacion(text, uuid) to anon, authenticated;
