-- New purchases use these prices; existing collections and balances are preserved.
begin;
create or replace function hechi.comprar_bestia(p_token text, p_alumno_id uuid, p_password text, p_bestia_id text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_precio integer;
begin
  v_precio := case p_bestia_id
    when 'bowtruckle' then 100
    when 'doxy' then 100
    when 'duendecillo' then 100
    when 'elfo' then 100
    when 'lechuza' then 100
    when 'acromantula' then 250
    when 'centauro' then 250
    when 'demiguise' then 250
    when 'dugbog' then 250
    when 'escarbato' then 250
    when 'fwooper' then 250
    when 'grindylow' then 250
    when 'basilisco' then 500
    when 'cerbero' then 500
    when 'dementor' then 500
    when 'gigante' then 500
    when 'hipogrifo' then 500
    when 'hombre-lobo' then 500
    when 'inferi' then 500
    when 'thestral' then 500
    when 'dragon' then 1000
    when 'fenix' then 1000
    when 'troll' then 1000
    when 'unicornio' then 1000
    else null
  end;

  if v_precio is null then
    raise exception 'Bestia no encontrada';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id for update;
  if not found or v_alumno.password <> p_password then
    raise exception 'Credenciales de alumno incorrectas';
  end if;

  if v_alumno.bestiario ? p_bestia_id then
    raise exception 'Ya tienes esta bestia en tu Bestiario Magico';
  end if;

  if v_alumno.galeones < v_precio then
    raise exception 'No tienes suficientes galeones';
  end if;

  update hechi.alumnos
  set galeones = galeones - v_precio,
      bestiario = bestiario || jsonb_build_array(p_bestia_id),
      elecciones_legendarias = elecciones_legendarias + case when p_bestia_id in ('dragon','fenix','troll','unicornio') then 1 else 0 end,
      updated_at = now()
  where id = v_alumno.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;
commit;
