import { useMemo, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { obtenerCasa } from '../../utils/gameUtils';

function CardModal({ carta, onClose, casasRivales = [], alumnosIntercambio = [], alumnosPuntos = [], alumnosCompanero = [], alumnosReplica = [], alumnosRobo = [], onSelectRival, onSelectExchange, onSelectPointSwap, onSelectCompanionBonus, onSelectReplica, onSelectRobbery, onSelectJokeDecision }) {
  const [companeroId, setCompaneroId] = useState('');
  const [rivalId, setRivalId] = useState('');
  const [roboIds, setRoboIds] = useState([]);
  const [roboProcesando, setRoboProcesando] = useState(false);
  const cartaActiva = carta || { casaId: 'gryffindor', tipo: '', puntos: 0, alumnoId: '' };
  const casa = obtenerCasa(cartaActiva.casaId);
  const puntosTexto = cartaActiva.tipo === 'proteccion' ? 'Protección activa' : (cartaActiva.tipo === 'intercambio' ? 'Intercambio mágico' : (cartaActiva.tipo === 'puntosIntercambio' ? 'Intercambio de puntos' : (cartaActiva.tipo === 'companeroBonus' ? 'Bonificación compartida' : (cartaActiva.tipo === 'replicaPuntos' ? 'Réplica de puntos' : (cartaActiva.tipo === 'roboMultiple' ? 'Robo de puntos' : (cartaActiva.tipo === 'decisionChiste' ? 'Decisión de chiste' : (cartaActiva.puntos > 0 ? '+' + cartaActiva.puntos + ' puntos' : String(cartaActiva.puntos) + ' puntos')))))));
  const esperaRival = cartaActiva.tipo === 'rival' && cartaActiva.pendienteRival;
  const esperaIntercambio = cartaActiva.tipo === 'intercambio' && cartaActiva.pendienteIntercambio;
  const esperaPuntosIntercambio = cartaActiva.tipo === 'puntosIntercambio' && cartaActiva.pendientePuntosIntercambio;
  const esperaCompaneroBonus = cartaActiva.tipo === 'companeroBonus' && cartaActiva.pendienteCompaneroBonus;
  const esperaReplicaPuntos = cartaActiva.tipo === 'replicaPuntos' && cartaActiva.pendienteReplicaPuntos;
  const esperaRoboMultiple = cartaActiva.tipo === 'roboMultiple' && cartaActiva.pendienteRoboMultiple;
  const esperaDecisionChiste = cartaActiva.tipo === 'decisionChiste' && cartaActiva.pendienteDecisionChiste;
  const tieneDecisionPendiente = esperaRival || esperaIntercambio || esperaPuntosIntercambio || esperaCompaneroBonus || esperaReplicaPuntos || esperaRoboMultiple || esperaDecisionChiste;
  const miCasa = cartaActiva.casaId;
  const alumnosMiCasa = useMemo(() => alumnosIntercambio.filter((alumno) => alumno.casaId === miCasa && alumno.id !== cartaActiva.alumnoId), [alumnosIntercambio, cartaActiva.alumnoId, miCasa]);
  const alumnosRivales = useMemo(() => alumnosIntercambio.filter((alumno) => alumno.casaId !== miCasa), [alumnosIntercambio, miCasa]);
  const casaPropiaDisponible = alumnosIntercambio.some((alumno) => alumno.id === cartaActiva.alumnoId);
  const alumnosParaPuntos = useMemo(() => alumnosPuntos.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosPuntos, cartaActiva.alumnoId]);
  const alumnosParaCompanero = useMemo(() => alumnosCompanero.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosCompanero, cartaActiva.alumnoId]);
  const alumnosParaReplica = useMemo(() => alumnosReplica.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosReplica, cartaActiva.alumnoId]);
  const alumnosParaRobo = useMemo(() => alumnosRobo.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosRobo, cartaActiva.alumnoId]);
  const alternarRobo = (alumnoId) => {
    if (roboProcesando) return;
    setRoboIds((actuales) => {
      if (actuales.includes(alumnoId)) return actuales.filter((id) => id !== alumnoId);
      if (actuales.length >= 5) return actuales;
      const siguientes = [...actuales, alumnoId];
      if (siguientes.length === 5) {
        setRoboProcesando(true);
        Promise.resolve(onSelectRobbery?.(siguientes))
          .then((resultado) => {
            if (resultado === false) setRoboProcesando(false);
          })
          .catch(() => setRoboProcesando(false));
      }
      return siguientes;
    });
  };

  if (!carta) return null;

  return (
    <section className={'card-modal ' + (tieneDecisionPendiente ? 'has-options' : 'simple-card-modal') + (esperaRoboMultiple ? ' morsmordre-modal' : '')} role='dialog' aria-modal='true'>
      <button type='button' className='modal-close' onClick={onClose} aria-label='Cerrar carta'><FaXmark /></button>
      <div className={'modal-card-wrap ' + (!tieneDecisionPendiente ? 'clickable-card' : '')} onClick={!tieneDecisionPendiente ? onClose : undefined} title={!tieneDecisionPendiente ? 'Toca la carta para cerrar' : undefined}>
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
                <option value=''>Compañero de mi casa</option>
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
        {esperaPuntosIntercambio && (
          <div className='point-swap-options' aria-label='Intercambio de puntos'>
            <small>Elige un alumno. Si eres lider absoluto, absorbes sus puntos; si no, intercambian puntos.</small>
            {alumnosParaPuntos.length === 0 && <span>No hay otros alumnos disponibles.</span>}
            <div>
              {alumnosParaPuntos.map((alumno) => {
                const casaAlumno = obtenerCasa(alumno.casaId);
                return (
                  <button key={alumno.id} type='button' className='point-swap-choice' style={{ '--house': casaAlumno.color, '--metal': casaAlumno.metal }} onClick={() => onSelectPointSwap?.(alumno.id)}>
                    {alumno.nombre} - {casaAlumno.nombre} - {alumno.puntos} pts
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {esperaCompaneroBonus && (
          <div className='companion-bonus-options' aria-label='Elegir compañero'>
            <small>Elige un compañero: ambos ganan +2 puntos.</small>
            {alumnosParaCompanero.length === 0 && <span>No hay otro compañero disponible.</span>}
            <div>
              {alumnosParaCompanero.map((alumno) => {
                const casaAlumno = obtenerCasa(alumno.casaId);
                return (
                  <button key={alumno.id} type='button' className='companion-bonus-choice' style={{ '--house': casaAlumno.color, '--metal': casaAlumno.metal }} onClick={() => onSelectCompanionBonus?.(alumno.id)}>
                    {alumno.nombre} - {casaAlumno.nombre} - {alumno.puntos} pts
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {esperaReplicaPuntos && (
          <div className='point-swap-options' aria-label='Réplica de puntos'>
            <small>Elige un alumno disponible. Puede ser de tu casa, pero no de una casa protegida.</small>
            {alumnosParaReplica.length === 0 && <span>No hay alumnos disponibles para replicar.</span>}
            <div>
              {alumnosParaReplica.map((alumno) => {
                const casaAlumno = obtenerCasa(alumno.casaId);
                return (
                  <button key={alumno.id} type='button' className='point-swap-choice' style={{ '--house': casaAlumno.color, '--metal': casaAlumno.metal }} onClick={() => onSelectReplica?.(alumno.id)}>
                    {alumno.nombre} - {casaAlumno.nombre} - {alumno.puntos} pts
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {esperaRoboMultiple && (
          <div className='point-swap-options' aria-label='Robo de puntos'>
            <small>Elige exactamente 5 alumnos. Cada uno pierde 1 punto y tu casa gana +5.</small>
            {alumnosParaRobo.length < 5 && <span>No hay 5 alumnos disponibles.</span>}
            <div>
              {alumnosParaRobo.map((alumno) => {
                const casaAlumno = obtenerCasa(alumno.casaId);
                const seleccionado = roboIds.includes(alumno.id);
                return (
                  <button key={alumno.id} type='button' disabled={roboProcesando} className={'point-swap-choice ' + (seleccionado ? 'selected' : '')} style={{ '--house': casaAlumno.color, '--metal': casaAlumno.metal }} onClick={() => alternarRobo(alumno.id)}>
                    {seleccionado ? '[x] ' : ''}{alumno.nombre} - {casaAlumno.nombre} - {alumno.puntos} pts
                  </button>
                );
              })}
            </div>
            <span className='morsmordre-counter'>{roboProcesando ? 'Aplicando Morsmordre...' : 'Seleccionados ' + roboIds.length + '/5. Al elegir el quinto se aplica automaticamente.'}</span>
          </div>
        )}
        {esperaDecisionChiste && (
          <div className='joke-decision-options' aria-label='Decisión de Riddikulus'>
            <small>Pasa al frente a contar un chiste frente al salón.</small>
            <div>
              <button type='button' className='joke-choice accept' onClick={() => onSelectJokeDecision?.(true)}>Sí, contar chiste (+2)</button>
              <button type='button' className='joke-choice reject' onClick={() => onSelectJokeDecision?.(false)}>No, me niego (-2)</button>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

export default CardModal;
