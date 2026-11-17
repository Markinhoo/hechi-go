import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('real roster name stays fixed when the student changes username',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema hechi;
      create table hechi.clases(id uuid primary key,token text,estado text);
      create table hechi.alumnos(id uuid primary key,clase_id uuid,nombre text,password text,updated_at timestamptz default now());
      create function hechi.estado_clase_vista(p_clase_id uuid,p_alumno_id uuid) returns jsonb
        language sql as $$ select jsonb_build_object('alumnoId',p_alumno_id) $$;
      insert into hechi.clases values('00000000-0000-0000-0000-000000000001','CLASE','activa');
      insert into hechi.alumnos(id,clase_id,nombre,password) values
        ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','apodo','pass'),
        ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','otro','pass');
    `);
    await db.exec(await readFile(new URL('../migrations/20261117_profile_real_names.sql',import.meta.url),'utf8'));
    const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
    assert.equal((await q("select nombre_real from hechi.alumnos where nombre='apodo'")).nombre_real,'apodo');
    await q("insert into hechi.alumnos(id,clase_id,nombre,password) values('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','nuevo','pass')");
    assert.equal((await q("select nombre_real from hechi.alumnos where nombre='nuevo'")).nombre_real,'nuevo');
    await q("update hechi.alumnos set nombre_real='NOMBRE REAL' where nombre='apodo'");
    await q("select hechi.perfil_cambiar_nombre('CLASE','00000000-0000-0000-0000-000000000002','pass','usuario_nuevo')");
    const identity=(await q("select hechi.perfil_obtener_identidad('CLASE','00000000-0000-0000-0000-000000000002','pass') data")).data;
    assert.deepEqual(identity,{nombreReal:'NOMBRE REAL',usuario:'usuario_nuevo'});
    await assert.rejects(q("select hechi.perfil_cambiar_nombre('CLASE','00000000-0000-0000-0000-000000000002','pass','otro')"),/ya está en uso/);
    await assert.rejects(q("select hechi.perfil_obtener_identidad('CLASE','00000000-0000-0000-0000-000000000002','wrong')"),/Credenciales/);
  } finally {await db.close();}
});
