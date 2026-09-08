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
