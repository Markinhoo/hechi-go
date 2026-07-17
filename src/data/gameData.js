export const TOTAL_CARTAS = 28;
export const PLAYER_KEY = 'hechi-pocket-player-v3';
export const TEACHER_KEY = 'hechi-pocket-teacher-v4';

export const casas = [
  { id: 'gryffindor', nombre: 'Gryffindor', color: '#8f1628', metal: '#f0c75e', escudo: '/houses/gryffindor.png' },
  { id: 'slytherin', nombre: 'Slytherin', color: '#0d5c45', metal: '#c8d2d8', escudo: '/houses/slytherin.png' },
  { id: 'ravenclaw', nombre: 'Ravenclaw', color: '#174b7a', metal: '#c99445', escudo: '/houses/ravenclaw.png' },
  { id: 'hufflepuff', nombre: 'Hufflepuff', color: '#e0ad25', metal: '#1f1a18', escudo: '/houses/hufflepuff.png' }
];

export const efectosCartas = Array.from({ length: TOTAL_CARTAS }, (_, index) => {
  const numero = index + 1;
  if (numero === 1) return { puntos: 1, titulo: 'Alohomora', descripcion: 'SUMA +1 A LA CASA' };
  if (numero === 2) return { puntos: 0, titulo: 'Expecto Patronus', descripcion: 'PROTEGE A TU CASA Y DUPLICA LA SIGUIENTE PARTICIPACION', tipo: 'proteccion' };
  if (numero === 3) return { puntos: -5, titulo: 'Avada Kedavra', descripcion: 'RESTA -5 A UNA CASA RIVAL', tipo: 'rival' };
  if (numero === 4) return { puntos: 0, titulo: 'Confundo', descripcion: 'INTERCAMBIA PUNTOS ENTRE ALUMNOS', tipo: 'puntosIntercambio' };
  if (numero === 5) return { puntos: 1, titulo: 'Envejecedora', descripcion: '+1 A SU CASA. CADA VEZ QUE SALGA AUMENTA SU VALOR', tipo: 'acumulativa' };
  if (numero === 6) return { puntos: 0, titulo: 'Imperio', descripcion: 'INTERCAMBIA DE CASA CON OTRO JUGADOR', tipo: 'intercambio' };
  if (numero === 7) return { puntos: 2, titulo: 'Incendio', descripcion: 'SUMA +2 A LA CASA' };
  if (numero === 9) return { puntos: -3, titulo: 'Crucio', descripcion: 'RESTA -3 A UNA CASA RIVAL', tipo: 'rival' };
  if (numero === 11) return { puntos: 3, titulo: 'Engorgio', descripcion: 'SUMA +3 A LA CASA' };
  if (numero === 16) return { puntos: 0, titulo: 'Amortentia', descripcion: 'SUMA +2 A TI Y OTRO COMPANERO', tipo: 'companeroBonus' };
  if (numero === 17) return { puntos: 0, titulo: 'Elixir de Vida', descripcion: 'QUITA LA MITAD DE LOS PUNTOS NEGATIVOS A SU CASA', tipo: 'limpiaNegativos' };
  if (numero === 18) return { puntos: 1, titulo: 'Crecehuesos', descripcion: 'SUMA +1 O JUSTIFICA UNA FALTA', tipo: 'guardable' };
  if ([12, 21, 28].includes(numero)) return { puntos: 40, titulo: 'Hechizo supremo', descripcion: 'La casa recibe una gran recompensa por una participacion brillante.' };
  if ([14, 23].includes(numero)) return { puntos: 30, titulo: 'Reliquia poderosa', descripcion: 'La casa sube con fuerza en el marcador.' };
  if ([10, 15, 20, 25].includes(numero)) return { puntos: 20, titulo: 'Encantamiento mayor', descripcion: 'La participacion suma una ventaja importante.' };
  if (numero % 2 === 0) return { puntos: 15, titulo: 'Carta especial', descripcion: 'Buen aporte para la casa.' };
  return { puntos: 10, titulo: 'Carta comun', descripcion: 'Suma base por participacion autorizada.' };
});
