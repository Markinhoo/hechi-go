export function tieneCartaGuardada(alumno, numero) {
  return (alumno?.cartasGuardadas ?? []).some((carta) => Number(carta.numero) === Number(numero));
}
export function esDuplicadoDeMochila(error, tipo) {
  return tipo === 'guardable' && /ya tienes.*mochila/i.test(error?.message ?? '');
}
