import { useEffect, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaWandMagicSparkles } from 'react-icons/fa6';
import { casas, TOTAL_CARTAS } from '../../data/gameData';
import { db } from '../../services/hechiApi';
import { efectoCarta, obtenerCasa, randomEntero } from '../../utils/gameUtils';
import CardModal from './CardModal';

function GameView({ sesion, setSesion, estado, setEstado, setModo, mensaje, setMensaje }) {
  const [arrastre, setArrastre] = useState({ activo: false, inicio: 0, delta: 0 });
  const [cartaAbierta, setCartaAbierta] = useState(null);
  const sobres = Array.from({ length: 7 }, (_, index) => index);

  const refrescar = async (token) => {
    const { data, error } = await db.rpc('cargar_clase', { p_token: token });
    if (error) return setMensaje(error.message);
    setEstado(data);
    return data;
  };

  const autorizar = async (alumnoId) => {
    const { data, error } = await db.rpc('autorizar_participacion', { p_token: sesion.token, p_pin: sesion.pin, p_alumno_id: alumnoId });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Participacion autorizada.');
  };

  const solicitarCarta = async () => {
    if (sesion.tipo !== 'alumno') return;
    const alumno = estado.alumnos.find((item) => item.id === sesion.alumnoId);
    if (!alumno) return setMensaje('No encuentro tu usuario en esta clase.');
    if (alumno.oportunidades > 0) return setMensaje('Ya tienes una oportunidad autorizada. Ahora abre una carta.');
    const { data, error } = await db.rpc('solicitar_carta', { p_token: sesion.token, p_alumno_id: sesion.alumnoId, p_password: sesion.password });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Solicitud enviada al maestro.');
  };

  const cambiarPassword = async (alumno) => {
    const nueva = window.prompt('Nueva contrasena para ' + alumno.nombre);
    if (!nueva) return;
    const { data, error } = await db.rpc('cambiar_password_alumno', { p_token: sesion.token, p_pin: sesion.pin, p_alumno_id: alumno.id, p_password: nueva });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Contrasena actualizada para ' + alumno.nombre + '.');
  };

  const reiniciarClase = async () => {
    if (sesion.tipo !== 'maestro') return;
    if (!window.confirm('Reiniciar esta clase borrara alumnos, puntos, cartas, solicitudes e historial. El token se conserva.')) return;
    const { data, error } = await db.rpc('reiniciar_clase', { p_token: sesion.token, p_pin: sesion.pin });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Clase reiniciada desde cero. El token sigue siendo ' + data.token + '.');
  };

  const eliminarClase = async () => {
    if (sesion.tipo !== 'maestro') return;
    if (!window.confirm('Eliminar esta clase borrara definitivamente grupo, alumnos, puntos y token.')) return;
    const { error } = await db.rpc('eliminar_clase', { p_token: sesion.token, p_pin: sesion.pin });
    if (error) return setMensaje(error.message);
    setSesion(null);
    setEstado(null);
    setModo('maestro');
    setMensaje('Clase eliminada.');
  };

  const moverSobre = (direccion) => {
    setEstado((actual) => ({ ...actual, sobreActivo: (actual.sobreActivo + direccion + sobres.length) % sobres.length }));
  };

  const abrirCarta = async () => {
    if (sesion.tipo !== 'alumno') return setMensaje('Solo el alumno puede abrir su carta.');
    const alumno = estado.alumnos.find((item) => item.id === sesion.alumnoId);
    if (!alumno || alumno.oportunidades <= 0) return setMensaje('Necesitas autorizacion del maestro para abrir carta.');
    const numero = randomEntero(TOTAL_CARTAS) + 1;
    const efecto = efectoCarta(numero);
    const { data, error } = await db.rpc('abrir_carta', { p_token: sesion.token, p_alumno_id: sesion.alumnoId, p_password: sesion.password, p_numero: numero, p_puntos: efecto.puntos, p_titulo: efecto.titulo, p_descripcion: efecto.descripcion });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId });
    setMensaje(obtenerCasa(alumno.casaId).nombre + ' gana ' + efecto.puntos + ' puntos.');
  };

  const iniciarArrastre = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setArrastre({ activo: true, inicio: event.clientX, delta: 0 });
  };

  const moverArrastre = (event) => {
    if (arrastre.activo) setArrastre((actual) => ({ ...actual, delta: Math.max(-220, Math.min(220, event.clientX - actual.inicio)) }));
  };

  const cerrarArrastre = () => {
    if (!arrastre.activo) return;
    const pasos = Math.trunc(arrastre.delta / 110);
    if (Math.abs(arrastre.delta) > 42) moverSobre(pasos !== 0 ? -pasos : arrastre.delta < 0 ? 1 : -1);
    setArrastre({ activo: false, inicio: 0, delta: 0 });
  };

  useEffect(() => {
    if (!sesion?.token || !estado?.token) return undefined;
    const id = window.setInterval(async () => {
      const { data } = await db.rpc('cargar_clase', { p_token: sesion.token });
      if (data) setEstado(data);
    }, 1800);
    return () => window.clearInterval(id);
  }, [sesion?.token, estado?.token, setEstado]);

  const salir = () => { setSesion(null); setEstado(null); setModo('inicio'); setCartaAbierta(null); };
  const alumnoActual = sesion.tipo === 'alumno' ? estado.alumnos.find((alumno) => alumno.id === sesion.alumnoId) : null;
  const casaActual = obtenerCasa(alumnoActual?.casaId);

  return (
    <main className='game-shell app-fixed'>
      <header className='hero compact-hero'>
        <div>
          <span className='eyebrow'><FaWandMagicSparkles /> {sesion.tipo === 'maestro' ? 'Vista maestro' : 'Vista alumno'}</span>
          <h1>HECHI GO</h1>
          <p>{sesion.tipo === 'maestro' ? (estado.nombre + ' - Token de clase: ' + estado.token) : (estado.nombre + ' - Token ' + estado.token + ' - espera autorizacion para abrir carta.')}</p>
        </div>
        <div className='hero-actions'>
          {sesion.tipo === 'alumno' && <span className='player-badge' style={{ '--house': casaActual.color, '--metal': casaActual.metal }}>{alumnoActual?.nombre} - {casaActual.nombre} - {alumnoActual?.oportunidades || 0} oportunidades</span>}
          <button type='button' className='ghost' onClick={() => refrescar(estado.token)}>Actualizar</button>
          {sesion.tipo === 'maestro' && <button type='button' className='ghost danger-soft' onClick={reiniciarClase}>Reiniciar clase</button>}
          {sesion.tipo === 'maestro' && <button type='button' className='ghost danger-soft' onClick={eliminarClase}>Eliminar clase</button>}
          <button type='button' className='ghost' onClick={salir}>Salir</button>
        </div>
      </header>

      <section className='house-board'>
        {casas.map((casa) => (
          <article key={casa.id} className='house-card' style={{ '--house': casa.color, '--metal': casa.metal }}>
            <img className='house-crest' src={casa.escudo} alt='' />
            <span>{estado.conteos[casa.id]}/{estado.objetivos[casa.id]} aprendices</span>
            <h2>{casa.nombre}</h2>
            <strong>{estado.puntajes[casa.id]} pts</strong>
          </article>
        ))}
      </section>

      <section className='pocket-layout no-scroll-grid'>
        <aside className='panel roster hall-panel'>
          <h2>Gran salon</h2>
          <div className='students'>
            {[...estado.alumnos].sort((a, b) => b.puntos - a.puntos).map((alumno, index) => {
              const casa = obtenerCasa(alumno.casaId);
              return (
                <div className='student-row' key={alumno.id} style={{ '--house': casa.color, '--metal': casa.metal }}>
                  <span className='rank'>{index + 1}</span>
                  <span><strong>{alumno.nombre}</strong><small>{casa.nombre} - {alumno.cartas.length} cartas - {alumno.oportunidades} oportunidades</small></span>
                  <b>{alumno.puntos} pts</b>
                  {sesion.tipo === 'maestro' && <button type='button' className='authorize password' onClick={() => cambiarPassword(alumno)}>Contrasena</button>}
                </div>
              );
            })}
          </div>
        </aside>

        <section className={'pack-stage ' + (sesion.tipo === 'maestro' ? 'teacher-requests-stage' : '')}>
          {sesion.tipo === 'maestro' ? (
            <div className='request-board'>
              <span className='eyebrow'><FaWandMagicSparkles /> Solicitudes de carta</span>
              <h2>Permisos pendientes</h2>
              {(!estado.solicitudes || estado.solicitudes.length === 0) && <p className='empty light'>Cuando un alumno participe y pida carta, aparecera aqui para autorizarlo.</p>}
              <div className='request-list'>
                {(estado.solicitudes || []).map((solicitud) => {
                  const casa = obtenerCasa(solicitud.casaId);
                  return (
                    <article className='request-row' key={solicitud.id} style={{ '--house': casa.color, '--metal': casa.metal }}>
                      <img src={casa.escudo} alt='' />
                      <div><strong>{solicitud.alumno}</strong><span>{casa.nombre} solicita abrir carta</span></div>
                      <button type='button' onClick={() => autorizar(solicitud.alumnoId)}>Autorizar</button>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className='carousel-shell'>
                <button className='carousel-nav' type='button' onClick={() => moverSobre(-1)} aria-label='Carta anterior'><FaArrowLeft /></button>
                <div
                  className={'pack-carousel ' + (arrastre.activo ? 'dragging' : '')}
                  onPointerDown={iniciarArrastre}
                  onPointerMove={moverArrastre}
                  onPointerUp={cerrarArrastre}
                  onPointerCancel={cerrarArrastre}
                  onPointerLeave={cerrarArrastre}
                >
                  {sobres.map((sobre, index) => {
                    const offset = index - estado.sobreActivo;
                    const normal = offset > 3 ? offset - sobres.length : offset < -3 ? offset + sobres.length : offset;
                    const visualOffset = normal + (arrastre.activo ? arrastre.delta / 118 : 0);
                    const distancia = Math.min(3.4, Math.abs(visualOffset));
                    return (
                      <button type='button' key={sobre} className={'pack-card ' + (Math.abs(visualOffset) < 0.45 ? 'active' : '')} style={{ '--offset': visualOffset, '--distance': distancia }} onClick={() => normal === 0 ? abrirCarta() : setEstado({ ...estado, sobreActivo: index })}>
                        <img src='/hechi/card-back.png' alt='Reverso de carta HECHI' draggable='false' />
                      </button>
                    );
                  })}
                </div>
                <button className='carousel-nav' type='button' onClick={() => moverSobre(1)} aria-label='Carta siguiente'><FaArrowRight /></button>
              </div>
              <div className='student-card-actions'>
                <button type='button' className='request-card' onClick={solicitarCarta}>Solicitar autorizacion</button>
                <button type='button' className='open-pack' onClick={abrirCarta}>Abrir carta</button>
              </div>
            </>
          )}
          <p className='message'>{mensaje}</p>
        </section>

        <aside className='panel history parchment-panel'>
          <h2>Ultimos hechizos</h2>
          {estado.historial.length === 0 && <p className='empty'>Aun no se abre ninguna carta.</p>}
          {estado.historial.map((item) => <div className='history-row' key={item.id} style={{ '--house': obtenerCasa(item.casaId).color, '--metal': obtenerCasa(item.casaId).metal }}><strong>{item.alumno}</strong><span>{obtenerCasa(item.casaId).nombre} +{item.puntos}</span></div>)}
        </aside>
      </section>

      <CardModal carta={cartaAbierta} onClose={() => setCartaAbierta(null)} />
    </main>
  );
}

export default GameView;
