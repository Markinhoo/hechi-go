-- Riddikulus: the student chooses whether to tell a joke for +2 or refuse for -2.
-- Safe for an existing HECHI GO database: it only adds/replaces this RPC.

drop function if exists hechi.riddikulus_decision_chiste(text, uuid, text, integer, text, text, boolean);

create or replace function hechi.riddikulus_decision_chiste(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_acepta boolean)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_puntos integer;
  v_positivos integer;
  v_negativos integer;
  v_total integer;
begin
  if p_numero <> 15 then
    raise exception 'Carta Riddikulus invalida';
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

  v_puntos := case when p_acepta then 2 else -2 end;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      puntos = puntos + v_puntos,
      updated_at = now()
  where id = v_alumno.id;

  v_positivos := coalesce((v_clase.puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0));
  v_negativos := coalesce((v_clase.puntajes_negativos->>v_alumno.casa_id)::integer, 0);

  if v_puntos >= 0 then
    v_positivos := v_positivos + v_puntos;
  else
    v_negativos := v_negativos + abs(v_puntos);
  end if;

  v_total := greatest(0, v_positivos - v_negativos);

  update hechi.clases
  set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivos),
      puntajes_negativos = puntajes_negativos || jsonb_build_object(v_alumno.casa_id, v_negativos),
      puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_total),
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos, v_alumno.casa_id, p_titulo, case when p_acepta then 'Acepto contar un chiste frente al salon' else 'Se nego a contar un chiste frente al salon' end);

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.riddikulus_decision_chiste(text, uuid, text, integer, text, text, boolean) to anon, authenticated;
