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
  // Persistent counters are authoritative; older servers may still send attack totals.
  const registrados = Number(alumno.puntosPositivos ?? 0);
  const perdidos = Number(alumno.puntosNegativos ?? 0);
  if (registrados >= 0 && perdidos >= 0 && registrados - perdidos === total) {
    return { positivos: registrados, negativos: perdidos, total };
  }
  const positivos = Math.max(registrados, total, 0);
  return { positivos, negativos: positivos - total, total };
}

export function desgloseCasa(estado, casaId) {
  const negativos = penalizacionCasa(estado, casaId);
  const total = calcularPuntajeCasa(estado, casaId);
  return { positivos: Number(estado.puntajesPositivos?.[casaId] ?? total + negativos), negativos, total };
}


export function tablaPuntajesCasa(estado, casaId) {
  const alumnos = estado.alumnos.filter((a) => a.casaId === casaId).map((a) => {
    const { positivos, negativos } = desgloseAlumno(a);
    return { id: a.id, positivos, negativos };
  }).sort((a,b) => a.id.localeCompare(b.id));
  const suma = alumnos.reduce((r,a) => ({ positivos:r.positivos+a.positivos, negativos:r.negativos+a.negativos }), { positivos:0, negativos:0 });
  const casa = desgloseCasa(estado,casaId);
  const generalNegativo = Number(estado.puntajesGeneralesNegativos?.[casaId] ??
    Math.max(casa.negativos-suma.negativos, suma.positivos-suma.negativos-casa.total, 0));
  const generalPositivo = Number(estado.puntajesGeneralesPositivos?.[casaId] ??
    casa.total-suma.positivos+suma.negativos+generalNegativo);
  return { alumnos, generalNegativo, generalPositivo };
}

export function validarTablaPuntajes(tabla) {
  const valores = [tabla.generalNegativo, tabla.generalPositivo,
    ...tabla.alumnos.flatMap((a) => [a.positivos,a.negativos])];
  if (valores.some((v) => !/^[0-9]+$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v)>2147483647)) {
    throw new Error('Escribe números enteros de cero o más en cada celda.');
  }
  const positivos = tabla.alumnos.reduce((s,a) => s+Number(a.positivos),Number(tabla.generalPositivo));
  const negativos = tabla.alumnos.reduce((s,a) => s+Number(a.negativos),Number(tabla.generalNegativo));
  if (Math.max(positivos,negativos)>2147483647) throw new Error('El total de puntos es demasiado grande.');
  return {
    alumnos: tabla.alumnos.map((a) => ({ ...a, positivos:Number(a.positivos), negativos:Number(a.negativos) })),
    generalNegativo:Number(tabla.generalNegativo), generalPositivo:Number(tabla.generalPositivo)
  };
}
