import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite, migration, manual, teacher, classId, first, ale, schema } from './score_fixture.mjs';
const audit=await readFile(new URL('../migrations/20260924_z_score_audit_and_undo.sql',import.meta.url),'utf8');
const backup=await readFile(new URL('../migrations/20260924_zz_period_backups.sql',import.meta.url),'utf8');
test('snapshot survives reset; retries are idempotent; full history and ownership are preserved',async()=>{
 const db=new PGlite();
 try {
  await db.exec(schema);await db.exec(migration);await db.exec(manual);await db.exec(audit);
  await db.exec(backup);await db.exec(backup);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  await db.exec("insert into hechi.participaciones(clase_id,alumno_id,carta,puntos,titulo) select '"+classId+"','"+first+"',1,0,'Prueba' from generate_series(1,130)");
  const id='00000000-0000-0000-0000-000000000099';
  const reset=()=>db.query('select hechi.reiniciar_clase_con_respaldo($1,$2) as data',['TEST',id]);
  let result=(await reset()).rows[0].data;
  assert.equal(result.respaldo.datos.historialCompleto.length,134);
  assert.equal(result.respaldo.datos.alumnos.find(a=>a.id===first).puntos,8);
  assert.ok(result.estado.alumnos.every(a=>a.puntos===0));
  assert.equal(result.respaldo.datos.token,undefined);
  assert.ok(result.respaldo.datos.alumnos.every(a=>!('password' in a)));
  await db.query('select hechi.ajustar_puntos_alumno($1,$2,$3)',['TEST',first,3]);
  result=(await reset()).rows[0].data;
  assert.equal(result.estado.alumnos.find(a=>a.id===first).puntos,3,'retry must not wipe new activity');
  assert.equal((await db.query('select count(*)::integer n from hechi.respaldos_parcial')).rows[0].n,1);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ale]);
  await assert.rejects(reset(),/No autorizado/);
  await assert.rejects(db.query('select hechi.obtener_respaldo_parcial($1)',[id]),/no autorizado/);
  assert.deepEqual((await db.query('select hechi.listar_respaldos_parcial($1) d',['TEST'])).rows[0].d,[]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
  // Failing a backup insert must leave all active scores untouched.
  await db.exec("create function hechi.fail_backup() returns trigger language plpgsql as $$ begin raise exception 'backup failure'; end $$; create trigger fail_backup before insert on hechi.respaldos_parcial for each row execute function hechi.fail_backup()");
  await assert.rejects(db.query('select hechi.reiniciar_clase($1)',['TEST']),/backup failure/);
  assert.equal((await db.query('select puntos from hechi.alumnos where id=$1',[first])).rows[0].puntos,3);
  await db.exec('drop trigger fail_backup on hechi.respaldos_parcial');
  await db.query('select hechi.reiniciar_clase($1)',['TEST']);
  assert.equal((await db.query('select count(*)::integer n from hechi.respaldos_parcial')).rows[0].n,2);
 } finally{await db.close();}
});