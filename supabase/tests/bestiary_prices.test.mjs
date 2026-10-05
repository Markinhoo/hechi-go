import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite, schema, migration, first } from './score_fixture.mjs';
import { bestiario, precioBestia } from '../../src/data/bestiaryData.js';

test('all 24 shop prices match server charges, affordability and legendary benefits',async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema);await db.exec(migration);
  const sql=await readFile(new URL('../migrations/20261005_b_bestiary_prices.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  const buy=(id,password='12345')=>db.query("select hechi.comprar_bestia('TEST',$1,$2,$3)",[first,password,id]);
  const student=async()=>(await db.query('select galeones,bestiario,elecciones_legendarias,puntos,oportunidades from hechi.alumnos where id=$1',[first])).rows[0];
  const prices={comun:100,rara:250,epica:500,legendaria:1000};
  const total=bestiario.reduce((sum,b)=>sum+precioBestia(b),0);
  assert.equal(total,10250);
  for(const beast of bestiario){
   const price=prices[beast.rareza];assert.equal(precioBestia(beast),price);
   await db.query("update hechi.alumnos set galeones=$2,bestiario='[]',elecciones_legendarias=0 where id=$1",[first,price-1]);
   const before=await student();
   await assert.rejects(buy(beast.id),/suficientes galeones/);
   assert.deepEqual(await student(),before,'failed purchase changes nothing');
   await db.query('update hechi.alumnos set galeones=$2 where id=$1',[first,price]);
   await buy(beast.id);
   const after=await student();
   assert.equal(after.galeones,0);assert.deepEqual(after.bestiario,[beast.id]);
   assert.equal(after.elecciones_legendarias,beast.rareza==='legendaria'?1:0);
   assert.equal(after.puntos,before.puntos);assert.equal(after.oportunidades,before.oportunidades);
   await assert.rejects(buy(beast.id),/Ya tienes/);
   assert.deepEqual(await student(),after,'duplicate purchase changes nothing');
  }
  const existing=await student();
  await db.exec(sql);
  assert.deepEqual(await student(),existing,'migration preserves previous purchases and balances');
  await assert.rejects(buy('dragon','wrong'),/Credenciales/);
  await assert.rejects(buy('unknown'),/Bestia no encontrada/);
 }finally{await db.close();}
});
