-- Multijugos: replicate the points of another available student.
-- Safe for an existing HECHI GO database: it only adds/replaces this RPC.

drop function if exists hechi.replicar_puntos_alumno(text, uuid, text, integer, text, text, uuid);

create or replace function hechi.replicar_puntos_alumno(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_objetivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_objetivo hechi.alumnos%rowtype;
  v_puntos integer;
  v_positivos integer;
  v_negativos integer;
  v_total integer;
  v_consumir_multiplicador boolean := false;
begin
  if p_numero <> 26 then
    raise exception 'Carta Multijugos invalida';
  end if;
  if p_alumno_id = p_objetivo_id then
    raise exception 'Debes elegir otro alumno';
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

  select * into v_objetivo from hechi.alumnos where id = p_objetivo_id and clase_id = v_clase.id;
  if not found then
    raise exception 'Alumno objetivo no encontrado';
  end if;

  if v_clase.casa_protegida is not null and v_objetivo.casa_id = v_clase.casa_protegida then
    raise exception 'Ese alumno pertenece a una casa protegida por Expecto Patronus';
  end if;

  v_puntos := greatest(0, v_objetivo.puntos);
  if v_puntos <> 0 and v_clase.casa_multiplicador = v_alumno.casa_id then
    v_puntos := v_puntos * 2;
    v_consumir_multiplicador := true;
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      puntos = puntos + v_puntos,
      updated_at = now()
  where id = v_alumno.id;

  v_positivos := coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0)) + v_puntos;
  v_negativos := coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0);
  v_total := greatest(0, v_positivos - v_negativos);

  update hechi.clases
  set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivos),
      puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_total),
      casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos, v_objetivo.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.replicar_puntos_alumno(text, uuid, text, integer, text, text, uuid) to anon, authenticated;
