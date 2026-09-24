import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularPuntajeCasa, penalizacionCasa, desgloseAlumno, desgloseCasa } from './houseScores.js';

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


test('Ale conserva 17 positivos, cero perdidos y total 17 aunque el historial incluya ataques', () => {
  assert.deepEqual(desgloseAlumno({ puntos: 17, puntosPositivos: 17, puntosNegativos: 11 }),
    { positivos: 17, negativos: 0, total: 17 });
});

test('las pérdidas recibidas se conservan y los ataques lanzados no se acumulan como pérdidas', () => {
  assert.deepEqual(desgloseAlumno({ puntos: 12, puntosPositivos: 17, puntosNegativos: 16 }),
    { positivos: 17, negativos: 5, total: 12 });
});

test('admite saldo negativo, saldo cero y ganancias sin historial completo', () => {
  assert.deepEqual(desgloseAlumno({ puntos: -3, puntosPositivos: 2 }),
    { positivos: 2, negativos: 5, total: -3 });
  assert.deepEqual(desgloseAlumno({ puntos: 0, puntosPositivos: 4 }),
    { positivos: 4, negativos: 4, total: 0 });
  assert.deepEqual(desgloseAlumno({ puntos: 20, puntosPositivos: 5 }),
    { positivos: 20, negativos: 0, total: 20 });
  assert.deepEqual(desgloseAlumno({ puntos: 0, puntosPositivos: 0, puntosNegativos: 1 }),
    { positivos: 0, negativos: 0, total: 0 });
});

test('el pie usa el marcador general aunque existan efectos exclusivos de casa', () => {
  const estado = {
    puntajesPositivos: { slytherin: 17 },
    puntajesNegativos: { slytherin: 0 },
    puntajes: { slytherin: 17 },
    alumnos: [{ puntos: 17, puntosPositivos: 17, puntosNegativos: 11 }]
  };
  assert.deepEqual(desgloseCasa(estado, 'slytherin'), { positivos: 17, negativos: 0, total: 17 });
  estado.puntajesNegativos.slytherin = 6;
  assert.deepEqual(desgloseCasa(estado, 'slytherin'), { positivos: 17, negativos: 6, total: 11 });
  assert.deepEqual(desgloseAlumno(estado.alumnos[0]), { positivos: 17, negativos: 0, total: 17 });
});

test('el pie admite el formato anterior sin desglose', () => {
  assert.deepEqual(desgloseCasa({ puntajes: { casa: 14 } }, 'casa'),
    { positivos: 14, negativos: 0, total: 14 });
});
