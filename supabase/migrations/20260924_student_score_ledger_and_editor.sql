-- Persistent student score breakdown. History records actions, not always recipients.
begin;
alter table hechi.alumnos add column if not exists puntos_positivos integer;
alter table hechi.alumnos add column if not exists puntos_negativos integer;

-- Recover known personal penalties (including manual deductions with missing earnings).
-- House attacks 3/9/12 must never be charged to their caster.
with historial as (
  select alumno_id,
    sum(greatest(puntos,0))::integer as positivos,
    sum(case when puntos < 0 and (carta not in (3,9,12)
      or titulo in ('Ajuste manual','Quita manual')) then -puntos else 0 end)::integer as negativos
  from hechi.participaciones group by alumno_id
), saldos as (
  select a.id, greatest(coalesce(h.positivos,0), a.puntos + coalesce(h.negativos,0), 0) as positivos
  from hechi.alumnos a left join historial h on h.alumno_id=a.id
  where a.puntos_positivos is null or a.puntos_negativos is null
)
update hechi.alumnos a set puntos_positivos=s.positivos, puntos_negativos=s.positivos-a.puntos
from saldos s where s.id=a.id;

alter table hechi.alumnos alter column puntos_positivos set default 0;
alter table hechi.alumnos alter column puntos_negativos set default 0;
alter table hechi.alumnos alter column puntos_positivos set not null;
alter table hechi.alumnos alter column puntos_negativos set not null;

create or replace function hechi.registrar_desglose_alumno()
returns trigger language plpgsql set search_path=hechi,public,pg_catalog as $$
begin
  if TG_OP='INSERT' then
    new.puntos_positivos := greatest(new.puntos,0);
    new.puntos_negativos := greatest(-new.puntos,0);
  elsif new.puntos_positivos is distinct from old.puntos_positivos
     or new.puntos_negativos is distinct from old.puntos_negativos then
    -- Explicit table edits/reset provide both counters.
    new.puntos := new.puntos_positivos-new.puntos_negativos;
  else
    new.puntos_positivos := old.puntos_positivos + greatest(new.puntos-old.puntos,0);
    new.puntos_negativos := old.puntos_negativos + greatest(old.puntos-new.puntos,0);
  end if;
  return new;
end;
$$;
drop trigger if exists registrar_desglose_alumno on hechi.alumnos;
create trigger registrar_desglose_alumno before insert or update of puntos,puntos_positivos,puntos_negativos
on hechi.alumnos for each row execute function hechi.registrar_desglose_alumno();
alter table hechi.alumnos drop constraint if exists alumnos_desglose_check;
alter table hechi.alumnos add constraint alumnos_desglose_check
  check(puntos_positivos>=0 and puntos_negativos>=0 and puntos=puntos_positivos-puntos_negativos);
create or replace function hechi.estado_clase(p_clase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_conteos jsonb;
  v_alumnos jsonb;
  v_historial jsonb;
  v_solicitudes jsonb;
  v_puntajes jsonb;
  v_generales_positivos jsonb := '{}'::jsonb;
  v_generales_negativos jsonb := '{}'::jsonb;
  v_casa text;
  v_pos integer;
  v_neg integer;
  v_total integer;
  v_general_pos integer;
  v_general_neg integer;
begin
  select * into v_clase from hechi.clases where id = p_clase_id;
  if not found then
    raise exception 'Clase no encontrada';
  end if;

  v_puntajes := jsonb_build_object(
    'gryffindor', coalesce((v_clase.puntajes_positivos->>'gryffindor')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'gryffindor')::integer, 0),
    'slytherin', coalesce((v_clase.puntajes_positivos->>'slytherin')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'slytherin')::integer, 0),
    'ravenclaw', coalesce((v_clase.puntajes_positivos->>'ravenclaw')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'ravenclaw')::integer, 0),
    'hufflepuff', coalesce((v_clase.puntajes_positivos->>'hufflepuff')::integer, 0) - coalesce((v_clase.puntajes_negativos->>'hufflepuff')::integer, 0)
  );

  -- Reconcile cumulative individual counters with the official net house score.
  -- Exchanges/house spells may have changed the legacy aggregate breakdown.
  foreach v_casa in array array['gryffindor','slytherin','ravenclaw','hufflepuff'] loop
    select coalesce(sum(puntos_positivos),0),coalesce(sum(puntos_negativos),0)
      into v_pos,v_neg from hechi.alumnos where clase_id=p_clase_id and casa_id=v_casa;
    v_total := (v_puntajes->>v_casa)::integer;
    v_general_neg := greatest(coalesce((v_clase.puntajes_negativos->>v_casa)::integer,0)-v_neg,
                              v_pos-v_neg-v_total,0);
    v_general_pos := v_total-v_pos+v_neg+v_general_neg;
    v_generales_positivos := v_generales_positivos||jsonb_build_object(v_casa,v_general_pos);
    v_generales_negativos := v_generales_negativos||jsonb_build_object(v_casa,v_general_neg);
    v_clase.puntajes_positivos := v_clase.puntajes_positivos||jsonb_build_object(v_casa,v_pos+v_general_pos);
    v_clase.puntajes_negativos := v_clase.puntajes_negativos||jsonb_build_object(v_casa,v_neg+v_general_neg);
  end loop;
  select jsonb_build_object(
    'gryffindor', count(*) filter (where casa_id = 'gryffindor'),
    'slytherin', count(*) filter (where casa_id = 'slytherin'),
    'ravenclaw', count(*) filter (where casa_id = 'ravenclaw'),
    'hufflepuff', count(*) filter (where casa_id = 'hufflepuff')
  ) into v_conteos
  from hechi.alumnos
  where clase_id = p_clase_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'nombre', a.nombre,
    'casaId', a.casa_id,
    'puntos', a.puntos,
    'puntosPositivos', a.puntos_positivos,
    'puntosNegativos', a.puntos_negativos,
    'cartas', a.cartas,
    'cartasGuardadas', a.cartas_guardadas,
    'galeones', a.galeones,
    'bestiario', a.bestiario,
    'eleccionesLegendarias', a.elecciones_legendarias,
    'flashSignal', a.flash_signal,
    'oportunidades', a.oportunidades
  ) order by a.puntos desc, a.created_at), '[]'::jsonb)
  into v_alumnos
  from hechi.alumnos a
  where a.clase_id = p_clase_id;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_historial
  from (
  select jsonb_build_object(
      'id', p.id,
      'alumno', a.nombre,
      'casaId', coalesce(p.casa_objetivo, a.casa_id),
      'casaAlumno', a.casa_id,
      'casaObjetivo', p.casa_objetivo,
      'carta', p.carta,
      'puntos', p.puntos,
      'titulo', p.titulo,
      'descripcion', p.descripcion,
      'createdAt', p.created_at
    ) as item
    from hechi.participaciones p
    join hechi.alumnos a on a.id = p.alumno_id
    where p.clase_id = p_clase_id
    order by p.created_at desc
    limit 100
  ) recientes;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_solicitudes
  from (
  select jsonb_build_object(
      'id', s.id,
      'alumnoId', a.id,
      'alumno', a.nombre,
      'casaId', a.casa_id,
      'createdAt', s.created_at
    ) as item
    from hechi.solicitudes s
    join hechi.alumnos a on a.id = s.alumno_id
    where s.clase_id = p_clase_id and s.estado = 'pendiente'
    order by s.created_at asc
  ) pendientes;

  return jsonb_build_object(
    'id', v_clase.id,
    'token', v_clase.token,
    'nombre', v_clase.nombre,
    'total', v_clase.total,
    'estado', v_clase.estado,
    'objetivos', v_clase.objetivos,
    'puntajes', v_puntajes,
    'puntajesGeneralesPositivos', v_generales_positivos,
    'puntajesGeneralesNegativos', v_generales_negativos,
    'puntajesPositivos', v_clase.puntajes_positivos,
    'puntajesNegativos', v_clase.puntajes_negativos,
    'casaProtegida', v_clase.casa_protegida,
    'casaMultiplicador', v_clase.casa_multiplicador,
    'conteos', v_conteos,
    'alumnos', v_alumnos,
    'historial', v_historial,
    'solicitudes', v_solicitudes,
    'sobreActivo', v_clase.sobre_activo
  );
end;
$$;


-- New grading period reset: clear the house cup race without deleting long-term student progress.

create or replace function hechi.reiniciar_clase(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion como maestro';
  end if;

  select * into v_clase
  from hechi.clases
  where token = upper(trim(p_token)) and created_by = auth.uid();

  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  delete from hechi.participaciones where clase_id = v_clase.id;
  delete from hechi.solicitudes where clase_id = v_clase.id;

  update hechi.alumnos
  set puntos = 0, puntos_positivos = 0, puntos_negativos = 0,
      cartas = '{}',
      cartas_guardadas = '[]'::jsonb,
      oportunidades = 0,
      updated_at = now()
  where clase_id = v_clase.id;

  update hechi.clases
  set puntajes = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb,
      puntajes_positivos = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb,
      puntajes_negativos = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb,
      casa_protegida = null,
      casa_multiplicador = null,
      sobre_activo = 0,
      updated_at = now()
  where id = v_clase.id;

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.reiniciar_clase(text) to authenticated;

-- All rows and house effects are committed together; stale snapshots are rejected.
create or replace function hechi.actualizar_tabla_puntajes(
  p_token text, p_casa_id text, p_alumnos jsonb, p_original jsonb,
  p_general_negativo integer, p_general_positivo integer)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare
  v_clase hechi.clases%rowtype;
  v_estado jsonb;
  v_actual jsonb;
  v_fila jsonb;
  v_alumno hechi.alumnos%rowtype;
  v_pos integer;
  v_neg integer;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion como maestro'; end if;
  select * into v_clase from hechi.clases
    where token=upper(trim(p_token)) and created_by=auth.uid() and estado='activa' for update;
  if not found then raise exception 'No autorizado como maestro'; end if;
  if p_casa_id is null or p_casa_id not in ('gryffindor','slytherin','ravenclaw','hufflepuff') then
    raise exception 'Casa invalida';
  end if;
  if p_general_negativo is null or p_general_negativo<0 or p_general_positivo is null or p_general_positivo<0 then
    raise exception 'Los puntos generales deben ser enteros no negativos';
  end if;
  if jsonb_typeof(p_alumnos) is distinct from 'array' then raise exception 'Tabla invalida'; end if;
  -- Lock every class member so changes of house cannot race with the snapshot.
  perform id from hechi.alumnos where clase_id=v_clase.id order by id for update;
  v_estado := hechi.estado_clase(v_clase.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'positivos',puntos_positivos,
    'negativos',puntos_negativos) order by id),'[]'::jsonb) into v_actual
    from hechi.alumnos where clase_id=v_clase.id and casa_id=p_casa_id;
  v_actual := jsonb_build_object('alumnos',v_actual,
    'generalNegativo',(v_estado->'puntajesGeneralesNegativos'->>p_casa_id)::integer,
    'generalPositivo',(v_estado->'puntajesGeneralesPositivos'->>p_casa_id)::integer);
  if p_original is distinct from v_actual then
    raise exception 'Los puntajes cambiaron. Cierra y abre la tabla para editar los datos actuales.';
  end if;
  if jsonb_array_length(p_alumnos)<>(select count(*) from hechi.alumnos where clase_id=v_clase.id and casa_id=p_casa_id)
     or (select count(distinct x->>'id') from jsonb_array_elements(p_alumnos) x)<>jsonb_array_length(p_alumnos) then
    raise exception 'La tabla debe incluir una vez a cada alumno de esta casa';
  end if;
  for v_fila in select value from jsonb_array_elements(p_alumnos) loop
    if coalesce(v_fila->>'positivos','') !~ '^[0-9]+$' or coalesce(v_fila->>'negativos','') !~ '^[0-9]+$' then
      raise exception 'Usa puntos enteros no negativos';
    end if;
    v_pos := (v_fila->>'positivos')::integer;
    v_neg := (v_fila->>'negativos')::integer;
    select * into v_alumno from hechi.alumnos where id=(v_fila->>'id')::uuid
      and clase_id=v_clase.id and casa_id=p_casa_id;
    if not found then raise exception 'Alumno ajeno a esta casa'; end if;
    if v_pos<>v_alumno.puntos_positivos or v_neg<>v_alumno.puntos_negativos then
      update hechi.alumnos set puntos_positivos=v_pos,puntos_negativos=v_neg,
        puntos=v_pos-v_neg,updated_at=now() where id=v_alumno.id;
      insert into hechi.participaciones(clase_id,alumno_id,carta,puntos,casa_objetivo,titulo,descripcion)
      values(v_clase.id,v_alumno.id,1,(v_pos-v_neg)-v_alumno.puntos,p_casa_id,'Ajuste manual',
        'Tabla: positivos '||v_alumno.puntos_positivos||' -> '||v_pos||
        ', negativos '||v_alumno.puntos_negativos||' -> '||v_neg);
    end if;
  end loop;
  select coalesce(sum(puntos_positivos),0)+p_general_positivo,
         coalesce(sum(puntos_negativos),0)+p_general_negativo into v_pos,v_neg
    from hechi.alumnos where clase_id=v_clase.id and casa_id=p_casa_id;
  update hechi.clases set
    puntajes_positivos=puntajes_positivos||jsonb_build_object(p_casa_id,v_pos),
    puntajes_negativos=puntajes_negativos||jsonb_build_object(p_casa_id,v_neg),
    puntajes=puntajes||jsonb_build_object(p_casa_id,v_pos-v_neg),updated_at=now()
    where id=v_clase.id;
  return hechi.estado_clase(v_clase.id);
end;
$$;
revoke all on function hechi.actualizar_tabla_puntajes(text,text,jsonb,jsonb,integer,integer) from public,anon;
grant execute on function hechi.actualizar_tabla_puntajes(text,text,jsonb,jsonb,integer,integer) to authenticated;
commit;