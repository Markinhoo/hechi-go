import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite, migration, manual, teacher, classId, first, ale, schema } from './score_fixture.mjs';
const sql = async file => readFile(new URL('../migrations/' + file, import.meta.url), 'utf8');
test('duel server: deck, privacy, validation, fusion, combat, rewards and reset', async () => {
 const db = new PGlite();
 try {
  await db.exec(schema); await db.exec(migration); await db.exec(manual);
  await db.exec(await sql('20260924_z_score_audit_and_undo.sql'));
  await db.exec(await sql('20260924_zz_period_backups.sql'));
  await db.exec(await sql('20260924_zzz_duel_arena.sql'));
  await db.exec(await sql('20260924_zzz_duel_arena.sql'));
  await db.exec(await sql('20260924_zzz_duel_catalog.sql'));
  const query = async (s, a=[]) => (await db.query(s,a)).rows[0]?.data;
  const identity = id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await assert.rejects(db.query("select hechi.configurar_arena('TEST',true)"), /maestro/);
  await identity(teacher);
  await db.query("select hechi.configurar_arena('TEST',true)");
  await identity('');
  const deck=await query('select hechi.arena_mazo() as data');
  assert.equal(deck.length,61); assert.equal(new Set(deck.map(c=>c.uid)).size,61);
  const catalog=JSON.parse(await readFile(new URL('../../src/data/duelCatalog.json',import.meta.url),'utf8'));
  for(const c of catalog.cards) assert.equal(deck.filter(x=>x.id===c.id).length,c.copies);
  const view = id => query('select hechi.obtener_arena($1,$2,$3) as data',['TEST',id,'12345']);
  const invite = (a=first,b=ale,practice=false) => query('select hechi.retar_arena($1,$2,$3,$4,$5) as data',['TEST',a,'12345',b,practice]);
  const accept = (id,a=ale) => query('select hechi.responder_reto_arena($1,$2,$3,$4,true) as data',['TEST',a,'12345',id]);
  const action = (d,a,act,data={}) => query('select hechi.accion_duelo_arena($1,$2,$3,$4,$5,$6,$7::jsonb) as data',['TEST',a,'12345',d.id,d.version,act,JSON.stringify(data)]);
  let d=await invite();
  await assert.rejects(invite(),/ya tiene/);
  await assert.rejects(accept(d.id,first),/Solo el rival/);
  d=await accept(d.id);
  assert.equal(d.yo.mano.length,5); assert.equal(d.yo.restantes,56);
  assert.equal(d.rival.mano.length,0); assert.ok(!JSON.stringify(d).includes('"mazo"'));
  assert.equal((await view(first)).cupos,2);
  await assert.rejects(db.query("select hechi.obtener_arena('TEST',$1,'wrong')",[first]),/Credenciales/);
  const current=d.turno==='a'?first:ale, other=current===first?ale:first;
  d=(await view(current)).activo;
  await assert.rejects(action(d,other,'terminar'),/turno del rival/);
  const h=d.yo.mano[0], stats=catalog.cards.find(c=>c.id===h.id);
  d=await action(d,current,'invocar',{uid:h.uid,casilla:0,afinidad:stats.stars[0],posicion:'ataque',oculta:true});
  assert.equal((await view(other)).activo.rival.campo[0].id,undefined);
  await assert.rejects(action(d,current,'invocar',{}),/Solo una/);
  await assert.rejects(action(d,current,'atacar',{casilla:0}),/primer turno/);
  await assert.rejects(action({...d,version:0},current,'terminar'),/cambió/);
  d=await action(d,current,'terminar');
  assert.equal(d.turno,current===first?'b':'a');
  // Arrange two ingredients in the current player's actual hand.
  const side=current===first?'b':'a';
  await db.query("update hechi.duelos_arena set partida=jsonb_set(partida,$2::text[],$3::jsonb) where id=$1",
   [d.id,[side,'mano'],JSON.stringify([{id:'bowtruckle',uid:'one'},{id:'doxy',uid:'two'}])]);
  d=(await view(other)).activo;
  d=await action(d,other,'invocar',{uid:'one',uid2:'two',casilla:0,afinidad:'sombra',posicion:'ataque',oculta:true});
  assert.equal(d.yo.campo[0].id,'acromantula');assert.equal(d.yo.campo[0].oculta,false);
  assert.equal(d.yo.mano.length,0);
  // Deterministic combat: dragon 2800 + affinity 300 vs bowtruckle 800.
  const monster=(id,afinidad,posicion='ataque')=>({id,uid:id,afinidad,posicion,oculta:false,ataco:false,cambio:false});
  const arrange=async(a,b,life=4000)=>{
   await db.query("update hechi.duelos_arena set partida=jsonb_set(jsonb_set(jsonb_set(jsonb_set(partida,'{turno}','\"a\"'),'{ronda}','2'),'{a,campo}',$2::jsonb),'{b,campo}',$3::jsonb) where id=$1",
    [d.id,JSON.stringify([a,null,null,null,null]),JSON.stringify([b,null,null,null,null])]);
   await db.query("update hechi.duelos_arena set partida=jsonb_set(partida,'{b,vida}',to_jsonb($2::integer)) where id=$1",[d.id,life]);
   d=(await view(first)).activo;
  };
  await arrange(monster('dragon','fuego'),monster('bowtruckle','tierra'));
  d=await action(d,first,'atacar',{casilla:0,objetivo:0});
  assert.equal(d.rival.vida,1700); assert.equal(d.rival.campo[0],null);
  await assert.rejects(action(d,first,'atacar',{casilla:0}),/no puede atacar/);
  await arrange(monster('dragon','fuego'),monster('bowtruckle','tierra','defensa'));
  d=await action(d,first,'atacar',{casilla:0,objetivo:0});
  assert.equal(d.rival.vida,4000);
  await arrange(monster('dragon','fuego'),null,100);
  const before=await query('select puntos as data from hechi.alumnos where id=$1',[first]);
  d=await action(d,first,'atacar',{casilla:0});
  assert.equal(d.estado,'finalizado');assert.equal(d.ganador,first);assert.equal(d.premioEntregado,true);
  assert.equal(await query('select puntos as data from hechi.alumnos where id=$1',[first]),before+3);
  await assert.rejects(action(d,first,'atacar',{casilla:0}),/ya terminó/);
  d=await invite(ale,first); assert.equal(d.recompensa,false);
  d=await accept(d.id,first);assert.equal(d.recompensa,false);
  await arrange(monster('dragon','fuego'),null,100);
  d=(await view(ale)).activo;
  d=await action(d,ale,'atacar',{casilla:0});
  assert.equal(d.estado,'finalizado');assert.equal(d.premioEntregado,false);
  assert.equal(await query('select puntos as data from hechi.alumnos where id=$1',[first]),before+3);
  assert.equal((await view(first)).cupos,2);
  // Reserve two more rewarded matches against distinct peers; cancelled starts keep slots.
  for(let i=5;i<=6;i++){
   const rival='00000000-0000-0000-0000-00000000000'+i;
   await db.query("insert into hechi.alumnos(id,clase_id,nombre,casa_id) values($1,$2,'Rival','slytherin')",[rival,classId]);
   d=await invite(first,rival);d=await accept(d.id,rival);assert.equal(d.recompensa,true);
   d=await action(d,first,'rendirse');
  }
  assert.equal((await view(first)).cupos,0);
  assert.equal(await query("select has_table_privilege('anon','hechi.duelos_arena','SELECT') as data"),false);
  assert.equal(await query("select has_function_privilege('anon','hechi.arena_vista(uuid,uuid)','EXECUTE') as data"),false);
  assert.equal(await query("select has_function_privilege('anon','hechi.obtener_arena(text,uuid,text)','EXECUTE') as data"),true);
  const rival='00000000-0000-0000-0000-000000000007';
  await db.query("insert into hechi.alumnos(id,clase_id,nombre,casa_id) values($1,$2,'Rival','slytherin')",[rival,classId]);
  d=await invite(first,rival);assert.equal(d.recompensa,false);
  d=await accept(d.id,rival);
  await identity(teacher);
  await db.query("select hechi.configurar_arena('TEST',false)");
  assert.equal((await view(first)).activo.estado,'activo');
  await db.query("select hechi.reiniciar_clase('TEST')");
  assert.equal((await view(first)).activo,null);
 } finally {await db.close();}
});