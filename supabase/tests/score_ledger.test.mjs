// Run with PGLITE_MODULE pointing to a local @electric-sql/pglite/dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20260924_student_score_ledger_and_editor.sql',import.meta.url),'utf8');
const manualFile = await readFile(new URL('../migrations/20260922_teacher_manual_unrestricted_points.sql',import.meta.url),'utf8');
const manual = manualFile.slice(manualFile.indexOf('create or replace function'),manualFile.lastIndexOf('commit;'));
const teacher='00000000-0000-0000-0000-000000000001';
const classId='00000000-0000-0000-0000-000000000002';
const first='00000000-0000-0000-0000-000000000003';
const ale='00000000-0000-0000-0000-000000000004';
const schema = `
create role anon; create role authenticated;
create schema hechi; create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table hechi.clases (
 id uuid primary key, token text, created_by uuid, estado text default 'activa', nombre text default 'Prueba',
 total integer default 30, objetivos jsonb default '{}', puntajes jsonb default '{}',
 puntajes_positivos jsonb default '{}', puntajes_negativos jsonb default '{}',
 casa_protegida text,casa_multiplicador text,sobre_activo integer default 0, updated_at timestamptz default now());
create table hechi.alumnos (
 id uuid primary key,clase_id uuid references hechi.clases(id),nombre text,casa_id text,password text default '12345',
 puntos integer default 0,cartas integer[] default '{}',cartas_guardadas jsonb default '[]',
 galeones integer default 0,bestiario jsonb default '[]',elecciones_legendarias integer default 0,
 flash_signal integer default 0,oportunidades integer default 0,created_at timestamptz default now(),updated_at timestamptz default now());
create table hechi.participaciones(id uuid primary key default gen_random_uuid(),clase_id uuid,alumno_id uuid,
 carta integer,puntos integer,casa_objetivo text,titulo text,descripcion text,created_at timestamptz default now());
create table hechi.solicitudes(id uuid,clase_id uuid,alumno_id uuid,estado text,created_at timestamptz default now());
insert into hechi.clases(id,token,created_by,puntajes_positivos,puntajes_negativos)
 values('${classId}','TEST','${teacher}','{"slytherin":27}','{"slytherin":2}');
insert into hechi.alumnos(id,clase_id,nombre,casa_id,puntos) values
 ('${first}','${classId}','Alumno','slytherin',8),('${ale}','${classId}','Ale','slytherin',17);
insert into hechi.participaciones(clase_id,alumno_id,carta,puntos,titulo) values
 ('${classId}','${first}',1,-2,'Ajuste manual'),('${classId}','${ale}',7,17,'Ganancia'),
 ('${classId}','${ale}',3,-5,'Avada Kedavra'),('${classId}','${ale}',12,-6,'Sectumsempra');
`;
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