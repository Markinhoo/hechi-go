import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,migration,manual,teacher,first,ale,schema} from './score_fixture.mjs';
test('spells: deck, private traps, limits, boosts, healing, target validation and victory',async()=>{
 const db=new PGlite();
 try{
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const file of ['20260924_z_score_audit_and_undo.sql','20260924_zz_period_backups.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql','20260925_b_arena_spells.sql'])
   await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const q=async(s,a=[]) => (await db.query(s,a)).rows[0]?.data;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  await q("select hechi.configurar_arena('TEST',true)");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  let d=await q("select hechi.retar_arena('TEST',$1,'12345',$2,false) as data",[first,ale]);
  d=await q("select hechi.responder_reto_arena('TEST',$1,'12345',$2,true) as data",[ale,d.id]);
  assert.equal(d.yo.restantes,70);
  const deck=await q('select hechi.arena_mazo() as data');
  assert.equal(deck.length,75);
  const catalog=JSON.parse(await readFile(new URL('../../src/data/duelCatalog.json',import.meta.url),'utf8'));
  for(const c of [...catalog.cards,...catalog.spells]) assert.equal(deck.filter(x=>x.id===c.id).length,c.copies);
  const view=async id=>(await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[id])).activo;
  const action=(id,move,data={})=>q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,$5::jsonb) as data",[id,d.id,d.version,move,JSON.stringify(data)]);
  const monster={id:'dragon',uid:'dragon',posicion:'ataque',afinidad:'fuego',ataco:false,cambio:false,oculta:false};
  const spell=id=>({id:'hechizo-'+id,uid:id});
  const player=(hand)=>({vida:3500,mano:hand,mazo:deck.slice(0,30),campo:[monster,null,null,null,null]});
  const reset=async(handA,handB,other={})=>{
   const state={a:player(handA),b:player(handB),turno:'a',ronda:2,invoco:false,hechizo:false,fase:'invocacion',...other};
   await db.query("update hechi.duelos_arena set partida=$2::jsonb where id=$1",[d.id,JSON.stringify(state)]);
   d=await view(first);
  };
  await reset([spell('incendio'),spell('engorgio')],[spell('patronus')]);
  await assert.rejects(action(first,'invocar',{uid:'incendio',casilla:1,afinidad:'fuego',posicion:'ataque'}),/hechizos/);
  d=await action(first,'hechizo',{uid:'incendio',casilla:0});
  assert.equal(d.rival.vida,2900);assert.equal(d.hechizo,true);assert.equal(d.yo.mano.length,1);
  await assert.rejects(action(first,'hechizo',{uid:'engorgio',objetivo:0}),/Solo una/);
  d=await action(first,'terminar');
  d=await action(ale,'hechizo',{uid:'patronus',casilla:0});
  assert.equal(d.yo.apoyos[0].id,'hechizo-patronus');
  assert.deepEqual((await view(first)).rival.apoyos[0],{oculta:true});
  assert.doesNotMatch(d.mensaje,/Patronus/);
  d=await action(ale,'terminar');
  d=await action(first,'hechizo',{uid:'engorgio',objetivo:0});
  assert.equal(d.yo.campo[0].bonusAtk,500);
  await assert.rejects(action(first,'atacar',{casilla:0,objetivo:4}),/Objetivo/);
  assert.ok((await view(ale)).yo.apoyos[0]);
  d=await action(first,'atacar',{casilla:0,objetivo:0});
  assert.equal(d.yo.vida,3100);assert.equal(d.rival.vida,2900);assert.equal(d.rival.apoyos[0],null);
  assert.equal(d.turno,'b');assert.match(d.mensaje,/Patronus/);
  // Boost participates in actual combat, not only presentation.
  await reset([spell('engorgio')],[]);
  d=await action(first,'hechizo',{uid:'engorgio',objetivo:0});
  d=await action(first,'atacar',{casilla:0,objetivo:0});
  assert.equal(d.rival.vida,3000);assert.equal(d.rival.campo[0],null);
  // Both other traps cancel a direct attack and are consumed exactly once.
  for(const trap of ['confundo','invisibilidad']){
   await reset([],[]);
   await db.query("update hechi.duelos_arena set partida=jsonb_set(jsonb_set(partida,'{b,campo}','[null,null,null,null,null]'),'{b,apoyos}',$2::jsonb) where id=$1",
    [d.id,JSON.stringify([{...spell(trap),oculta:true},null,null])]);
   d=await view(first);d=await action(first,'atacar',{casilla:0});
   assert.equal(d.rival.vida,3500);assert.equal(d.rival.apoyos[0],null);assert.equal(d.turno,'b');
   if(trap==='confundo') assert.equal(d.yo.campo[0].posicion,'defensa');
  }
  await reset([spell('elixir')],[]);
  d=await action(first,'hechizo',{uid:'elixir',casilla:0});
  assert.equal(d.yo.vida,4000);assert.equal(d.turno,'a');
  await reset([spell('incendio')],[]);
  await db.query("update hechi.duelos_arena set partida=jsonb_set(partida,'{b,vida}','500') where id=$1",[d.id]);
  const before=await q('select puntos as data from hechi.alumnos where id=$1',[first]);
  d=await action(first,'hechizo',{uid:'incendio',casilla:0});
  assert.equal(d.estado,'finalizado');assert.equal(d.premioEntregado,true);
  assert.equal(await q('select puntos as data from hechi.alumnos where id=$1',[first]),before+3);
  await assert.rejects(action(first,'hechizo',{uid:'incendio',casilla:0}),/ya terminó/);
 }finally{await db.close();}
});