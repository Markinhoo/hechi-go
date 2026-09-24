import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomEntero, sortearCarta } from './cardRandom.js';
import { CARTAS_ACTIVAS, CARTAS_PROBABILIDAD, TOTAL_PESO_CARTAS } from '../data/gameData.js';
import { brilloCarta } from '../data/cardVisuals.js';

test('todos los boletos dan exactamente 45/30/15/10 sin historial', (t) => {
  let valor = 0;
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0] = valor++; return buffer; });
  const conteos = new Map();
  for (let i=0; i<TOTAL_PESO_CARTAS; i+=1) {
    const carta=sortearCarta(CARTAS_ACTIVAS);
    conteos.set(carta,(conteos.get(carta) ?? 0)+1);
  }
  const categorias={comun:0,especial:0,epica:0,legendaria:0};
  for(const carta of CARTAS_PROBABILIDAD) {
    assert.equal(conteos.get(carta.numero),carta.peso);
    categorias[brilloCarta(carta.numero).nivel]+=conteos.get(carta.numero);
  }
  assert.equal(TOTAL_PESO_CARTAS,400);
  assert.deepEqual(categorias,{comun:180,especial:120,epica:60,legendaria:40});
  assert.equal(brilloCarta(3).nivel,'epica');
  assert.equal(brilloCarta(4).nivel,'epica');
  assert.equal(new Set(CARTAS_PROBABILIDAD.map(c=>c.numero)).size,CARTAS_ACTIVAS.length);
});

test('evita la última carta y reduce a la mitad las otras dos recientes', (t) => {
  let valor=0;
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=valor++; return buffer; });
  // 1 and 7 become 18 each, 15 is excluded, 11 retains 36.
  const conteos={1:0,7:0,11:0,15:0};
  for(let i=0;i<72;i+=1) conteos[sortearCarta([1,7,11,15],[1,7,11,15],[1,7,15])]+=1;
  assert.deepEqual(conteos,{1:18,7:18,11:36,15:0});
});

test('historial antiguo no penaliza; la penalización no se multiplica por repeticiones', (t) => {
  let valor=0;
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=valor++; return buffer; });
  const conteos={1:0,7:0};
  for(let i=0;i<54;i+=1) conteos[sortearCarta([1,7],[1,7],[7,1,1,15])]+=1;
  assert.deepEqual(conteos,{1:18,7:36});
});

test('las aperturas de otro alumno no heredan la exclusión', (t) => {
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=0; return buffer; });
  assert.equal(sortearCarta([1,7],[1,7],[1]),7);
  assert.equal(sortearCarta([1,7],[1,7],[]),1);
});

test('respeta elegibilidad y permite repetir si solo queda una carta', (t) => {
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=0; return buffer; });
  assert.equal(sortearCarta([1,15,16],[16,99],[16]),16);
  assert.equal(sortearCarta([1,15,16],[15,16],[1]),15);
  assert.throws(()=>sortearCarta([1],[]));
});

test('descarta valores que sesgarían el módulo', (t) => {
  const valores=[0xffffffff,5];
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0]=valores.shift(); return buffer; });
  assert.equal(randomEntero(3),2);
  assert.throws(()=>randomEntero(0),RangeError);
});