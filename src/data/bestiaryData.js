export const RAREZAS_BESTIARIO = {
  comun: { nombre: 'Comun', precio: 30 },
  rara: { nombre: 'Rara', precio: 60 },
  epica: { nombre: 'Epica', precio: 90 },
  legendaria: { nombre: 'Legendaria', precio: 140 }
};

export const bestiario = [
  { id: 'bowtruckle', nombre: 'Bowtruckle', rareza: 'comun', descripcion: 'Guardian diminuto de ramas y secretos.', imagen: '/bestiary/bowtruckle.png' },
  { id: 'doxy', nombre: 'Doxy', rareza: 'comun', descripcion: 'Criatura inquieta para retos rapidos.', imagen: '/bestiary/doxy.png' },
  { id: 'duendecillo', nombre: 'Duendecillo', rareza: 'comun', descripcion: 'Caos pequeno, energia grande.', imagen: '/bestiary/duendecillo.png' },
  { id: 'elfo', nombre: 'Elfo', rareza: 'comun', descripcion: 'Ayudante fiel para colecciones iniciales.', imagen: '/bestiary/elfo.png' },
  { id: 'lechuza', nombre: 'Lechuza', rareza: 'comun', descripcion: 'Mensajera de pistas y avisos.', imagen: '/bestiary/lechuza.png' },

  { id: 'acromantula', nombre: 'Acromantula', rareza: 'rara', descripcion: 'Una presencia intimidante para el bestiario.', imagen: '/bestiary/acromantula.png' },
  { id: 'centauro', nombre: 'Centauro', rareza: 'rara', descripcion: 'Observador sabio de la clase.', imagen: '/bestiary/centauro.png' },
  { id: 'demiguise', nombre: 'Demiguise', rareza: 'rara', descripcion: 'Silencioso, escurridizo y dificil de encontrar.', imagen: '/bestiary/demiguise.png' },
  { id: 'dugbog', nombre: 'Dugbog', rareza: 'rara', descripcion: 'Acecha entre pantanos y sorpresas.', imagen: '/bestiary/dugbog.png' },
  { id: 'escarbato', nombre: 'Escarbato', rareza: 'rara', descripcion: 'Brilla cuando hay recompensas cerca.', imagen: '/bestiary/escarbato.png' },
  { id: 'fwooper', nombre: 'Fwooper', rareza: 'rara', descripcion: 'Colorido, ruidoso y muy coleccionable.', imagen: '/bestiary/fwooper.png' },
  { id: 'grindylow', nombre: 'Grindylow', rareza: 'rara', descripcion: 'Habita aguas oscuras del album.', imagen: '/bestiary/grindylow.png' },

  { id: 'basilisco', nombre: 'Basilisco', rareza: 'epica', descripcion: 'Peligroso y dificil de dominar.', imagen: '/bestiary/basilisco.png' },
  { id: 'cerbero', nombre: 'Cerbero', rareza: 'epica', descripcion: 'Tres guardianes en una sola bestia.', imagen: '/bestiary/cerbero.png' },
  { id: 'dementor', nombre: 'Dementor', rareza: 'epica', descripcion: 'Oscuro, frio y poderoso.', imagen: '/bestiary/dementor.png' },
  { id: 'gigante', nombre: 'Gigante', rareza: 'epica', descripcion: 'Fuerza descomunal para un album avanzado.', imagen: '/bestiary/gigante.png' },
  { id: 'hipogrifo', nombre: 'Hipogrifo', rareza: 'epica', descripcion: 'Noble, orgulloso y veloz.', imagen: '/bestiary/hipogrifo.png' },
  { id: 'hombre-lobo', nombre: 'Hombre-lobo', rareza: 'epica', descripcion: 'Transformacion rara de alto valor.', imagen: '/bestiary/hombre-lobo.png' },
  { id: 'inferi', nombre: 'Inferi', rareza: 'epica', descripcion: 'Una pieza oscura para coleccionistas.', imagen: '/bestiary/inferi.png' },
  { id: 'thestral', nombre: 'Thestral', rareza: 'epica', descripcion: 'Misterioso y reservado para pocos.', imagen: '/bestiary/thestral.png' },

  { id: 'dragon', nombre: 'Dragon', rareza: 'legendaria', descripcion: 'La joya ardiente del bestiario.', imagen: '/bestiary/dragon.png' },
  { id: 'fenix', nombre: 'Fenix', rareza: 'legendaria', descripcion: 'Renace y simboliza una coleccion brillante.', imagen: '/bestiary/fenix.png' },
  { id: 'troll', nombre: 'Troll', rareza: 'legendaria', descripcion: 'Enorme, dificil y muy costoso.', imagen: '/bestiary/troll.png' },
  { id: 'unicornio', nombre: 'Unicornio', rareza: 'legendaria', descripcion: 'Una criatura pura de valor maximo.', imagen: '/bestiary/unicornio.png' }
];

export function precioBestia(bestia) {
  return RAREZAS_BESTIARIO[bestia.rareza]?.precio || 30;
}
