begin;
-- A movement is a validated summon/fusion, spell, attack or position change.
-- Merely ending a turn, polling or selecting a card does not reset inactivity.
do $patch$
declare definition text; anchor text;
begin
 definition:=pg_get_functiondef('hechi.accion_duelo_arena(text,uuid,text,uuid,integer,text,jsonb)'::regprocedure);
 if position('arena_inactivity_v1' in definition)=0 then
  anchor:='  if not fin and (p_accion=''terminar''';
  if position(anchor in definition)=0 or position('   r:=hechi.arena_rellenar(r);' in definition)=0 then raise exception 'Cambio de turno no reconocido'; end if;
  definition:=replace(definition,anchor,$mark$
  -- arena_inactivity_v1: only reached after action validation succeeded.
  g:=g||jsonb_build_object('avanceAutomatico',expirado);
  if p_accion in ('invocar','hechizo','atacar','posicion') then
   g:=g||jsonb_build_object('movimientoTurno',true,'turnosInactivos',0);
  end if;
  if not fin and (p_accion='terminar'$mark$);
  definition:=replace(definition,'   r:=hechi.arena_rellenar(r);',$count$
   g:=g||jsonb_build_object('turnosInactivos',case when coalesce((g->>'movimientoTurno')::boolean,false) then 0 else coalesce((g->>'turnosInactivos')::integer,0)+1 end,'movimientoTurno',false);
   r:=hechi.arena_rellenar(r);$count$);
  anchor:='   if (g->>''ronda'')::integer>60 then fin:=true;v_ganador:=null;texto:=''Empate por límite de turnos''; end if;';
  if position(anchor in definition)=0 then raise exception 'Límite de turnos no reconocido'; end if;
  definition:=replace(definition,anchor,anchor||$cancel$
   if (g->>'turnosInactivos')::integer>=4 then
    fin:=true;premiar:=false;v_ganador:=null;
    texto:='Duelo cerrado por inactividad: cuatro turnos sin movimientos. Sin premios de galeones; las apuestas se devuelven.';
   end if;$cancel$);
  execute definition;
 end if;
end;
$patch$;

-- Keep elapsed deadlines when processing automatic turns after both clients leave.
create or replace function hechi.arena_reloj_turno()
returns trigger language plpgsql set search_path=hechi,public,pg_catalog as $$
begin
 if new.estado='activo' and old.estado<>'activo' then new.turno_iniciado:=now();
 elsif new.partida->>'ronda' is distinct from old.partida->>'ronda' then
  new.turno_iniciado:=case when coalesce((new.partida->>'avanceAutomatico')::boolean,false)
   then old.turno_iniciado+interval '90 seconds' else now() end;
 end if;
 return new;
end;
$$;
create or replace function hechi.arena_avanzar_vencidos(p_clase uuid)
returns void language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare d hechi.duelos_arena%rowtype; duel_id uuid; alumno uuid; clave text; token_clase text; n integer;
begin
 perform id from hechi.clases where id=p_clase for update;
 select token into token_clase from hechi.clases where id=p_clase;
 for duel_id in select id from hechi.duelos_arena where clase_id=p_clase and estado='activo'
  and turno_iniciado<=now()-interval '90 seconds' order by id loop
  -- At most one previously played turn plus four inactive turns.
  for n in 1..5 loop
   select * into d from hechi.duelos_arena where id=duel_id for update;
   exit when d.estado<>'activo' or d.turno_iniciado>now()-interval '90 seconds';
   alumno:=case when d.partida->>'turno'='a' then d.jugador1 else d.jugador2 end;
   select password into clave from hechi.alumnos where id=alumno;
   perform hechi.accion_duelo_arena(token_clase,alumno,clave,d.id,d.version,'vencido','{}');
  end loop;
 end loop;
end;
$$;
revoke all on function hechi.arena_avanzar_vencidos(uuid),hechi.arena_reloj_turno() from public,anon,authenticated;
commit;
