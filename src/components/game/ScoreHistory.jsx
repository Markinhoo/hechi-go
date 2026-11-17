import { obtenerCasa } from '../../utils/gameUtils';

function ScoreHistory({ estado, maestro, onUndo, deshaciendo, className = '' }) {
  const operaciones = estado.historialPuntajes ?? [];
  return <aside className={'panel history parchment-panel score-history '+className}>
    <h2>Hechizos realizados</h2>
    <p className='score-history-intro'>Cartas usadas y cambios de puntos de la clase.</p>
    <div className='spell-history-list'>
      {!estado.historial?.length && <p className='empty'>Todavía no se han usado hechizos.</p>}
      {(estado.historial ?? []).map(item => <article className='spell-history-entry' key={item.id}>
        <strong>{item.titulo || 'Carta'}</strong><span>{item.alumno}</span><p>{item.descripcion}</p>
      </article>)}
    </div>
    <details className='score-history-adjustments'>
      <summary>Ver ajustes de puntos ({operaciones.length})</summary>
    {!operaciones.length && <p className='empty'>Los nuevos cambios mostrarán quién los hizo, quién los recibió y su saldo antes y después.</p>}
    {operaciones.map((op) => <article className='score-history-operation' key={op.id}>
      <strong>{op.actor} · {op.titulo}</strong>
      <time dateTime={op.createdAt}>{new Date(op.createdAt).toLocaleString('es-MX')}</time>
      {op.deshecha && <span className='score-history-reverted'>Ajuste deshecho</span>}
      <ul>{op.movimientos.map((m,i) => <li key={i}>
        <span>{m.tipo==='casa' ? 'Total de '+obtenerCasa(m.objetivoId).nombre : m.nombre}</span>
        <b>{m.antes.total} → {m.despues?.total ?? 'Eliminado'}</b>
        {m.despues && <small>
          Positivos: {m.antes.positivos} → {m.despues.positivos} · Negativos: {m.antes.negativos} → {m.despues.negativos}
          {m.tipo==='alumno' && m.antes.casaId!==m.despues.casaId &&
            ' · '+obtenerCasa(m.antes.casaId).nombre+' → '+obtenerCasa(m.despues.casaId).nombre}
        </small>}
      </li>)}</ul>
      {maestro && op.puedeDeshacer && <button type='button' disabled={deshaciendo}
        onClick={() => onUndo(op.id)}>{deshaciendo ? 'Deshaciendo…' : 'Deshacer este ajuste'}</button>}
    </article>)}
    </details>
  </aside>;
}
export default ScoreHistory;
