begin;
alter table hechi.clases add column if not exists arena_abierta boolean not null default false;
create table if not exists hechi.cartas_arena (
 id text primary key, ataque integer not null, defensa integer not null, copias integer not null,
 afinidades text[] not null
);
create table if not exists hechi.fusiones_arena(receta text primary key,resultado text not null references hechi.cartas_arena(id));
create table if not exists hechi.duelos_arena (
 id uuid primary key default gen_random_uuid(), clase_id uuid not null references hechi.clases(id) on delete cascade,
 jugador1 uuid not null references hechi.alumnos(id) on delete cascade,
 jugador2 uuid not null references hechi.alumnos(id) on delete cascade,
 estado text not null default 'pendiente' check(estado in ('pendiente','activo','finalizado','cancelado')),
 recompensa boolean not null default false, dia date,
 partida jsonb, ganador uuid, premio_entregado boolean not null default false,
 version integer not null default 0, mensaje text not null default 'Reto enviado',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(jugador1<>jugador2)
);
create index if not exists duelos_arena_clase on hechi.duelos_arena(clase_id,updated_at desc);
create index if not exists duelos_arena_cupos on hechi.duelos_arena(clase_id,dia) where recompensa;
alter table hechi.cartas_arena enable row level security;
alter table hechi.fusiones_arena enable row level security;
alter table hechi.duelos_arena enable row level security;
revoke all on hechi.cartas_arena,hechi.fusiones_arena,hechi.duelos_arena from public,anon,authenticated;

create or replace function hechi.arena_autenticar(p_token text,p_alumno uuid,p_password text)
returns uuid language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c hechi.clases%rowtype;
begin
 select * into c from hechi.clases where token=upper(trim(p_token)) and estado='activa';
 if not found then raise exception 'Clase no encontrada'; end if;
 if p_alumno is null then
   if auth.uid() is null or auth.uid() is distinct from c.created_by then raise exception 'No autorizado como maestro'; end if;
 elsif not exists(select 1 from hechi.alumnos where id=p_alumno and clase_id=c.id and password is not distinct from p_password) then
   raise exception 'Credenciales incorrectas';
 end if;
 return c.id;
end;
$$;
create or replace function hechi.arena_hay_cupo(p_clase uuid,p_a uuid,p_b uuid)
returns boolean language sql security definer set search_path=hechi,public,pg_catalog as $$
 select (select count(*) from hechi.duelos_arena where clase_id=p_clase and recompensa
   and dia=(now() at time zone 'America/Mexico_City')::date and (jugador1=p_a or jugador2=p_a))<3
 and (select count(*) from hechi.duelos_arena where clase_id=p_clase and recompensa
   and dia=(now() at time zone 'America/Mexico_City')::date and (jugador1=p_b or jugador2=p_b))<3
 and not exists(select 1 from hechi.duelos_arena where clase_id=p_clase and recompensa
   and dia=(now() at time zone 'America/Mexico_City')::date
   and ((jugador1=p_a and jugador2=p_b) or (jugador1=p_b and jugador2=p_a)));
$$;
create or replace function hechi.arena_mazo()
returns jsonb language sql security definer set search_path=hechi,public,pg_catalog as $$
 select jsonb_agg(jsonb_build_object('uid',gen_random_uuid(),'id',c.id) order by random())
 from hechi.cartas_arena c cross join lateral generate_series(1,c.copias) copia;
$$;
create or replace function hechi.arena_rellenar(p_jugador jsonb)
returns jsonb language plpgsql set search_path=hechi,public,pg_catalog as $$
declare j jsonb:=p_jugador;
begin
 while jsonb_array_length(j->'mano')<5 and jsonb_array_length(j->'mazo')>0 loop
  j:=jsonb_set(j,'{mano}',(j->'mano')||jsonb_build_array(j->'mazo'->0));
  j:=jsonb_set(j,'{mazo}',(j->'mazo')-0);
 end loop;
 return j;
end;
$$;
create or replace function hechi.arena_jugador_publico(p_jugador jsonb,p_propio boolean)
returns jsonb language sql immutable as $$
 select jsonb_build_object('vida',p_jugador->'vida','restantes',jsonb_array_length(p_jugador->'mazo'),
 'mano',case when p_propio then p_jugador->'mano' else '[]'::jsonb end,
 'cantidadMano',jsonb_array_length(p_jugador->'mano'),
 'campo',(select jsonb_agg(case when value='null'::jsonb then value
   when not p_propio and (value->>'oculta')::boolean then jsonb_build_object('oculta',true,'posicion',value->'posicion')
   else value end order by ord) from jsonb_array_elements(p_jugador->'campo') with ordinality e(value,ord)));
$$;
create or replace function hechi.arena_vista(p_id uuid,p_alumno uuid)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare d hechi.duelos_arena%rowtype; lado text; rival text;
begin
 select * into d from hechi.duelos_arena where id=p_id;
 lado:=case when p_alumno=d.jugador1 then 'a' when p_alumno=d.jugador2 then 'b' else null end;
 rival:=case when lado='a' then 'b' else 'a' end;
 return jsonb_build_object('id',d.id,'estado',d.estado,'jugador1',d.jugador1,'jugador2',d.jugador2,
 'nombre1',(select nombre from hechi.alumnos where id=d.jugador1),
 'nombre2',(select nombre from hechi.alumnos where id=d.jugador2),
 'recompensa',d.recompensa,'ganador',d.ganador,'premioEntregado',d.premio_entregado,'version',d.version,
 'mensaje',d.mensaje,'lado',lado,'turno',d.partida->'turno','ronda',d.partida->'ronda',
 'invoco',d.partida->'invoco','fase',d.partida->'fase',
 'venceEn',d.updated_at+interval '90 seconds',
 'yo',case when lado is not null and d.partida is not null then hechi.arena_jugador_publico(d.partida->lado,true) else null end,
 'rival',case when lado is not null and d.partida is not null then hechi.arena_jugador_publico(d.partida->rival,false) else null end);
end;
$$;
create or replace function hechi.obtener_arena(p_token text,p_alumno_id uuid default null,p_password text default null)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; lista jsonb; activo jsonb; cupos integer:=0;
begin
 c:=hechi.arena_autenticar(p_token,p_alumno_id,p_password);
 -- Expired invitations and abandoned matches are cancelled without awarding points.
 update hechi.duelos_arena set estado='cancelado',version=version+1,mensaje='Partida vencida, sin puntos'
 where clase_id=c and ((estado='pendiente' and updated_at<now()-interval '10 minutes')
   or (estado='activo' and updated_at<now()-interval '10 minutes'));
 select coalesce(jsonb_agg(hechi.arena_vista(id,p_alumno_id) order by updated_at desc),'[]'::jsonb) into lista
 from (select * from hechi.duelos_arena where clase_id=c and (p_alumno_id is null or jugador1=p_alumno_id or jugador2=p_alumno_id)
   order by updated_at desc limit 30) d;
 select hechi.arena_vista(id,p_alumno_id) into activo from hechi.duelos_arena
 where clase_id=c and estado in ('pendiente','activo') and (jugador1=p_alumno_id or jugador2=p_alumno_id)
 order by created_at desc limit 1;
 select count(*) into cupos from hechi.duelos_arena where clase_id=c and recompensa
   and dia=(now() at time zone 'America/Mexico_City')::date and (jugador1=p_alumno_id or jugador2=p_alumno_id);
 return jsonb_build_object('abierta',(select arena_abierta from hechi.clases where id=c),'activo',activo,
 'duelos',lista,'cupos',greatest(0,3-cupos),
 'rivales',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'nombre',a.nombre,'casaId',a.casa_id,
   'ocupado',exists(select 1 from hechi.duelos_arena d where d.clase_id=c and d.estado in ('pendiente','activo') and (d.jugador1=a.id or d.jugador2=a.id)),
   'conPremio',hechi.arena_hay_cupo(c,p_alumno_id,a.id)) order by a.nombre),'[]'::jsonb)
   from hechi.alumnos a where a.clase_id=c and a.id is distinct from p_alumno_id));
end;
$$;
create or replace function hechi.configurar_arena(p_token text,p_abierta boolean)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid;
begin
 c:=hechi.arena_autenticar(p_token,null,null);
 update hechi.clases set arena_abierta=coalesce(p_abierta,false) where id=c;
 if not coalesce(p_abierta,false) then
  update hechi.duelos_arena set estado='cancelado',version=version+1,mensaje='El maestro cerró la arena'
  where clase_id=c and estado='pendiente';
 end if;
 return hechi.obtener_arena(p_token,null,null);
end;
$$;
create or replace function hechi.retar_arena(p_token text,p_alumno_id uuid,p_password text,p_rival uuid,p_practica boolean default false)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; nuevo uuid;
begin
 c:=hechi.arena_autenticar(p_token,p_alumno_id,p_password);
 if p_alumno_id is null or p_rival is null or p_alumno_id=p_rival then raise exception 'Elige otro alumno'; end if;
 perform id from hechi.clases where id=c for update;
 if not (select arena_abierta from hechi.clases where id=c) then raise exception 'La arena está cerrada'; end if;
 if not exists(select 1 from hechi.alumnos where id=p_rival and clase_id=c) then raise exception 'Rival no válido'; end if;
 if exists(select 1 from hechi.duelos_arena where clase_id=c and estado in ('activo','pendiente') and
   (jugador1 in(p_alumno_id,p_rival) or jugador2 in(p_alumno_id,p_rival))) then raise exception 'Uno de los alumnos ya tiene un duelo o reto pendiente'; end if;
 insert into hechi.duelos_arena(clase_id,jugador1,jugador2,recompensa)
 values(c,p_alumno_id,p_rival,not coalesce(p_practica,false) and hechi.arena_hay_cupo(c,p_alumno_id,p_rival)) returning id into nuevo;
 return hechi.arena_vista(nuevo,p_alumno_id);
end;
$$;
create or replace function hechi.responder_reto_arena(p_token text,p_alumno_id uuid,p_password text,p_duelo uuid,p_aceptar boolean)
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; d hechi.duelos_arena%rowtype; a jsonb; b jsonb; inicio text; premio boolean;
begin
 c:=hechi.arena_autenticar(p_token,p_alumno_id,p_password);
 perform id from hechi.clases where id=c for update;
 select * into d from hechi.duelos_arena where id=p_duelo and clase_id=c for update;
 if not found or p_alumno_id is null or p_alumno_id not in(d.jugador1,d.jugador2) then raise exception 'Reto no autorizado'; end if;
 if d.estado<>'pendiente' then raise exception 'El reto ya fue respondido'; end if;
 if not coalesce(p_aceptar,false) then
  update hechi.duelos_arena set estado='cancelado',version=version+1,mensaje='Reto cancelado' where id=d.id;
 else
  if p_alumno_id<>d.jugador2 then raise exception 'Solo el rival puede aceptar'; end if;
  if not (select arena_abierta from hechi.clases where id=c) or d.created_at<now()-interval '10 minutes' then raise exception 'El reto venció o la arena está cerrada'; end if;
  premio:=d.recompensa and hechi.arena_hay_cupo(c,d.jugador1,d.jugador2);
  a:=hechi.arena_rellenar(jsonb_build_object('vida',4000,'mano','[]'::jsonb,'campo','[null,null,null,null,null]'::jsonb,'mazo',hechi.arena_mazo()));
  b:=hechi.arena_rellenar(jsonb_build_object('vida',4000,'mano','[]'::jsonb,'campo','[null,null,null,null,null]'::jsonb,'mazo',hechi.arena_mazo()));
  if jsonb_array_length(a->'mazo')<>56 or jsonb_array_length(b->'mazo')<>56 then raise exception 'Falta configurar el mazo de 61 cartas'; end if;
  inicio:=case when random()<0.5 then 'a' else 'b' end;
  update hechi.duelos_arena set estado='activo',recompensa=premio,dia=(now() at time zone 'America/Mexico_City')::date,
   version=version+1,updated_at=now(),mensaje='Duelo iniciado; en el primer turno no se puede atacar',
   partida=jsonb_build_object('a',a,'b',b,'turno',inicio,'ronda',1,'invoco',false,'fase','invocacion') where id=d.id;
 end if;
 return hechi.arena_vista(d.id,p_alumno_id);
end;
$$;
create or replace function hechi.arena_ventaja(p_a text,p_b text)
returns integer language sql immutable as $$
 select case when position(p_a||','||p_b in 'fuego,tierra,aire,agua,sombra,luz,fuego')>0 then 300 else 0 end;
$$;
create or replace function hechi.accion_duelo_arena(p_token text,p_alumno_id uuid,p_password text,p_duelo uuid,p_version integer,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; d hechi.duelos_arena%rowtype; g jsonb; yo text; otro text; j jsonb; r jsonb;
 carta jsonb; segunda jsonb; atacante jsonb; defensor jsonb; stats hechi.cartas_arena%rowtype; ds hechi.cartas_arena%rowtype;
 mano jsonb; campo jsonb; uid text; uid2 text; criatura text; estrella text; pos text; oculta boolean;
 casilla integer; objetivo integer; atk integer; defensa integer; dano integer; v_ganador uuid:=null;
 fin boolean:=false; premiar boolean:=true; texto text; casa text;
begin
 c:=hechi.arena_autenticar(p_token,p_alumno_id,p_password);
 perform id from hechi.clases where id=c for update;
 select * into d from hechi.duelos_arena where id=p_duelo and clase_id=c for update;
 if not found or p_alumno_id is null or p_alumno_id not in(d.jugador1,d.jugador2) then raise exception 'Duelo no autorizado'; end if;
 if d.estado<>'activo' then raise exception 'El duelo ya terminó'; end if;
 if p_version is distinct from d.version then raise exception 'El duelo cambió. Espera la actualización y vuelve a elegir.'; end if;
 yo:=case when p_alumno_id=d.jugador1 then 'a' else 'b' end;
 otro:=case when yo='a' then 'b' else 'a' end;
 g:=d.partida; j:=g->yo; r:=g->otro;
 if p_accion='rendirse' then
  fin:=true;premiar:=false;texto:='Duelo cancelado por rendición; sin puntos';
 elsif p_accion='vencido' then
  if d.updated_at>now()-interval '90 seconds' then raise exception 'El turno aún no vence'; end if;
  fin:=true;premiar:=false;texto:='Duelo cancelado por inactividad; sin puntos';
 else
  if g->>'turno'<>yo then raise exception 'Es el turno del rival'; end if;
  if d.updated_at<now()-interval '90 seconds' then raise exception 'El turno venció; cancela la partida'; end if;
  if p_accion='invocar' then
   if (g->>'invoco')::boolean or g->>'fase'='batalla' then raise exception 'Solo una invocación o fusión antes de atacar'; end if;
   uid:=p_datos->>'uid';uid2:=nullif(p_datos->>'uid2','');
   select value into carta from jsonb_array_elements(j->'mano') where value->>'uid'=uid;
   if carta is null then raise exception 'La carta no está en tu mano'; end if;
   criatura:=carta->>'id';
   if uid2 is not null then
    if uid=uid2 then raise exception 'Selecciona dos cartas distintas'; end if;
    select value into segunda from jsonb_array_elements(j->'mano') where value->>'uid'=uid2;
    if segunda is null then raise exception 'Falta la segunda carta'; end if;
    select resultado into criatura from hechi.fusiones_arena where receta=least(carta->>'id',segunda->>'id')||'+'||greatest(carta->>'id',segunda->>'id');
    if criatura is null then raise exception 'Estas cartas no tienen una fusión'; end if;
   end if;
   select * into stats from hechi.cartas_arena where id=criatura;
   estrella:=p_datos->>'afinidad';pos:=p_datos->>'posicion';oculta:=coalesce((p_datos->>'oculta')::boolean,false);
   if estrella is null or not estrella=any(stats.afinidades) or pos is null or pos not in('ataque','defensa') then raise exception 'Posición o afinidad no válida'; end if;
   casilla:=(p_datos->>'casilla')::integer;
   if casilla is null or casilla<0 or casilla>4 or j->'campo'->casilla<>'null'::jsonb then raise exception 'Selecciona un espacio libre'; end if;
   if uid2 is not null then oculta:=false; end if;
   select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into mano from jsonb_array_elements(j->'mano') with ordinality e(value,ord)
    where value->>'uid'<>uid and (uid2 is null or value->>'uid'<>uid2);
   j:=jsonb_set(j,'{mano}',mano);
   j:=jsonb_set(j,array['campo',casilla::text],jsonb_build_object('id',criatura,'uid',uid,'afinidad',estrella,'posicion',pos,'oculta',oculta,'ataco',false,'cambio',true));
   g:=jsonb_set(g,'{invoco}','true'::jsonb);
   texto:=case when uid2 is not null then 'Fusión: '||criatura when oculta then 'Criatura colocada boca abajo' else 'Invocación: '||criatura end;
  elsif p_accion='posicion' then
   casilla:=(p_datos->>'casilla')::integer;
   if casilla is null or casilla<0 or casilla>4 then raise exception 'Espacio no válido'; end if;
   carta:=j->'campo'->casilla;
   if carta='null'::jsonb or (carta->>'ataco')::boolean or (carta->>'cambio')::boolean then raise exception 'No puedes cambiar esta posición ahora'; end if;
   carta:=jsonb_set(carta,'{posicion}',to_jsonb(case when carta->>'posicion'='ataque' then 'defensa' else 'ataque' end));
   carta:=jsonb_set(carta,'{cambio}','true'::jsonb);
   j:=jsonb_set(j,array['campo',casilla::text],carta);texto:='Cambio de posición';
  elsif p_accion='atacar' then
   if (g->>'ronda')::integer=1 then raise exception 'No se puede atacar en el primer turno'; end if;
   casilla:=(p_datos->>'casilla')::integer;objetivo:=(p_datos->>'objetivo')::integer;
   if casilla is null or casilla<0 or casilla>4 then raise exception 'Atacante no válido'; end if;
   atacante:=j->'campo'->casilla;
   if atacante='null'::jsonb or atacante->>'posicion'<>'ataque' or (atacante->>'ataco')::boolean then raise exception 'Esta criatura no puede atacar'; end if;
   select * into stats from hechi.cartas_arena where id=atacante->>'id';
   atacante:=atacante||'{"oculta":false,"ataco":true}'::jsonb;
   j:=jsonb_set(j,array['campo',casilla::text],atacante);
   g:=jsonb_set(g,'{fase}','"batalla"'::jsonb);
   if objetivo is null then
    if exists(select 1 from jsonb_array_elements(r->'campo') x where x<>'null'::jsonb) then raise exception 'Primero debes atacar las criaturas rivales'; end if;
    r:=jsonb_set(r,'{vida}',to_jsonb(greatest(0,(r->>'vida')::integer-stats.ataque)));
    texto:='Ataque directo: '||stats.ataque;
   else
    if objetivo<0 or objetivo>4 then raise exception 'Objetivo no válido'; end if;
    defensor:=r->'campo'->objetivo;
    if defensor='null'::jsonb then raise exception 'No hay criatura en ese espacio'; end if;
    select * into ds from hechi.cartas_arena where id=defensor->>'id';
    defensor:=defensor||'{"oculta":false}'::jsonb;
    r:=jsonb_set(r,array['campo',objetivo::text],defensor);
    atk:=stats.ataque+hechi.arena_ventaja(atacante->>'afinidad',defensor->>'afinidad');
    defensa:=case when defensor->>'posicion'='ataque' then ds.ataque else ds.defensa end
      +hechi.arena_ventaja(defensor->>'afinidad',atacante->>'afinidad');
    dano:=atk-defensa;
    if dano>0 then
     r:=jsonb_set(r,array['campo',objetivo::text],'null'::jsonb);
     if defensor->>'posicion'='ataque' then r:=jsonb_set(r,'{vida}',to_jsonb(greatest(0,(r->>'vida')::integer-dano))); end if;
    elsif dano<0 then
     j:=jsonb_set(j,'{vida}',to_jsonb(greatest(0,(j->>'vida')::integer+dano)));
     if defensor->>'posicion'='ataque' then j:=jsonb_set(j,array['campo',casilla::text],'null'::jsonb); end if;
    elsif defensor->>'posicion'='ataque' then
     j:=jsonb_set(j,array['campo',casilla::text],'null'::jsonb);r:=jsonb_set(r,array['campo',objetivo::text],'null'::jsonb);
    end if;
    texto:='Combate: '||(atacante->>'id')||' ('||atk||') contra '||(defensor->>'id')||' ('||defensa||')';
   end if;
  elsif p_accion='terminar' then
   r:=hechi.arena_rellenar(r);
   select jsonb_agg(case when value='null'::jsonb then value else value||'{"ataco":false,"cambio":false}'::jsonb end order by ord)
    into campo from jsonb_array_elements(r->'campo') with ordinality e(value,ord);
   r:=jsonb_set(r,'{campo}',campo);
   g:=g||jsonb_build_object('turno',otro,'ronda',(g->>'ronda')::integer+1,'invoco',false,'fase','invocacion');
   texto:='Turno del rival';
   if jsonb_array_length(r->'mano')<5 then fin:=true;v_ganador:=p_alumno_id;texto:='El rival agotó su mazo'; end if;
   if (g->>'ronda')::integer>60 then fin:=true;v_ganador:=null;texto:='Empate por límite de turnos'; end if;
  else raise exception 'Acción no válida';
  end if;
  if (r->>'vida')::integer<=0 then fin:=true;v_ganador:=p_alumno_id;texto:='Victoria: vida rival agotada'; end if;
  if (j->>'vida')::integer<=0 then fin:=true;v_ganador:=case when yo='a' then d.jugador2 else d.jugador1 end;texto:='Victoria del rival'; end if;
 end if;
 g:=jsonb_set(jsonb_set(g,array[yo],j),array[otro],r);
 update hechi.duelos_arena set partida=g,estado=case when fin and not premiar then 'cancelado' when fin then 'finalizado' else 'activo' end,
  ganador=v_ganador,version=version+1,updated_at=now(),mensaje=texto where id=d.id;
 if fin and premiar and v_ganador is not null and d.recompensa and not d.premio_entregado then
  perform hechi.iniciar_operacion_puntaje(p_token,v_ganador,'duelo_bestiario','Victoria en duelo del bestiario');
  update hechi.alumnos set puntos=puntos+3,updated_at=now() where id=v_ganador and clase_id=c returning casa_id into casa;
  if casa is null then raise exception 'Ganador no encontrado'; end if;
  update hechi.clases set puntajes_positivos=puntajes_positivos||jsonb_build_object(casa,coalesce((puntajes_positivos->>casa)::integer,0)+3),
   puntajes=puntajes||jsonb_build_object(casa,coalesce((puntajes_positivos->>casa)::integer,0)+3-coalesce((puntajes_negativos->>casa)::integer,0)),
   updated_at=now() where id=c;
  insert into hechi.participaciones(clase_id,alumno_id,carta,puntos,casa_objetivo,titulo,descripcion)
   values(c,v_ganador,1,3,casa,'Duelo del bestiario','Victoria con recompensa: +3 puntos');
  update hechi.duelos_arena set premio_entregado=true where id=d.id;
 end if;
 return hechi.arena_vista(d.id,p_alumno_id);
end;
$$;
-- Resetting a grading period must stop old duels from awarding points in the new one.
create or replace function hechi.arena_cerrar_parcial(p_token text)
returns void language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid;
begin
 c:=hechi.arena_autenticar(p_token,null,null);
 update hechi.clases set arena_abierta=false where id=c;
 update hechi.duelos_arena set estado='cancelado',version=version+1,mensaje='Nuevo parcial; duelo cancelado sin puntos'
 where clase_id=c and estado in('pendiente','activo');
end;
$$;
do $reset$
declare definicion text; funcion text;
begin
 funcion:=case when to_regprocedure('hechi.reiniciar_clase_sin_respaldo(text)') is not null then 'hechi.reiniciar_clase_sin_respaldo(text)' else 'hechi.reiniciar_clase(text)' end;
 definicion:=pg_get_functiondef(funcion::regprocedure);
 if position('arena_cerrar_parcial' in definicion)=0 then
  definicion:=regexp_replace(definicion,'\mbegin\M',E'begin\n perform hechi.arena_cerrar_parcial(p_token);','i');
  execute definicion;
 end if;
end;
$reset$;
revoke all on function hechi.arena_autenticar(text,uuid,text),hechi.arena_hay_cupo(uuid,uuid,uuid),
 hechi.arena_mazo(),hechi.arena_rellenar(jsonb),hechi.arena_jugador_publico(jsonb,boolean),
 hechi.arena_vista(uuid,uuid),hechi.arena_ventaja(text,text),hechi.arena_cerrar_parcial(text) from public,anon,authenticated;
revoke all on function hechi.obtener_arena(text,uuid,text),hechi.retar_arena(text,uuid,text,uuid,boolean),
 hechi.responder_reto_arena(text,uuid,text,uuid,boolean),hechi.accion_duelo_arena(text,uuid,text,uuid,integer,text,jsonb)
 from public;
grant execute on function hechi.obtener_arena(text,uuid,text),hechi.retar_arena(text,uuid,text,uuid,boolean),
 hechi.responder_reto_arena(text,uuid,text,uuid,boolean),hechi.accion_duelo_arena(text,uuid,text,uuid,integer,text,jsonb)
 to anon,authenticated;
revoke all on function hechi.configurar_arena(text,boolean) from public,anon;
grant execute on function hechi.configurar_arena(text,boolean) to authenticated;
commit;