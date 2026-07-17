-- Incremental migration for Confundo point exchanges.
-- Safe for an existing HECHI GO database: it does not drop class/student tables.

drop function if exists hechi.intercambiar_puntos_alumnos(text, uuid, text, integer, text, text, uuid);

create or replace function hechi.intercambiar_puntos_alumnos(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_titulo text, p_descripcion text, p_objetivo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_objetivo hechi.alumnos%rowtype;
  v_es_lider boolean;
  v_nuevo_alumno integer;
  v_nuevo_objetivo integer;
  v_delta_alumno integer;
  v_delta_objetivo integer;
  v_puntaje_casa_alumno integer;
  v_puntaje_casa_objetivo integer;
begin
  if p_numero <> 4 then
    raise exception 'Carta de intercambio de puntos invalida';
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

  select not exists (
    select 1 from hechi.alumnos
    where clase_id = v_clase.id
      and id <> v_alumno.id
      and puntos >= v_alumno.puntos
  ) into v_es_lider;

  if v_es_lider then
    v_nuevo_alumno := v_alumno.puntos + v_objetivo.puntos;
    v_nuevo_objetivo := 0;
  else
    v_nuevo_alumno := v_objetivo.puntos;
    v_nuevo_objetivo := v_alumno.puntos;
  end if;

  v_delta_alumno := v_nuevo_alumno - v_alumno.puntos;
  v_delta_objetivo := v_nuevo_objetivo - v_objetivo.puntos;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      puntos = v_nuevo_alumno,
      updated_at = now()
  where id = v_alumno.id;

  update hechi.alumnos
  set puntos = v_nuevo_objetivo,
      updated_at = now()
  where id = v_objetivo.id;

  if v_alumno.casa_id = v_objetivo.casa_id then
    v_puntaje_casa_alumno := greatest(0, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + v_delta_alumno + v_delta_objetivo);
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_casa_alumno),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  else
    v_puntaje_casa_alumno := greatest(0, coalesce((v_clase.puntajes->>v_alumno.casa_id)::integer, 0) + v_delta_alumno);
    v_puntaje_casa_objetivo := greatest(0, coalesce((v_clase.puntajes->>v_objetivo.casa_id)::integer, 0) + v_delta_objetivo);
    update hechi.clases
    set puntajes = puntajes || jsonb_build_object(v_alumno.casa_id, v_puntaje_casa_alumno, v_objetivo.casa_id, v_puntaje_casa_objetivo),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;
  end if;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_delta_alumno, v_objetivo.casa_id, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.intercambiar_puntos_alumnos(text, uuid, text, integer, text, text, uuid) to anon, authenticated;
