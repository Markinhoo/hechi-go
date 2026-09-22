import { randomEntero } from './cardRandom.js';

// The spin only presents an already selected result; it never draws another card.
export function crearTiraRuleta(disponibles, ganadora) {
  const opciones = [...new Set(disponibles)];
  if (!opciones.includes(ganadora)) throw new Error('La carta ganadora debe estar disponible');
  const cartas = [];
  while (cartas.length < 38) {
    const vuelta = [...opciones];
    for (let i = vuelta.length - 1; i > 0; i -= 1) {
      const j = randomEntero(i + 1);
      [vuelta[i], vuelta[j]] = [vuelta[j], vuelta[i]];
    }
    cartas.push(...vuelta);
  }
  const indiceGanador = 32;
  cartas.length = 38;
  cartas[indiceGanador] = ganadora;
  return { cartas, indiceGanador, indiceInicial: 2 };
}

export function posicionRuleta(progreso, inicio, final) {
  const t = Math.max(0, Math.min(1, progreso));
  return inicio + (final - inicio) * (1 - (1 - t) ** 4);
}
