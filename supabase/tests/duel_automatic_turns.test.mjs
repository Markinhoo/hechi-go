import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite, migration, manual, teacher, first, ale, schema } from './score_fixture.mjs';
const sql=async n=>readFile(new URL('../migrations/'+n,import.meta.url),'utf8');
test('automatic turns: first summon, one attack, fixed timer, timeout race and final victory',async()=>{
 const db=new PGlite();
 try{
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const n of ['20260924_z_score_audit_and_undo.sql','20260924_zz_period_backups.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql']) await db.exec(await sql(n));
  await db.exec(await sql('20260925_arena_automatic_turns.sql'));
  const q=async(s,a=[]) => (await db.query(s,a)).rows[0]?.data;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  await q("select hechi.configurar_arena('TEST',true) as data");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  let d=await q("select hechi.retar_arena('TEST',$1,'12345',$2,false) as data",[first,ale]);
  d=await q("select hechi.responder_reto_arena('TEST',$1,'12345',$2,true) as data",[ale,d.id]);
  const view=async id=>(await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[id])).activo;
  const action=(id,move,values={},version=d.version)=>q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,$5::jsonb) as data",[id,d.id,version,move,JSON.stringify(values)]);
  const current=d.turno==='a'?first:ale, rival=current===first?ale:first;
  d=await view(current);
  const catalog=JSON.parse(await readFile(new URL('../../src/data/duelCatalog.json',import.meta.url),'utf8'));
  const card=d.yo.mano[0],stats=catalog.cards.find(c=>c.id===card.id);
  d=await action(current,'invocar',{uid:card.uid,casilla:0,afinidad:stats.stars[0],posicion:'ataque',oculta:true});
  assert.equal(d.ronda,2);assert.notEqual(d.turno,d.lado);
  await assert.rejects(action(current,'terminar'),/turno del rival/);
  d=await view(rival);
  const before=d.venceEn;
  const card2=d.yo.mano[0],stats2=catalog.cards.find(c=>c.id===card2.id);
  d=await action(rival,'invocar',{uid:card2.uid,casilla:0,afinidad:stats2.stars[0],posicion:'ataque'});
  assert.equal(d.turno,d.lado);assert.equal(d.venceEn,before,'summoning later does not extend the timer');
  d=await action(rival,'atacar',{casilla:0,objetivo:0});
  assert.equal(d.ronda,3);assert.notEqual(d.turno,d.lado);
  const version=d.version;
  await assert.rejects(action(rival,'atacar',{casilla:0,objetivo:0}),/turno del rival/);
  await db.query("update hechi.duelos_arena set turno_iniciado=now()-interval '91 seconds' where id=$1",[d.id]);
  d=await view(rival);
  assert.equal(d.ronda,4);assert.equal(d.turno,d.lado);
  assert.match(d.mensaje,/Tiempo agotado/);assert.equal(d.version,version+1);
  const stable=await view(current);assert.equal(stable.version,d.version);
  await assert.rejects(action(current,'vencido',{},version),/cambió/);
  await assert.rejects(action(current,'vencido'),/aún no vence/);
  assert.equal(d.estado,'activo');
  // A timeout must work even when the waiting student is the caller.
  await db.query("update hechi.duelos_arena set turno_iniciado=now()-interval '91 seconds' where id=$1",[d.id]);
  d=await action(current,'vencido');
  assert.equal(d.ronda,5);assert.equal(d.turno,d.lado);
  // Winning attacks finish before the automatic pass.
  const side=d.lado, other=side==='a'?'b':'a';
  await db.query("update hechi.duelos_arena set partida=jsonb_set(jsonb_set(jsonb_set(partida,$2::text[],$3::jsonb),$4::text[],'[null,null,null,null,null]'),$5::text[],'1') where id=$1",
   [d.id,[side,'campo'],JSON.stringify([{id:'dragon',uid:'x',afinidad:'fuego',posicion:'ataque',ataco:false},null,null,null,null]),[other,'campo'],[other,'vida']]);
  d=await view(current);
  const points=await q('select puntos as data from hechi.alumnos where id=$1',[current]);
  d=await action(current,'atacar',{casilla:0});
  assert.equal(d.estado,'finalizado');assert.equal(d.ronda,5);assert.equal(d.premioEntregado,true);
  assert.equal(await q('select puntos as data from hechi.alumnos where id=$1',[current]),points+3);
 }finally{await db.close();}
});