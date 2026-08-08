-- Morsmordre: subtract 1 point from 5 selected students and add 5 to the caster.
-- Safe for an existing HECHI GO database: it only adds/replaces this RPC.

drop function if exists hechi.morsmordre_robar_puntos(text, uuid, text, integer, text, text, uuid[]);

create or replace function hechi.morsmordre_robar_puntos(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_objetivo_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_objetivo hechi.alumnos%rowtype;
  v_objetivo_id uuid;
  v_positivos integer;
  v_negativos integer;
  v_total integer;
  v_puntos_ganados integer := 5;
begin
  if p_numero <> 10 then
    raise exception 'Carta Morsmordre invalida';
  end if;
  if coalesce(array_length(p_objetivo_ids, 1), 0) <> 5 then
    raise exception 'Debes elegir exactamente 5 alumnos';
  end if;
  if (select count(distinct item) from unnest(p_objetivo_ids) item) <> 5 then
    raise exception 'No puedes repetir alumnos';
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

  foreach v_objetivo_id in array p_objetivo_ids
  loop
    if v_objetivo_id = v_alumno.id then
      raise exception 'No puedes elegirte a ti mismo';
    end if;

    select * into v_objetivo from hechi.alumnos where id = v_objetivo_id and clase_id = v_clase.id;
    if not found then
      raise exception 'Alumno objetivo no encontrado';
    end if;

    if v_clase.casa_protegida is not null and v_objetivo.casa_id = v_clase.casa_protegida then
      raise exception 'No puedes elegir alumnos de una casa protegida';
    end if;
  end loop;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      puntos = puntos + v_puntos_ganados,
      updated_at = now()
  where id = v_alumno.id;

  select coalesce((puntajes_positivos->>v_alumno.casa_id)::integer, coalesce((puntajes->>v_alumno.casa_id)::integer, 0)),
         coalesce((puntajes_negativos->>v_alumno.casa_id)::integer, 0)
  into v_positivos, v_negativos
  from hechi.clases
  where id = v_clase.id;

  v_positivos := v_positivos + v_puntos_ganados;
  v_total := greatest(0, v_positivos - v_negativos);

  update hechi.clases
  set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_alumno.casa_id, v_positivos),
      puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_total)
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos_ganados, v_alumno.casa_id, p_titulo, p_descripcion);

  foreach v_objetivo_id in array p_objetivo_ids
  loop
    select * into v_objetivo from hechi.alumnos where id = v_objetivo_id and clase_id = v_clase.id;

    update hechi.alumnos
    set puntos = puntos - 1,
        updated_at = now()
    where id = v_objetivo.id;

    select coalesce((puntajes_positivos->>v_objetivo.casa_id)::integer, coalesce((puntajes->>v_objetivo.casa_id)::integer, 0)),
           coalesce((puntajes_negativos->>v_objetivo.casa_id)::integer, 0)
    into v_positivos, v_negativos
    from hechi.clases
    where id = v_clase.id;

    v_negativos := v_negativos + 1;
    v_total := greatest(0, v_positivos - v_negativos);

    update hechi.clases
    set puntajes_negativos = puntajes_negativos || jsonb_build_object(v_objetivo.casa_id, v_negativos),
        puntajes = puntajes || jsonb_build_object(v_objetivo.casa_id, v_total)
    where id = v_clase.id;

    insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
    values (v_clase.id, v_objetivo.id, p_numero, -1, v_alumno.casa_id, p_titulo, 'Morsmordre aplicado por ' || v_alumno.nombre);
  end loop;

  update hechi.clases
  set sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.morsmordre_robar_puntos(text, uuid, text, integer, text, text, uuid[]) to anon, authenticated;
