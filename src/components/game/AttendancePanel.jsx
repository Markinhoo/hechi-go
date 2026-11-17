import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../../services/hechiApi';
import '../../styles/attendance.css';

const CALENDARIO_2026 = [9,10,11,12,13,17,18,19,20,23,24,25,26,27,30].map(d => `2026-11-${String(d).padStart(2,'0')}`)
  .concat([1,2,3,4].map(d => `2026-12-${String(d).padStart(2,'0')}`));
const NORMALIZAR = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
const fechaTexto = fecha => new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${fecha}T12:00:00Z`));
const contar = registros => ({
  presente: registros.filter(r => r.estado === 'presente').length,
  falta: registros.filter(r => r.estado === 'falta').length,
  justificada: registros.filter(r => r.estado === 'justificada').length
});

export default function AttendancePanel({ sesion, alumnos = [], onClose }) {
  const maestro = sesion.tipo === 'maestro';
  const [datos,setDatos] = useState(null);
  const [fecha,setFecha] = useState('');
  const [fechaNueva,setFechaNueva] = useState('');
  const [error,setError] = useState('');
  const [aviso,setAviso] = useState('');
  const [ocupado,setOcupado] = useState(false);
  const [importacion,setImportacion] = useState(null);
  const [busqueda,setBusqueda] = useState('');
  const credenciales = useMemo(() => ({p_token:sesion.token,...(maestro ? {} : {p_alumno_id:sesion.alumnoId,p_password:sesion.password})}),[maestro,sesion.token,sesion.alumnoId,sesion.password]);
  const cargar = useCallback(async () => {
    const {data,error:fallo} = await db.rpc('asistencia_estado',credenciales);
    if(fallo) throw new Error(fallo.message);
    setDatos(data);
    setFecha(actual => actual && data.fechas.includes(actual) ? actual : data.fechas.find(d => d >= new Date().toISOString().slice(0,10)) || data.fechas.at(-1) || '');
  },[credenciales]);
  useEffect(() => {
    let activo = true;
    const obtener = async () => { try { await cargar(); } catch(e) { if(activo) setError(e.message); } };
    void obtener();
    if(!maestro){const timer = window.setInterval(obtener,12000);return () => {activo=false;window.clearInterval(timer);};}
    return () => {activo=false;};
  },[cargar,maestro]);
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
  const filas = alumnos.filter(a => NORMALIZAR(a.nombre).includes(NORMALIZAR(busqueda)))
    .sort((a,b) => a.nombre.localeCompare(b.nombre,'es'));
  const buscarRegistro = (alumnoId,dia) => registros.find(r => r.alumnoId === alumnoId && r.fecha === dia);
  const registrar = (alumnoId,estado,nota=null) => void ejecutar('asistencia_marcar',{
    p_alumno_id:alumnoId,p_fecha:fecha,p_estado:estado,p_nota:nota
  },'Asistencia guardada.');
  const agregarFechas = async (fechas) => {
    const data = await ejecutar('asistencia_guardar_fechas',{p_fechas:fechas},'Calendario preparado.');
    if(data && !fecha)setFecha(fechas[0]);
    return data;
  };
  const leerArchivo = async (archivo) => {
    if(!archivo)return;
    setError('');setAviso('');
    try {
      if(!/\.csv$/i.test(archivo.name)) throw new Error('Selecciona un archivo .csv.');
      const texto = (await archivo.text()).replace(/^\uFEFF/,'');
      const lineas = texto.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const encabezado = lineas[0]?.split(';').map(x => x.trim()) || [];
      const fechas = encabezado.slice(1);
      if(NORMALIZAR(encabezado[0]) !== 'NOMBRE' || !fechas.length || fechas.some(x => !/^\d{4}-\d{2}-\d{2}$/.test(x)))
        throw new Error('El CSV debe comenzar con nombre;AAAA-MM-DD;AAAA-MM-DD...');
      const filasArchivo = lineas.slice(1).map((linea,index) => {
        const celdas = linea.split(';').map(x => x.trim());
        if(celdas.length !== encabezado.length) throw new Error(`La fila ${index+2} tiene un número de columnas distinto al encabezado.`);
        const marcas = celdas.slice(1).map((valor,i) => {
          const marca = valor.toLowerCase();
          if(!['.','x','j',''].includes(marca)) throw new Error(`Marca no reconocida en la fila ${index+2}, ${fechas[i]}. Usa ., x, j o vacío.`);
          return marca === '.' ? 'presente' : marca === 'x' ? 'falta' : marca === 'j' ? 'justificada' : null;
        });
        const iguales = alumnos.filter(a => NORMALIZAR(a.nombre) === NORMALIZAR(celdas[0]));
        return {nombre:celdas[0],alumnoId:iguales.length === 1 ? iguales[0].id : '',marcas};
      });
      if(!filasArchivo.length)throw new Error('El archivo no tiene alumnos.');
      setImportacion({fechas,filas:filasArchivo});
    } catch(e) {setError(e.message);setImportacion(null);}
  };
  const importar = async () => {
    if(!importacion || ocupado)return;
    const ids=importacion.filas.map(f => f.alumnoId);
    if(ids.some(x => !x) || new Set(ids).size !== ids.length){setError('Relaciona cada fila con un alumno distinto antes de importar.');return;}
    const fechas = [...new Set([...(importacion.fechas.every(d => CALENDARIO_2026.includes(d)) ? CALENDARIO_2026 : []),...importacion.fechas])];
    const calendario = await agregarFechas(fechas);
    if(!calendario)return;
    const marcas = importacion.filas.flatMap(f => f.marcas.flatMap((estado,i) => estado ? [{alumnoId:f.alumnoId,fecha:importacion.fechas[i],estado}] : []));
    if(!marcas.length){setError('El archivo no contiene asistencias ni faltas.');return;}
    const guardado = await ejecutar('asistencia_importar',{p_registros:marcas},`${marcas.length} marcas importadas.`);
    if(guardado)setImportacion(null);
  };
  const justificarCarta = (alumno,cardId) => void ejecutar('asistencia_justificar_carta',{
    p_alumno_id:alumno.id,p_fecha:fecha,p_carta_id:cardId
  },'Falta justificada con Crecehuesos. La carta se consumió.');

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
      <header><div><h2 id='attendance-title'>Control de asistencias</h2><p>Las asistencias y faltas no cambian los puntos de las casas.</p></div><button type='button' onClick={onClose} aria-label='Cerrar asistencias'>Cerrar</button></header>
      {error && <p className='attendance-error' role='alert'>{error}</p>}
      {aviso && <p className='attendance-notice' role='status'>{aviso}</p>}
      {!datos ? <p>Cargando lista…</p> : <>
        <div className='attendance-toolbar'>
          {!datos.fechas.length && <button type='button' disabled={ocupado} onClick={() => void agregarFechas(CALENDARIO_2026)}>Preparar fechas de la lista (9 nov.–4 dic. 2026)</button>}
          <label>Fecha de clase<select value={fecha} onChange={e => setFecha(e.target.value)}>{datos.fechas.map(d => <option key={d} value={d}>{fechaTexto(d)}</option>)}</select></label>
          <label>Agregar fecha<input type='date' value={fechaNueva} onChange={e => setFechaNueva(e.target.value)} /></label>
          <button type='button' disabled={ocupado || !fechaNueva} onClick={() => void agregarFechas([fechaNueva])}>Agregar</button>
          <label>Buscar alumno<input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder='Nombre' /></label>
        </div>
        <details className='attendance-import'><summary>Importar lista existente desde CSV</summary>
          <p>Archivo con encabezado <code>nombre;2026-11-09;2026-11-10</code>. Usa <b>.</b> para asistencia, <b>x</b> para falta, <b>j</b> para justificada y vacío para pendiente. Revisa la asignación de nombres antes de guardar.</p>
          <input type='file' accept='.csv,text/csv' onChange={e => {void leerArchivo(e.target.files?.[0]);e.target.value='';}} />
          {importacion && <div className='attendance-preview'><p>{importacion.filas.length} alumnos · {importacion.fechas.length} fechas · {importacion.filas.flatMap(f => f.marcas).filter(Boolean).length} marcas. Aún no se han guardado.</p>
            <p className='attendance-preview-dates'>Marcas por fecha: {importacion.fechas.map((dia,i) => `${fechaTexto(dia)}: ${importacion.filas.filter(f => f.marcas[i]).length}/${importacion.filas.length}`).join(' · ')}.</p>
            {importacion.filas.map((fila,i) => <label key={i}><span>{fila.nombre} · {fila.marcas.filter(x => x === 'presente').length} A / {fila.marcas.filter(x => x === 'falta').length} F</span>
              <select value={fila.alumnoId} onChange={e => setImportacion(actual => ({...actual,filas:actual.filas.map((f,j) => j===i ? {...f,alumnoId:e.target.value} : f)}))}>
                <option value=''>Seleccionar alumno</option>{alumnos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select></label>)}
            <button type='button' disabled={ocupado} onClick={() => void importar()}>Confirmar importación</button>
          </div>}
        </details>
        {fecha && <div className='attendance-roster'>{filas.map(alumno => {
          const registro=buscarRegistro(alumno.id,fecha);
          const resumen=contar(registros.filter(r => r.alumnoId === alumno.id));
          const carta=(alumno.cartasGuardadas || []).find(c => Number(c.numero) === 18);
          return <article key={alumno.id}><div><strong>{alumno.nombre}</strong><small>{resumen.presente} A · {resumen.falta} F · {resumen.justificada} J</small></div>
            <div className='attendance-actions'>
              {['presente','falta','justificada'].map(estado => <button key={estado} type='button' disabled={ocupado} className={registro?.estado === estado ? 'active '+estado : ''} onClick={() => registrar(alumno.id,estado,estado === 'justificada' ? 'Justificada por el maestro' : null)}>{estado === 'presente' ? 'Presente' : estado === 'falta' ? 'Falta' : 'Justificada'}</button>)}
              <button type='button' disabled={ocupado || !registro} onClick={() => registrar(alumno.id,null)}>Borrar</button>
              {registro?.estado === 'falta' && carta && <button type='button' disabled={ocupado} className='card-justify' onClick={() => justificarCarta(alumno,carta.id)}>Usar Crecehuesos</button>}
            </div>
            {registro?.nota && <small>Motivo: {registro.nota}</small>}
          </article>;
        })}</div>}
      </>}
    </section>
  </div>;
}
