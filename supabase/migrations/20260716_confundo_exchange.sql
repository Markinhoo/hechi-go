-- Incremental migration for Confundo student exchanges.
-- Safe for an existing HECHI GO database: it does not drop class/student tables.

drop function if exists hechi.intercambiar_alumnos(text, uuid, text, integer, text, text, uuid, uuid);

create or replace function hechi.intercambiar_alumnos(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_origen_id uuid, p_destino_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_origen hechi.alumnos%rowtype;
  v_destino hechi.alumnos%rowtype;
  v_puntos_origen integer;
  v_puntos_destino integer;
begin
  if p_numero <> 6 then
    raise exception 'Carta de intercambio invalida';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'Debes elegir dos alumnos diferentes';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and estado = 'activa';
  if not found then
    raise exception 'Token de clase no encontrado';
  end if;

  select * into v_alumno from hechi.alumnos where id = p_alumno_id and clase_id = v_clase.id;
  if not found or v_alumno.password <> p_password then
    raise exception 'Credenciales de alumno incorrectas';
  end if;
  if v_alumno.oportunidades <= 0 then
    raise exception 'Necesitas autorizacion del maestro para abrir carta';
  end if;

  select * into v_origen from hechi.alumnos where id = p_origen_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Alumno origen no encontrado';
  end if;

  select * into v_destino from hechi.alumnos where id = p_destino_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Alumno destino no encontrado';
  end if;

  if v_origen.casa_id <> v_alumno.casa_id then
    raise exception 'Solo puedes intercambiarte tu o elegir a alguien de tu casa';
  end if;
  if v_destino.casa_id = v_alumno.casa_id then
    raise exception 'El segundo alumno debe ser de otra casa';
  end if;
  if v_clase.casa_protegida is not null and (v_origen.casa_id = v_clase.casa_protegida or v_destino.casa_id = v_clase.casa_protegida) then
    raise exception 'Una de las casas esta protegida por Expecto Patronus';
  end if;

  v_puntos_origen := greatest(0, coalesce((v_clase.puntajes->>v_origen.casa_id)::integer, 0) - v_origen.puntos + v_destino.puntos);
  v_puntos_destino := greatest(0, coalesce((v_clase.puntajes->>v_destino.casa_id)::integer, 0) - v_destino.puntos + v_origen.puntos);

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      updated_at = now()
  where id = v_alumno.id;

  update hechi.alumnos
  set casa_id = case
        when id = v_origen.id then v_destino.casa_id
        when id = v_destino.id then v_origen.casa_id
        else casa_id
      end,
      updated_at = now()
  where id in (v_origen.id, v_destino.id);

  update hechi.clases
  set puntajes = puntajes || jsonb_build_object(v_origen.casa_id, v_puntos_origen, v_destino.casa_id, v_puntos_destino),
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, 0, v_destino.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;
grant execute on function hechi.intercambiar_alumnos(text, uuid, text, integer, text, text, uuid, uuid) to anon, authenticated;
