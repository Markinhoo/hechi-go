import { useEffect,useState } from 'react';
import { db } from '../../services/hechiApi';
import { descargarRespaldo } from '../../utils/periodBackup';
function PeriodBackups({ token,onClose }) {
  const [lista,setLista]=useState(null);
  const [error,setError]=useState('');
  const [ocupado,setOcupado]=useState(false);
  useEffect(()=>{
    let cancelado=false;
    db.rpc('listar_respaldos_parcial',{p_token:token}).then(({data,error})=>{
      if(cancelado)return;
      if(error)setError(error.message);else setLista(data ?? []);
    });
    return ()=>{cancelado=true;};
  },[token]);
  const descargar=async(id,completo)=>{
    if(ocupado)return;
    setOcupado(true);setError('');
    try {
      const {data,error}=await db.rpc('obtener_respaldo_parcial',{p_id:id});
      if(error)throw new Error(error.message);
      descargarRespaldo(data,completo);
    } catch(e){setError(e.message);} finally{setOcupado(false);}
  };
  return <div className='unsaved-overlay' role='dialog' aria-modal='true' aria-labelledby='backups-title'>
    <section className='unsaved-card backups-card'>
      <h2 id='backups-title'>Respaldos de parciales</h2>
      <button type='button' onClick={onClose}>Cerrar</button>
      {error && <p role='alert'>{error}</p>}
      {!lista && !error && <p>Cargando respaldos…</p>}
      {lista?.length===0 && <p>El respaldo se creará al iniciar un nuevo parcial.</p>}
      {lista?.map(r=><article key={r.id}>
        <strong>{r.nombre} · {new Date(r.created_at).toLocaleString('es-MX')}</strong>
        <button type='button' disabled={ocupado} onClick={()=>descargar(r.id,false)}>Descargar resumen</button>
        <button type='button' disabled={ocupado} onClick={()=>descargar(r.id,true)}>Descargar datos completos</button>
      </article>)}
    </section>
  </div>;
}
export default PeriodBackups;