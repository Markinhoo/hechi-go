import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearTiraRuleta, posicionRuleta } from './cardRoulette.js';
import { brilloCarta } from '../data/cardVisuals.js';
import { CARTAS_ACTIVAS } from '../data/gameData.js';

test('cada resultado real termina en el indice de la flecha', () => {
  for (const numero of CARTAS_ACTIVAS) {
    const tira = crearTiraRuleta(CARTAS_ACTIVAS, numero);
    assert.equal(tira.cartas[tira.indiceGanador], numero);
    assert.equal(posicionRuleta(1, tira.indiceInicial, tira.indiceGanador), tira.indiceGanador);
    assert.equal(tira.cartas.length, 38);
  }
});
test('la tira solo contiene cartas disponibles; admite una sola opcion', () => {
  const tira = crearTiraRuleta([1,7,15],7);
  assert.ok(tira.cartas.every((n) => [1,7,15].includes(n)));
  assert.ok(crearTiraRuleta([18],18).cartas.every((n) => n===18));
  assert.throws(() => crearTiraRuleta([],8));
  assert.throws(() => crearTiraRuleta([1,7],8));
});
test('frena progresivamente sin sobrepasar el resultado', () => {
  let anterior = 2;
  let pasoAnterior = Infinity;
  for (let i=1;i<=100;i++) {
    const actual = posicionRuleta(i/100,2,32);
    const paso = actual-anterior;
    assert.ok(paso >= 0 && paso <= pasoAnterior+1e-9);
    assert.ok(actual <= 32);
    anterior=actual;pasoAnterior=paso;
  }
});
test('las categorias visuales tienen los cuatro colores esperados', () => {
  assert.equal(brilloCarta(1).nivel,'comun');
  assert.equal(brilloCarta(16).nivel,'especial');
  assert.equal(brilloCarta(6).nivel,'epica');
  assert.equal(brilloCarta(8).nivel,'legendaria');
  assert.ok(CARTAS_ACTIVAS.every((n) => brilloCarta(n).color));
});


test('no hay cartas iguales juntas, tampoco junto a la ganadora', () => {
  for (const opciones of [[1, 7], [1, 7, 15], CARTAS_ACTIVAS]) {
    for (const ganadora of opciones) {
      for (let intento = 0; intento < 40; intento += 1) {
        const tira = crearTiraRuleta(opciones, ganadora);
        assert.equal(tira.cartas[tira.indiceGanador], ganadora);
        for (let i = 1; i < tira.cartas.length; i += 1) {
          assert.notEqual(tira.cartas[i], tira.cartas[i - 1]);
        }
      }
    }
  }
});

test('una sola carta disponible se muestra una sola vez', () => {
  const tira = crearTiraRuleta([18, 18], 18);
  assert.deepEqual(tira.cartas, [18]);
  assert.equal(tira.indiceInicial, 0);
  assert.equal(tira.indiceGanador, 0);
});
