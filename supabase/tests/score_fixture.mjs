// Run with PGLITE_MODULE pointing to a local @electric-sql/pglite/dist/index.js.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

export { PGlite, migration, manual, teacher, classId, first, ale, schema };
