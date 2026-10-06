begin;
alter table hechi.alumnos add column if not exists bestias_usadas jsonb not null default '[]';
alter table hechi.alumnos add column if not exists beneficio_bestia text;
alter table hechi.alumnos add column if not exists beneficio_oportunidades integer;
alter table hechi.alumnos add column if not exists exencion_bestiario text not null default 'ninguna';

create or replace function hechi.bestiario_puntos(p_id text)
returns integer language sql immutable as $$
 select case when p_id in ('bowtruckle','doxy','duendecillo','elfo','lechuza') then 1
 when p_id in ('acromantula','centauro','demiguise','dugbog','escarbato','fwooper','grindylow') then 2
 when p_id in ('basilisco','cerbero','dementor','gigante','hipogrifo','hombre-lobo','inferi','thestral') then 3
 when p_id in ('dragon','fenix','troll','unicornio') then 0 else null end;
$$;
create or replace function hechi.bestiario_completo(p_coleccion jsonb)
returns boolean language sql immutable as $$
 select coalesce(p_coleccion,'[]') @> '["bowtruckle","doxy","duendecillo","elfo","lechuza","acromantula","centauro","demiguise","dugbog","escarbato","fwooper","grindylow","basilisco","cerbero","dementor","gigante","hipogrifo","hombre-lobo","inferi","thestral","dragon","fenix","troll","unicornio"]'::jsonb;
$$;

-- Preserve previously spent legendary choices, once, even on migration reruns.
do $legacy$
begin
 if not exists(select 1 from pg_trigger where tgname='bestiario_conservar_usos') then
  update hechi.alumnos a set bestias_usadas=coalesce((select jsonb_agg(id) from
   (select distinct value id from jsonb_array_elements_text(a.bestiario) where value in ('dragon','fenix','troll','unicornio') order by id offset greatest(0,a.elecciones_legendarias)) spent),'[]');
 end if;
end;
$legacy$;

-- Arena bonuses are replaced, not added to the participation benefits.
create or replace function hechi.arena_bonus_bestiario(p_bestiario jsonb)
returns integer language sql immutable as $$ select 0 $$;

create or replace function hechi.elegir_beneficio_bestia(p_token text,p_alumno_id uuid,p_password text,p_bestia text default null)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; a hechi.alumnos%rowtype;
begin
 select id into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' for update;
 if c is null then raise exception 'Clase no encontrada'; end if;
 select * into a from hechi.alumnos where id=p_alumno_id and clase_id=c for update;
 if not found or a.password is distinct from p_password then raise exception 'Credenciales incorrectas'; end if;
 if a.oportunidades<=0 then raise exception 'Necesitas una participación autorizada'; end if;
 if p_bestia is not null and (hechi.bestiario_puntos(p_bestia) is null or not a.bestiario ? p_bestia or a.bestias_usadas ? p_bestia) then raise exception 'Esta bestia no tiene un beneficio disponible'; end if;
 update hechi.alumnos set beneficio_bestia=p_bestia,beneficio_oportunidades=a.oportunidades where id=a.id;
 return hechi.estado_clase(c);
end;
$$;

create or replace function hechi.aplicar_beneficio_bestia(p_alumno uuid,p_oportunidades_antes integer)
returns void language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare a hechi.alumnos%rowtype; puntos_extra integer;
begin
 select * into a from hechi.alumnos where id=p_alumno for update;
 if a.beneficio_bestia is null or a.oportunidades is distinct from p_oportunidades_antes-1 then return; end if;
 if a.bestias_usadas ? a.beneficio_bestia or not a.bestiario ? a.beneficio_bestia then raise exception 'Beneficio no disponible'; end if;
 puntos_extra:=hechi.bestiario_puntos(a.beneficio_bestia);
 if puntos_extra is null then raise exception 'Bestia no válida'; end if;
 update hechi.alumnos set bestias_usadas=bestias_usadas||jsonb_build_array(a.beneficio_bestia),
  beneficio_bestia=null,beneficio_oportunidades=null,puntos=puntos+puntos_extra,
  elecciones_legendarias=greatest(0,elecciones_legendarias-case when puntos_extra=0 then 1 else 0 end),updated_at=now() where id=a.id;
 if puntos_extra>0 then
  update hechi.clases set puntajes_positivos=puntajes_positivos||jsonb_build_object(a.casa_id,coalesce((puntajes_positivos->>a.casa_id)::integer,0)+puntos_extra),
   puntajes=puntajes||jsonb_build_object(a.casa_id,coalesce((puntajes_positivos->>a.casa_id)::integer,0)+puntos_extra-coalesce((puntajes_negativos->>a.casa_id)::integer,0)),updated_at=now() where id=a.clase_id;
 end if;
end;
$$;
revoke all on function hechi.aplicar_beneficio_bestia(uuid,integer) from public,anon,authenticated;

-- Run after each spell has finished its own scoring, before returning its state.
do $wrap$
declare f record; definition text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='hechi' and p.proname in
 ('abrir_carta','intercambiar_alumnos','intercambiar_puntos_alumnos','sumar_puntos_companero','replicar_puntos_alumno','morsmordre_robar_puntos','restar_puntos_otras_casas','riddikulus_solicitar') loop
  definition:=pg_get_functiondef(f.oid);
  if position('aplicar_beneficio_bestia' in definition)=0 then
   if position('return hechi.estado_clase(' in definition)=0 then raise exception 'Función de carta no reconocida'; end if;
   definition:=replace(definition,'return hechi.estado_clase(',E'perform hechi.aplicar_beneficio_bestia(p_alumno_id,v_alumno.oportunidades);\n  return hechi.estado_clase(');
   execute definition;
  end if;
 end loop;
end;
$wrap$;

-- The old endpoint must not spend an additional choice before the spell succeeds.
create or replace function hechi.consumir_eleccion_legendaria(p_token text,p_alumno_id uuid,p_password text)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
begin raise exception 'Selecciona una bestia legendaria antes de abrir la carta'; end;
$$;

create or replace function hechi.solicitar_exencion_bestiario(p_token text,p_alumno_id uuid,p_password text)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; a hechi.alumnos%rowtype;
begin
 select id into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' for update;
 select * into a from hechi.alumnos where id=p_alumno_id and clase_id=c for update;
 if not found or a.password is distinct from p_password then raise exception 'Credenciales incorrectas'; end if;
 if not hechi.bestiario_completo(a.bestiario) then raise exception 'Necesitas las 24 bestias'; end if;
 if a.exencion_bestiario<>'autorizada' then update hechi.alumnos set exencion_bestiario='pendiente' where id=a.id; end if;
 return hechi.estado_clase(c);
end;
$$;
create or replace function hechi.autorizar_exencion_bestiario(p_token text,p_alumno_id uuid)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; a hechi.alumnos%rowtype;
begin
 if auth.uid() is null then raise exception 'Solo el maestro puede autorizar'; end if;
 select id into c from hechi.clases where token=upper(trim(p_token)) and estado='activa' and created_by=auth.uid() for update;
 if c is null then raise exception 'No autorizado como maestro'; end if;
 select * into a from hechi.alumnos where id=p_alumno_id and clase_id=c for update;
 if not found or not hechi.bestiario_completo(a.bestiario) or a.exencion_bestiario not in ('pendiente','autorizada') then raise exception 'No hay solicitud válida de exención'; end if;
 update hechi.alumnos set exencion_bestiario='autorizada',updated_at=now() where id=a.id;
 return hechi.estado_clase(c);
end;
$$;

-- Keep spent benefits across partial resets; clear only unfinished selections.
create or replace function hechi.bestiario_conservar_usos()
returns trigger language plpgsql as $$
begin
 if new.oportunidades=0 and new.cartas='{}'::integer[] then new.beneficio_bestia:=null;new.beneficio_oportunidades:=null; end if;
 if new.bestiario='[]'::jsonb and old.bestiario<>'[]'::jsonb then
  new.bestias_usadas:='[]';new.beneficio_bestia:=null;new.beneficio_oportunidades:=null;new.exencion_bestiario:='ninguna';
 end if;
 return new;
end;
$$;
drop trigger if exists bestiario_conservar_usos on hechi.alumnos;
create trigger bestiario_conservar_usos before update on hechi.alumnos for each row execute function hechi.bestiario_conservar_usos();

do $state$
declare definition text;
begin
 select pg_get_functiondef('hechi.estado_clase(uuid)'::regprocedure) into definition;
 if position('bestiasUsadas' in definition)=0 then
  if position('''bestiario'', a.bestiario,' in definition)=0 then raise exception 'Estado de clase no reconocido'; end if;
  definition:=replace(definition,'''bestiario'', a.bestiario,',E'''bestiario'', a.bestiario,\n    ''bestiasUsadas'', a.bestias_usadas,\n    ''beneficioBestia'', a.beneficio_bestia,\n    ''exencionBestiario'', a.exencion_bestiario,');
  execute definition;
 end if;
end;
$state$;
do $period$
declare definition text; reset_function regprocedure;
begin
 -- The backup migration moves the actual reset into this private function.
 -- Leave both public wrappers intact so snapshots and retry protection remain.
 reset_function:=coalesce(to_regprocedure('hechi.reiniciar_clase_sin_respaldo(text)'),to_regprocedure('hechi.reiniciar_clase(text)'));
 if reset_function is not null then
  select pg_get_functiondef(reset_function) into definition;
  if position('exencion_bestiario' in definition)=0 then
   if position('delete from hechi.participaciones where clase_id = v_clase.id;' in definition)=0 then raise exception 'Reinicio de parcial no reconocido'; end if;
   definition:=replace(definition,'delete from hechi.participaciones where clase_id = v_clase.id;',E'update hechi.alumnos set exencion_bestiario=''ninguna'',beneficio_bestia=null,beneficio_oportunidades=null where clase_id=v_clase.id;\n  delete from hechi.participaciones where clase_id = v_clase.id;');
   execute definition;
  end if;
 end if;
end;
$period$;
revoke all on function hechi.elegir_beneficio_bestia(text,uuid,text,text),hechi.solicitar_exencion_bestiario(text,uuid,text) from public;
grant execute on function hechi.elegir_beneficio_bestia(text,uuid,text,text),hechi.solicitar_exencion_bestiario(text,uuid,text) to anon,authenticated;
revoke all on function hechi.autorizar_exencion_bestiario(text,uuid) from public,anon;
grant execute on function hechi.autorizar_exencion_bestiario(text,uuid) to authenticated;
commit;
