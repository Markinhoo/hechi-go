import { randomEntero } from './cardRandom.js';

// The spin only presents an already selected result; it never draws another card.
export function crearTiraRuleta(disponibles, ganadora) {
  const opciones = [...new Set(disponibles)];
  if (!opciones.includes(ganadora)) throw new Error('La carta ganadora debe estar disponible');
  // With only one option, reveal it once instead of repeating it across the strip.
  if (opciones.length === 1) return { cartas: [ganadora], indiceGanador: 0, indiceInicial: 0 };
  const cartas = new Array(38);
  const indiceGanador = 32;
  cartas[indiceGanador] = ganadora;
  const distintaDe = (vecina) => {
    const candidatas = opciones.filter((numero) => numero !== vecina);
    return candidatas[randomEntero(candidatas.length)];
  };
  // Build outward from the winner so both neighbors are always different.
  for (let i = indiceGanador - 1; i >= 0; i -= 1) cartas[i] = distintaDe(cartas[i + 1]);
  for (let i = indiceGanador + 1; i < cartas.length; i += 1) cartas[i] = distintaDe(cartas[i - 1]);
  return { cartas, indiceGanador, indiceInicial: 2 };
}

export function posicionRuleta(progreso, inicio, final) {
  const t = Math.max(0, Math.min(1, progreso));
  return inicio + (final - inicio) * (1 - (1 - t) ** 4);
}
