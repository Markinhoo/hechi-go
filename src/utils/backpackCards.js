export function tieneCartaGuardada(alumno, numero) {
  return (alumno?.cartasGuardadas ?? []).some((carta) => Number(carta.numero) === Number(numero));
}
