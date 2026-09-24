import { CARTAS_PROBABILIDAD } from '../data/gameData.js';

export function randomEntero(maximo) {
  if (!Number.isInteger(maximo) || maximo <= 0 || maximo > 0x100000000) throw new RangeError('Limite aleatorio invalido');
  const valores = new Uint32Array(1);
  const limite = 0x100000000 - (0x100000000 % maximo);
  do { crypto.getRandomValues(valores); } while (valores[0] >= limite);
  return valores[0] % maximo;
}

const categoria = (numero) => {
  const rareza = CARTAS_PROBABILIDAD.find((c) => c.numero === numero)?.rareza;
  return ['poco_comun','rara'].includes(rareza) ? 'especial' : rareza;
};

export function probabilidadesPorRacha(historial = []) {
  let comunes = 0;
  let sinAlta = 0;
  let sinLegendaria = 0;
  for (let i=historial.length-1; i>=0 && categoria(historial[i])==='comun'; i-=1) comunes+=1;
  for (let i=historial.length-1; i>=0 && !['epica','legendaria'].includes(categoria(historial[i])); i-=1) sinAlta+=1;
  for (let i=historial.length-1; i>=0 && categoria(historial[i])!=='legendaria'; i-=1) sinLegendaria+=1;
  const racha = Math.min(comunes,5);
  const bonusEpica = Math.min(10,Math.max(0,sinAlta-3)*2);
  const bonusLegendaria = Math.min(15,Math.max(0,sinLegendaria-5)*1.5);
  return {
    comun:45-3*racha-bonusEpica-bonusLegendaria,
    especial:30+racha,
    epica:15+racha+bonusEpica,
    legendaria:10+racha+bonusLegendaria
  };
}

export function pesosDisponibles(activas, disponibles = activas, historial = []) {
  const permitidas = new Set(disponibles);
  let candidatas = [...new Set(activas)].filter((numero) => permitidas.has(numero));
  if (!candidatas.length) throw new Error('No hay cartas disponibles');
  const recientes = historial.slice(-3);
  const ultima = recientes.at(-1);
  if (candidatas.length > 1) candidatas = candidatas.filter((numero) => numero !== ultima);
  const probabilidades = probabilidadesPorRacha(historial);
  return candidatas.map((numero) => {
    const grupo = categoria(numero);
    if (!grupo) throw new Error('Carta sin probabilidad configurada: ' + numero);
    const cantidad = CARTAS_PROBABILIDAD.filter((c) => categoria(c.numero)===grupo).length;
    // 120 keeps every ticket count integral, including half-point bonuses and recency.
    const peso = probabilidades[grupo]*120/cantidad*(recientes.includes(numero)?0.5:1);
    return { numero, peso };
  });
}

export function sortearCarta(activas, disponibles = activas, historial = []) {
  const candidatas = pesosDisponibles(activas,disponibles,historial);
  let boleto = randomEntero(candidatas.reduce((total,carta) => total+carta.peso,0));
  for (const carta of candidatas) {
    if (boleto<carta.peso) return carta.numero;
    boleto-=carta.peso;
  }
  throw new Error('No se pudo seleccionar una carta');
}