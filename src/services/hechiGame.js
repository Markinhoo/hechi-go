import { supabase } from '../lib/supabaseClient';

export const TOTAL_CARTAS = 28;
const LOCAL_KEY = 'hechi-go-local-state';

export function cargarLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
  } catch {
    return null;
  }
}

export function guardarLocal(estado) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(estado));
}

export function limpiarLocal() {
  localStorage.removeItem(LOCAL_KEY);
}

function normalizarAlumno(alumno) {
  return {
    id: alumno.id,
    nombre: alumno.nombre,
    puntos: alumno.puntos ?? 0,
    cartas: alumno.cartas ?? [],
    participaciones: alumno.participaciones ?? 0
  };
}

export async function cargarClase(userId) {
  let { data: clase, error: claseError } = await supabase
    .from('hechi_clases')
    .select('id, nombre, estado, created_at')
    .eq('created_by', userId)
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (claseError) throw claseError;

  if (!clase) {
    const { data: nuevaClase, error: crearError } = await supabase
      .from('hechi_clases')
      .insert({ nombre: 'Clase HECHI GO' })
      .select('id, nombre, estado, created_at')
      .single();

    if (crearError) throw crearError;
    clase = nuevaClase;
  }

  const { data: alumnos, error: alumnosError } = await supabase
    .from('hechi_alumnos')
    .select('id, nombre, puntos, cartas, participaciones')
    .eq('clase_id', clase.id)
    .eq('activo', true)
    .order('created_at', { ascending: true });

  if (alumnosError) throw alumnosError;
  return { clase, alumnos: (alumnos || []).map(normalizarAlumno) };
}

export async function crearAlumno(claseId, nombre) {
  const { data, error } = await supabase
    .from('hechi_alumnos')
    .insert({ clase_id: claseId, nombre })
    .select('id, nombre, puntos, cartas, participaciones')
    .single();

  if (error) throw error;
  return normalizarAlumno(data);
}

export function elegirCarta(cartas) {
  const disponibles = Array.from({ length: TOTAL_CARTAS }, (_, index) => index + 1)
    .filter((numero) => !cartas.includes(numero));

  if (disponibles.length > 0) {
    return disponibles[Math.floor(Math.random() * disponibles.length)];
  }

  return Math.floor(Math.random() * TOTAL_CARTAS) + 1;
}

export async function registrarParticipacion({ claseId, alumno, puntos, carta, esNueva }) {
  const actualizado = {
    ...alumno,
    puntos: alumno.puntos + puntos,
    participaciones: alumno.participaciones + 1,
    cartas: esNueva ? [...alumno.cartas, carta] : alumno.cartas
  };

  const { error: historialError } = await supabase
    .from('hechi_participaciones')
    .insert({ clase_id: claseId, alumno_id: alumno.id, puntos, carta, carta_nueva: esNueva });

  if (historialError) throw historialError;

  const { data, error } = await supabase
    .from('hechi_alumnos')
    .update({ puntos: actualizado.puntos, cartas: actualizado.cartas, participaciones: actualizado.participaciones })
    .eq('id', alumno.id)
    .select('id, nombre, puntos, cartas, participaciones')
    .single();

  if (error) throw error;
  return normalizarAlumno(data);
}

export async function cerrarClase(claseId) {
  const { error } = await supabase
    .from('hechi_clases')
    .update({ estado: 'cerrada' })
    .eq('id', claseId);

  if (error) throw error;
}