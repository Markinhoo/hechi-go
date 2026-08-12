import { CARTAS_PROBABILIDAD, TOTAL_PESO_CARTAS, casas, efectosCartas } from '../data/gameData';

export function randomEntero(maximo) {
  const valores = new Uint32Array(1);
  crypto.getRandomValues(valores);
  return valores[0] % maximo;
}

export function elegirCartaAleatoria(disponibles = null) {
  const permitidas = disponibles ? new Set(disponibles) : null;
  const candidatas = permitidas ? CARTAS_PROBABILIDAD.filter((carta) => permitidas.has(carta.numero)) : CARTAS_PROBABILIDAD;
  const totalPeso = candidatas.reduce((total, carta) => total + carta.peso, 0) || TOTAL_PESO_CARTAS;
  let tiro = randomEntero(totalPeso);

  for (const carta of candidatas.length ? candidatas : CARTAS_PROBABILIDAD) {
    if (tiro < carta.peso) return carta.numero;
    tiro -= carta.peso;
  }

  return CARTAS_PROBABILIDAD[0].numero;
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
