import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../../services/hechiApi';
import '../../styles/attendance.css';

const NORMALIZAR = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
const hoyMexico = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fechaTexto = fecha => new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${fecha}T12:00:00Z`));
const contar = registros => ({
  presente: registros.filter(r => r.estado === 'presente').length,
  falta: registros.filter(r => r.estado === 'falta').length,
  justificada: registros.filter(r => r.estado === 'justificada').length
});

export default function AttendancePanel({ sesion, alumnos = [], onClose }) {
  const maestro = sesion.tipo === 'maestro';
  const [datos,setDatos] = useState(null);
  const [fecha,setFecha] = useState(hoyMexico);
  const [presentes,setPresentes] = useState([]);
  const [fechaNueva,setFechaNueva] = useState('');
  const [error,setError] = useState('');
  const [aviso,setAviso] = useState('');
  const [ocupado,setOcupado] = useState(false);
  const [busqueda,setBusqueda] = useState('');
  const credenciales = useMemo(() => ({p_token:sesion.token,...(maestro ? {} : {p_alumno_id:sesion.alumnoId,p_password:sesion.password})}),[maestro,sesion.token,sesion.alumnoId,sesion.password]);
  const cargar = useCallback(async () => {
    const {data,error:fallo} = await db.rpc('asistencia_estado',credenciales);
    if(fallo) throw new Error(fallo.message);
    setDatos(data);
    const dia=hoyMexico();
    setFecha(dia);
    setPresentes(data.registros.filter(r => r.fecha === dia && r.estado === 'presente').map(r => r.alumnoId));
  },[credenciales]);
  useEffect(() => {
    let activo = true;
    const obtener = async () => { try { await cargar(); } catch(e) { if(activo) setError(e.message); } };
    void obtener();
    if(!maestro){const timer = window.setInterval(obtener,12000);return () => {activo=false;window.clearInterval(timer);};}
    return () => {activo=false;};
  },[cargar,maestro]);
  useEffect(() => {
    if(!maestro)return undefined;
    const timer=window.setInterval(() => {
      if(hoyMexico()!==fecha)void cargar();
    },30000);
    return () => window.clearInterval(timer);
  },[maestro,fecha,cargar]);
  const ejecutar = async (nombre,args,mensaje) => {
    if(ocupado) return null;
    setOcupado(true);setError('');setAviso('');
    const {data,error:fallo} = await db.rpc(nombre,{...credenciales,...args});
    setOcupado(false);
    if(fallo){setError(fallo.message);return null;}
    setDatos(data);if(mensaje)setAviso(mensaje);return data;
  };
  const registros = datos?.registros || [];
  const resumenAlumno = contar(registros);
  const lista = datos?.alumnos?.length ? datos.alumnos : alumnos.map(a => ({id:a.id,nombreReal:a.nombre,usuario:a.nombre}));
  const filas = lista.filter(a => NORMALIZAR(`${a.nombreReal} ${a.usuario}`).includes(NORMALIZAR(busqueda)))
    .sort((a,b) => a.nombreReal.localeCompare(b.nombreReal,'es',{sensitivity:'base'}));
  const guardarLista = async () => {
    if (hoyMexico() !== fecha) { await cargar(); setError('Cambió el día. Revisa la nueva lista antes de guardar.'); return; }
    const resultado=await ejecutar('asistencia_pasar_lista',{p_presentes:presentes},'Lista guardada. Los alumnos sin marcar quedaron con falta.');
    if (resultado) setPresentes(resultado.registros.filter(r => r.fecha === fecha && r.estado === 'presente').map(r => r.alumnoId));
  };
  const buscarRegistro = (alumnoId,dia) => registros.find(r => r.alumnoId === alumnoId && r.fecha === dia);
  if(!maestro)return <section className='attendance-student' aria-label='Mi asistencia'>
    <h3>Mi asistencia del parcial</h3>
    {error && <p role='alert'>{error}</p>}
    {!datos ? <p>Cargando asistencia…</p> : <>
      {!registros.length && <p className='attendance-empty'>Aún no hay asistencias ni faltas registradas para tu cuenta. Consulta al maestro si tu usuario ya está vinculado con la lista.</p>}
      <div className='attendance-summary'><strong>{registros.length ? resumenAlumno.presente : '—'}<small>Asistencias</small></strong><strong>{registros.length ? resumenAlumno.falta : '—'}<small>Faltas</small></strong><strong>{registros.length ? resumenAlumno.justificada : '—'}<small>Justificadas</small></strong></div>
      <details defaultOpen><summary>Ver fechas y marcas</summary>{!datos.fechas.length ? <p>El calendario de clases aún no está cargado.</p> : <ul>{datos.fechas.map(dia => {
        const marca=buscarRegistro(sesion.alumnoId,dia);
        return <li key={dia}><span>{fechaTexto(dia)}</span><b>{marca?.estado === 'presente' ? 'Presente' : marca?.estado === 'falta' ? 'Falta' : marca?.estado === 'justificada' ? 'Justificada' : 'Pendiente'}</b>{marca?.nota && <small>{marca.nota}</small>}</li>;
      })}</ul>}</details>
    </>}
  </section>;

  return <div className='attendance-overlay' role='dialog' aria-modal='true' aria-labelledby='attendance-title'>
    <section className='attendance-card'>
      <header><div><h2 id='attendance-title'>Pasar lista</h2><p>{fechaTexto(fecha)} · Marca a quienes asistieron. Los demás tendrán falta al guardar.</p></div><button type='button' onClick={onClose} aria-label='Cerrar asistencias'>Cerrar</button></header>
      {error && <p className='attendance-error' role='alert'>{error}</p>}
      {aviso && <p className='attendance-notice' role='status'>{aviso}</p>}
      {!datos ? <p>Cargando lista…</p> : <>
        <div className='attendance-daily'>
          <div className='attendance-toolbar'><label>Buscar por nombre real o usuario<input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder='Buscar alumno' /></label><span>{presentes.length} de {lista.length} presentes</span></div>
          <div className='attendance-checklist'>{filas.map(alumno => <label key={alumno.id} className={'attendance-check-row'+(presentes.includes(alumno.id) ? ' checked' : '')}>
            <input type='checkbox' checked={presentes.includes(alumno.id)} disabled={ocupado} onChange={e => setPresentes(actual => e.target.checked ? [...actual,alumno.id] : actual.filter(id => id !== alumno.id))} />
            <span><strong>{alumno.nombreReal}</strong><small>Usuario: {alumno.usuario}</small></span><b>{presentes.includes(alumno.id) ? 'Presente' : 'Falta'}</b>
          </label>)}</div>
          <button type='button' className='attendance-save' disabled={ocupado || !lista.length} onClick={() => void guardarLista()}>{ocupado ? 'Guardando…' : 'Guardar lista de hoy'}</button>
        </div>
        <details className='attendance-corrections'><summary>Corregir faltas de días anteriores</summary><div className='attendance-corrections-body'>
        <div className='attendance-toolbar'>
          <label>Fecha anterior<select value={fechaNueva} onChange={e => setFechaNueva(e.target.value)}><option value=''>Seleccionar</option>{datos.fechas.filter(d => d < fecha).map(d => <option key={d} value={d}>{fechaTexto(d)}</option>)}</select></label>
        </div>
        {fechaNueva && <div className='attendance-roster'>{filas.map(alumno => {
          const registro=buscarRegistro(alumno.id,fechaNueva);
          const resumen=contar(registros.filter(r => r.alumnoId === alumno.id));
          const carta=(alumnos.find(a => a.id===alumno.id)?.cartasGuardadas || []).find(c => Number(c.numero) === 18);
          return <article key={alumno.id}><div><strong>{alumno.nombreReal}</strong><small>{resumen.presente} A · {resumen.falta} F · {resumen.justificada} J</small></div>
            <div className='attendance-actions'>
              {['presente','falta','justificada'].map(estado => <button key={estado} type='button' disabled={ocupado} className={registro?.estado === estado ? 'active '+estado : ''} onClick={() => void ejecutar('asistencia_marcar',{p_alumno_id:alumno.id,p_fecha:fechaNueva,p_estado:estado,p_nota:estado === 'justificada' ? 'Justificada por el maestro' : null},'Corrección guardada.')}>{estado === 'presente' ? 'Presente' : estado === 'falta' ? 'Falta' : 'Justificada'}</button>)}
              {registro?.estado === 'falta' && carta && <button type='button' disabled={ocupado} className='card-justify' onClick={() => void ejecutar('asistencia_justificar_carta',{p_alumno_id:alumno.id,p_fecha:fechaNueva,p_carta_id:carta.id},'Falta justificada con Crecehuesos.')}>Usar Crecehuesos</button>}
            </div>
            {registro?.nota && <small>Motivo: {registro.nota}</small>}
          </article>;
        })}</div>}
        </div></details>
      </>}
    </section>
  </div>;
}
