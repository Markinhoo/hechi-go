-- Audit real score changes, group effects by action, and safely undo teacher adjustments.
begin;
create table if not exists hechi.operaciones_puntaje (
 id uuid primary key default gen_random_uuid(), secuencia bigserial unique,
 clase_id uuid not null references hechi.clases(id) on delete cascade,
 origen text not null, actor text not null, titulo text not null,
 deshecha boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists hechi.movimientos_puntaje (
 id bigserial primary key,
 operacion_id uuid not null references hechi.operaciones_puntaje(id) on delete cascade,
 tipo text not null, objetivo_id text not null, nombre text not null,
 antes jsonb not null, despues jsonb not null
);
create index if not exists operaciones_puntaje_clase on hechi.operaciones_puntaje(clase_id,secuencia desc);
create index if not exists movimientos_puntaje_operacion on hechi.movimientos_puntaje(operacion_id,id);
alter table hechi.operaciones_puntaje enable row level security;
alter table hechi.movimientos_puntaje enable row level security;
revoke all on hechi.operaciones_puntaje,hechi.movimientos_puntaje from public,anon,authenticated;

create or replace function hechi.iniciar_operacion_puntaje(p_token text,p_actor uuid,p_origen text,p_titulo text)
returns uuid language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare v_clase uuid; v_actor text; v_id uuid;
begin
  select id into v_clase from hechi.clases where token=upper(trim(p_token)) for update;
  if v_clase is null then raise exception 'Clase no encontrada'; end if;
  if p_actor is null then v_actor:='Maestro';
  else select nombre into v_actor from hechi.alumnos where id=p_actor and clase_id=v_clase;
  end if;
  insert into hechi.operaciones_puntaje(clase_id,origen,actor,titulo)
    values(v_clase,p_origen,coalesce(v_actor,'Alumno'),p_titulo) returning id into v_id;
  perform set_config('hechi.operacion_puntaje',v_id::text,true);
  return v_id;
end;
$$;
revoke all on function hechi.iniciar_operacion_puntaje(text,uuid,text,text) from public,anon,authenticated;

create or replace function hechi.auditar_puntajes()
returns trigger language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare v_id uuid; v_clase uuid; v_antes jsonb; v_despues jsonb; v_casa text;
begin
  if TG_TABLE_NAME='alumnos' then v_clase:=old.clase_id; else v_clase:=old.id; end if;
  -- Cascading class deletion must not recreate audit rows for a deleted class.
  if not exists(select 1 from hechi.clases where id=v_clase) then return null; end if;
  v_id := nullif(current_setting('hechi.operacion_puntaje',true),'')::uuid;
  if not exists(select 1 from hechi.operaciones_puntaje where id=v_id and clase_id=v_clase) then
    insert into hechi.operaciones_puntaje(clase_id,origen,actor,titulo)
    values(v_clase,'sistema','Sistema','Cambio de puntaje') returning id into v_id;
    perform set_config('hechi.operacion_puntaje',v_id::text,true);
  end if;
  if TG_TABLE_NAME='alumnos' then
    v_antes:=jsonb_build_object('positivos',old.puntos_positivos,'negativos',old.puntos_negativos,
      'total',old.puntos,'casaId',old.casa_id);
    if TG_OP='DELETE' then v_despues:='null'::jsonb;
    else v_despues:=jsonb_build_object('positivos',new.puntos_positivos,'negativos',new.puntos_negativos,
      'total',new.puntos,'casaId',new.casa_id); end if;
    if v_antes is distinct from v_despues then
      insert into hechi.movimientos_puntaje(operacion_id,tipo,objetivo_id,nombre,antes,despues)
        values(v_id,'alumno',old.id::text,old.nombre,v_antes,v_despues);
    end if;
  else
    foreach v_casa in array array['gryffindor','slytherin','ravenclaw','hufflepuff'] loop
      v_antes:=jsonb_build_object('positivos',coalesce((old.puntajes_positivos->>v_casa)::integer,0),
        'negativos',coalesce((old.puntajes_negativos->>v_casa)::integer,0));
      v_despues:=jsonb_build_object('positivos',coalesce((new.puntajes_positivos->>v_casa)::integer,0),
        'negativos',coalesce((new.puntajes_negativos->>v_casa)::integer,0));
      v_antes:=v_antes||jsonb_build_object('total',(v_antes->>'positivos')::integer-(v_antes->>'negativos')::integer);
      v_despues:=v_despues||jsonb_build_object('total',(v_despues->>'positivos')::integer-(v_despues->>'negativos')::integer);
      if v_antes is distinct from v_despues then
        insert into hechi.movimientos_puntaje(operacion_id,tipo,objetivo_id,nombre,antes,despues)
        values(v_id,'casa',v_casa,v_casa,v_antes,v_despues);
      end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke all on function hechi.auditar_puntajes() from public,anon,authenticated;
drop trigger if exists auditar_puntajes_alumno on hechi.alumnos;
create trigger auditar_puntajes_alumno after update of puntos,puntos_positivos,puntos_negativos,casa_id or delete
on hechi.alumnos for each row execute function hechi.auditar_puntajes();
drop trigger if exists auditar_puntajes_casa on hechi.clases;
create trigger auditar_puntajes_casa after update of puntajes_positivos,puntajes_negativos
on hechi.clases for each row execute function hechi.auditar_puntajes();

-- Instrument the installed RPCs, retaining their current validations and effects.
-- No client-supplied audit context is accepted. Each failed action rolls its audit back.
do $instrumentar$
declare f record; definicion text; actor text; titulo text; llamada text;
begin
  for f in select p.oid,p.proname,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='hechi' and p.proname in (
      'abrir_carta','intercambiar_alumnos','intercambiar_puntos_alumnos','sumar_puntos_companero',
      'replicar_puntos_alumno','morsmordre_robar_puntos','restar_puntos_otras_casas',
      'riddikulus_resolver','resolver_riddikulus','riddikulus_decidir','riddikulus_decision_chiste','riddikulus_solicitar',
      'ajustar_puntos_alumno','quitar_puntos_alumno','actualizar_tabla_puntajes',
      'reiniciar_clase','eliminar_alumno'
    ) loop
    definicion:=pg_get_functiondef(f.oid);
    if position('hechi.iniciar_operacion_puntaje' in definicion)>0 then continue; end if;
    actor:=case when f.proname in ('ajustar_puntos_alumno','quitar_puntos_alumno','actualizar_tabla_puntajes',
      'reiniciar_clase','eliminar_alumno','riddikulus_resolver','resolver_riddikulus','riddikulus_decidir','riddikulus_decision_chiste')
      then 'null' when 'p_alumno_id'=any(f.proargnames) then 'p_alumno_id' else 'null' end;
    titulo:=case when 'p_titulo'=any(f.proargnames) then 'p_titulo' else quote_literal(
      case f.proname when 'ajustar_puntos_alumno' then 'Ajuste manual'
      when 'quitar_puntos_alumno' then 'Quita manual' when 'actualizar_tabla_puntajes' then 'Edición de tabla'
      when 'reiniciar_clase' then 'Nuevo parcial' when 'eliminar_alumno' then 'Eliminar alumno'
      else 'Riddikulus' end) end;
    llamada:=format(E'begin\n  perform hechi.iniciar_operacion_puntaje(p_token,%s,%L,%s);',actor,f.proname,titulo);
    definicion:=regexp_replace(definicion,'\mbegin\M',llamada,'i');
    execute definicion;
  end loop;
end;
$instrumentar$;

create or replace function hechi.historial_puntajes(p_clase_id uuid)
returns jsonb language sql security definer set search_path=hechi,public,pg_catalog as $$
  select coalesce(jsonb_agg(item order by secuencia desc),'[]'::jsonb) from (
    select o.secuencia,jsonb_build_object('id',o.id,'actor',o.actor,'titulo',o.titulo,
      'createdAt',o.created_at,'deshecha',o.deshecha,
      'puedeDeshacer',o.origen in ('ajustar_puntos_alumno','quitar_puntos_alumno','actualizar_tabla_puntajes')
        and not o.deshecha and auth.uid()=c.created_by
        and not exists(select 1 from hechi.operaciones_puntaje siguiente
          where siguiente.clase_id=o.clase_id and siguiente.secuencia>o.secuencia
          and exists(select 1 from hechi.movimientos_puntaje where operacion_id=siguiente.id)),
      'movimientos',(select jsonb_agg(jsonb_build_object('tipo',m.tipo,'nombre',m.nombre,
        'objetivoId',m.objetivo_id,'antes',m.antes,'despues',m.despues) order by m.id)
        from hechi.movimientos_puntaje m where m.operacion_id=o.id)) item
    from hechi.operaciones_puntaje o join hechi.clases c on c.id=o.clase_id
    where o.clase_id=p_clase_id and exists(select 1 from hechi.movimientos_puntaje where operacion_id=o.id)
    order by o.secuencia desc limit 100
  ) recientes
$$;
revoke all on function hechi.historial_puntajes(uuid) from public,anon,authenticated;

create or replace function hechi.deshacer_ultimo_ajuste(p_token text,p_operacion_id uuid)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c hechi.clases%rowtype; o hechi.operaciones_puntaje%rowtype; m record; a hechi.alumnos%rowtype;
  actual jsonb; esperado jsonb;
begin
  select * into c from hechi.clases where token=upper(trim(p_token)) and created_by=auth.uid()
    and estado='activa' for update;
  if not found then raise exception 'Solo el maestro de la clase puede deshacer'; end if;
  perform id from hechi.alumnos where clase_id=c.id order by id for update;
  select * into o from hechi.operaciones_puntaje where clase_id=c.id and id=p_operacion_id for update;
  if not found or o.deshecha or o.origen not in ('ajustar_puntos_alumno','quitar_puntos_alumno','actualizar_tabla_puntajes') then
    raise exception 'Este ajuste no se puede deshacer'; end if;
  if not exists(select 1 from hechi.movimientos_puntaje where operacion_id=o.id)
    or exists(select 1 from hechi.operaciones_puntaje siguiente where siguiente.clase_id=c.id
      and siguiente.secuencia>o.secuencia
      and exists(select 1 from hechi.movimientos_puntaje where operacion_id=siguiente.id)) then
    raise exception 'Ya hubo cambios posteriores de puntaje; no se puede deshacer este ajuste';
  end if;
  -- Validate the current values, even if a change bypassed the normal RPCs.
  for m in select distinct on(tipo,objetivo_id) * from hechi.movimientos_puntaje
    where operacion_id=o.id order by tipo,objetivo_id,id desc loop
    if m.tipo='alumno' then
      select * into a from hechi.alumnos where id=m.objetivo_id::uuid and clase_id=c.id;
      if not found then raise exception 'El alumno ya no está en la clase'; end if;
      actual:=jsonb_build_object('positivos',a.puntos_positivos,'negativos',a.puntos_negativos,'total',a.puntos,'casaId',a.casa_id);
    else
      actual:=jsonb_build_object('positivos',coalesce((c.puntajes_positivos->>m.objetivo_id)::integer,0),
        'negativos',coalesce((c.puntajes_negativos->>m.objetivo_id)::integer,0));
      actual:=actual||jsonb_build_object('total',(actual->>'positivos')::integer-(actual->>'negativos')::integer);
    end if;
    if actual is distinct from m.despues then raise exception 'El saldo cambió; no se puede deshacer'; end if;
  end loop;
  perform hechi.iniciar_operacion_puntaje(p_token,null,'deshacer','Deshacer: '||o.titulo);
  for m in select distinct on(tipo,objetivo_id) * from hechi.movimientos_puntaje
    where operacion_id=o.id order by tipo,objetivo_id,id asc loop
    if m.tipo='alumno' then
      update hechi.alumnos set puntos_positivos=(m.antes->>'positivos')::integer,
        puntos_negativos=(m.antes->>'negativos')::integer,puntos=(m.antes->>'total')::integer,updated_at=now()
        where id=m.objetivo_id::uuid and clase_id=c.id;
    else
      update hechi.clases set puntajes_positivos=puntajes_positivos||jsonb_build_object(m.objetivo_id,(m.antes->>'positivos')::integer),
        puntajes_negativos=puntajes_negativos||jsonb_build_object(m.objetivo_id,(m.antes->>'negativos')::integer),
        puntajes=puntajes||jsonb_build_object(m.objetivo_id,(m.antes->>'total')::integer),updated_at=now() where id=c.id;
    end if;
  end loop;
  update hechi.operaciones_puntaje set deshecha=true where id=o.id;
  return hechi.estado_clase(c.id);
end;
$$;
revoke all on function hechi.deshacer_ultimo_ajuste(text,uuid) from public,anon;
grant execute on function hechi.deshacer_ultimo_ajuste(text,uuid) to authenticated;

-- Extend the existing class payload without replacing its current fields.
do $estado$
declare definicion text;
begin
  definicion:=pg_get_functiondef('hechi.estado_clase(uuid)'::regprocedure);
  if position('historialPuntajes' in definicion)=0 then
    definicion:=replace(definicion,'''historial'', v_historial,',
      '''historialPuntajes'', hechi.historial_puntajes(p_clase_id), ''historial'', v_historial,');
    execute definicion;
  end if;
end;
$estado$;
commit;