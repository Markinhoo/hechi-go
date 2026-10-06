import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite, migration, manual, teacher, classId, first, ale, schema } from './score_fixture.mjs';

for (const bonuses of [false,true]) test(`arena currency, classroom isolation and idempotency (bestiary bonus: ${bonuses})`, async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  const sql=file=>readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
  for(const file of ['20260924_z_score_audit_and_undo.sql','20260924_zz_period_backups.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql','20260925_b_arena_spells.sql','20260925_c_arena_battlefield.sql','20260925_d_arena_postures.sql','20260928_arena_combat_events.sql','20260928_b_arena_hand_boost.sql','20260929_arena_balance.sql','20261005_arena_galleon_rewards.sql']) await db.exec(await sql(file));
  await db.exec(await sql('20261005_arena_galleon_rewards.sql'));
  if(bonuses) await db.exec(await sql('20261005_c_bestiary_duel_bonus.sql'));
  if(bonuses) await db.exec(await sql('20261006_arena_confundo_surrender.sql'));
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  const identity=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const balances=()=>q("select jsonb_object_agg(id,galeones) as data from hechi.alumnos");
  const scores=()=>q(`select jsonb_build_object('students',(select jsonb_agg(jsonb_build_object('id',id,'points',puntos,'chances',oportunidades,'cards',cartas) order by id) from hechi.alumnos), 'houses',(select jsonb_build_array(puntajes,puntajes_positivos,puntajes_negativos) from hechi.clases where id=$1), 'history',(select jsonb_agg(to_jsonb(p) order by id) from hechi.participaciones p)) as data`,[classId]);
  await identity(teacher);
  await q("select hechi.configurar_arena('TEST',true)");
  await db.query("update hechi.alumnos set galeones=123,bestiario='[\"dragon\",\"troll\"]' where id=$1",[first]);
  await db.query("insert into hechi.solicitudes(id,clase_id,alumno_id,estado) values(gen_random_uuid(),$1,$2,'pendiente')",[classId,first]);
  const beforeApproval=await balances();
  await q("select hechi.autorizar_participacion('TEST',$1)",[first]);
  await q("select hechi.autorizar_participacion('TEST',$1)",[first]);
  assert.deepEqual(await balances(),beforeApproval,'approval and bestiary do not pay coins');
  assert.equal(await q('select oportunidades as data from hechi.alumnos where id=$1',[first]),1,'approval still grants one card opportunity');
  await identity('');
  await assert.rejects(q("select hechi.autorizar_participacion('TEST',$1)",[first]),/maestro/);
  const baseline=await scores();
  if(bonuses){
   const {bestiario,bonusDueloBestia,bonusDueloBestiario}=await import('../../src/data/bestiaryData.js');
   const ids=bestiario.map(b=>b.id);
   assert.equal(bonusDueloBestiario(ids),63);
   assert.equal(await q('select hechi.arena_bonus_bestiario($1::jsonb) as data',[JSON.stringify([...ids,...ids,'unknown'])]),63);
   assert.equal(bonusDueloBestiario([...ids,...ids,'unknown']),63);
   for(const beast of bestiario) assert.equal(await q('select hechi.arena_bonus_bestiario($1::jsonb) as data',[JSON.stringify([beast.id])]),bonusDueloBestia(beast));
  }
  const player=()=>({vida:4000,mano:Array.from({length:5},(_,i)=>({id:'doxy',uid:'card'+i})),mazo:[],campo:[null,null,null,null,null],apoyos:[null,null,null,null,null]});
  for(const scenario of ['win-a','win-b','draw','practice','surrender','timeout-draw']){
   const a=player(),b=player();
   const side=scenario==='win-b'?'b':'a';
   const draw=scenario.includes('draw');
   const game={a,b,turno:side,ronda:draw?60:2,invoco:false,hechizo:false,fase:'invocacion'};
   if(!draw){game[side].campo[0]={id:'dragon',uid:'dragon',afinidad:'fuego',posicion:'ataque',oculta:false,ataco:false};game[side==='a'?'b':'a'].vida=100;}
   const id=await q("insert into hechi.duelos_arena(clase_id,jugador1,jugador2,estado,recompensa,partida) values($1,$2,$3,'activo',$4,$5::jsonb) returning id as data",[classId,first,ale,scenario!=='practice',JSON.stringify(game)]);
   if(scenario==='timeout-draw') await db.query("update hechi.duelos_arena set turno_iniciado=now()-interval '100 seconds' where id=$1",[id]);
   const version=await q('select version as data from hechi.duelos_arena where id=$1',[id]);
   const caller=side==='a'?first:ale;
   const action=scenario==='surrender'?'rendirse':scenario==='timeout-draw'?'vencido':draw?'terminar':'atacar';
   const old=await balances();
   const result=await q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,'{\"casilla\":0}') as data",[caller,id,version,action]);
   const surrendered=scenario==='surrender' && bonuses;
   const paid=scenario!=='practice' && (scenario!=='surrender' || bonuses);
   const after=await balances();
   assert.equal(after[first]-old[first],!paid || surrendered?0:(draw?50:side==='a'?80:30)+(bonuses?10:0),scenario);
   assert.equal(after[ale]-old[ale],!paid?0:surrendered?80:draw?50:side==='b'?80:30,scenario);
   assert.equal(result.premioEntregado,paid);
   assert.equal(result.galeonesGanados,paid?(surrendered?0:(draw?50:80)+(bonuses && caller===first && !surrendered?10:0)):null);
   if(bonuses) assert.equal(result.bonoBestiario,paid?(caller===first && !surrendered?10:0):null);
   assert.deepEqual(await scores(),baseline,'arena never changes classroom records');
   await assert.rejects(q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,'{\"casilla\":0}') as data",[caller,id,version,action]),/terminó/);
   await q("select hechi.obtener_arena('TEST',$1,'12345')",[first]);
   assert.deepEqual(await balances(),after,'retries and polling do not pay twice');
   const other=await q('select hechi.arena_vista($1,$2) as data',[id,caller===first?ale:first]);
   assert.equal(other.galeonesGanados,paid?((surrendered?80:draw?50:30)+(bonuses && caller!==first?10:0)):null);
  }
  if(bonuses){
   const receipt=await q("select hechi.arena_vista(id,$1) as data from hechi.duelos_arena where premio_entregado order by updated_at desc limit 1",[first]);
   await db.query("update hechi.alumnos set bestiario='[]' where id=$1",[first]);
   await db.exec(await sql('20261005_c_bestiary_duel_bonus.sql'));
   const preserved=await q('select hechi.arena_vista($1,$2) as data',[receipt.id,first]);
   assert.equal(preserved.galeonesGanados,receipt.galeonesGanados);
   assert.equal(preserved.bonoBestiario,10,'receipt survives collection changes and migration reruns');
  }
 }finally{await db.close();}
});
