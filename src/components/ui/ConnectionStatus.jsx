import { useEffect, useState, useSyncExternalStore } from 'react';
import { leerConexion, suscribirConexion, actualizarConexion } from '../../services/connectionStore';
function ConnectionStatus() {
  const estado=useSyncExternalStore(suscribirConexion,leerConexion);
  const [online,setOnline]=useState(()=>navigator.onLine);
  useEffect(()=>{
    const conectado=()=>{setOnline(true);actualizarConexion({conexion:'reconectando'});};
    const desconectado=()=>setOnline(false);
    window.addEventListener('online',conectado);window.addEventListener('offline',desconectado);
    return ()=>{window.removeEventListener('online',conectado);window.removeEventListener('offline',desconectado);};
  },[]);
  const texto=!online ? 'Sin conexión' : estado.pendientes ? 'Guardando…' :
    estado.conexion==='reconectando' ? 'Reconectando…' :
    estado.conexion==='error' ? 'No se pudo sincronizar' :
    estado.conexion==='conectando' ? 'Conectando…' :
    estado.errorGuardado || (estado.guardadoEn ? 'Cambio guardado · '+new Date(estado.guardadoEn).toLocaleTimeString('es-MX') : 'Conectado');
  return <span className='connection-status' role='status' aria-live='polite' data-warning={!online || Boolean(estado.errorGuardado) || estado.conexion==='error'}>{texto}</span>;
}
export default ConnectionStatus;