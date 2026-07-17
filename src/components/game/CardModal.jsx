import { useMemo, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { obtenerCasa } from '../../utils/gameUtils';

function CardModal({ carta, onClose, casasRivales = [], alumnosIntercambio = [], onSelectRival, onSelectExchange }) {
  const [companeroId, setCompaneroId] = useState('');
  const [rivalId, setRivalId] = useState('');
  const cartaActiva = carta || { casaId: 'gryffindor', tipo: '', puntos: 0, alumnoId: '' };
  const casa = obtenerCasa(cartaActiva.casaId);
  const puntosTexto = cartaActiva.tipo === 'proteccion' ? 'Proteccion activa' : (cartaActiva.tipo === 'intercambio' ? 'Intercambio magico' : (cartaActiva.puntos > 0 ? '+' + cartaActiva.puntos + ' puntos' : String(cartaActiva.puntos) + ' puntos'));
  const esperaRival = cartaActiva.tipo === 'rival' && cartaActiva.pendienteRival;
  const esperaIntercambio = cartaActiva.tipo === 'intercambio' && cartaActiva.pendienteIntercambio;
  const miCasa = cartaActiva.casaId;
  const alumnosMiCasa = useMemo(() => alumnosIntercambio.filter((alumno) => alumno.casaId === miCasa && alumno.id !== cartaActiva.alumnoId), [alumnosIntercambio, cartaActiva.alumnoId, miCasa]);
  const alumnosRivales = useMemo(() => alumnosIntercambio.filter((alumno) => alumno.casaId !== miCasa), [alumnosIntercambio, miCasa]);
  const casaPropiaDisponible = alumnosIntercambio.some((alumno) => alumno.id === cartaActiva.alumnoId);

  if (!carta) return null;

  return (
    <section className='card-modal' role='dialog' aria-modal='true'>
      <button type='button' className='modal-close' onClick={onClose} aria-label='Cerrar carta'><FaXmark /></button>
      <div className='modal-card-wrap'>
        <div className='modal-card-flip'>
          <div className='modal-card-face modal-card-back'><img src='/hechi/card-back.png' alt='' /></div>
          <div className='modal-card-face modal-card-front'><img src={'/hechi/card-' + carta.numero + '.png'} alt={'Carta ' + carta.numero} /></div>
        </div>
      </div>
      <article className={'modal-effect ' + (carta.puntos < 0 ? 'negative' : '')} style={{ '--house': casa.color, '--metal': casa.metal }}>
        <span>{carta.titulo}</span>
        <h2>{puntosTexto}</h2>
        <p>{carta.descripcion}</p>
        {esperaRival && (
          <div className='rival-options' aria-label='Selecciona una casa rival'>
            <small>Elige la casa rival que perdera {Math.abs(carta.puntos)} puntos</small>
            <div>
              {casasRivales.map((rival) => (
                <button
                  key={rival.id}
                  type='button'
                  className='rival-choice'
                  style={{ '--house': rival.color, '--metal': rival.metal }}
                  onClick={() => onSelectRival?.(rival.id)}
                >
                  {rival.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
        {esperaIntercambio && (
          <div className='exchange-options' aria-label='Opciones de intercambio'>
            <small>Elige como se hara el intercambio. No se puede usar una casa protegida.</small>
            {!casaPropiaDisponible && <span>Tu casa esta protegida, asi que Imperio no puede mover alumnos de tu casa.</span>}
            {casaPropiaDisponible && <div className='exchange-section'>
              <strong>Intercambiarme yo</strong>
              {alumnosRivales.length === 0 && <span>No hay alumnos disponibles de otra casa.</span>}
              {alumnosRivales.map((alumno) => {
                const casaAlumno = obtenerCasa(alumno.casaId);
                return (
                  <button key={alumno.id} type='button' className='exchange-choice' style={{ '--house': casaAlumno.color, '--metal': casaAlumno.metal }} onClick={() => onSelectExchange?.({ origenId: carta.alumnoId, destinoId: alumno.id })}>
                    Yo por {alumno.nombre} - {casaAlumno.nombre} - {alumno.puntos} pts
                  </button>
                );
              })}
            </div>}
            {casaPropiaDisponible && <div className='exchange-section'>
              <strong>Intercambiar a alguien de mi casa</strong>
              <select value={companeroId} onChange={(event) => setCompaneroId(event.target.value)}>
                <option value=''>Companero de mi casa</option>
                {alumnosMiCasa.map((alumno) => <option key={alumno.id} value={alumno.id}>{alumno.nombre} - {alumno.puntos} pts</option>)}
              </select>
              <select value={rivalId} onChange={(event) => setRivalId(event.target.value)}>
                <option value=''>Alumno de otra casa</option>
                {alumnosRivales.map((alumno) => <option key={alumno.id} value={alumno.id}>{alumno.nombre} - {obtenerCasa(alumno.casaId).nombre} - {alumno.puntos} pts</option>)}
              </select>
              <button type='button' className='exchange-apply' disabled={!companeroId || !rivalId} onClick={() => onSelectExchange?.({ origenId: companeroId, destinoId: rivalId })}>Aplicar intercambio</button>
            </div>}
          </div>
        )}
      </article>
    </section>
  );
}

export default CardModal;
