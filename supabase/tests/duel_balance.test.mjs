import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,access} from 'node:fs/promises';
import {PGlite,migration,manual,teacher,first,ale,schema} from './score_fixture.mjs';

test('balance: complete catalog, spell effects, limits, privacy and legendary counters',async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const file of ['20260924_z_score_audit_and_undo.sql','20260924_zz_period_backups.sql','20260924_zzz_duel_arena.sql','20260924_zzz_duel_catalog.sql','20260925_arena_automatic_turns.sql','20260925_b_arena_spells.sql','20260925_c_arena_battlefield.sql','20260925_d_arena_postures.sql','20260928_arena_combat_events.sql','20260928_b_arena_hand_boost.sql','20260929_arena_balance.sql'])
   await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  const catalog=JSON.parse(await readFile(new URL('../../src/data/duelCatalog.json',import.meta.url),'utf8'));
  const {CARTAS_ACTIVAS}=await import('../../src/data/gameData.js');
  assert.deepEqual(catalog.spells.map(c=>c.numero),[...CARTAS_ACTIVAS].sort((a,b)=>a-b));
  const deck=await q('select hechi.arena_mazo() as data');assert.equal(deck.length,75);
  for(const card of [...catalog.cards,...catalog.spells]) {
   assert.equal(deck.filter(c=>c.id===card.id).length,card.copies);
   const stats=await q('select to_jsonb(c) as data from hechi.cartas_arena c where id=$1',[card.id]);
   assert.equal(stats.ataque,card.atk||0);assert.equal(stats.defensa,card.def||0);
  }
  for(const spell of catalog.spells) await access(new URL('../../public/hechi/card-'+spell.numero+'.png',import.meta.url));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);await q("select hechi.configurar_arena('TEST',true)");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  let d=await q("select hechi.retar_arena('TEST',$1,'12345',$2,true) as data",[first,ale]);
  d=await q("select hechi.responder_reto_arena('TEST',$1,'12345',$2,true) as data",[ale,d.id]);
  const view=async(id=first)=>(await q("select hechi.obtener_arena('TEST',$1,'12345') as data",[id])).activo;
  const action=(move,data,id=first)=>q("select hechi.accion_duelo_arena('TEST',$1,'12345',$2,$3,$4,$5::jsonb) as data",[id,d.id,d.version,move,JSON.stringify(data)]);
  const monster=(id,extra={})=>({id,uid:id,posicion:'ataque',afinidad:catalog.cards.find(c=>c.id===id).stars[0],oculta:false,ataco:false,...extra});
  const reset=async(spell,own={},rival={},state={})=>{
   const player={vida:3500,mazo:deck,mano:[{id:'hechizo-'+spell,uid:'spell'},{id:'doxy',uid:'extra'}],campo:[monster('bowtruckle'),null,null,null,null],apoyos:[null,null,null,null,null]};
   await db.query("update hechi.duelos_arena set partida=$2::jsonb where id=$1",[d.id,JSON.stringify({a:{...player,...own},b:{...player,campo:[monster('dragon'),null,null,null,null],...rival},turno:'a',ronda:2,invoco:false,hechizo:false,fase:'invocacion',...state})]);d=await view();
  };
  const cast=()=>action('hechizo',{uid:'spell',objetivo:0,casilla:0});
  for(const [spell,atk,def] of [['engorgio',500,0],['crecehuesos',0,500],['vigorizante',300,300]]) {
   await reset(spell);d=await cast();assert.equal(d.yo.campo[0].bonusAtk,atk);assert.equal(d.yo.campo[0].bonusDef,def);
   assert.equal(d.hechizo,true);assert.equal(d.yo.mano.length,1);
  }
  await reset('vigorizante',{campo:[monster('bowtruckle',{bonusAtk:900,bonusDef:900}),null,null,null,null]});d=await cast();assert.equal(d.yo.campo[0].bonusAtk,1000);assert.equal(d.yo.campo[0].bonusDef,1000);
  await reset('multijugos',{campo:[monster('centauro'),null,null,null,null]});d=await cast();assert.equal(d.yo.campo[0].bonusAtk,600);
  await reset('crucio');d=await cast();assert.equal(d.rival.campo[0].bonusAtk,-700);
  await reset('sectumsempra');d=await cast();assert.equal(d.rival.campo[0].bonusDef,-700);
  await reset('crucio',{}, {campo:[monster('dragon',{bonusAtk:-2400}),null,null,null,null]});d=await cast();assert.equal(d.rival.campo[0].bonusAtk,-2500);
  await reset('avada');d=await cast();assert.equal(d.yo.vida,2700);assert.equal(d.rival.campo[0],null);
  await reset('avada',{vida:800});await assert.rejects(cast(),/800/);assert.equal((await view()).yo.mano.length,2);
  await reset('avada',{}, {campo:[monster('dragon',{oculta:true}),null,null,null,null]});await assert.rejects(cast(),/boca arriba/);
  await reset('riddikulus');d=await cast();assert.equal(d.rival.campo[0].posicion,'defensa');
  await reset('alohomora',{}, {apoyos:[{id:'hechizo-patronus',oculta:true},null,null,null,null]});d=await cast();assert.equal(d.rival.apoyos[0],null);assert.equal(d.yo.vida,3500);
  await reset('felix');d=await cast();assert.equal(d.yo.mano.length,2);assert.equal(d.yo.restantes,74);
  await reset('amortentia',{campo:[monster('bowtruckle'),monster('doxy'),null,null,null]});d=await cast();assert.equal(d.yo.campo[0].bonusAtk,300);assert.equal(d.yo.campo[1].bonusAtk,300);
  await reset('morsmordre',{}, {campo:[monster('dragon'),monster('troll',{oculta:true}),null,null,null]});d=await cast();assert.equal(d.rival.campo[0].bonusAtk,-300);assert.deepEqual(d.rival.campo[1],{oculta:true,posicion:'ataque'});
  await reset('incendio');d=await cast();assert.equal(d.rival.vida,2900);
  await reset('elixir');d=await cast();assert.equal(d.yo.vida,4000);
  for(const trap of catalog.spells.filter(c=>c.tipo==='trampa')) {
   await reset(trap.id.slice(8),{}, {campo:[monster('dragon',{bonusAtk:500,bonusDef:300}),null,null,null,null]});
   d=await cast();assert.equal(d.yo.apoyos[0].id,trap.id);assert.deepEqual((await view(ale)).rival.apoyos[0],{oculta:true});
   d=await action('terminar',{});d=await action('atacar',{casilla:0,objetivo:0},ale);
   assert.equal(d.rival.apoyos[0],null);assert.equal(d.rival.campo[0].id,'bowtruckle');
   if(trap.id==='hechizo-envejecedora') assert.equal(d.yo.campo[0].bonusAtk,100);
   if(trap.id==='hechizo-imperio') {assert.equal(d.yo.campo[0].bonusAtk,0);assert.equal(d.yo.campo[0].bonusDef,0);}
   if(trap.id==='hechizo-muertos') assert.equal(d.rival.vida,4000);
  }
  await reset('riddikulus',{campo:[monster('fwooper'),null,null,null,null]});d=await cast();d=await action('atacar',{casilla:0,objetivo:0});assert.equal(d.rival.campo[0],null,'Fwooper destroys Dragon in defense');
  await reset('crucio',{campo:[monster('fwooper'),null,null,null,null]});d=await cast();d=await action('atacar',{casilla:0,objetivo:0});assert.equal(d.rival.campo[0],null,'Fwooper trades with weakened Dragon');
  await reset('incendio',{campo:[monster('cerbero'),null,null,null,null]}, {campo:[monster('troll'),null,null,null,null]});d=await action('atacar',{casilla:0,objetivo:0});assert.equal(d.rival.campo[0],null,'Cerberus beats Troll with fire advantage');
  for(const spell of ['crucio','sectumsempra','riddikulus','crecehuesos','multijugos','alohomora']) {
   await reset(spell);await assert.rejects(action('hechizo',{uid:'spell',objetivo:8,casilla:0}));assert.equal((await view()).yo.mano.length,2);
  }
  await reset('crucio',{}, {},{hechizo:true});await assert.rejects(cast(),/Solo una/);
  await reset('crucio',{}, {},{turno:'b'});await assert.rejects(cast(),/turno del rival/);
 } finally {await db.close();}
});
