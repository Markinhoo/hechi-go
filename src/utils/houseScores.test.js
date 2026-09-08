import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularPuntajeCasa, penalizacionCasa } from './houseScores.js';

for (const negativos of [5, -5, '5', '-5']) {
  test(`19 positivos y ${negativos} de penalizacion dan 14`, () => {
    const estado = {
      puntajesPositivos: { gryffindor: 19 },
      puntajesNegativos: { gryffindor: negativos },
      puntajes: { gryffindor: 24 }
    };
    assert.equal(calcularPuntajeCasa(estado, 'gryffindor'), 14);
    assert.equal(penalizacionCasa(estado, 'gryffindor'), 5);
  });
}

test('conserva los totales negativos y el cero', () => {
  assert.equal(calcularPuntajeCasa({ puntajesPositivos: { casa: 3 }, puntajesNegativos: { casa: -5 } }, 'casa'), -2);
  assert.equal(calcularPuntajeCasa({ puntajesPositivos: { casa: 5 }, puntajesNegativos: { casa: 5 } }, 'casa'), 0);
});

test('admite casas sin desglose y casas sin puntos', () => {
  assert.equal(calcularPuntajeCasa({ puntajes: { casa: 14 } }, 'casa'), 14);
  assert.equal(calcularPuntajeCasa({}, 'casa'), 0);
  assert.equal(calcularPuntajeCasa({ puntajesPositivos: { casa: 19 } }, 'casa'), 19);
  assert.equal(calcularPuntajeCasa({ puntajesNegativos: { casa: -5 } }, 'casa'), -5);
});
