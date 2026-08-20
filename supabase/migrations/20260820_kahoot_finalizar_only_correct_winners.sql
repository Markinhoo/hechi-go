drop function if exists hechi.kahoot_finalizar(text);

create or replace function hechi.kahoot_finalizar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_kahoot hechi.kahoots%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;

  select * into v_clase
  from hechi.clases
  where token = upper(trim(p_token)) and created_by = auth.uid();

  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  select * into v_kahoot
  from hechi.kahoots
  where clase_id = v_clase.id and estado = 'activa'
  order by updated_at desc, created_at desc
  limit 1;

  if not found then
    raise exception 'No hay Kahoot activo';
  end if;

  with ranking as (
    select
      r.alumno_id,
      sum(case when r.correcta then 1 else 0 end)::integer as aciertos,
      sum(case when r.correcta then r.tiempo_ms else 20000 end)::integer as tiempo
    from hechi.kahoot_respuestas r
    where r.kahoot_id = v_kahoot.id
    group by r.alumno_id
  ),
  ranking_con_aciertos as (
    select
      alumno_id,
      aciertos,
      tiempo,
      row_number() over (order by aciertos desc, tiempo asc) as lugar
    from ranking
    where aciertos > 0
  ),
  premios as (
    select
      alumno_id,
      case lugar when 1 then 3 when 2 then 2 when 3 then 1 else 0 end as oportunidades
    from ranking_con_aciertos
    where lugar <= 3
  )
  update hechi.alumnos a
  set oportunidades = a.oportunidades + premios.oportunidades,
      updated_at = now()
  from premios
  where a.id = premios.alumno_id and premios.oportunidades > 0;

  update hechi.kahoots
  set estado = 'finalizada', finalizada_at = now(), updated_at = now()
  where id = v_kahoot.id;

  return hechi.estado_clase_vista(v_clase.id, null);
end;
$$;

grant execute on function hechi.kahoot_finalizar(text) to authenticated;