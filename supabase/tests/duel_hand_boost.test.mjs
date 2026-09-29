import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,migration,manual,teacher,first,ale,schema} from './score_fixture.mjs';

test('hand boost validates both cards, consumes both allowances and increases combat damage',async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const file of ['20260924_z_score_audit_and_undo.sql','20260924_zz_period_backups.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql','20260925_b_arena_spells.sql','20260925_c_arena_battlefield.sql','20260925_d_arena_postures.sql','20260928_arena_combat_events.sql','20260928_b_arena_hand_boost.sql'])
   await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  await q("select hechi.configurar_arena('TEST',true)");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  let d=await q("select hechi.retar_arena('TEST',$1,'12345',$2,true) as data",[first,ale]);
  d=await q("select hechi.responder_reto_arena('TEST',$1,'12345',$2,true) as data",[ale,d.id]);
  const deck=await q('select hechi.arena_mazo() as data');
  const stars=await q("select to_jsonb(afinidades) as data from hechi.cartas_arena where id='bowtruckle'");
  const view=async()=>(await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[first])).activo;
  const action=(move,data)=>q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,$5::jsonb) as data",[first,d.id,d.version,move,JSON.stringify(data)]);
  const reset=async(extra={})=>{
   const player={vida:4000,mazo:deck,mano:[{id:'bowtruckle',uid:'monster'},{id:'hechizo-engorgio',uid:'boost'},{id:'hechizo-incendio',uid:'fire'}],campo:[null,null,null,null,null],apoyos:[null,null,null,null,null]};
   await db.query("update hechi.duelos_arena set partida=$2::jsonb where id=$1",[d.id,JSON.stringify({a:player,b:player,turno:'a',ronda:2,invoco:false,hechizo:false,fase:'invocacion',...extra})]);
   d=await view();
  };
  const summon={uid:'monster',uid2:'boost',casilla:0,afinidad:stars[0],posicion:'ataque',oculta:true};
  await reset();
  for(const invalid of [{uid2:'missing'},{uid2:'monster'},{uid:'fire'},{casilla:8},{afinidad:'invalid'}]) {
   await assert.rejects(action('invocar',{...summon,...invalid}));
   const unchanged=await view();assert.equal(unchanged.version,d.version);assert.equal(unchanged.yo.mano.length,3);assert.equal(unchanged.yo.campo[0],null);
  }
  await reset({hechizo:true});await assert.rejects(action('invocar',summon),/Solo una magia/);
  await reset({fase:'batalla'});await assert.rejects(action('invocar',summon),/antes de atacar/);
  await reset();d=await action('invocar',summon);
  assert.equal(d.yo.campo[0].bonusAtk,500);assert.equal(d.yo.campo[0].oculta,false);
  assert.equal(d.hechizo,true);assert.equal(d.invoco,true);assert.equal(d.yo.mano.length,1);
  assert.equal(d.eventos.at(-1).bonusAtk,500);
  await assert.rejects(action('hechizo',{uid:'fire',casilla:0}),/Solo una magia/);
  d=await action('atacar',{casilla:0});assert.equal(d.rival.vida,2700);
  await reset({ronda:1});d=await action('invocar',{...summon,uid:'boost',uid2:'monster'});
  assert.equal(d.turno,'b');assert.equal(d.yo.campo[0].bonusAtk,500);assert.equal(d.yo.mano.length,1);
 } finally {await db.close();}
});
