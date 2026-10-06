import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,first,ale,classId,teacher} from './score_fixture.mjs';
import {bestiario} from '../../src/data/bestiaryData.js';
for(const backups of [false,true]) test(`single-use bestiary benefits and teacher-approved exemption (period backups: ${backups})`,async()=>{
 const db=new PGlite();
 try{
  const sql=f=>readFile(new URL('../migrations/'+f,import.meta.url),'utf8');
  await db.exec(schema);await db.exec(migration);
  const spells=await sql('20260717_house_score_breakdown_elixir.sql');
  for(const name of ['abrir_carta','sumar_puntos_companero']){
   const start=spells.indexOf('create or replace function hechi.'+name+'(');
   await db.exec(spells.slice(start,spells.indexOf('$$;',start)+3));
  }
  await db.exec(await sql('20260922_fix_amortentia_breakdown.sql'));
  await db.exec(await sql('20260924_z_score_audit_and_undo.sql'));
  if(backups) await db.exec(await sql('20260924_zz_period_backups.sql'));
  await db.query("update hechi.alumnos set oportunidades=12,bestiario=$2::jsonb,elecciones_legendarias=2 where id=$1",[first,JSON.stringify(bestiario.map(b=>b.id))]);
  const upgrade=await sql('20261006_d_bestiary_single_use.sql');await db.exec(upgrade);await db.exec(upgrade);
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  const state=()=>q('select hechi.estado_clase($1) as data',[classId]);
  const me=async()=>(await state()).alumnos.find(a=>a.id===first);
  const choose=id=>q("select hechi.elegir_beneficio_bestia('TEST',$1,'12345',$2) as data",[first,id]);
  const draw=(n=7,points=2)=>q("select hechi.abrir_carta('TEST',$1,'12345',$2,$3,'Prueba','Efecto',null) as data",[first,n,points]);
  assert.equal((await me()).bestiasUsadas.length,2,'spent legacy legendary choices stay spent');
  assert.equal(await q("select hechi.arena_bonus_bestiario($1::jsonb) as data",[JSON.stringify(bestiario.map(b=>b.id))]),0);
  for(const [id,bonus] of [['bowtruckle',1],['centauro',2],['basilisco',3]]){
   const before=await me();await choose(id);
   const result=await draw();const after=result.alumnos.find(a=>a.id===first);
   assert.equal(after.puntos,before.puntos+2+bonus);assert.equal(after.oportunidades,before.oportunidades-1);
   assert.ok(after.bestiasUsadas.includes(id));assert.equal(after.beneficioBestia,null);
   await assert.rejects(choose(id),/no tiene un beneficio/);
  }
  await choose('doxy');const beforeFailed=await me();
  await assert.rejects(draw(3,-5),/casa rival/);
  assert.deepEqual(await me(),beforeFailed,'failed spell preserves selected benefit');
  await choose(null);const beforeNone=await me();await draw();assert.equal((await me()).puntos,beforeNone.puntos+2);
  await choose('doxy');await draw(2,0); // Patronus grants +1 but leaves x2 available.
  assert.equal((await state()).casaMultiplicador,'slytherin');
  await choose('elfo');const beforeX2=await me();await draw();assert.equal((await me()).puntos,beforeX2.puntos+5,'x2 applies only to spell, then +1');
  const legendary=bestiario.find(b=>b.rareza==='legendaria' && !beforeX2.bestiasUsadas.includes(b.id));
  await choose(legendary.id);const beforeLegend=await me();await draw();
  assert.equal((await me()).puntos,beforeLegend.puntos+2);assert.equal((await me()).eleccionesLegendarias,beforeLegend.eleccionesLegendarias-1);
  await assert.rejects(choose(legendary.id),/no tiene un beneficio/);
  await choose('lechuza');const beforeMulti=await me();
  await q("select hechi.sumar_puntos_companero('TEST',$1,'12345',16,'Amortentia','Efecto',$2) as data",[first,ale]);
  assert.equal((await me()).bestiasUsadas.filter(id=>id==='lechuza').length,1);
  assert.equal((await me()).oportunidades,beforeMulti.oportunidades-1);
  const request=()=>q("select hechi.solicitar_exencion_bestiario('TEST',$1,'12345') as data",[first]);
  const approve=()=>q("select hechi.autorizar_exencion_bestiario('TEST',$1) as data",[first]);
  await request();assert.equal((await me()).exencionBestiario,'pendiente');
  await assert.rejects(approve(),/maestro/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ale]);await assert.rejects(approve(),/No autorizado/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  await approve();await approve();assert.equal((await me()).exencionBestiario,'autorizada');
  const used=(await me()).bestiasUsadas;await db.exec(upgrade);assert.deepEqual((await me()).bestiasUsadas,used);
  const resetId='00000000-0000-0000-0000-000000000099';
  if(backups){
   const reset=await q("select hechi.reiniciar_clase_con_respaldo('TEST',$1) as data",[resetId]);
   const snapshot=reset.respaldo.datos.alumnos.find(a=>a.id===first);
   assert.equal(snapshot.exencionBestiario,'autorizada','backup preserves prior authorization');
   assert.deepEqual(snapshot.bestiasUsadas,used);
  }else await q("select hechi.reiniciar_clase('TEST') as data");
  assert.deepEqual((await me()).bestiasUsadas,used);assert.equal((await me()).exencionBestiario,'ninguna');
  if(backups){
   await request();await approve();
   await q("select hechi.reiniciar_clase_con_respaldo('TEST',$1) as data",[resetId]);
   assert.equal((await me()).exencionBestiario,'autorizada','retry must not clear new-period authorization');
   await q("select hechi.reiniciar_clase('TEST') as data");
   assert.equal((await me()).exencionBestiario,'ninguna','public wrapper reaches the patched reset');
   assert.deepEqual((await me()).bestiasUsadas,used);
  }
  await assert.rejects(q("select hechi.solicitar_exencion_bestiario('TEST',$1,'12345') as data",[ale]),/24 bestias/);
 }finally{await db.close();}
});
