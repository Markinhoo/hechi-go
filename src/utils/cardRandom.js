import { CARTAS_PROBABILIDAD } from '../data/gameData.js';

export function randomEntero(maximo) {
  if (!Number.isInteger(maximo) || maximo <= 0 || maximo > 0x100000000) throw new RangeError('Limite aleatorio invalido');
  const valores = new Uint32Array(1);
  const limite = 0x100000000 - (0x100000000 % maximo);
  do { crypto.getRandomValues(valores); } while (valores[0] >= limite);
  return valores[0] % maximo;
}

export function sortearCarta(activas, disponibles = activas, historial = []) {
  const permitidas = new Set(disponibles);
  let candidatas = [...new Set(activas)].filter((numero) => permitidas.has(numero));
  if (!candidatas.length) throw new Error('No hay cartas disponibles');
  // The persisted student's cards are appended in chronological order.
  const recientes = historial.slice(-3);
  const ultima = recientes.at(-1);
  if (candidatas.length > 1) candidatas = candidatas.filter((numero) => numero !== ultima);
  const pesos = candidatas.map((numero) => {
    const configuracion = CARTAS_PROBABILIDAD.find((carta) => carta.numero === numero);
    if (!configuracion) throw new Error('Carta sin probabilidad configurada: ' + numero);
    return configuracion.peso * (recientes.includes(numero) ? 0.5 : 1);
  });
  let boleto = randomEntero(pesos.reduce((total, peso) => total + peso, 0));
  for (let i = 0; i < candidatas.length; i += 1) {
    if (boleto < pesos[i]) return candidatas[i];
    boleto -= pesos[i];
  }
  throw new Error('No se pudo seleccionar una carta');
}