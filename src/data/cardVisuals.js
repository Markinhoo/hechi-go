import { CARTAS_PROBABILIDAD } from './gameData.js';

export const BRILLOS_CARTAS = {
  comun: { nombre: 'Común', color: '#b6bfce' },
  especial: { nombre: 'Especial', color: '#bf84ff' },
  epica: { nombre: 'Épica', color: '#ff637a' },
  legendaria: { nombre: 'Legendaria', color: '#ffd166' }
};

export function brilloCarta(numero) {
  const rareza = CARTAS_PROBABILIDAD.find((carta) => carta.numero === numero)?.rareza;
  const nivel = rareza === 'legendaria' ? 'legendaria' : rareza === 'epica' ? 'epica' : ['rara', 'poco_comun'].includes(rareza) ? 'especial' : 'comun';
  return { nivel, ...BRILLOS_CARTAS[nivel] };
}
