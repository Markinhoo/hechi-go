import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const teacher = '00000000-0000-0000-0000-000000000001';
const first = '00000000-0000-0000-0000-000000000003';
const second = '00000000-0000-0000-0000-000000000004';

test('Word import, server timing, speed ranking and student photos', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema hechi; create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table hechi.clases(id uuid primary key,token text,estado text,created_by uuid);
      create table hechi.alumnos(id uuid primary key,clase_id uuid references hechi.clases(id),nombre text,password text,casa_id text,
        oportunidades integer default 0,updated_at timestamptz default now());
      create table hechi.kahoots(id uuid primary key default gen_random_uuid(),clase_id uuid references hechi.clases(id),
        estado text default 'borrador',pregunta_actual integer default 0,iniciada_at timestamptz,
        finalizada_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),
        creator_user_id uuid,creator_alumno_id uuid,creador_nombre text);
      create table hechi.kahoot_preguntas(id uuid primary key default gen_random_uuid(),kahoot_id uuid references hechi.kahoots(id),
        pregunta text,opcion_a text,opcion_b text,opcion_c text,opcion_d text,correcta text,orden integer,created_at timestamptz default now());
      create table hechi.kahoot_respuestas(id uuid primary key default gen_random_uuid(),kahoot_id uuid references hechi.kahoots(id),
        pregunta_id uuid references hechi.kahoot_preguntas(id),alumno_id uuid references hechi.alumnos(id),
        opcion text,correcta boolean,tiempo_ms integer);
      create function hechi.estado_clase_vista(p_clase_id uuid,p_alumno_id uuid default null) returns jsonb
        language sql as $$ select jsonb_build_object('claseId',p_clase_id) $$;
      insert into hechi.clases values('00000000-0000-0000-0000-000000000002','TEST','activa','${teacher}');
      insert into hechi.alumnos(id,clase_id,nombre,password) values
        ('${first}','00000000-0000-0000-0000-000000000002','Alumno','pass'),
        ('${second}','00000000-0000-0000-0000-000000000002','Compañero','pass');
    `);
    await db.exec(await readFile(new URL('../migrations/20261117_kahoot_word_timing_podium.sql', import.meta.url), 'utf8'));
    await db.exec(`create or replace function hechi.estado_clase_vista(p_clase_id uuid,p_alumno_id uuid default null) returns jsonb
      language sql as $$ select jsonb_build_object('kahoot',hechi.kahoot_estado(p_clase_id,p_alumno_id)) $$;`);
    const q = async (sql, args = []) => (await db.query(sql, args)).rows;
    const question = (name) => ({ texto: name, opciones: ['Uno', 'Dos', 'Tres', 'Cuatro'], correcta: 0 });
    await assert.rejects(q("select hechi.kahoot_importar_word('TEST',$1::jsonb)", [JSON.stringify([question('Pregunta uno')])]), /Credenciales/);
    await q("select set_config('request.jwt.claim.sub',$1,false)", [teacher]);
    await q("select hechi.kahoot_importar_word('TEST',$1::jsonb)", [JSON.stringify([question('Pregunta uno'), question('Pregunta dos')])]);
    assert.equal((await q('select count(*)::integer n from hechi.kahoot_preguntas'))[0].n, 2);
    await q("update hechi.kahoots set estado='activa',iniciada_at=now()");
    await q("select set_config('request.jwt.claim.sub','',false)");
    const studentView = (await q("select hechi.kahoot_estado('00000000-0000-0000-0000-000000000002',$1) data", [first]))[0].data;
    assert.equal(studentView.preguntas[0].correcta, null);
    await q("select hechi.kahoot_avanzar_si_listo('TEST',$1,'pass')", [first]);
    assert.equal((await q('select pregunta_actual from hechi.kahoots'))[0].pregunta_actual, 0);
    const ids = (await q('select id from hechi.kahoot_preguntas order by orden')).map((row) => row.id);
    const kahootId = (await q('select id from hechi.kahoots'))[0].id;
    for (const [student, ms] of [[first, 3000], [second, 1200]]) {
      await q('insert into hechi.kahoot_respuestas(kahoot_id,pregunta_id,alumno_id,opcion,correcta,tiempo_ms) values($1,$2,$3,\'a\',true,$4)', [kahootId, ids[0], student, ms]);
    }
    await q("select hechi.kahoot_avanzar_si_listo('TEST',$1,'pass')", [first]);
    assert.equal((await q('select pregunta_actual from hechi.kahoots'))[0].pregunta_actual, 1);
    await q("select hechi.kahoot_avanzar_si_listo('TEST',$1,'pass')", [first]);
    assert.equal((await q('select estado from hechi.kahoots'))[0].estado, 'activa');
    await q("update hechi.kahoots set iniciada_at=now()-interval '21 seconds'");
    await q("select hechi.kahoot_avanzar_si_listo('TEST',$1,'pass')", [first]);
    assert.equal((await q('select estado from hechi.kahoots'))[0].estado, 'finalizada');
    const awards = await q('select id,oportunidades from hechi.alumnos order by id');
    assert.equal(awards.find((row) => row.id === second).oportunidades, 3);
    assert.equal(awards.find((row) => row.id === first).oportunidades, 2);
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(32);
    await q("select hechi.perfil_guardar_foto('TEST',$1,'pass',$2)", [first, photo]);
    const photos = (await q("select hechi.kahoot_listar_fotos('TEST',$1,'pass') fotos", [first]))[0].fotos;
    assert.equal(photos[first], photo);
    assert.equal((await q("select hechi.perfil_obtener_foto('TEST',$1,'pass') foto", [first]))[0].foto, photo);
    await assert.rejects(q("select hechi.perfil_guardar_foto('TEST',$1,'wrong',$2)", [first, photo]), /Credenciales/);
    await q("select hechi.perfil_cambiar_nombre('TEST',$1,'pass','Nuevo Nombre')", [first]);
    assert.equal((await q('select nombre from hechi.alumnos where id=$1', [first]))[0].nombre, 'Nuevo Nombre');
    await assert.rejects(q("select hechi.perfil_cambiar_nombre('TEST',$1,'pass','Compañero')", [first]), /Ya existe/);
    await q("select hechi.kahoot_importar_word('TEST',$1::jsonb,$2,'pass')", [JSON.stringify([question('Pregunta del alumno')]), first]);
    assert.equal((await q('select creator_alumno_id from hechi.kahoots where estado=\'borrador\''))[0].creator_alumno_id, first);
  } finally { await db.close(); }
});
