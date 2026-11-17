import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite,schema,migration,manual,teacher,first} from './score_fixture.mjs';
test('teacher publishes, student submits, leaving blocks with zero and teacher authorizes retry',async()=>{
 const db=new PGlite();try{
  await db.exec(schema);await db.exec(migration);await db.exec(manual);
  for(const name of ['20260924_zzz_duel_arena.sql','20261117_exams.sql']) await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.data;
  const student=(action='ver',id=null,answers=null)=>q("select hechi.examen_alumno('TEST',$1,'12345',$2,$3,$4::jsonb) as data",[first,action,id,JSON.stringify(answers)]);
  const manage=(title=null,questions=null,id=null,published=null,authorize=null)=>q("select hechi.examen_maestro('TEST',$1,$2::jsonb,$3,$4,$5) as data",[title,questions===null?null:JSON.stringify(questions),id,published,authorize]);
  const questions=[{texto:'¿Qué hace Git en un proyecto?',opciones:['Controla versiones','Compila','Pinta','Borra'],correcta:0},{texto:'¿Qué hace GitHub en un proyecto?',opciones:['Aloja repositorios','Compila','Pinta','Borra'],correcta:0}];
  await assert.rejects(manage('Prueba',questions),/maestro/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  let data=await manage('Desarrollo Web Integral',questions,null,true);const id=data[0].id;
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  data=await student();assert.equal(data[0].preguntas[0].correcta,undefined);
  await student('iniciar',id);await assert.rejects(student('iniciar',id),/requiere autorización/);
  await student('pulso',id,{'0':1,'1':0});await student('finalizar',id);
  data=await student();assert.equal(data[0].intento.aciertos,1);assert.equal(data[0].preguntas[0].correcta,0);
  await assert.rejects(student('iniciar',id),/requiere autorización/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);await manage(null,null,id,null,first);
  await db.query("select set_config('request.jwt.claim.sub','',false)");await student('iniciar',id);await student('incidente',id);
  data=await student();assert.equal(data[0].intento.estado,'bloqueado');assert.equal(data[0].intento.aciertos,0);assert.equal(data[0].preguntas[0].correcta,undefined);
  await assert.rejects(student('iniciar',id),/requiere autorización/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);await manage(null,null,id,null,first);
  await db.query("select set_config('request.jwt.claim.sub','',false)");await student('iniciar',id);
  await db.query("update hechi.intentos_examen set pulso_at=now()-interval '26 seconds' where examen_id=$1 and estado='en_curso'",[id]);
  data=await student();assert.equal(data[0].intento.estado,'bloqueado');assert.equal(data[0].intento.aciertos,0);
  assert.equal((await q('select count(*)::integer as data from hechi.intentos_examen where examen_id=$1',[id])),3);
  assert.equal((await q('select count(*)::integer as data from hechi.intentos_examen where examen_id=$1 and estado=\'finalizado\'',[id])),1);
 }finally{await db.close();}
});
