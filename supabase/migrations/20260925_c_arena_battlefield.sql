begin;
-- Pad existing zones without dropping placed traps.
update hechi.duelos_arena set partida=jsonb_set(jsonb_set(partida,'{a,apoyos}',(select jsonb_agg(coalesce(partida->'a'->'apoyos'->i,'null'::jsonb) order by i) from generate_series(0,4) i)),'{b,apoyos}',(select jsonb_agg(coalesce(partida->'b'->'apoyos'->i,'null'::jsonb) order by i) from generate_series(0,4) i)),version=version+1
where partida is not null and (jsonb_array_length(coalesce(partida->'a'->'apoyos','[]'::jsonb))<5 or jsonb_array_length(coalesce(partida->'b'->'apoyos','[]'::jsonb))<5);
create or replace function hechi.arena_jugador_publico(p_jugador jsonb,p_propio boolean)
returns jsonb language sql immutable as $$
 select jsonb_build_object('vida',p_jugador->'vida','restantes',jsonb_array_length(p_jugador->'mazo'),
 'mano',case when p_propio then p_jugador->'mano' else '[]'::jsonb end,
 'cantidadMano',jsonb_array_length(p_jugador->'mano'),
 'apoyos',(select jsonb_agg(case when value='null'::jsonb then value when p_propio then value else '{"oculta":true}'::jsonb end order by ord) from jsonb_array_elements(coalesce(p_jugador->'apoyos','[null,null,null,null,null]'::jsonb)) with ordinality e(value,ord)),
 'campo',(select jsonb_agg(case when value='null'::jsonb then value
   when not p_propio and (value->>'oculta')::boolean then jsonb_build_object('oculta',true,'posicion',value->'posicion')
   else value end order by ord) from jsonb_array_elements(p_jugador->'campo') with ordinality e(value,ord)));
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
  a:=hechi.arena_rellenar(jsonb_build_object('vida',4000,'mano','[]'::jsonb,'apoyos','[null,null,null,null,null]'::jsonb,'campo','[null,null,null,null,null]'::jsonb,'mazo',hechi.arena_mazo()));
  b:=hechi.arena_rellenar(jsonb_build_object('vida',4000,'mano','[]'::jsonb,'apoyos','[null,null,null,null,null]'::jsonb,'campo','[null,null,null,null,null]'::jsonb,'mazo',hechi.arena_mazo()));
  if jsonb_array_length(a->'mazo')<>(select sum(copias)-5 from hechi.cartas_arena) or jsonb_array_length(b->'mazo')<>(select sum(copias)-5 from hechi.cartas_arena) then raise exception 'Falta configurar el mazo de la arena'; end if;
  inicio:=case when random()<0.5 then 'a' else 'b' end;
  update hechi.duelos_arena set estado='activo',recompensa=premio,dia=(now() at time zone 'America/Mexico_City')::date,
   version=version+1,updated_at=now(),mensaje='Duelo iniciado; en el primer turno no se puede atacar',
   partida=jsonb_build_object('a',a,'b',b,'turno',inicio,'ronda',1,'invoco',false,'hechizo',false,'fase','invocacion') where id=d.id;
 end if;
 return hechi.arena_vista(d.id,p_alumno_id);
end;
$$;
create or replace function hechi.accion_duelo_arena(p_token text,p_alumno_id uuid,p_password text,p_duelo uuid,p_version integer,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare c uuid; d hechi.duelos_arena%rowtype; g jsonb; yo text; otro text; j jsonb; r jsonb;
 trampa jsonb; indice_trampa integer; tipo_hechizo text; carta jsonb; segunda jsonb; atacante jsonb; defensor jsonb; stats hechi.cartas_arena%rowtype; ds hechi.cartas_arena%rowtype;
 mano jsonb; campo jsonb; uid text; uid2 text; criatura text; estrella text; pos text; oculta boolean;
 casilla integer; objetivo integer; atk integer; defensa integer; dano integer; v_ganador uuid:=null;
 expirado boolean:=false; actor uuid; fin boolean:=false; premiar boolean:=true; texto text; casa text;
begin
 c:=hechi.arena_autenticar(p_token,p_alumno_id,p_password);
 perform id from hechi.clases where id=c for update;
 select * into d from hechi.duelos_arena where id=p_duelo and clase_id=c for update;
 if not found or p_alumno_id is null or p_alumno_id not in(d.jugador1,d.jugador2) then raise exception 'Duelo no autorizado'; end if;
 if d.estado<>'activo' then raise exception 'El duelo ya terminó'; end if;
 if p_version is distinct from d.version then raise exception 'El duelo cambió. Espera la actualización y vuelve a elegir.'; end if;
 actor:=p_alumno_id;
 if p_accion='vencido' then
  if d.turno_iniciado>now()-interval '90 seconds' then raise exception 'El turno aún no vence'; end if;
  actor:=case when d.partida->>'turno'='a' then d.jugador1 else d.jugador2 end;
  expirado:=true;p_accion:='terminar';
 end if;
 yo:=case when actor=d.jugador1 then 'a' else 'b' end;
 otro:=case when yo='a' then 'b' else 'a' end;
 g:=d.partida; j:=g->yo; r:=g->otro;
 j:=j||jsonb_build_object('apoyos',coalesce(j->'apoyos','[null,null,null,null,null]'::jsonb));
 r:=r||jsonb_build_object('apoyos',coalesce(r->'apoyos','[null,null,null,null,null]'::jsonb));
 if p_accion='rendirse' then
  fin:=true;premiar:=false;texto:='Duelo cancelado por rendición; sin puntos';

 else
  if g->>'turno'<>yo then raise exception 'Es el turno del rival'; end if;
  if not expirado and d.turno_iniciado<=now()-interval '90 seconds' then raise exception 'El tiempo terminó; espera el siguiente turno'; end if;
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
   if stats.tipo<>'criatura' then raise exception 'Los hechizos se juegan en su zona'; end if;
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
  elsif p_accion='hechizo' then
   if coalesce((g->>'hechizo')::boolean,false) then raise exception 'Solo una magia o trampa por turno'; end if;
   if g->>'fase'='batalla' then raise exception 'Juega el hechizo antes de atacar'; end if;
   uid:=p_datos->>'uid';
   select value into carta from jsonb_array_elements(j->'mano') where value->>'uid'=uid;
   if carta is null then raise exception 'La carta no está en tu mano'; end if;
   criatura:=carta->>'id';
   select tipo into tipo_hechizo from hechi.cartas_arena where id=criatura;
   if tipo_hechizo is null or tipo_hechizo not in('magia','trampa') then raise exception 'No es un hechizo'; end if;
   if criatura='hechizo-engorgio' then
    objetivo:=(p_datos->>'objetivo')::integer;
    if objetivo is null or objetivo<0 or objetivo>4 or j->'campo'->objetivo='null'::jsonb then raise exception 'Elige una criatura propia'; end if;
    defensor:=j->'campo'->objetivo;
    defensor:=defensor||jsonb_build_object('bonusAtk',coalesce((defensor->>'bonusAtk')::integer,0)+500);
    j:=jsonb_set(j,array['campo',objetivo::text],defensor);texto:='Engorgio: +500 ATQ';
   else
    casilla:=(p_datos->>'casilla')::integer;
    if casilla is null or casilla<0 or casilla>4 or j->'apoyos'->casilla<>'null'::jsonb then raise exception 'Elige un espacio de magia o trampa libre'; end if;
    if tipo_hechizo='trampa' then
     j:=jsonb_set(j,array['apoyos',casilla::text],jsonb_build_object('id',criatura,'uid',uid,'oculta',true));
     texto:='Trampa colocada boca abajo';
    elsif criatura='hechizo-incendio' then
     r:=jsonb_set(r,'{vida}',to_jsonb(greatest(0,(r->>'vida')::integer-600)));texto:='Incendio: 600 de daño';
    elsif criatura='hechizo-elixir' then
     j:=jsonb_set(j,'{vida}',to_jsonb(least(4000,(j->>'vida')::integer+800)));texto:='Elixir de Vida: recupera hasta 800';
    else raise exception 'Hechizo no disponible';
    end if;
   end if;
   select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into mano from jsonb_array_elements(j->'mano') with ordinality e(value,ord) where value->>'uid'<>uid;
   j:=jsonb_set(j,'{mano}',mano);g:=g||'{"hechizo":true}'::jsonb;
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
   stats.ataque:=stats.ataque+coalesce((atacante->>'bonusAtk')::integer,0);
   atacante:=atacante||'{"oculta":false,"ataco":true}'::jsonb;
   j:=jsonb_set(j,array['campo',casilla::text],atacante);
   g:=jsonb_set(g,'{fase}','"batalla"'::jsonb);
   -- Validate the attack before revealing or consuming any trap.
   if objetivo is null then
    if exists(select 1 from jsonb_array_elements(r->'campo') x where x<>'null'::jsonb) then raise exception 'Primero debes atacar las criaturas rivales'; end if;
   elsif objetivo<0 or objetivo>4 or r->'campo'->objetivo='null'::jsonb then raise exception 'Objetivo no válido';
   end if;
   select value,(ord-1)::integer into trampa,indice_trampa from jsonb_array_elements(r->'apoyos') with ordinality e(value,ord) where value<>'null'::jsonb order by ord limit 1;
   if trampa is not null then
    r:=jsonb_set(r,array['apoyos',indice_trampa::text],'null'::jsonb);
    if trampa->>'id'='hechizo-patronus' then
     j:=jsonb_set(j,'{vida}',to_jsonb(greatest(0,(j->>'vida')::integer-400)));texto:='Expecto Patronus cancela el ataque y refleja 400 de daño';
    elsif trampa->>'id'='hechizo-confundo' then
     j:=jsonb_set(j,array['campo',casilla::text,'posicion'],'"defensa"'::jsonb);texto:='Confundo cancela el ataque y cambia al atacante a defensa';
    else texto:='Invisibilidad cancela el ataque';
    end if;
   else
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
    defensa:=case when defensor->>'posicion'='ataque' then ds.ataque+coalesce((defensor->>'bonusAtk')::integer,0) else ds.defensa end
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
   end if;
  elsif p_accion='terminar' then
   texto:='Fin de turno';
  else raise exception 'Acción no válida';
  end if;
  if (r->>'vida')::integer<=0 then fin:=true;v_ganador:=actor;texto:='Victoria: vida rival agotada'; end if;
  if (j->>'vida')::integer<=0 then fin:=true;v_ganador:=case when yo='a' then d.jugador2 else d.jugador1 end;texto:='Victoria del rival'; end if;
  if not fin and (p_accion='terminar' or (p_accion='atacar' and not exists (select 1 from jsonb_array_elements(j->'campo') e where e<>'null'::jsonb and e->>'posicion'='ataque' and not coalesce((e->>'ataco')::boolean,false))) or (p_accion='invocar' and (g->>'ronda')::integer=1)) then
   r:=hechi.arena_rellenar(r);
   select jsonb_agg(case when value='null'::jsonb then value else value||'{"ataco":false,"cambio":false}'::jsonb end order by ord)
    into campo from jsonb_array_elements(r->'campo') with ordinality e(value,ord);
   r:=jsonb_set(r,'{campo}',campo);
   g:=g||jsonb_build_object('turno',otro,'ronda',(g->>'ronda')::integer+1,'invoco',false,'hechizo',false,'fase','invocacion');
   texto:=case when expirado then 'Tiempo agotado. ' else coalesce(texto||'. ','') end||'Turno del rival';
   if jsonb_array_length(r->'mano')<5 then fin:=true;v_ganador:=actor;texto:='El rival agotó su mazo'; end if;
   if (g->>'ronda')::integer>60 then fin:=true;v_ganador:=null;texto:='Empate por límite de turnos'; end if;
  end if;
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
commit;
