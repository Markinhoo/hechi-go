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
