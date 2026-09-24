import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite, migration, manual, teacher, classId, first, ale, schema } from './score_fixture.mjs';
test('persistent scores, house effects, atomic editor, permissions, conflicts and reset',async () => {
  const db=new PGlite();
  try {
    await db.exec(schema);
    await db.exec(migration);
    await db.exec(manual);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
    const state=async () => (await db.query('select hechi.estado_clase($1) as data',[classId])).rows[0].data;
    const snapshot=(s) => ({
      alumnos:s.alumnos.filter(a=>a.casaId==='slytherin').map(a=>({id:a.id,positivos:a.puntosPositivos,negativos:a.puntosNegativos})).sort((a,b)=>a.id.localeCompare(b.id)),
      generalNegativo:s.puntajesGeneralesNegativos.slytherin,generalPositivo:s.puntajesGeneralesPositivos.slytherin
    });
    let s=await state();
    let a=s.alumnos.find(a=>a.id===first);
    assert.deepEqual([a.puntosPositivos,a.puntosNegativos,a.puntos],[10,2,8]);
    a=s.alumnos.find(a=>a.id===ale);
    assert.deepEqual([a.puntosPositivos,a.puntosNegativos,a.puntos],[17,0,17]);
    // Migration can be safely reapplied without reconstructing existing counters.
    await db.exec(migration);
    await db.query('select hechi.ajustar_puntos_alumno($1,$2,$3)',['TEST',ale,-2]);
    s=await state(); a=s.alumnos.find(a=>a.id===ale);
    assert.deepEqual([a.puntosPositivos,a.puntosNegativos,a.puntos],[17,2,15]);
    await db.exec(`update hechi.clases set puntajes_negativos='{"slytherin":7}' where id='${classId}'`);
    s=await state();
    assert.equal(s.puntajesGeneralesNegativos.slytherin,3);
    const base=snapshot(s);
    const rows=base.alumnos.map(a=>a.id===first?{...a,positivos:12,negativos:3}:a);
    const save=(r,original=base,neg=3) => db.query(
      'select hechi.actualizar_tabla_puntajes($1,$2,$3::jsonb,$4::jsonb,$5,$6) as data',
      ['TEST','slytherin',JSON.stringify(r),JSON.stringify(original),neg,0]);
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(save(rows),/Debes iniciar/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[first]);
    await assert.rejects(save(rows),/No autorizado/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
    await assert.rejects(save([rows[0],rows[0]]),/una vez/);
    await assert.rejects(save([rows[0],{...rows[1],negativos:-2}]),/enteros no negativos/);
    assert.deepEqual(snapshot(await state()),base,'failed save must roll back the first row');
    await assert.rejects(save([{...rows[0],id:teacher},rows[1]]),/Alumno ajeno/);
    s=(await save(rows)).rows[0].data;
    a=s.alumnos.find(a=>a.id===first);
    assert.deepEqual([a.puntosPositivos,a.puntosNegativos,a.puntos],[12,3,9]);
    assert.equal(s.puntajesPositivos.slytherin,29);
    assert.equal(s.puntajesNegativos.slytherin,8);
    assert.equal(s.puntajes.slytherin,21);
    assert.equal(s.puntajesGeneralesNegativos.slytherin,3);
    await assert.rejects(save(rows),/puntajes cambiaron/);
    // A house-only edit cannot be assigned to an individual student.
    const current=snapshot(s);
    s=(await save(current.alumnos,current,4)).rows[0].data;
    assert.equal(s.puntajesGeneralesNegativos.slytherin,4);
    assert.equal(s.alumnos.find(a=>a.id===first).puntosNegativos,3);
    assert.equal(s.puntajes.slytherin,20);
    // Subsequent ordinary adjustments keep the edited counters.
    await db.query('select hechi.ajustar_puntos_alumno($1,$2,$3)',['TEST',first,-2]);
    s=await state(); a=s.alumnos.find(a=>a.id===first);
    assert.deepEqual([a.puntosPositivos,a.puntosNegativos,a.puntos],[12,5,7]);
    await db.query('select hechi.reiniciar_clase($1)',['TEST']);
    s=await state();
    assert.ok(s.alumnos.every(a=>a.puntos===0 && a.puntosPositivos===0 && a.puntosNegativos===0));
    assert.equal(s.puntajes.slytherin,0);
    assert.equal(s.puntajesGeneralesNegativos.slytherin,0);
    await db.query('select hechi.ajustar_puntos_alumno($1,$2,$3)',['TEST',first,10]);
    await db.query('select hechi.ajustar_puntos_alumno($1,$2,$3)',['TEST',first,-2]);
    s=await state(); a=s.alumnos.find(a=>a.id===first);
    assert.deepEqual([a.puntosPositivos,a.puntosNegativos,a.puntos],[10,2,8]);
    assert.equal(s.puntajesGeneralesNegativos.slytherin,0);
  } finally { await db.close(); }
});