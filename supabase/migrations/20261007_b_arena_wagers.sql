begin;

alter table hechi.duelos_arena add column if not exists apuesta integer not null default 0 check(apuesta>=0);
alter table hechi.duelos_arena add column if not exists apuesta_cobrada boolean not null default false;
alter table hechi.duelos_arena add column if not exists apuesta_liquidada boolean not null default false;

-- Replace the old signature so PostgREST has a single unambiguous endpoint.
drop function if exists hechi.retar_arena(text,uuid,text,uuid,boolean);
create or replace function hechi.retar_arena(p_token text,p_alumno_id uuid,p_password text,p_rival uuid,p_practica boolean default false,p_apuesta integer default 0)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; nuevo uuid; limite integer;
begin
 c:=hechi.arena_autenticar(p_token,p_alumno_id,p_password);
 if p_alumno_id is null or p_rival is null or p_alumno_id=p_rival then raise exception 'Elige otro alumno'; end if;
 perform id from hechi.clases where id=c for update;
 if not (select arena_abierta from hechi.clases where id=c) then raise exception 'La arena está cerrada'; end if;
 if not exists(select 1 from hechi.alumnos where id=p_rival and clase_id=c) then raise exception 'Rival no válido'; end if;
 if exists(select 1 from hechi.duelos_arena where clase_id=c and estado in ('activo','pendiente') and
   (jugador1 in(p_alumno_id,p_rival) or jugador2 in(p_alumno_id,p_rival))) then raise exception 'Uno de los alumnos ya tiene un duelo o reto pendiente'; end if;
 perform id from hechi.alumnos where clase_id=c and id in(p_alumno_id,p_rival) order by id for update;
 select least(a.galeones,b.galeones) into limite from hechi.alumnos a,hechi.alumnos b where a.id=p_alumno_id and b.id=p_rival;
 if p_apuesta is null or p_apuesta<0 or p_apuesta>limite then raise exception 'Apuesta no válida. El máximo disponible entre ambos es % galeones',limite; end if;
 insert into hechi.duelos_arena(clase_id,jugador1,jugador2,recompensa,apuesta)
 values(c,p_alumno_id,p_rival,not coalesce(p_practica,false) and hechi.arena_hay_cupo(c,p_alumno_id,p_rival),p_apuesta) returning id into nuevo;
 return hechi.arena_vista(nuevo,p_alumno_id);
end;
$$;
revoke all on function hechi.retar_arena(text,uuid,text,uuid,boolean,integer) from public;
grant execute on function hechi.retar_arena(text,uuid,text,uuid,boolean,integer) to anon,authenticated;

-- Collect both stakes atomically only when the invited pupil accepts.
do $accept$
declare definition text;
begin
 definition:=pg_get_functiondef('hechi.responder_reto_arena(text,uuid,text,uuid,boolean)'::regprocedure);
 if position('arena_wager_accept' in definition)=0 then
  if position('premio:=d.recompensa' in definition)=0 then raise exception 'Aceptar reto no reconocido'; end if;
  definition:=replace(definition,'premio:=d.recompensa',$insert$
  -- arena_wager_accept
  perform id from hechi.alumnos where clase_id=c and id in(d.jugador1,d.jugador2) order by id for update;
  if exists(select 1 from hechi.alumnos where id in(d.jugador1,d.jugador2) and galeones<d.apuesta) then
   raise exception 'El saldo cambió y ya no alcanza para esta apuesta. Rechaza el reto y envía uno nuevo';
  end if;
  if d.apuesta>0 then
   update hechi.alumnos set galeones=galeones-d.apuesta,updated_at=now() where clase_id=c and id in(d.jugador1,d.jugador2);
   update hechi.duelos_arena set apuesta_cobrada=true where id=d.id;
  end if;
  premio:=d.recompensa$insert$);
  execute definition;
 end if;
end;
$accept$;

-- One transactional settlement covers wins, surrender, draws and cancellation.
create or replace function hechi.arena_liquidar_galeones()
returns trigger language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare premio_a integer:=0; premio_b integer:=0; fondo_a bigint:=0; fondo_b bigint:=0;
begin
 if old.estado<>'activo' or new.estado not in('finalizado','cancelado') then return new; end if;
 if new.ganador is not null and new.ganador not in(new.jugador1,new.jugador2) then raise exception 'Ganador no válido'; end if;
 perform id from hechi.alumnos where clase_id=new.clase_id and id in(new.jugador1,new.jugador2) order by id for update;
 if new.estado='finalizado' and new.recompensa and not old.premio_entregado then
  premio_a:=case when new.ganador is null then 50 when new.ganador=new.jugador1 then 80 else 0 end;
  premio_b:=case when new.ganador is null then 50 when new.ganador=new.jugador2 then 80 else 0 end;
  new.premio_entregado:=true;
 end if;
 if old.apuesta_cobrada and not old.apuesta_liquidada then
  if new.estado='cancelado' or new.ganador is null then fondo_a:=old.apuesta;fondo_b:=old.apuesta;
  elsif new.ganador=new.jugador1 then fondo_a:=2::bigint*old.apuesta;
  else fondo_b:=2::bigint*old.apuesta;
  end if;
  new.apuesta_liquidada:=true;
 end if;
 update hechi.alumnos set galeones=galeones+case when id=new.jugador1 then premio_a+fondo_a else premio_b+fondo_b end,
  updated_at=now() where clase_id=new.clase_id and id in(new.jugador1,new.jugador2);
 new.partida:=coalesce(new.partida,'{}'::jsonb)||jsonb_build_object(
  'premiosGaleones',jsonb_build_object('a',premio_a,'b',premio_b),
  'bonosBestiario',jsonb_build_object('a',0,'b',0),
  'retornosApuesta',jsonb_build_object('a',fondo_a,'b',fondo_b));
 return new;
end;
$$;
revoke all on function hechi.arena_liquidar_galeones() from public,anon,authenticated;
drop trigger if exists arena_liquidar_galeones on hechi.duelos_arena;
create trigger arena_liquidar_galeones before update of estado on hechi.duelos_arena
for each row execute function hechi.arena_liquidar_galeones();

-- Preserve all combat rules, replacing only the former payout block.
do $payout$
declare definition text; first_pos integer; last_pos integer;
begin
 definition:=pg_get_functiondef('hechi.accion_duelo_arena(text,uuid,text,uuid,integer,text,jsonb)'::regprocedure);
 if position('arena_wager_settlement' in definition)=0 then
  first_pos:=position(' if fin and premiar and d.recompensa and not d.premio_entregado then' in definition);
  last_pos:=position(' return hechi.arena_vista(d.id,p_alumno_id);' in definition);
  if first_pos=0 or last_pos<=first_pos then raise exception 'Premios de arena no reconocidos'; end if;
  definition:=substring(definition from 1 for first_pos-1)||E' -- arena_wager_settlement: paid atomically by the state transition trigger.\n'||substring(definition from last_pos);
  execute definition;
 end if;
end;
$payout$;

do $views$
declare definition text;
begin
 definition:=pg_get_functiondef('hechi.arena_vista(uuid,uuid)'::regprocedure);
 if position('retornoApuesta' in definition)=0 then
  if position('''recompensa'',d.recompensa,' in definition)=0 then raise exception 'Vista de arena no reconocida'; end if;
  definition:=replace(definition,'''recompensa'',d.recompensa,',$fields$
 'apuesta',d.apuesta,'apuestaCobrada',d.apuesta_cobrada,
 'retornoApuesta',case when lado is not null then d.partida->'retornosApuesta'->lado else null end,
 'recompensa',d.recompensa,$fields$);
  execute definition;
 end if;
 definition:=pg_get_functiondef('hechi.obtener_arena(text,uuid,text)'::regprocedure);
 if position('maxApuesta' in definition)=0 then
  if position('''duelos'',lista,' in definition)=0 or position('''conPremio'',hechi.arena_hay_cupo' in definition)=0 then raise exception 'Listado de arena no reconocido'; end if;
  definition:=replace(definition,'''duelos'',lista,','''galeones'',(select galeones from hechi.alumnos where id=p_alumno_id),''duelos'',lista,');
  definition:=replace(definition,'''conPremio'',hechi.arena_hay_cupo',$limit$
   'maxApuesta',greatest(0,least(a.galeones,coalesce((select galeones from hechi.alumnos where id=p_alumno_id),0))),
   'conPremio',hechi.arena_hay_cupo$limit$);
  execute definition;
 end if;
end;
$views$;
notify pgrst,'reload schema';
commit;
