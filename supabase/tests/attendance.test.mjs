import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const teacher='00000000-0000-0000-0000-000000000001';
const classId='00000000-0000-0000-0000-000000000002';
const first='00000000-0000-0000-0000-000000000003';
const second='00000000-0000-0000-0000-000000000004';

test('teacher records attendance, student sees own absences, card justifies, reset starts new period',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema hechi; create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table hechi.clases(id uuid primary key,token text,estado text,created_by uuid);
      create table hechi.alumnos(id uuid primary key,clase_id uuid references hechi.clases(id),password text,
        cartas_guardadas jsonb default '[]'::jsonb,updated_at timestamptz default now());
      create table hechi.participaciones(clase_id uuid);
      insert into hechi.clases values('${classId}','TEST','activa','${teacher}');
      insert into hechi.alumnos(id,clase_id,password,cartas_guardadas) values
        ('${first}','${classId}','pass','[{"id":"card-18","numero":18}]'),
        ('${second}','${classId}','pass','[]');
      create function hechi.reiniciar_clase_sin_respaldo(p_token text) returns jsonb language plpgsql as $$
      declare v_clase hechi.clases%rowtype; begin
        select * into v_clase from hechi.clases where token=p_token;
        delete from hechi.participaciones where clase_id = v_clase.id;
        return '{}'::jsonb;
      end; $$;
    `);
    await db.exec(await readFile(new URL('../migrations/20261117_attendance.sql',import.meta.url),'utf8'));
    const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
    await assert.rejects(q("select hechi.asistencia_guardar_fechas('TEST',array['2026-11-09']::date[])"),/maestro/);
    await q("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
    await q("select hechi.asistencia_guardar_fechas('TEST',array['2026-11-09','2026-11-10']::date[])");
    await q("select hechi.asistencia_marcar('TEST',$1,'2026-11-09','falta',null)",[first]);
    await q("select hechi.asistencia_marcar('TEST',$1,'2026-11-09','presente',null)",[second]);
    await q("select set_config('request.jwt.claim.sub','',false)");
    const student=(await q("select hechi.asistencia_estado('TEST',$1,'pass') data",[first])).data;
    assert.equal(student.registros.length,1);
    assert.equal(student.registros[0].estado,'falta');
    await assert.rejects(q("select hechi.asistencia_marcar('TEST',$1,'2026-11-10','presente',null)",[first]),/maestro/);
    await q("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
    await q("select hechi.asistencia_justificar_carta('TEST',$1,'2026-11-09','card-18')",[first]);
    assert.equal((await q("select estado from hechi.asistencia_registros where alumno_id=$1",[first])).estado,'justificada');
    assert.deepEqual((await q('select cartas_guardadas from hechi.alumnos where id=$1',[first])).cartas_guardadas,[]);
    await q("select hechi.asistencia_importar('TEST',$1::jsonb)",[JSON.stringify([{alumnoId:first,fecha:'2026-11-10',estado:'presente'}])]);
    await q("select hechi.reiniciar_clase_sin_respaldo('TEST')");
    assert.equal((await q('select asistencia_periodo from hechi.clases')).asistencia_periodo,2);
    assert.equal((await q("select hechi.asistencia_estado('TEST') data")).data.registros.length,0);
    assert.equal((await q('select count(*)::integer n from hechi.asistencia_registros')).n,3);
  } finally {await db.close();}
});
