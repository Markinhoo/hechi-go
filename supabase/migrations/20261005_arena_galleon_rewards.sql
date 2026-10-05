-- Arena currency is independent of classroom participation and house scores.
-- Apply after 20260929_arena_balance.sql. Historical rewards remain unchanged.
begin;
create or replace function hechi.autorizar_participacion(p_token text, p_alumno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = hechi, public, pg_catalog
as $$
declare
  v_clase hechi.clases%rowtype;
  v_actualizados integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión como maestro';
  end if;

  select * into v_clase from hechi.clases where token = upper(trim(p_token)) and created_by = auth.uid();
  if not found then
    raise exception 'No autorizado como maestro';
  end if;

  -- Claim the pending request atomically: repeated clicks cannot grant extra cards.
  update hechi.solicitudes
  set estado = 'autorizada'
  where clase_id = v_clase.id and alumno_id = p_alumno_id and estado = 'pendiente';
  get diagnostics v_actualizados = row_count;
  if v_actualizados = 0 then
    return hechi.estado_clase(v_clase.id);
  end if;

  update hechi.alumnos
  set oportunidades = oportunidades + 1,
      updated_at = now()
  where id = p_alumno_id and clase_id = v_clase.id;

  get diagnostics v_actualizados = row_count;
  if v_actualizados = 0 then
    raise exception 'Alumno no encontrado en esta clase';
  end if;

  return hechi.estado_clase(v_clase.id);
end;
$$;

grant execute on function hechi.autorizar_participacion(text, uuid) to anon, authenticated;

create or replace function hechi.accion_duelo_arena(p_token text,p_alumno_id uuid,p_password text,p_duelo uuid,p_version integer,p_accion text,p_datos jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=hechi,public,pg_catalog as $$
declare idx integer; maxima integer; refuerzo boolean:=false; evento jsonb; eventos jsonb; vida_yo integer; vida_rival integer; c uuid; d hechi.duelos_arena%rowtype; g jsonb; yo text; otro text; j jsonb; r jsonb;
 trampa jsonb; indice_trampa integer; tipo_hechizo text; carta jsonb; segunda jsonb; atacante jsonb; defensor jsonb; stats hechi.cartas_arena%rowtype; ds hechi.cartas_arena%rowtype;
 mano jsonb; campo jsonb; uid text; uid2 text; criatura text; estrella text; pos text; oculta boolean;
 casilla integer; objetivo integer; atk integer; defensa integer; dano integer; v_ganador uuid:=null;
 expirado boolean:=false; actor uuid; fin boolean:=false; premiar boolean:=true; texto text;
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
 vida_yo:=(j->>'vida')::integer;vida_rival:=(r->>'vida')::integer;
 j:=j||jsonb_build_object('apoyos',coalesce(j->'apoyos','[null,null,null,null,null]'::jsonb));
 r:=r||jsonb_build_object('apoyos',coalesce(r->'apoyos','[null,null,null,null,null]'::jsonb));
 if p_accion='rendirse' then
  fin:=true;premiar:=false;texto:='Duelo cancelado por rendición; sin galeones';

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
    refuerzo:=(carta->>'id'='hechizo-engorgio' or segunda->>'id'='hechizo-engorgio');
    if refuerzo then
     if coalesce((g->>'hechizo')::boolean,false) then raise exception 'Solo una magia o trampa por turno'; end if;
     criatura:=case when carta->>'id'='hechizo-engorgio' then segunda->>'id' else carta->>'id' end;
     if not exists(select 1 from hechi.cartas_arena where id=criatura and tipo='criatura') then raise exception 'Engorgio requiere una criatura'; end if;
    else
     select resultado into criatura from hechi.fusiones_arena where receta=least(carta->>'id',segunda->>'id')||'+'||greatest(carta->>'id',segunda->>'id');
     if criatura is null then raise exception 'Estas cartas no tienen una fusión'; end if;
    end if;
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
   j:=jsonb_set(j,array['campo',casilla::text],jsonb_build_object('id',criatura,'uid',uid,'afinidad',estrella,'posicion',pos,'oculta',oculta,'ataco',false,'cambio',true,'bonusAtk',case when refuerzo then 500 else 0 end));
   g:=jsonb_set(g,'{invoco}','true'::jsonb);
   if refuerzo then g:=jsonb_set(g,'{hechizo}','true'::jsonb); end if;
   texto:=case when refuerzo then 'Engorgio: '||criatura||' +500 ATQ' when uid2 is not null then 'Fusión: '||criatura when oculta then 'Criatura colocada boca abajo' else 'Invocación: '||criatura end;
  elsif p_accion='hechizo' then
   if coalesce((g->>'hechizo')::boolean,false) then raise exception 'Solo una magia o trampa por turno'; end if;
   if g->>'fase'='batalla' then raise exception 'Juega el hechizo antes de atacar'; end if;
   uid:=p_datos->>'uid';
   select value into carta from jsonb_array_elements(j->'mano') where value->>'uid'=uid;
   if carta is null then raise exception 'La carta no está en tu mano'; end if;
   criatura:=carta->>'id';
   select tipo into tipo_hechizo from hechi.cartas_arena where id=criatura;
   if tipo_hechizo is null or tipo_hechizo not in('magia','trampa') then raise exception 'No es un hechizo'; end if;
   if criatura in ('hechizo-engorgio','hechizo-crecehuesos','hechizo-vigorizante','hechizo-multijugos') then
    objetivo:=(p_datos->>'objetivo')::integer;
    if objetivo is null or objetivo<0 or objetivo>4 or j->'campo'->objetivo='null'::jsonb then raise exception 'Elige una criatura propia'; end if;
    defensor:=j->'campo'->objetivo;
    select * into ds from hechi.cartas_arena where id=defensor->>'id';
    if criatura='hechizo-multijugos' then
     select max(greatest(0,ca.ataque+coalesce((e->>'bonusAtk')::integer,0))) into maxima from jsonb_array_elements(r->'campo') e join hechi.cartas_arena ca on ca.id=e->>'id' where e<>'null'::jsonb and not coalesce((e->>'oculta')::boolean,false);
     if maxima is null then raise exception 'Se necesita una criatura rival boca arriba'; end if;
     defensor:=defensor||jsonb_build_object('bonusAtk',least(1000,least(2500,maxima)-ds.ataque));
    else
     defensor:=defensor||jsonb_build_object('bonusAtk',least(1000,coalesce((defensor->>'bonusAtk')::integer,0)+case criatura when 'hechizo-engorgio' then 500 when 'hechizo-vigorizante' then 300 else 0 end),
      'bonusDef',least(1000,coalesce((defensor->>'bonusDef')::integer,0)+case criatura when 'hechizo-crecehuesos' then 500 when 'hechizo-vigorizante' then 300 else 0 end));
    end if;
    j:=jsonb_set(j,array['campo',objetivo::text],defensor);texto:='Refuerzo aplicado';
   elsif criatura in ('hechizo-avada','hechizo-crucio','hechizo-sectumsempra','hechizo-riddikulus') then
    objetivo:=(p_datos->>'objetivo')::integer;
    if objetivo is null or objetivo<0 or objetivo>4 or r->'campo'->objetivo='null'::jsonb or coalesce((r->'campo'->objetivo->>'oculta')::boolean,false) then raise exception 'Elige una criatura rival boca arriba'; end if;
    defensor:=r->'campo'->objetivo;
    select * into ds from hechi.cartas_arena where id=defensor->>'id';
    if criatura='hechizo-avada' then
     if (j->>'vida')::integer<=800 then raise exception 'Necesitas más de 800 de vida'; end if;
     j:=jsonb_set(j,'{vida}',to_jsonb((j->>'vida')::integer-800));defensor:='null'::jsonb;
    elsif criatura='hechizo-crucio' then
     defensor:=defensor||jsonb_build_object('bonusAtk',greatest(-ds.ataque,coalesce((defensor->>'bonusAtk')::integer,0)-700));
    elsif criatura='hechizo-sectumsempra' then
     defensor:=defensor||jsonb_build_object('bonusDef',greatest(-ds.defensa,coalesce((defensor->>'bonusDef')::integer,0)-700));
    else defensor:=defensor||'{"posicion":"defensa"}'::jsonb;
    end if;
    r:=jsonb_set(r,array['campo',objetivo::text],defensor);texto:='Magia aplicada al rival';
   elsif criatura='hechizo-alohomora' then
    objetivo:=(p_datos->>'objetivo')::integer;
    if objetivo is null or objetivo<0 or objetivo>4 or r->'apoyos'->objetivo='null'::jsonb then raise exception 'Elige una trampa rival'; end if;
    r:=jsonb_set(r,array['apoyos',objetivo::text],'null'::jsonb);texto:='Alohomora retira una trampa rival';
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
    elsif criatura='hechizo-felix' then
     if jsonb_array_length(j->'mazo')=0 then raise exception 'No quedan cartas en el mazo'; end if;
     select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into mano from jsonb_array_elements(j->'mano') with ordinality e(value,ord) where value->>'uid'<>uid;
     if jsonb_array_length(mano)>=5 then raise exception 'Tu mano está llena'; end if;
     j:=jsonb_set(jsonb_set(j,'{mano}',mano||jsonb_build_array(j->'mazo'->0)),'{mazo}',(j->'mazo')-0);texto:='Felix Felicis: robas una carta';
    elsif criatura in ('hechizo-amortentia','hechizo-morsmordre') then
     for idx in 0..4 loop
      defensor:=case when criatura='hechizo-amortentia' then j->'campo'->idx else r->'campo'->idx end;
      if defensor<>'null'::jsonb then
       select * into ds from hechi.cartas_arena where id=defensor->>'id';
       defensor:=defensor||jsonb_build_object('bonusAtk',case when criatura='hechizo-amortentia' then least(1000,coalesce((defensor->>'bonusAtk')::integer,0)+300) else greatest(-ds.ataque,coalesce((defensor->>'bonusAtk')::integer,0)-300) end);
       if criatura='hechizo-amortentia' then j:=jsonb_set(j,array['campo',idx::text],defensor); else r:=jsonb_set(r,array['campo',idx::text],defensor); end if;
      end if;
     end loop;
     texto:='Magia aplicada al campo';
    else raise exception 'Hechizo no disponible';
    end if;
   end if;
   select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into mano from jsonb_array_elements(j->'mano') with ordinality e(value,ord) where value->>'uid'<>uid;
   j:=jsonb_set(j,'{mano}',mano);g:=g||'{"hechizo":true}'::jsonb;
  elsif p_accion='posicion' then
   casilla:=(p_datos->>'casilla')::integer;
   if casilla is null or casilla<0 or casilla>4 then raise exception 'Espacio no válido'; end if;
   carta:=j->'campo'->casilla;
   if carta='null'::jsonb then raise exception 'No puedes cambiar esta posición ahora'; end if;
   carta:=jsonb_set(carta,'{posicion}',to_jsonb(case when carta->>'posicion'='ataque' then 'defensa' else 'ataque' end));
   carta:=jsonb_set(carta,'{cambio}','true'::jsonb);
   j:=jsonb_set(j,array['campo',casilla::text],carta);texto:='Cambio de posición';
  elsif p_accion='atacar' then
   if (g->>'ronda')::integer=1 then raise exception 'No se puede atacar en el primer turno'; end if;
   casilla:=(p_datos->>'casilla')::integer;objetivo:=(p_datos->>'objetivo')::integer;
   if casilla is null or casilla<0 or casilla>4 then raise exception 'Atacante no válido'; end if;
   atacante:=j->'campo'->casilla;
   if atacante='null'::jsonb or (atacante->>'ataco')::boolean then raise exception 'Esta criatura no puede atacar'; end if;
   select * into stats from hechi.cartas_arena where id=atacante->>'id';
   stats.ataque:=greatest(0,stats.ataque+coalesce((atacante->>'bonusAtk')::integer,0));
   atacante:=atacante||'{"oculta":false,"ataco":true,"posicion":"ataque"}'::jsonb;
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
    elsif trampa->>'id'='hechizo-envejecedora' then
     select * into ds from hechi.cartas_arena where id=atacante->>'id';
     j:=jsonb_set(j,array['campo',casilla::text,'bonusAtk'],to_jsonb(greatest(-ds.ataque,coalesce((atacante->>'bonusAtk')::integer,0)-400)));texto:='Envejecedora cancela el ataque y reduce 400 ATQ';
    elsif trampa->>'id'='hechizo-imperio' then
     atacante:=atacante||jsonb_build_object('bonusAtk',least(0,coalesce((atacante->>'bonusAtk')::integer,0)),'bonusDef',least(0,coalesce((atacante->>'bonusDef')::integer,0)));
     j:=jsonb_set(j,array['campo',casilla::text],atacante);texto:='Imperio cancela el ataque y elimina refuerzos';
    elsif trampa->>'id'='hechizo-muertos' then
     r:=jsonb_set(r,'{vida}',to_jsonb(least(4000,(r->>'vida')::integer+500)));texto:='Muertos en Vida cancela el ataque y recupera 500 de vida';
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
    defensa:=case when defensor->>'posicion'='ataque' then greatest(0,ds.ataque+coalesce((defensor->>'bonusAtk')::integer,0)) else greatest(0,ds.defensa+coalesce((defensor->>'bonusDef')::integer,0)) end
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
  if not fin and (p_accion='terminar' or (p_accion='atacar' and not exists (select 1 from jsonb_array_elements(j->'campo') e where e<>'null'::jsonb and not coalesce((e->>'ataco')::boolean,false))) or (p_accion='invocar' and (g->>'ronda')::integer=1)) then
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
 -- Events contain only explicit public fields, never hands, decks, or hidden target IDs.
 if p_accion='atacar' then
  evento:=jsonb_build_object('id',gen_random_uuid(),'tipo','combate','actor',yo,
   'atacante',jsonb_build_object('id',atacante->>'id'),
   'defensor',case when objetivo is null then null
    when trampa is not null then jsonb_build_object('oculta',true)
    when defensor->>'oculta'='false' then jsonb_build_object('id',defensor->>'id','posicion',defensor->>'posicion')
    else jsonb_build_object('oculta',true) end,
   'trampa',trampa->>'id','directo',objetivo is null,
   'ataque',coalesce(atk,stats.ataque),'defensa',case when trampa is null then defensa else null end,
   'danoActor',vida_yo-(j->>'vida')::integer,'danoRival',vida_rival-(r->>'vida')::integer,
   'destruidoActor',j->'campo'->casilla='null'::jsonb,
   'destruidoRival',case when objetivo is null then false else r->'campo'->objetivo='null'::jsonb end);
 elsif p_accion='invocar' and uid2 is not null then
  evento:=jsonb_build_object('id',gen_random_uuid(),'tipo','fusion','actor',yo,'ingredientes',jsonb_build_array(carta->>'id',segunda->>'id'),'resultado',criatura,'bonusAtk',case when refuerzo then 500 else 0 end);
 end if;
 if evento is not null then
  select jsonb_agg(value order by ord) into eventos from (select value,ord from jsonb_array_elements(coalesce(g->'eventos','[]'::jsonb)||jsonb_build_array(evento)) with ordinality e(value,ord) order by ord desc limit 12) recientes;
  g:=jsonb_set(g,'{eventos}',eventos);
 end if;
 g:=jsonb_set(jsonb_set(g,array[yo],j),array[otro],r);
 update hechi.duelos_arena set partida=g,estado=case when fin and not premiar then 'cancelado' when fin then 'finalizado' else 'activo' end,
  ganador=v_ganador,version=version+1,updated_at=now(),mensaje=texto where id=d.id;
 if fin and premiar and d.recompensa and not d.premio_entregado then
  -- The duel row is locked for the whole action. Currency and receipt commit together.
  update hechi.alumnos set galeones=galeones+case when v_ganador is null then 50 when id=v_ganador then 80 else 30 end,
   updated_at=now() where clase_id=c and id in(d.jugador1,d.jugador2);
  update hechi.duelos_arena set premio_entregado=true,
   partida=partida||jsonb_build_object('premiosGaleones',jsonb_build_object(
    'a',case when v_ganador is null then 50 when v_ganador=d.jugador1 then 80 else 30 end,
    'b',case when v_ganador is null then 50 when v_ganador=d.jugador2 then 80 else 30 end))
   where id=d.id;
 end if;
 return hechi.arena_vista(d.id,p_alumno_id);
end;
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
 'galeonesGanados',case when lado is not null then d.partida->'premiosGaleones'->lado else null end,
 'recompensa',d.recompensa,'ganador',d.ganador,'premioEntregado',d.premio_entregado,'version',d.version,
 'eventos',case when lado is not null then coalesce(d.partida->'eventos','[]'::jsonb) else '[]'::jsonb end,'mensaje',d.mensaje,'lado',lado,'turno',d.partida->'turno','ronda',d.partida->'ronda',
 'invoco',d.partida->'invoco','hechizo',coalesce(d.partida->'hechizo','false'::jsonb),'fase',d.partida->'fase',
 'venceEn',d.turno_iniciado+interval '90 seconds',
 'yo',case when lado is not null and d.partida is not null then hechi.arena_jugador_publico(d.partida->lado,true) else null end,
 'rival',case when lado is not null and d.partida is not null then hechi.arena_jugador_publico(d.partida->rival,false) else null end);
end;
$$;
commit;
