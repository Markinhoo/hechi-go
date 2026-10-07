import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,manual,first,ale,classId} from './score_fixture.mjs';

test('wagers: authenticated offers, atomic acceptance, settlement and reward isolation',async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const file of ['20260924_z_score_audit_and_undo.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql','20260925_b_arena_spells.sql','20260925_c_arena_battlefield.sql','20260925_d_arena_postures.sql','20260928_arena_combat_events.sql','20260928_b_arena_hand_boost.sql','20260929_arena_balance.sql','20261005_arena_galleon_rewards.sql','20261005_c_bestiary_duel_bonus.sql','20261006_arena_confundo_surrender.sql','20261007_b_arena_wagers.sql','20261007_b_arena_wagers.sql']) await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  const balances=()=>q('select jsonb_object_agg(id,galeones) as data from hechi.alumnos');
  await db.query('update hechi.clases set arena_abierta=true where id=$1',[classId]);
  await db.exec(`update hechi.alumnos set bestiario='["dragon","troll"]'::jsonb`);
  const reset=async()=>{
   await db.exec('delete from hechi.duelos_arena');
   await db.query('update hechi.alumnos set galeones=case when id=$1 then 100 else 40 end',[first]);
  };
  const offer=(amount=20,practice=false)=>q("select hechi.retar_arena('TEST',$1,'12345',$2,$3,$4) as data",[first,ale,practice,amount]);
  const respond=(id,accept=true,who=ale)=>q("select hechi.responder_reto_arena('TEST',$1,'12345',$2,$3) as data",[who,id,accept]);
  await reset();
  const list=await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[first]);
  assert.equal(list.galeones,100);assert.equal(list.rivales.find(r=>r.id===ale).maxApuesta,40);
  await assert.rejects(offer(-1),/Apuesta no válida/);await assert.rejects(offer(41),/máximo/);
  await assert.rejects(q("select hechi.retar_arena('TEST',$1,'wrong',$2,false,20)",[first,ale]),/Credenciales/);
  let d=await offer(40);assert.equal(d.apuesta,40);assert.equal((await balances())[first],100);
  await assert.rejects(respond(d.id,true,first),/Solo el rival/);
  await db.query('update hechi.alumnos set galeones=39 where id=$1',[ale]);
  await assert.rejects(respond(d.id),/saldo cambió/);
  assert.equal((await balances())[first],100);await respond(d.id,false);
  assert.equal((await balances())[ale],39);
  await reset();d=await offer();await db.query("update hechi.duelos_arena set updated_at=now()-interval '11 minutes' where id=$1",[d.id]);
  await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[first]);
  assert.equal((await balances())[first],100);await assert.rejects(respond(d.id),/ya fue respondido/);
  const baseline=await q('select jsonb_agg(jsonb_build_array(id,puntos,oportunidades,cartas)) as data from hechi.alumnos');
  for(const outcome of ['win','loss','draw','surrender','practice','cancel','timeout','zero']) {
   await reset();const stake=outcome==='zero'?0:20;
   d=await offer(stake,outcome==='practice');d=await respond(d.id);
   assert.equal((await balances())[first],100-stake);assert.equal((await balances())[ale],40-stake);
   await assert.rejects(respond(d.id),/ya fue respondido/);
   const player=()=>({vida:4000,mano:Array.from({length:5},(_,i)=>({id:'doxy',uid:'h'+i})),mazo:[],campo:[null,null,null,null,null],apoyos:[null,null,null,null,null]});
   const a=player(),b=player(),draw=['draw','timeout'].includes(outcome),side=outcome==='loss'?'b':'a';
   const g={a,b,turno:side,ronda:draw?60:2,invoco:false,hechizo:false,fase:'invocacion'};
   g[side].campo[0]={id:'dragon',uid:'dragon',afinidad:'fuego',posicion:'ataque',oculta:false,ataco:false};
   if(!draw) g[side==='a'?'b':'a'].vida=100;
   await db.query('update hechi.duelos_arena set partida=$2::jsonb where id=$1',[d.id,JSON.stringify(g)]);
   if(outcome==='cancel') await db.query("update hechi.duelos_arena set estado='cancelado' where id=$1",[d.id]);
   else if(outcome==='timeout') {
    await db.query("update hechi.duelos_arena set turno_iniciado=now()-interval '91 seconds' where id=$1",[d.id]);
    await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[first]);
   } else await q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,$5::jsonb) as data",[side==='b'?ale:first,d.id,d.version,outcome==='surrender'?'rendirse':draw?'terminar':'atacar',JSON.stringify({casilla:0})]);
   const payout=await balances();
   const winner=['loss','surrender'].includes(outcome)?ale:first;
   const expected=outcome==='cancel'?{[first]:100,[ale]:40}:draw?{[first]:150,[ale]:90}:
    {[first]:100-stake+(winner===first?(outcome==='practice'?0:80)+stake*2:0),[ale]:40-stake+(winner===ale?80+stake*2:0)};
   assert.equal(payout[first],expected[first],outcome);assert.equal(payout[ale],expected[ale],outcome);
   const view=await q('select hechi.arena_vista($1,$2) as data',[d.id,first]);
   assert.equal(view.retornoApuesta,outcome==='cancel'||draw?stake:winner===first?stake*2:0);
   await db.query('update hechi.duelos_arena set estado=estado where id=$1',[d.id]);assert.deepEqual(await balances(),payout,'no duplicate settlement');
   await assert.rejects(q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,'rendirse')",[first,d.id,view.version]),/ya terminó/);
  }
  assert.deepEqual(await q('select jsonb_agg(jsonb_build_array(id,puntos,oportunidades,cartas)) as data from hechi.alumnos'),baseline);
 } finally {await db.close();}
});
