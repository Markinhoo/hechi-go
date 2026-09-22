import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tieneCartaGuardada } from './backpackCards.js';
import { sortearCarta } from './cardRandom.js';

test('excluye todas las guardables que conserva el alumno, no las de otros', (t) => {
  const guardables = [8,13,18,19,22];
  const alumno = { cartasGuardadas: guardables.map((numero) => ({ numero })) };
  for (const numero of guardables) assert.equal(tieneCartaGuardada(alumno, numero), true);
  const disponibles = [1,...guardables].filter((n) => !tieneCartaGuardada(alumno,n));
  t.mock.method(crypto, 'getRandomValues', (buffer) => { buffer[0] = 0; return buffer; });
  assert.equal(sortearCarta([1,...guardables],disponibles),1);
  assert.equal(tieneCartaGuardada({cartasGuardadas:[]},18),false);
});

test('vuelve a estar disponible al usarla, aunque figure en cartas historicas', () => {
  assert.equal(tieneCartaGuardada({ cartas:[18], cartasGuardadas:[] },18),false);
  assert.equal(tieneCartaGuardada({ cartasGuardadas:[{numero:'18'}] },18),true);
});

test('sigue bloqueada mientras quede una copia antigua', () => {
  const alumno={cartasGuardadas:[{numero:8},{numero:8}]};
  alumno.cartasGuardadas.pop();
  assert.equal(tieneCartaGuardada(alumno,8),true);
  alumno.cartasGuardadas.pop();
  assert.equal(tieneCartaGuardada(alumno,8),false);
  assert.equal(tieneCartaGuardada(null,8),false);
});

// Only the known duplicate rejection can trigger a new draw.
test('solo reintenta duplicados de mochila, no errores de red o permisos', async () => {
  const { esDuplicadoDeMochila } = await import('./backpackCards.js');
  assert.equal(esDuplicadoDeMochila({message:'Ya tienes esa carta en la mochila. Usala antes de obtener otra.'},'guardable'),true);
  assert.equal(esDuplicadoDeMochila({message:'Sin autorizacion'},'guardable'),false);
  assert.equal(esDuplicadoDeMochila({message:'Network error'},'guardable'),false);
  assert.equal(esDuplicadoDeMochila({message:'Ya tienes esa carta en la mochila.'},'rival'),false);
});
