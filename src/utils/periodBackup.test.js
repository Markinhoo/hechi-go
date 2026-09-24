import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resumenRespaldo } from './periodBackup.js';
test('downloadable summary preserves totals and escapes untrusted names',()=>{
 const html=resumenRespaldo({id:'1',nombre:'Grupo <script>alert(1)</script>',created_at:'2026-09-24T12:00:00Z',
 datos:{alumnos:[{nombre:'<img src=x onerror=alert(1)>',casaId:'slytherin',puntosPositivos:10,puntosNegativos:2,puntos:8,cartas:[1,7]}],
 puntajes:{slytherin:5},puntajesPositivos:{slytherin:10},puntajesNegativos:{slytherin:5}}});
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
 assert.ok(html.includes('&lt;img'));assert.ok(html.includes('<td>10</td><td>2</td><td>8</td>'));
 assert.ok(html.includes('<td>10</td><td>5</td><td>5</td>'));
});