import catalog from '../data/duelCatalog.json';

const creatures = new Set(catalog.cards.map(card => card.id));
export function duelCombination(a, b, spellUsed = false) {
  if (!a || !b || a.uid === b.uid) return null;
  const monster = a.id === 'hechizo-engorgio' ? b : b.id === 'hechizo-engorgio' ? a : null;
  if (monster) return !spellUsed && creatures.has(monster.id) ? { id: monster.id, bonusAtk: 500 } : null;
  const id = catalog.fusions.find(([x, y]) => [x, y].sort().join('+') === [a.id, b.id].sort().join('+'))?.[2];
  return id ? { id, bonusAtk: 0 } : null;
}
