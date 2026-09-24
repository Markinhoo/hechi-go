import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite, migration, manual, teacher, classId, first, ale, schema } from './score_fixture.mjs';
const audit=await readFile(new URL('../migrations/20260924_z_score_audit_and_undo.sql',import.meta.url),'utf8');
const attack=await readFile(new URL('../migrations/20260718_sectumsempra_other_houses.sql',import.meta.url),'utf8');
test('audit, manual/table undo, later-change protection, permissions, house attack attribution',async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema); await db.exec(migration); await db.exec(manual); await db.exec(attack);
  await db.exec(audit); await db.exec(audit);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  const state=async()=> (await db.query('select hechi.estado_clase($1) as data',[classId])).rows[0].data;
  const adjust=async(n)=> (await db.query('select hechi.ajustar_puntos_alumno($1,$2,$3) as data',['TEST',first,n])).rows[0].data;
  const undo=(id)=>db.query('select hechi.deshacer_ultimo_ajuste($1,$2) as data',['TEST',id]);
  let s=await adjust(-2);
  let op=s.historialPuntajes[0];
  assert.equal(op.actor,'Maestro'); assert.equal(op.titulo,'Ajuste manual'); assert.equal(op.puedeDeshacer,true);
  const alumno=op.movimientos.find(m=>m.tipo==='alumno');
  assert.equal(alumno.nombre,'Alumno');
  assert.deepEqual([alumno.antes.total,alumno.despues.total],[8,6]);
  assert.deepEqual([alumno.antes.positivos,alumno.despues.positivos],[10,10]);
  assert.deepEqual([alumno.antes.negativos,alumno.despues.negativos],[2,4]);
  assert.ok(op.movimientos.some(m=>m.tipo==='casa'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ale]);
  await assert.rejects(undo(op.id),/Solo el maestro/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  s=(await undo(op.id)).rows[0].data;
  let a=s.alumnos.find(a=>a.id===first);
  assert.deepEqual([a.puntosPositivos,a.puntosNegativos,a.puntos],[10,2,8]);
  assert.equal(s.historialPuntajes[0].titulo,'Deshacer: Ajuste manual');
  assert.ok(s.historialPuntajes.find(o=>o.id===op.id).deshecha);
  await assert.rejects(undo(op.id),/no se puede deshacer/);
  const old=(await adjust(2)).historialPuntajes[0].id;
  s=await adjust(1);
  await assert.rejects(undo(old),/posteriores/);
  // A save that changes both counters but not the total is still reversible.
  const original={
    alumnos:s.alumnos.filter(a=>a.casaId==='slytherin').map(a=>({id:a.id,positivos:a.puntosPositivos,negativos:a.puntosNegativos})).sort((a,b)=>a.id.localeCompare(b.id)),
    generalNegativo:s.puntajesGeneralesNegativos.slytherin,generalPositivo:s.puntajesGeneralesPositivos.slytherin
  };
  const rows=original.alumnos.map(a=>({...a,positivos:a.positivos+2,negativos:a.negativos+2}));
  s=(await db.query('select hechi.actualizar_tabla_puntajes($1,$2,$3::jsonb,$4::jsonb,$5,$6) as data',
    ['TEST','slytherin',JSON.stringify(rows),JSON.stringify(original),original.generalNegativo+3,original.generalPositivo])).rows[0].data;
  op=s.historialPuntajes[0]; assert.equal(op.titulo,'Edición de tabla'); assert.equal(op.puedeDeshacer,true);
  s=(await undo(op.id)).rows[0].data;
  for(const fila of original.alumnos) {
    a=s.alumnos.find(a=>a.id===fila.id);
    assert.equal(a.puntosPositivos,fila.positivos);assert.equal(a.puntosNegativos,fila.negativos);
  }
  assert.equal(s.puntajesGeneralesNegativos.slytherin,original.generalNegativo);
  // House attacks report the caster and every affected house, never a loss for the caster.
  await db.query('update hechi.alumnos set oportunidades=1 where id=$1',[ale]);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  s=(await db.query('select hechi.restar_puntos_otras_casas($1,$2,$3,$4,$5,$6,$7) as data',
    ['TEST',ale,'12345',12,2,'Sectumsempra','Ataque'])).rows[0].data;
  op=s.historialPuntajes[0];assert.equal(op.actor,'Ale');assert.equal(op.titulo,'Sectumsempra');
  assert.equal(op.movimientos.length,3);assert.ok(op.movimientos.every(m=>m.tipo==='casa'));
  assert.ok(op.movimientos.every(m=>m.despues.total===m.antes.total-2));
  assert.ok(s.historialPuntajes.every(o=>!o.puedeDeshacer));
  // Reset is logged and blocks prior undo; deleting a class must still cascade.
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  await db.query('select hechi.reiniciar_clase($1)',['TEST']);
  await assert.rejects(undo(old),/posteriores/);
  await db.query('delete from hechi.alumnos where clase_id=$1',[classId]);
  await db.query('delete from hechi.clases where id=$1',[classId]);
 } finally { await db.close(); }
});