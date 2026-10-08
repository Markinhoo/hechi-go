import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,manual,first,ale,classId} from './score_fixture.mjs';

test('four idle turns cancel without rewards and refund stakes',async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const file of ['20260924_z_score_audit_and_undo.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql','20260925_b_arena_spells.sql','20260925_c_arena_battlefield.sql','20260925_d_arena_postures.sql','20260928_arena_combat_events.sql','20260928_b_arena_hand_boost.sql','20260929_arena_balance.sql','20261005_arena_galleon_rewards.sql','20261005_c_bestiary_duel_bonus.sql','20261006_arena_confundo_surrender.sql','20261007_b_arena_wagers.sql','20261008_arena_inactivity.sql','20261008_arena_inactivity.sql']) await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.data;
  await db.query('update hechi.clases set arena_abierta=true where id=$1',[classId]);
  const balances=()=>q('select jsonb_object_agg(id,galeones) as data from hechi.alumnos');
  const start=async()=>{
   await db.exec('delete from hechi.duelos_arena; update hechi.alumnos set galeones=100');
   let d=await q("select hechi.retar_arena('TEST',$1,'12345',$2,false,20) as data",[first,ale]);
   d=await q("select hechi.responder_reto_arena('TEST',$1,'12345',$2,true) as data",[ale,d.id]);
   return d;
  };
  const move=(d,action,data={})=>q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,$5::jsonb) as data",[d.turno==='a'?first:ale,d.id,d.version,action,JSON.stringify(data)]);
  let d=await start();
  for(let i=1;i<=3;i++){d=await move(d,'terminar');assert.equal(d.estado,'activo');}
  const invalid=await q('select partida as data from hechi.duelos_arena where id=$1',[d.id]);
  await assert.rejects(move(d,'posicion',{casilla:0}),/posición/);
  assert.deepEqual(await q('select partida as data from hechi.duelos_arena where id=$1',[d.id]),invalid);
  d=await move(d,'terminar');assert.equal(d.estado,'cancelado');assert.match(d.mensaje,/inactividad/);
  assert.equal(d.galeonesGanados,0);assert.equal(d.retornoApuesta,20);assert.equal(d.ganador,null);
  assert.deepEqual(await balances(),{[first]:100,[ale]:100});
  await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[first]);assert.deepEqual(await balances(),{[first]:100,[ale]:100});
  d=await start();
  for(let i=0;i<3;i++) d=await move(d,'terminar');
  const g=await q('select partida as data from hechi.duelos_arena where id=$1',[d.id]);
  g[d.turno].campo[0]={id:'doxy',uid:'doxy',posicion:'ataque',afinidad:'aire',oculta:false,ataco:false};
  await db.query('update hechi.duelos_arena set partida=$2::jsonb where id=$1',[d.id,JSON.stringify(g)]);
  d=await move(d,'posicion',{casilla:0});d=await move(d,'terminar');
  for(let i=0;i<3;i++){d=await move(d,'terminar');assert.equal(d.estado,'activo');}
  d=await move(d,'terminar');assert.equal(d.estado,'cancelado');
  // Both clients were closed: four elapsed deadlines are caught up in one read.
  d=await start();await db.query("update hechi.duelos_arena set turno_iniciado=now()-interval '361 seconds' where id=$1",[d.id]);
  const arena=await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[first]);
  assert.equal(arena.activo,null);assert.equal(arena.duelos[0].estado,'cancelado');assert.equal(arena.duelos[0].galeonesGanados,0);
  assert.deepEqual(await balances(),{[first]:100,[ale]:100});
  // One expired turn must not count as four; preserve the next deadline.
  d=await start();await db.query("update hechi.duelos_arena set turno_iniciado=now()-interval '100 seconds' where id=$1",[d.id]);
  const active=await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[first]);
  assert.equal(active.activo.estado,'activo');assert.equal(active.activo.ronda,2);
  // Inactivity takes precedence over the normal round-limit draw reward.
  await db.query("update hechi.duelos_arena set partida=partida||'{\"ronda\":60,\"turnosInactivos\":3}'::jsonb where id=$1",[d.id]);
  d=await q('select hechi.arena_vista($1,$2) as data',[d.id,first]);
  d=await move(d,'terminar');assert.equal(d.estado,'cancelado');assert.equal(d.galeonesGanados,0);
 } finally {await db.close();}
});
