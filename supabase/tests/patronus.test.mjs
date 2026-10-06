import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,first,ale,classId} from './score_fixture.mjs';
test('Patronus activates house protection and x2; protected pupils must resist Confundo',async()=>{
 const db=new PGlite();
 try{
  await db.exec(schema);await db.exec(migration);
  const sql=file=>readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
  const old=await sql('20260717_house_score_breakdown_elixir.sql');
  // Install actual spell bodies while retaining the current class-state serializer.
  for(const name of ['abrir_carta','intercambiar_puntos_alumnos']){
   const start=old.indexOf('create or replace function hechi.'+name+'(');
   await db.exec(old.slice(start,old.indexOf('$$;',start)+3));
  }
  await db.exec(await sql('20260718_sectumsempra_other_houses.sql'));
  await db.exec(await sql('20260924_z_score_audit_and_undo.sql'));
  await db.query("update hechi.alumnos set oportunidades=10,casa_id=case when id=$1 then 'slytherin' else 'gryffindor' end,puntos=case when id=$1 then 20 else 5 end",[first]);
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  const draw=(id,n,points=0,target=null)=>q("select hechi.abrir_carta('TEST',$1,'12345',$2,$3,'Carta','Efecto',$4) as data",[id,n,points,target]);
  const swap=()=>q("select hechi.intercambiar_puntos_alumnos('TEST',$1,'12345',4,'Confundo','Intercambio',$2) as data",[ale,first]);
  let state=await draw(first,2);
  assert.equal(state.casaProtegida,'slytherin');assert.equal(state.casaMultiplicador,'slytherin');
  for(const card of [3,9]) await assert.rejects(draw(ale,card,-5,'slytherin'),/protegida/);
  state=await draw(first,7,2);assert.equal(state.casaMultiplicador,null);assert.equal(state.casaProtegida,'slytherin');
  assert.equal(state.alumnos.find(a=>a.id===first).puntos,24);
  const protectedNegatives=state.puntajesNegativos.slytherin;
  state=await q("select hechi.restar_puntos_otras_casas('TEST',$1,'12345',12,2,'Sectumsempra','Ataque') as data",[ale]);
  assert.equal(state.puntajesNegativos.slytherin,protectedNegatives);
  // Reproduce the old bug in a rolled-back transaction, then verify the repair.
  await db.exec('begin');state=await swap();
  assert.equal(state.alumnos.find(a=>a.id===first).puntos,5,'old Confundo bypasses Patronus');
  await db.exec('rollback');
  await db.exec(await sql('20261006_c_patronus_confundo.sql'));
  await db.exec(await sql('20261006_c_patronus_confundo.sql'));
  const before=await q('select hechi.estado_clase($1) as data',[classId]);
  await assert.rejects(swap(),/protegida por Expecto Patronus/);
  state=await q('select hechi.estado_clase($1) as data',[classId]);
  assert.deepEqual(state,before,'rejected spell consumes no opportunity or points');
  // Existing single-house rule: a later Patronus transfers the protection.
  state=await draw(ale,2);assert.equal(state.casaProtegida,'gryffindor');
  state=await swap();assert.equal(state.alumnos.find(a=>a.id===first).puntos,5);
  const def=await q("select pg_get_functiondef('hechi.intercambiar_puntos_alumnos(text,uuid,text,integer,text,text,uuid)'::regprocedure) as data");
  assert.match(def,/iniciar_operacion_puntaje/,'repair retains score auditing');
 }finally{await db.close();}
});
