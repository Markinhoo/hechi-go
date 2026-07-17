-- Fix class reset so positive/negative scoreboard breakdown is cleared too.

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
  delete from hechi.alumnos where clase_id = v_clase.id;

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

-- Clean up classes that were already reset before this fix: no students/history, zero effective score,
-- but stale positive/negative breakdown values still visible in the UI.
update hechi.clases c
set puntajes_positivos = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb,
    puntajes_negativos = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb,
    updated_at = now()
where c.puntajes = '{"gryffindor":0,"slytherin":0,"ravenclaw":0,"hufflepuff":0}'::jsonb
  and not exists (select 1 from hechi.alumnos a where a.clase_id = c.id)
  and not exists (select 1 from hechi.participaciones p where p.clase_id = c.id);

grant execute on function hechi.reiniciar_clase(text) to authenticated;
