export function penalizacionCasa(estado, casaId) {
  return Math.abs(Number(estado.puntajesNegativos?.[casaId] ?? 0));
}

export function calcularPuntajeCasa(estado, casaId) {
  const positivos = estado.puntajesPositivos?.[casaId];
  const negativos = estado.puntajesNegativos?.[casaId];
  if (positivos != null || negativos != null) {
    // Las penalizaciones pueden llegar como magnitud (5) o con signo (-5).
    return Number(positivos ?? 0) - penalizacionCasa(estado, casaId);
  }
  return Number(estado.puntajes?.[casaId] ?? 0);
}


export function desgloseAlumno(alumno) {
  const total = Number(alumno.puntos ?? 0);
  // Spell history also records attacks made by this student. Those negative
  // entries are not losses: reconcile earned points with their actual balance.
  const positivos = Math.max(Number(alumno.puntosPositivos ?? 0), total, 0);
  return { positivos, negativos: positivos - total, total };
}

export function desgloseCasa(estado, casaId) {
  const negativos = penalizacionCasa(estado, casaId);
  const total = calcularPuntajeCasa(estado, casaId);
  return { positivos: Number(estado.puntajesPositivos?.[casaId] ?? total + negativos), negativos, total };
}
