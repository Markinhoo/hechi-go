import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,manual,first,ale,classId} from './score_fixture.mjs';
test('Confundo locks only the attacker until its next turn, including server-side actions',async()=>{
 const db=new PGlite();
 try{
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const file of ['20260924_z_score_audit_and_undo.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql','20260925_b_arena_spells.sql','20260925_c_arena_battlefield.sql','20260925_d_arena_postures.sql','20260928_arena_combat_events.sql','20260928_b_arena_hand_boost.sql','20260929_arena_balance.sql','20261005_arena_galleon_rewards.sql','20261005_c_bestiary_duel_bonus.sql','20261006_arena_confundo_surrender.sql']) await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  const monster=()=>({id:'dragon',uid:'dragon',afinidad:'fuego',posicion:'ataque',ataco:false,oculta:false});
  const player=()=>({vida:4000,mano:Array.from({length:5},(_,i)=>({id:i?'doxy':'hechizo-engorgio',uid:'hand'+i})),mazo:[],campo:[monster(),monster(),null,null,null],apoyos:[null,null,null,null,null]});
  const a=player(),b=player();b.apoyos[0]={id:'hechizo-confundo',oculta:true};
  const id=await q("insert into hechi.duelos_arena(clase_id,jugador1,jugador2,estado,recompensa,partida) values($1,$2,$3,'activo',false,$4::jsonb) returning id as data",[classId,first,ale,JSON.stringify({a,b,turno:'a',ronda:2,fase:'invocacion',invoco:false,hechizo:false})]);
  const view=who=>q('select hechi.arena_vista($1,$2) as data',[id,who]);
  let d=await view(first);
  const action=(who,move,data={})=>q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,$5::jsonb) as data",[who,id,d.version,move,JSON.stringify(data)]);
  d=await action(first,'atacar',{casilla:0,objetivo:0});
  assert.equal(d.yo.campo[0].posicion,'defensa');assert.equal(d.yo.campo[0].bloqueada,true);assert.equal(d.turno,'a');
  await assert.rejects(action(first,'posicion',{casilla:0}),/Confundo/);
  await assert.rejects(action(first,'atacar',{casilla:0,objetivo:0}),/no puede atacar/);
  d=await action(first,'posicion',{casilla:1});
  d=await action(first,'terminar');
  assert.equal((await view(first)).yo.campo[0].bloqueada,true);
  d=await action(ale,'terminar');
  d=await view(first);assert.equal(d.yo.campo[0].bloqueada,false);assert.equal(d.yo.campo[0].ataco,false);
  d=await action(first,'posicion',{casilla:0});assert.equal(d.yo.campo[0].posicion,'ataque');
 }finally{await db.close();}
});
