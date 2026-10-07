import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,first,classId} from './score_fixture.mjs';
test('Crecehuesos chooses points OR stored justification, preserves benefits and rejects old dual effect',async()=>{
 const db=new PGlite();try{
  const sql=f=>readFile(new URL('../migrations/'+f,import.meta.url),'utf8');
  await db.exec(schema);await db.exec(migration);
  const old=await sql('20260717_house_score_breakdown_elixir.sql');const start=old.indexOf('create or replace function hechi.abrir_carta(');await db.exec(old.slice(start,old.indexOf('$$;',start)+3));
  await db.exec(await sql('20260924_z_score_audit_and_undo.sql'));await db.exec(await sql('20261006_d_bestiary_single_use.sql'));await db.exec(await sql('20261007_crecehuesos_choice.sql'));await db.exec(await sql('20261007_crecehuesos_choice.sql'));
  await db.query("update hechi.alumnos set oportunidades=5,bestiario='[\"bowtruckle\",\"dragon\"]',elecciones_legendarias=1 where id=$1",[first]);
  const q=async(s,a=[])=>(await db.query(s,a)).rows[0]?.data;
  const me=async()=> (await q('select hechi.estado_clase($1) as data',[classId])).alumnos.find(a=>a.id===first);
  const choose=b=>q("select hechi.elegir_beneficio_bestia('TEST',$1,'12345',$2) as data",[first,b]);
  const use=(choice,password='12345')=>q("select hechi.resolver_crecehuesos('TEST',$1,$2,$3) as data",[first,password,choice]);
  await assert.rejects(use('other'),/Elige/);await assert.rejects(use('punto','wrong'),/Credenciales/);
  await assert.rejects(q("select hechi.abrir_carta('TEST',$1,'12345',18,1,'Crecehuesos','Efecto',null)",[first]),/Elige/);
  await choose('bowtruckle');const initial=await me();await use('justificar');let a=await me();
  assert.equal(a.puntos,initial.puntos);assert.equal(a.cartasGuardadas.length,1);assert.equal(a.bestiasUsadas.length,0);assert.equal(a.beneficioBestia,null);
  const saved=a;await assert.rejects(use('justificar'),/mochila/);assert.deepEqual(await me(),saved);
  await choose('bowtruckle');await use('punto');a=await me();assert.equal(a.puntos,initial.puntos+2);assert.equal(a.cartasGuardadas.length,1);assert.ok(a.bestiasUsadas.includes('bowtruckle'));
  await db.query("update hechi.alumnos set cartas_guardadas='[]' where id=$1",[first]);
  await choose('dragon');const beforeLegend=await me();await use('justificar');a=await me();assert.equal(a.puntos,beforeLegend.puntos);assert.ok(a.bestiasUsadas.includes('dragon'));assert.equal(a.eleccionesLegendarias,0);
  await db.query("update hechi.alumnos set oportunidades=0 where id=$1",[first]);await assert.rejects(use('punto'),/autorizada/);
 }finally{await db.close();}
});
