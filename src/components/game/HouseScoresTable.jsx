import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { tablaPuntajesCasa, validarTablaPuntajes } from '../../utils/houseScores';

function HouseScoresTable({ estado, casaId, editable, onSave, onSaveGalleons, ref }) {
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [galeonesEditando, setGaleonesEditando] = useState(null);
  const [galeonesGuardando, setGaleonesGuardando] = useState(false);
  const [galeonesMensaje, setGaleonesMensaje] = useState('');
  const [salidaPendiente, setSalidaPendiente] = useState(null);
  const enCurso = useRef(false);
  const actual = tablaPuntajesCasa(estado,casaId);
  const tabla = edicion?.tabla ?? actual;
  const nombres = new Map(estado.alumnos.map((a) => [a.id,a.nombre]));
  const galeones = new Map(estado.alumnos.map((a) => [a.id,a.galeones ?? 0]));
  const participaciones = new Map(estado.alumnos.map((a) => [a.id, a.cartas?.length || 0]));
  const cambiar = (id,campo,valor) => {
    setMensaje('');
    setEdicion((prev) => {
      const base = prev ?? { original: actual, tabla: actual };
      return { ...base, tabla: id ? { ...base.tabla,
        alumnos:base.tabla.alumnos.map((a) => a.id===id ? { ...a,[campo]:valor } : a)
      } : { ...base.tabla,[campo]:valor } };
    });
  };
  const celda = (id,campo,valor,label) => editable ?
    <input type='number' min='0' max='2147483647' step='1' inputMode='numeric'
      aria-label={label} value={valor} disabled={guardando || Boolean(galeonesEditando)}
      onChange={(e) => cambiar(id,campo,e.target.value)}
      onFocus={(e) => e.target.select()} /> : valor;
  const positivos = tabla.alumnos.reduce((s,a) => s+Number(a.positivos),Number(tabla.generalPositivo));
  const negativos = tabla.alumnos.reduce((s,a) => s+Number(a.negativos),Number(tabla.generalNegativo));
  const guardar = async (event, salirDespues = false) => {
    event?.preventDefault();
    if (!edicion || enCurso.current) return;
    enCurso.current = true;
    setGuardando(true);
    setMensaje('');
    try {
      const validada = validarTablaPuntajes(tabla);
      await onSave(validada,edicion.original);
      setEdicion(null);
      setMensaje('Puntajes actualizados.');
      if (salirDespues) { setSalidaPendiente(null); salidaPendiente?.(); }
    } catch (error) {
      setMensaje(error.message || 'No se pudieron guardar los puntajes.');
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  };
  const guardarGaleones = async (salirDespues = false) => {
    if (!galeonesEditando || galeonesGuardando) return;
    const { alumnoId, valor, anterior } = galeonesEditando;
    if (!/^\d+$/.test(valor) || !Number.isSafeInteger(Number(valor)) || Number(valor) > 2147483647) {
      setGaleonesMensaje('Escribe un saldo válido entre 0 y 2,147,483,647.');
      return;
    }
    const alumno = estado.alumnos.find(a => a.id === alumnoId);
    if (!alumno) { setGaleonesMensaje('El alumno ya no está en la lista.'); return; }
    setGaleonesGuardando(true);
    setGaleonesMensaje('');
    try {
      await onSaveGalleons(alumno,Number(valor),anterior);
      setGaleonesEditando(null);
      setGaleonesMensaje(`${alumno.nombre}: ${Number(valor).toLocaleString('es-MX')} galeones guardados.`);
      if (salirDespues) { setSalidaPendiente(null); salidaPendiente?.(); }
    } catch (error) {
      setGaleonesMensaje(error.message || 'No se pudo actualizar el saldo.');
    } finally { setGaleonesGuardando(false); }
  };
  const navegarCelda = (event) => {
    if (event.target.classList.contains('house-score-galleons-input')) return;
    if (event.target.tagName !== 'INPUT' || !['Enter','ArrowUp','ArrowDown'].includes(event.key)) return;
    event?.preventDefault();
    const celdaActual = event.target.closest('td');
    const fila = celdaActual.parentElement;
    const filas = [...fila.parentElement.rows];
    const paso = event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1;
    for (let i=filas.indexOf(fila)+paso; i>=0 && i<filas.length; i+=paso) {
      const input = filas[i].cells[celdaActual.cellIndex]?.querySelector('input');
      if (input) { input.focus(); break; }
    }
  };
  useEffect(() => {
    if (!edicion && !guardando && !galeonesEditando && !galeonesGuardando) return undefined;
    const avisar = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload',avisar);
    return () => window.removeEventListener('beforeunload',avisar);
  }, [edicion,guardando,galeonesEditando,galeonesGuardando]);
  useImperativeHandle(ref, () => ({
    requestClose(continuar) {
      if (enCurso.current || galeonesGuardando) return;
      if (edicion || galeonesEditando) setSalidaPendiente(() => continuar);
      else continuar();
    }
  }));
  return <><form className='house-detail-table-wrap' onSubmit={guardar}>
    <div className='house-score-table-scroll'>
    <table className='house-detail-table' onKeyDown={navegarCelda}>
      <thead><tr><th scope='col'>Nombre</th><th scope='col' aria-label='Participaciones' title='Participaciones'>P</th><th scope='col'>Puntos positivos</th><th scope='col'>Puntos negativos</th><th scope='col'>Total</th></tr></thead>
      <tbody>
        {tabla.alumnos.map((a) => <tr key={a.id}>
          <td><span className='house-score-student-name'>{nombres.get(a.id) || 'Alumno'}</span>
            {galeonesEditando?.alumnoId === a.id ? <span className='house-score-galleons-editor'>
              <input className='house-score-galleons-input' type='number' min='0' max='2147483647' step='1' inputMode='numeric' autoFocus
                aria-label={'Nuevo saldo de galeones de '+nombres.get(a.id)} value={galeonesEditando.valor} disabled={galeonesGuardando}
                onChange={event => { setGaleonesEditando(actual => ({...actual,valor:event.target.value})); setGaleonesMensaje(''); }}
                onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); void guardarGaleones(); } }} />
              <span><button type='button' disabled={galeonesGuardando} onClick={() => void guardarGaleones()}>{galeonesGuardando ? 'Guardando…' : 'Actualizar'}</button>
                <button type='button' disabled={galeonesGuardando} onClick={() => { setGaleonesEditando(null); setGaleonesMensaje(''); }}>Cancelar</button></span>
            </span> : <span className='house-score-galleons-display'><small className='house-score-student-galleons'>{Number(galeones.get(a.id) || 0).toLocaleString('es-MX')} galeones</small>
              {editable && onSaveGalleons && <button type='button' disabled={guardando || Boolean(edicion) || Boolean(galeonesEditando)}
                aria-label={'Editar galeones de '+nombres.get(a.id)} onClick={() => { setGaleonesEditando({alumnoId:a.id,valor:String(galeones.get(a.id) || 0),anterior:galeones.get(a.id) || 0}); setGaleonesMensaje(''); }}>Editar</button>}</span>}
          </td>
          <td>{participaciones.get(a.id) || 0}</td>
          <td>{celda(a.id,'positivos',a.positivos,'Puntos positivos de '+nombres.get(a.id))}</td>
          <td>{celda(a.id,'negativos',a.negativos,'Puntos negativos de '+nombres.get(a.id))}</td>
          <td>{Number(a.positivos)-Number(a.negativos)}</td>
        </tr>)}
        <tr className='house-general-score'>
          <td>Puntos negativos aplicados a la casa en general</td><td>—</td><td>0</td>
          <td>{celda(null,'generalNegativo',tabla.generalNegativo,'Puntos negativos aplicados a la casa en general')}</td>
          <td>{-Number(tabla.generalNegativo)}</td>
        </tr>
        {(Number(tabla.generalPositivo)>0 || Number(actual.generalPositivo)>0) && <tr className='house-general-score'>
          <td>Puntos positivos aplicados a la casa en general</td>
          <td>—</td><td>{celda(null,'generalPositivo',tabla.generalPositivo,'Puntos positivos aplicados a la casa en general')}</td>
          <td>0</td><td>{Number(tabla.generalPositivo)}</td>
        </tr>}
      </tbody>
      <tfoot><tr className='house-detail-total'><td>Total de casa</td><td /><td>{positivos}</td><td>{negativos}</td><td>{positivos-negativos}</td></tr></tfoot>
    </table>
    </div>
    {editable && <div className='house-score-editor-actions'>
      <p className='house-detail-note'>Edita positivos y negativos. Los totales se calculan automáticamente.</p>
      <button type='submit' disabled={!edicion || guardando || Boolean(galeonesEditando)}>{guardando ? 'Actualizando…' : 'Actualizar puntajes'}</button>
      {edicion && <button type='button' disabled={guardando} onClick={() => { setEdicion(null); setMensaje(''); }}>Descartar cambios</button>}
    </div>}
    {mensaje && <p role='status' className='house-detail-note'>{mensaje}</p>}
    {galeonesMensaje && <p role={galeonesEditando ? 'alert' : 'status'} className='house-detail-note'>{galeonesMensaje}</p>}
  </form>
  {salidaPendiente && <div className='unsaved-overlay' role='alertdialog' aria-modal='true' aria-labelledby='unsaved-title'>
    <div className='unsaved-card'>
      <h2 id='unsaved-title'>Tienes cambios sin guardar</h2>
      <p>Guarda los {galeonesEditando ? 'galeones' : 'puntajes'} antes de salir o descarta los cambios.</p>
      {(mensaje || galeonesMensaje) && <p role='alert'>{mensaje || galeonesMensaje}</p>}
      <button type='button' autoFocus disabled={guardando || galeonesGuardando} onClick={() => setSalidaPendiente(null)}>Seguir editando</button>
      <button type='button' disabled={guardando || galeonesGuardando} onClick={() => { setEdicion(null); setGaleonesEditando(null); setSalidaPendiente(null); salidaPendiente(); }}>Descartar y salir</button>
      <button type='button' disabled={guardando || galeonesGuardando} onClick={() => galeonesEditando ? guardarGaleones(true) : guardar(null,true)}>{guardando || galeonesGuardando ? 'Guardando…' : 'Guardar y salir'}</button>
    </div>
  </div>}</>;
}
export default HouseScoresTable;
