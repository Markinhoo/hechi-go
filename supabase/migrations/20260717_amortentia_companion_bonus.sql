-- Incremental migration for Amortentia companion bonus.
-- Safe for an existing HECHI GO database: it does not drop class/student tables.

drop function if exists hechi.sumar_puntos_companero(text, uuid, text, integer, text, text, uuid);

create or replace function hechi.sumar_puntos_companero(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_companero_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_companero hechi.alumnos%rowtype;
  v_puntos integer := 2;
  v_consumir_multiplicador boolean := false;
  v_puntaje_alumno integer;
  v_puntaje_companero integer;
begin
  if p_numero <> 16 then
    raise exception 'Carta de companero invalida';
  end if;
  if p_alumno_id = p_companero_id then
    raise exception 'Debes elegir otro companero';
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

  select * into v_companero from hechi.alumnos where id = p_companero_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Companero no encontrado';
  end if;

  if v_clase.casa_multiplicador = v_alumno.casa_id then
    v_puntos := 4;
    v_consumir_multiplicador := true;
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      puntos = puntos + v_puntos,
      updated_at = now()
  where id = v_alumno.id;

  update hechi.alumnos
  set puntos = puntos + v_puntos,
      updated_at = now()
  where id = v_companero.id;

  if v_alumno.casa_id = v_companero.casa_id then
    v_puntaje_alumno := coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + (v_puntos * 2);
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_alumno),
        casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  else
    v_puntaje_alumno := coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + v_puntos;
    v_puntaje_companero := coalesce((v_clase.puntajes->>v_companero.casa_id)::integer, 0) + v_puntos;
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_alumno, v_companero.casa_id, v_puntaje_companero),
        casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  end if;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos, v_companero.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.sumar_puntos_companero(text, uuid, text, integer, text, text, uuid) to anon, authenticated;
