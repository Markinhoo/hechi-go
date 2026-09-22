import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomEntero, sortearCarta } from './cardRandom.js';

test('cada carta disponible puede salir con el mismo intervalo', (t) => {
  const activas = [1,2,3,4,5,6,7,8,9,10,11,12,13,15,16,17,18,19,22,26];
  let valor = 0;
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0] = valor++; return buffer; });
  assert.deepEqual(Array.from({ length: activas.length }, () => sortearCarta(activas)), activas);
});

test('no impone una secuencia ni evita repeticiones legitimas', (t) => {
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0] = 1; return buffer; });
  assert.equal(sortearCarta([1,15,16]), 15);
  assert.equal(sortearCarta([1,15,16]), 15);
});

test('respeta cartas elegibles y rechaza un conjunto vacio', (t) => {
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0] = 0; return buffer; });
  assert.equal(sortearCarta([1,15,16], [16,99]), 16);
  assert.throws(() => sortearCarta([1], []));
});

test('descarta valores que sesgarian el modulo', (t) => {
  const valores = [0xffffffff, 5];
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0] = valores.shift(); return buffer; });
  assert.equal(randomEntero(3), 2);
  assert.throws(() => randomEntero(0), RangeError);
});
