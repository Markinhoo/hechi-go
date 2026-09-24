let estado = { conexion:'conectando', pendientes:0, guardadoEn:0, errorGuardado:'', revision:0 };
const escuchas = new Set();
export const leerConexion = () => estado;
export const suscribirConexion = (fn) => { escuchas.add(fn); return () => escuchas.delete(fn); };
export function actualizarConexion(cambios) {
  estado = { ...estado,...cambios };
  for (const fn of escuchas) fn();
}
export const rpcEsLectura = (nombre) => /^(cargar_|estado_|listar_|obtener_)/.test(nombre) ||
  ['riddikulus_pendientes','riddikulus_sigue_pendiente'].includes(nombre);
export function iniciarPeticion(escritura) {
  if (escritura) actualizarConexion({pendientes:estado.pendientes+1,revision:estado.revision+1,errorGuardado:''});
}
export function terminarPeticion(escritura,error,redCaida=false) {
  actualizarConexion({
    conexion:redCaida ? 'reconectando' : error && !escritura ? 'error' : 'conectado',
    ...(escritura ? {
      pendientes:Math.max(0,estado.pendientes-1),revision:estado.revision+1,
      guardadoEn:error ? estado.guardadoEn : Date.now(),
      errorGuardado:error ? (redCaida ? 'No se confirmó el guardado. Revisa los datos antes de repetir.' : 'No se pudo guardar el cambio.') : ''
    } : {})
  });
}