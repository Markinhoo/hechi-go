import { CARTAS_ACTIVAS, casas, efectosCartas } from '../data/gameData';

import { randomEntero, sortearCarta } from './cardRandom';
export { randomEntero } from './cardRandom';

export function elegirCartaAleatoria(disponibles = CARTAS_ACTIVAS, historial = []) {
  return sortearCarta(CARTAS_ACTIVAS, disponibles ?? CARTAS_ACTIVAS, historial);
}

export function generarToken() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => abc[randomEntero(abc.length)]).join('');
}

export function calcularObjetivos(total) {
  const base = Math.floor(total / casas.length);
  const sobrantes = total % casas.length;
  return casas.reduce((acc, casa, index) => ({ ...acc, [casa.id]: base + (index < sobrantes ? 1 : 0) }), {});
}

export function obtenerCasa(casaId) {
  return casas.find((casa) => casa.id === casaId) || casas[0];
}

export function efectoCarta(numero) {
  return efectosCartas[numero - 1] || efectosCartas[0];
}

export function cargarLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export function guardarLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function limpiarTexto(texto) {
  return texto.trim().toUpperCase();
}
