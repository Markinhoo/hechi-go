export function randomEntero(maximo) {
  if (!Number.isInteger(maximo) || maximo <= 0 || maximo > 0x100000000) throw new RangeError('Limite aleatorio invalido');
  const valores = new Uint32Array(1);
  const limite = 0x100000000 - (0x100000000 % maximo);
  do { crypto.getRandomValues(valores); } while (valores[0] >= limite);
  return valores[0] % maximo;
}

export function sortearCarta(activas, disponibles = activas) {
  const permitidas = new Set(disponibles);
  const candidatas = [...new Set(activas)].filter((numero) => permitidas.has(numero));
  if (!candidatas.length) throw new Error('No hay cartas disponibles');
  return candidatas[randomEntero(candidatas.length)];
}
