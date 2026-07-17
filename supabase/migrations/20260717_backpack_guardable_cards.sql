-- Backpack cards: save Felix Felicis, Muertos en Vida, Invisibilidad, Crecehuesos and Vigorizante.

drop function if exists hechi.abrir_carta(text, uuid, text, integer, integer, text, text);
drop function if exists hechi.abrir_carta(text, uuid, text, integer, integer, text, text, text);

create or replace function hechi.abrir_carta(p_token text, p_alumno_id uuid, p_password text, p_numero integer, p_puntos integer, p_titulo text, p_descripcion text, p_casa_objetivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_alumno hechi.alumnos%rowtype;
  v_casa_objetivo text;
  v_puntos_efectivos integer;
  v_positivos integer;
  v_negativos integer;
  v_consumir_multiplicador boolean := false;
  v_veces_envejecedora integer;
begin
  if not (p_numero between 1 and 28) then
    raise exception 'Carta invalida';
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

  if p_numero = 2 then
    update hechi.alumnos
    set oportunidades = oportunidades - 1,
        cartas = array_append(cartas, p_numero),
        updated_at = now()
    where id = v_alumno.id;

    update hechi.clases
    set casa_protegida = v_alumno.casa_id,
        casa_multiplicador = v_alumno.casa_id,
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;

    insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
    values (v_clase.id, v_alumno.id, p_numero, 0, v_alumno.casa_id, p_titulo, p_descripcion);

    return hechi.estado_clase(v_clase.id);
  end if;

  if p_numero = 17 then
    v_casa_objetivo := v_alumno.casa_id;
    v_positivos := coalesce((v_clase.puntajes_positivos->>v_casa_objetivo)::integer, coalesce((v_clase.puntajes->>v_casa_objetivo)::integer, 0));
    v_negativos := floor(coalesce((v_clase.puntajes_negativos->>v_casa_objetivo)::integer, 0) / 2.0)::integer;

    update hechi.alumnos
    set oportunidades = oportunidades - 1,
        cartas = array_append(cartas, p_numero),
        updated_at = now()
    where id = v_alumno.id;

    update hechi.clases
    set puntajes_negativos = puntajes_negativos || jsonb_build_object(v_casa_objetivo, v_negativos),
        puntajes = puntajes || jsonb_build_object(v_casa_objetivo, v_positivos - v_negativos),
        sobre_activo = floor(random() * 7)::integer,
        updated_at = now()
    where id = v_clase.id;

    insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
    values (v_clase.id, v_alumno.id, p_numero, 0, v_casa_objetivo, p_titulo, p_descripcion);

    return hechi.estado_clase(v_clase.id);
  end if;

  v_puntos_efectivos := p_puntos;

  if p_numero = 5 then
    select count(*) + 1
    into v_veces_envejecedora
    from hechi.participaciones
    where clase_id = v_clase.id
      and carta = 5;

    v_puntos_efectivos := v_veces_envejecedora;
  end if;

  if v_puntos_efectivos <> 0 and v_clase.casa_multiplicador = v_alumno.casa_id then
    v_puntos_efectivos := v_puntos_efectivos * 2;
    v_consumir_multiplicador := true;
  end if;

  if v_puntos_efectivos < 0 then
    v_casa_objetivo := lower(trim(coalesce(p_casa_objetivo, '')));
    if v_casa_objetivo not in ('gryffindor','slytherin','ravenclaw','hufflepuff') then
      raise exception 'Selecciona una casa rival valida';
    end if;
    if v_casa_objetivo = v_alumno.casa_id then
      raise exception 'No puedes restarle puntos a tu propia casa';
    end if;
    if v_casa_objetivo = v_clase.casa_protegida then
      raise exception 'Esa casa esta protegida por Expecto Patronus';
    end if;
  else
    v_casa_objetivo := v_alumno.casa_id;
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades - 1,
      puntos = puntos + greatest(v_puntos_efectivos, 0),
      cartas = array_append(cartas, p_numero),
      cartas_guardadas = case when p_numero in (8, 13, 18, 19, 22) then cartas_guardadas || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'numero', p_numero, 'titulo', p_titulo, 'descripcion', p_descripcion, 'createdAt', now())) else cartas_guardadas end,
      updated_at = now()
  where id = v_alumno.id;

  v_positivos := coalesce((v_clase.puntajes_positivos->>v_casa_objetivo)::integer, coalesce((v_clase.puntajes->>v_casa_objetivo)::integer, 0));
  v_negativos := coalesce((v_clase.puntajes_negativos->>v_casa_objetivo)::integer, 0);

  if v_puntos_efectivos >= 0 then
    v_positivos := v_positivos + v_puntos_efectivos;
  else
    v_negativos := v_negativos + abs(v_puntos_efectivos);
  end if;

  update hechi.clases
  set puntajes_positivos = puntajes_positivos || jsonb_build_object(v_casa_objetivo, v_positivos),
      puntajes_negativos = puntajes_negativos || jsonb_build_object(v_casa_objetivo, v_negativos),
      puntajes = puntajes || jsonb_build_object(v_casa_objetivo, v_positivos - v_negativos),
      casa_multiplicador = case when v_consumir_multiplicador then null else casa_multiplicador end,
      sobre_activo = floor(random() * 7)::integer,
      updated_at = now()
  where id = v_clase.id;

  insert into hechi.participaciones(clase_id, alumno_id, carta, puntos, casa_objetivo, titulo, descripcion)
  values (v_clase.id, v_alumno.id, p_numero, v_puntos_efectivos, v_casa_objetivo, p_titulo, p_descripcion);

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.abrir_carta(text, uuid, text, integer, integer, text, text, text) to anon, authenticated;
