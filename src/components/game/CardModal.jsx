import { useMemo, useRef, useState } from 'react';
import { FaXmark } from 'react-icons/fa6';
import { obtenerCasa } from '../../utils/gameUtils';

function CardModal({ carta, onClose, casasRivales = [], casaProtegida = null, alumnosIntercambio = [], alumnosPuntos = [], alumnosCompanero = [], alumnosReplica = [], alumnosRobo = [], onSelectRival, onSelectExchange, onSelectPointSwap, onSelectCompanionBonus, onSelectReplica, onSelectRobbery, onSelectJokeDecision }) {
  const [modoImperio, setModoImperio] = useState(null);
  const [companeroId, setCompaneroId] = useState('');
  const [rivalId, setRivalId] = useState('');
  const [roboIds, setRoboIds] = useState([]);
  const [roboProcesando, setRoboProcesando] = useState(false);
  const [roboError, setRoboError] = useState('');
  const roboEnCurso = useRef(false);
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
  const alumnosMiCasa = useMemo(() => alumnosIntercambio.filter((alumno) => alumno.casaId === miCasa && alumno.casaId !== casaProtegida && alumno.id !== cartaActiva.alumnoId), [alumnosIntercambio, cartaActiva.alumnoId, miCasa, casaProtegida]);
  const alumnosRivales = useMemo(() => alumnosIntercambio.filter((alumno) => alumno.casaId !== miCasa && alumno.casaId !== casaProtegida), [alumnosIntercambio, miCasa, casaProtegida]);
  const casaPropiaDisponible = alumnosIntercambio.some((alumno) => alumno.id === cartaActiva.alumnoId && alumno.casaId !== casaProtegida);
  const alumnosParaPuntos = useMemo(() => alumnosPuntos.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosPuntos, cartaActiva.alumnoId]);
  const alumnosParaCompanero = useMemo(() => alumnosCompanero.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosCompanero, cartaActiva.alumnoId]);
  const alumnosParaReplica = useMemo(() => alumnosReplica.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosReplica, cartaActiva.alumnoId]);
  const alumnosParaRobo = useMemo(() => alumnosRobo.filter((alumno) => alumno.id !== cartaActiva.alumnoId), [alumnosRobo, cartaActiva.alumnoId]);
  const aplicarRobo = async (objetivoIds) => {
    if (roboEnCurso.current || objetivoIds.length !== 5) return;
    roboEnCurso.current = true;
    setRoboProcesando(true);
    setRoboError('');
    try {
      const resultado = await onSelectRobbery?.(objetivoIds);
      if (resultado !== true) setRoboError('No se pudo aplicar Morsmordre. Revisa la seleccion e intenta de nuevo.');
    } catch (error) {
      setRoboError(error.message || 'No se pudo aplicar Morsmordre. Intenta de nuevo.');
    } finally {
      roboEnCurso.current = false;
      setRoboProcesando(false);
    }
  };
  const alternarRobo = (alumnoId) => {
    if (roboEnCurso.current) return;
    setRoboError('');
    if (roboIds.includes(alumnoId)) {
      setRoboIds(roboIds.filter((id) => id !== alumnoId));
      return;
    }
    if (roboIds.length >= 5) return;
    const siguientes = [...roboIds, alumnoId];
    setRoboIds(siguientes);
    if (siguientes.length === 5) void aplicarRobo(siguientes);
  };
  if (!carta) return null;

  return (
    <section className={'card-modal ' + (tieneDecisionPendiente ? 'has-options' : 'simple-card-modal') + (esperaRoboMultiple ? ' morsmordre-modal' : '') + (esperaIntercambio ? ' imperio-modal' : '')} role='dialog' aria-modal='true'>
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
            {!casaPropiaDisponible && <span>Tu casa está protegida y no puede intercambiar alumnos.</span>}
            {!modoImperio && <div className='exchange-section'>
              <strong>¿Qué quieres hacer?</strong>
              <button type='button' className='exchange-choice' disabled={!casaPropiaDisponible} onClick={() => setModoImperio('yo')}>Cambiarme a otra casa</button>
              <button type='button' className='exchange-choice' disabled={!casaPropiaDisponible || !alumnosMiCasa.length} onClick={() => setModoImperio('companero')}>Intercambiar a alguien de mi casa</button>
              {!alumnosMiCasa.length && <span>No hay compañeros de tu casa disponibles.</span>}
            </div>}
            {modoImperio && <button type='button' className='exchange-apply' onClick={() => setModoImperio(null)}>Volver a las opciones</button>}
            {modoImperio === 'yo' && <div className='exchange-section'>
              <strong>Elige con quién cambiarte de casa</strong>
              <small>Los alumnos de tu casa y de casas protegidas no se pueden elegir.</small>
              {alumnosIntercambio.map((alumno) => {
                const casaAlumno = obtenerCasa(alumno.casaId);
                const disponible = casaPropiaDisponible && alumno.casaId !== miCasa && alumno.casaId !== casaProtegida;
                return <button key={alumno.id} type='button' className='exchange-choice' disabled={!disponible} style={{ '--house': casaAlumno.color, '--metal': casaAlumno.metal }} onClick={() => onSelectExchange?.({ origenId: carta.alumnoId, destinoId: alumno.id })}>
                  {alumno.nombre} - {casaAlumno.nombre} - {alumno.puntos} pts
                </button>;
              })}
            </div>}
            {modoImperio === 'companero' && <div className='exchange-section'>
              <strong>¿A quién intercambiarás y por quién?</strong>
              <label>Compañero de mi casa
                <select value={companeroId} onChange={(event) => setCompaneroId(event.target.value)}>
                  <option value=''>Selecciona un compañero</option>
                  {alumnosMiCasa.map((alumno) => <option key={alumno.id} value={alumno.id}>{alumno.nombre} - {alumno.puntos} pts</option>)}
                </select>
              </label>
              <label>Alumno de otra casa
                <select value={rivalId} onChange={(event) => setRivalId(event.target.value)}>
                  <option value=''>Selecciona con quién intercambiar</option>
                  {alumnosRivales.map((alumno) => <option key={alumno.id} value={alumno.id}>{alumno.nombre} - {obtenerCasa(alumno.casaId).nombre} - {alumno.puntos} pts</option>)}
                </select>
              </label>
              <button type='button' className='exchange-apply' disabled={!alumnosMiCasa.some((a) => a.id === companeroId) || !alumnosRivales.some((a) => a.id === rivalId)} onClick={() => onSelectExchange?.({ origenId: companeroId, destinoId: rivalId })}>Aplicar intercambio</button>
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
            {roboError && <p role='alert'>{roboError}</p>}
            {roboError && roboIds.length === 5 && <button type='button' className='exchange-apply' disabled={roboProcesando} onClick={() => aplicarRobo(roboIds)}>Reintentar Morsmordre</button>}
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
