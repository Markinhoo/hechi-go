import { supabase } from '../lib/supabaseClient';
import { iniciarPeticion, terminarPeticion, rpcEsLectura } from './connectionStore';
const raw = supabase.schema('hechi');
const enCurso = new Map();
async function ejecutar(nombre,args,opciones) {
  const escritura = !rpcEsLectura(nombre);
  iniciarPeticion(escritura);
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(),20000);
  try {
    if (typeof navigator!=='undefined' && !navigator.onLine) throw new Error('Sin conexión a internet');
    const request=raw.rpc(nombre,args,opciones);
    const result=await (typeof request.abortSignal==='function' ? request.abortSignal(controlador.signal) : request);
    const redCaida=Boolean(result.error && (!result.status || /fetch|network|abort/i.test(result.error.message)));
    terminarPeticion(escritura,result.error,redCaida);
    return result;
  } catch(error) {
    terminarPeticion(escritura,error,true);
    return {data:null,error:{message:error.message || 'No se pudo conectar. Revisa el estado antes de repetir.'}};
  } finally { clearTimeout(timeout); }
}
export const db = new Proxy(raw,{
  get(target,prop) {
    if(prop==='rpc') return (nombre,args,opciones) => {
      if (rpcEsLectura(nombre)) return ejecutar(nombre,args,opciones);
      const key=nombre+JSON.stringify(args);
      if(enCurso.has(key)) return enCurso.get(key);
      const tarea=ejecutar(nombre,args,opciones).finally(()=>enCurso.delete(key));
      enCurso.set(key,tarea);
      return tarea;
    };
    const value=Reflect.get(target,prop);
    return typeof value==='function' ? value.bind(target) : value;
  }
});
export { supabase };