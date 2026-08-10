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
  set puntos = 0,
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
