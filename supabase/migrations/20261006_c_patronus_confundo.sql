-- Preserve installed scoring and audit logic; add the missing target protection.
begin;
do $repair$
declare definition text; anchor text := '  select not exists (';
begin
 select pg_get_functiondef('hechi.intercambiar_puntos_alumnos(text,uuid,text,integer,text,text,uuid)'::regprocedure) into definition;
 if position('patronus_confundo_guard' in definition)=0 then
  if position(anchor in definition)=0 then raise exception 'No se reconoce la función Confundo instalada; no se modificó'; end if;
  definition:=replace(definition,anchor,E'  -- patronus_confundo_guard\n  if v_objetivo.casa_id = v_clase.casa_protegida then\n    raise exception ''Ese alumno pertenece a una casa protegida por Expecto Patronus'';\n  end if;\n\n' || anchor);
  execute definition;
 end if;
end;
$repair$;
commit;
