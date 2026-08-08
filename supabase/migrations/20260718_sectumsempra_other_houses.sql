-- Sectumsempra: subtract points from every other non-protected house.
-- Safe for an existing HECHI GO database: it only adds/replaces this RPC.

drop function if exists hechi.restar_puntos_otras_casas(text, uuid, text, integer, integer, text, text);

create or replace function hechi.restar_puntos_otras_casas(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_puntos integer, p_titulo text, p_descripcion text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_casa text;
  v_puntos integer;
  v_positivos integer;
  v_negativos integer;
  v_total integer;
  v_afectadas integer := 0;
begin
  if p_numero <> 12 then
    raise exception 'Carta Sectumsempra invalida';
  end if;

  v_puntos := greatest(1, p_puntos);

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

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      cartas = array_append(cartas, p_numero),
      updated_at = now()
  where id = v_alumno.id;

  foreach v_casa in array array['gryffindor','slytherin','ravenclaw','hufflepuff']
  loop
    if v_casa <> v_alumno.casa_id and (v_clase.casa_protegida is null or v_casa <> v_clase.casa_protegida) then
      v_positivos := coalesce((v_clase.puntajes_positivos->>v_casa)::integer, coalesce((v_clase.puntajes->>v_casa)::integer, 0));
      v_negativos := coalesce((v_clase.puntajes_negativos->>v_casa)::integer, 0) + v_puntos;
      v_total := greatest(0, v_positivos - v_negativos);

      update hechi.clases
      set puntajes_negativos = puntajes_negativos || jsonb_build_object(v_casa, v_negativos),
          puntajes = puntajes || jsonb_build_object(v_casa, v_total)
      where id = v_clase.id;

      v_afectadas := v_afectadas + 1;
    end if;
  end loop;

  update hechi.clases
  set sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, -(v_puntos * v_afectadas), null, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.restar_puntos_otras_casas(text, uuid, text, integer, integer, text, text) to anon, authenticated;
