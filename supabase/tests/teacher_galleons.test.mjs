import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,teacher,first,ale} from './score_fixture.mjs';
test('only class owner can set currency, including zero, without overwriting concurrent rewards or classroom scores',async()=>{
 const db=new PGlite();
 try{
  await db.exec(schema);await db.exec(migration);
  await db.exec(await readFile(new URL('../migrations/20261006_b_teacher_galleons.sql',import.meta.url),'utf8'));
  const identity=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const save=(amount,previous=0,id=first)=>db.query("select hechi.editar_galeones_alumno('TEST',$1,$2,$3)",[id,amount,previous]);
  const saldo=async()=>(await db.query('select galeones from hechi.alumnos where id=$1',[first])).rows[0].galeones;
  const unchanged=async()=>(await db.query('select id,puntos,oportunidades,cartas,bestiario from hechi.alumnos order by id')).rows;
  const before=await unchanged();
  await assert.rejects(save(500),/maestro/);
  await identity(ale);await assert.rejects(save(500),/No autorizado/);
  await identity(teacher);
  await assert.rejects(save(-1),/entero/);await assert.rejects(save(null),/entero/);
  await assert.rejects(save(1.5),/integer/);
  await assert.rejects(save(500,0,teacher),/Alumno no encontrado/);
  await save(500);assert.equal(await saldo(),500);
  await save(80,500);assert.equal(await saldo(),80);
  await db.query('update hechi.alumnos set galeones=galeones+30 where id=$1',[first]);
  await assert.rejects(save(200,80),/saldo cambió/);assert.equal(await saldo(),110);
  await save(0,110);assert.equal(await saldo(),0);
  assert.deepEqual(await unchanged(),before);
  assert.equal((await db.query("select has_function_privilege('anon','hechi.editar_galeones_alumno(text,uuid,integer,integer)','execute') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
