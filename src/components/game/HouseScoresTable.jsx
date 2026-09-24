import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { tablaPuntajesCasa, validarTablaPuntajes } from '../../utils/houseScores';

function HouseScoresTable({ estado, casaId, editable, onSave, ref }) {
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [salidaPendiente, setSalidaPendiente] = useState(null);
  const enCurso = useRef(false);
  const actual = tablaPuntajesCasa(estado,casaId);
  const tabla = edicion?.tabla ?? actual;
  const nombres = new Map(estado.alumnos.map((a) => [a.id,a.nombre]));
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
      aria-label={label} value={valor} disabled={guardando}
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
  const navegarCelda = (event) => {
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
    if (!edicion && !guardando) return undefined;
    const avisar = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload',avisar);
    return () => window.removeEventListener('beforeunload',avisar);
  }, [edicion,guardando]);
  useImperativeHandle(ref, () => ({
    requestClose(continuar) {
      if (enCurso.current) return;
      if (edicion) setSalidaPendiente(() => continuar);
      else continuar();
    }
  }));
  return <><form className='house-detail-table-wrap' onSubmit={guardar}>
    <div className='house-score-table-scroll'>
    <table className='house-detail-table' onKeyDown={navegarCelda}>
      <thead><tr><th scope='col'>Nombre</th><th scope='col'>Puntos positivos</th><th scope='col'>Puntos negativos</th><th scope='col'>Total</th></tr></thead>
      <tbody>
        {tabla.alumnos.map((a) => <tr key={a.id}>
          <td>{nombres.get(a.id) || 'Alumno'}</td>
          <td>{celda(a.id,'positivos',a.positivos,'Puntos positivos de '+nombres.get(a.id))}</td>
          <td>{celda(a.id,'negativos',a.negativos,'Puntos negativos de '+nombres.get(a.id))}</td>
          <td>{Number(a.positivos)-Number(a.negativos)}</td>
        </tr>)}
        <tr className='house-general-score'>
          <td>Puntos negativos aplicados a la casa en general</td><td>0</td>
          <td>{celda(null,'generalNegativo',tabla.generalNegativo,'Puntos negativos aplicados a la casa en general')}</td>
          <td>{-Number(tabla.generalNegativo)}</td>
        </tr>
        {(Number(tabla.generalPositivo)>0 || Number(actual.generalPositivo)>0) && <tr className='house-general-score'>
          <td>Puntos positivos aplicados a la casa en general</td>
          <td>{celda(null,'generalPositivo',tabla.generalPositivo,'Puntos positivos aplicados a la casa en general')}</td>
          <td>0</td><td>{Number(tabla.generalPositivo)}</td>
        </tr>}
      </tbody>
      <tfoot><tr className='house-detail-total'><td>Total de casa</td><td>{positivos}</td><td>{negativos}</td><td>{positivos-negativos}</td></tr></tfoot>
    </table>
    </div>
    {editable && <div className='house-score-editor-actions'>
      <p className='house-detail-note'>Edita positivos y negativos. Los totales se calculan automáticamente.</p>
      <button type='submit' disabled={!edicion || guardando}>{guardando ? 'Actualizando…' : 'Actualizar puntajes'}</button>
      {edicion && <button type='button' disabled={guardando} onClick={() => { setEdicion(null); setMensaje(''); }}>Descartar cambios</button>}
    </div>}
    {mensaje && <p role='status' className='house-detail-note'>{mensaje}</p>}
  </form>
  {salidaPendiente && <div className='unsaved-overlay' role='alertdialog' aria-modal='true' aria-labelledby='unsaved-title'>
    <div className='unsaved-card'>
      <h2 id='unsaved-title'>Tienes cambios sin guardar</h2>
      <p>Guarda los puntajes antes de salir o descarta los cambios.</p>
      {mensaje && <p role='alert'>{mensaje}</p>}
      <button type='button' autoFocus disabled={guardando} onClick={() => setSalidaPendiente(null)}>Seguir editando</button>
      <button type='button' disabled={guardando} onClick={() => { setEdicion(null); setSalidaPendiente(null); salidaPendiente(); }}>Descartar y salir</button>
      <button type='button' disabled={guardando} onClick={() => guardar(null,true)}>{guardando ? 'Guardando…' : 'Guardar y salir'}</button>
    </div>
  </div>}</>;
}
export default HouseScoresTable;