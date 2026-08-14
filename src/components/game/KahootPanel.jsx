import { useEffect, useState } from 'react';
import { db, supabase } from '../../services/hechiApi';

const KAHOOT_FORM_INICIAL = { pregunta: '', opcionA: '', opcionB: '', opcionC: '', opcionD: '', correcta: 'a' };
const KAHOOT_OPCIONES = ['a', 'b', 'c', 'd'];

function KahootPanel({ sesion, estado, setEstado, setMensaje }) {
  const [kahootForm, setKahootForm] = useState(KAHOOT_FORM_INICIAL);
  const [kahootEditandoId, setKahootEditandoId] = useState(null);
  const [kahootNow, setKahootNow] = useState(() => Date.now());
  const [kahootAccion, setKahootAccion] = useState('');
  const [kahootError, setKahootError] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setKahootNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const kahoot = estado.kahoot;
  const kahootPreguntas = kahoot?.preguntas || [];
  const kahootEnBorrador = kahoot?.estado === 'borrador';
  const kahootBorradorPropioAlumno = sesion.tipo === 'alumno' && kahootEnBorrador && kahoot?.creadorAlumnoId === sesion.alumnoId;
  const kahootBorradorDelMaestro = sesion.tipo === 'maestro' && kahootEnBorrador && !kahoot?.creadorAlumnoId;
  const kahootPuedePreparar = !kahoot || kahoot.estado !== 'activa';
  const kahootPuedeAgregarPreguntas = !kahoot || kahoot.estado === 'finalizada' || kahootBorradorPropioAlumno || kahootBorradorDelMaestro;
  const kahootSubtitulo = kahootEnBorrador && kahoot?.creadorNombre ? 'Borrador de ' + kahoot.creadorNombre : (kahoot?.estado === 'finalizada' ? 'Actividad finalizada' : kahootPreguntas.length + ' preguntas listas');
  const kahootPreguntasBorrador = kahoot?.estado === 'borrador' ? kahootPreguntas : [];
  const kahootPreguntaActiva = kahoot?.estado === 'activa' ? kahootPreguntas[kahoot.preguntaActual] : null;
  const kahootRespuestas = kahootPreguntaActiva?.respuestas || [];
  const kahootInicio = kahoot?.iniciadaAt ? new Date(kahoot.iniciadaAt).getTime() : kahootNow;
  const kahootSegundos = kahootPreguntaActiva ? Math.max(0, 20 - Math.floor((kahootNow - kahootInicio) / 1000)) : 0;
  const kahootMiRespuesta = sesion.tipo === 'alumno' && kahootPreguntaActiva ? kahootRespuestas.find((respuesta) => respuesta.alumnoId === sesion.alumnoId) : null;
  const kahootTodosRespondieron = kahootPreguntaActiva && estado.alumnos.length > 0 && kahootRespuestas.length >= estado.alumnos.length;
  const kahootMostrarResultados = Boolean(kahootPreguntaActiva && (kahootSegundos <= 0 || kahootTodosRespondieron || kahootMiRespuesta || sesion.tipo === 'maestro'));
  const kahootConteos = KAHOOT_OPCIONES.reduce((resumen, opcion) => ({
    ...resumen,
    [opcion]: kahootRespuestas.filter((respuesta) => respuesta.opcion === opcion)
  }), {});
  const kahootRanking = Object.values((kahootPreguntas || []).flatMap((pregunta) => pregunta.respuestas || []).reduce((resumen, respuesta) => {
    const previo = resumen[respuesta.alumnoId] || { alumnoId: respuesta.alumnoId, alumno: respuesta.alumno, casaId: respuesta.casaId, aciertos: 0, tiempo: 0 };
    resumen[respuesta.alumnoId] = {
      ...previo,
      aciertos: previo.aciertos + (respuesta.correcta ? 1 : 0),
      tiempo: previo.tiempo + (respuesta.correcta ? respuesta.tiempoMs : 20000)
    };
    return resumen;
  }, {})).sort((a, b) => b.aciertos - a.aciertos || a.tiempo - b.tiempo);

  const actualizarKahootForm = (campo, valor) => {
    setKahootForm((actual) => ({ ...actual, [campo]: valor }));
  };

  const asegurarContextoKahoot = async () => {
    if (sesion.tipo === 'alumno') await supabase.auth.signOut();
  };

  const limpiarKahootForm = () => {
    setKahootForm(KAHOOT_FORM_INICIAL);
    setKahootEditandoId(null);
  };

  const crearPreguntaKahoot = async (event) => {
    event?.preventDefault?.();
    const campos = ['pregunta', 'opcionA', 'opcionB', 'opcionC', 'opcionD'];
    if (campos.some((campo) => !kahootForm[campo].trim())) return setMensaje('Completa la pregunta y sus cuatro respuestas.');
    await asegurarContextoKahoot();
    const payload = {
      p_token: sesion.token,
      p_alumno_id: sesion.tipo === 'alumno' ? sesion.alumnoId : null,
      p_password: sesion.tipo === 'alumno' ? sesion.password : null,
      p_pregunta: kahootForm.pregunta,
      p_opcion_a: kahootForm.opcionA,
      p_opcion_b: kahootForm.opcionB,
      p_opcion_c: kahootForm.opcionC,
      p_opcion_d: kahootForm.opcionD,
      p_correcta: kahootForm.correcta
    };
    const { data, error } = await db.rpc(kahootEditandoId ? 'kahoot_modificar_pregunta' : 'kahoot_crear_pregunta', kahootEditandoId ? { ...payload, p_pregunta_id: kahootEditandoId } : payload);
    if (error) return setMensaje(error.message);
    setEstado(data);
    limpiarKahootForm();
    setMensaje(kahootEditandoId ? 'Pregunta actualizada.' : 'Pregunta agregada al Kahoot.');
  };

  const editarPreguntaKahoot = (pregunta) => {
    setKahootEditandoId(pregunta.id);
    setKahootForm({
      pregunta: pregunta.pregunta || '',
      opcionA: pregunta.opciones?.a || '',
      opcionB: pregunta.opciones?.b || '',
      opcionC: pregunta.opciones?.c || '',
      opcionD: pregunta.opciones?.d || '',
      correcta: pregunta.correcta || 'a'
    });
  };

  const eliminarPreguntaKahoot = async (preguntaId) => {
    await asegurarContextoKahoot();
    const { data, error } = await db.rpc('kahoot_eliminar_pregunta', {
      p_token: sesion.token,
      p_alumno_id: sesion.tipo === 'alumno' ? sesion.alumnoId : null,
      p_password: sesion.tipo === 'alumno' ? sesion.password : null,
      p_pregunta_id: preguntaId
    });
    if (error) return setMensaje(error.message);
    if (kahootEditandoId === preguntaId) limpiarKahootForm();
    setEstado(data);
    setMensaje('Pregunta eliminada.');
  };

  const reiniciarKahoot = async () => {
    await asegurarContextoKahoot();
    const { data, error } = await db.rpc('kahoot_reiniciar', {
      p_token: sesion.token,
      p_alumno_id: sesion.tipo === 'alumno' ? sesion.alumnoId : null,
      p_password: sesion.tipo === 'alumno' ? sesion.password : null
    });
    if (error) return setMensaje(error.message);
    limpiarKahootForm();
    setEstado(data);
    setMensaje('Kahoot reiniciado.');
  };

  const iniciarKahoot = async () => {
    if (sesion.tipo !== 'maestro') return;
    const { data, error } = await db.rpc('kahoot_iniciar', { p_token: sesion.token });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setKahootNow(Date.now());
    setMensaje('Kahoot iniciado. Los alumnos ya pueden responder.');
  };

  const responderKahoot = async (preguntaId, opcion) => {
    if (sesion.tipo !== 'alumno') return;
    const { data, error } = await db.rpc('kahoot_responder', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_pregunta_id: preguntaId,
      p_opcion: opcion
    });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Respuesta enviada.');
  };

  const siguientePreguntaKahoot = async () => {
    if (sesion.tipo !== 'maestro') return;
    const { data, error } = await db.rpc('kahoot_siguiente_pregunta', { p_token: sesion.token });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setKahootNow(Date.now());
    setMensaje('Siguiente pregunta.');
  };

  const finalizarKahoot = async () => {
    if (sesion.tipo !== 'maestro' || kahootAccion === 'finalizar') return;
    setKahootAccion('finalizar');
    setKahootError('');
    setMensaje('Premiando Kahoot...');
    const ganadoresConAciertos = kahootRanking.filter((item) => item.aciertos > 0).slice(0, 3);
    const { data, error } = await db.rpc('kahoot_finalizar', { p_token: sesion.token });
    setKahootAccion('');
    if (error) {
      setKahootError(error.message);
      return setMensaje('No se pudo premiar el Kahoot: ' + error.message);
    }
    if (!data) {
      setKahootError('Supabase no devolvio informacion actualizada. Intenta actualizar la clase.');
      return setMensaje('No se recibio respuesta al premiar el Kahoot.');
    }
    setEstado(data);
    setMensaje(ganadoresConAciertos.length > 0 ? 'Kahoot finalizado. Se repartieron oportunidades: 3, 2 y 1 carta.' : 'Kahoot finalizado. No hubo respuestas correctas para premiar.');
  };

  const nuevaActividadKahoot = async () => {
    if (sesion.tipo !== 'maestro') return;
    const { data, error } = await db.rpc('kahoot_nueva_actividad', { p_token: sesion.token });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Nueva actividad Kahoot lista para preguntas.');
  };

  const kahootFormPanel = (kahootPuedeAgregarPreguntas || kahootEditandoId) && (
    <form className='kahoot-form' onSubmit={crearPreguntaKahoot}>
      <label>
        <span>Pregunta</span>
        <textarea value={kahootForm.pregunta} onChange={(event) => actualizarKahootForm('pregunta', event.target.value)} placeholder='Escribe la pregunta para la clase' />
      </label>
      <div className='kahoot-answer-grid'>
        {KAHOOT_OPCIONES.map((opcion) => (
          <label key={opcion}>
            <span>Inciso {opcion.toUpperCase()}</span>
            <input value={kahootForm['opcion' + opcion.toUpperCase()]} onChange={(event) => actualizarKahootForm('opcion' + opcion.toUpperCase(), event.target.value)} placeholder={'Respuesta ' + opcion.toUpperCase()} />
          </label>
        ))}
      </div>
      <div className='kahoot-correct-row'>
        <span>Respuesta correcta</span>
        <div>
          {KAHOOT_OPCIONES.map((opcion) => (
            <button key={opcion} type='button' className={kahootForm.correcta === opcion ? 'active' : ''} onClick={() => actualizarKahootForm('correcta', opcion)}>{opcion.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <div className='kahoot-form-actions'>
        <button type='submit'>{kahootEditandoId ? 'Guardar cambios' : 'Agregar pregunta'}</button>
        {kahootEditandoId && <button type='button' className='ghost' onClick={limpiarKahootForm}>Cancelar edición</button>}
      </div>
    </form>
  );

  const kahootResults = kahootPreguntaActiva && (
    <div className='kahoot-results'>
      {KAHOOT_OPCIONES.map((opcion) => {
        const respuestas = kahootConteos[opcion] || [];
        const porcentaje = kahootRespuestas.length ? Math.round((respuestas.length / kahootRespuestas.length) * 100) : 0;
        return (
          <article className={kahootPreguntaActiva.correcta === opcion ? 'correct' : ''} key={opcion}>
            <div><strong>{opcion.toUpperCase()}</strong><span>{kahootPreguntaActiva.opciones?.[opcion]}</span><b>{respuestas.length}</b></div>
            <i style={{ width: porcentaje + '%' }} />
            <small>{respuestas.map((respuesta) => respuesta.alumno).join(', ') || 'Sin respuestas'}</small>
          </article>
        );
      })}
    </div>
  );

  return (
    <section className='panel kahoot-panel student-tab-panel'>
      <div className='kahoot-heading'><span><strong>Kahoot mágico</strong><small>{kahootSubtitulo}</small></span>{kahoot?.estado && <b>{kahoot.estado}</b>}</div>
      {kahootPuedePreparar && <p className='kahoot-note'>{kahoot?.estado === 'finalizada' ? 'Agrega una pregunta para comenzar una nueva actividad.' : (sesion.tipo === 'maestro' && kahootEnBorrador && kahoot?.creadorAlumnoId ? 'Revisa el borrador y autorízalo cuando esté listo.' : 'Agrega todas las preguntas que quieras antes de iniciar.')}</p>}
      {kahootError && <p className='kahoot-error'>{kahootError}</p>}
      {kahootFormPanel}
      {kahootPuedePreparar && (
        <div className='kahoot-draft'>
          {kahootPreguntasBorrador.length === 0 && <p className='empty'>Agrega preguntas para preparar la actividad.</p>}
          {kahootPreguntasBorrador.map((pregunta, index) => (
            <article key={pregunta.id}>
              <strong>{index + 1}. {pregunta.pregunta}</strong>
              <span>Correcta: {pregunta.correcta?.toUpperCase()}</span>
              <div className='kahoot-question-actions'>
                <button type='button' onClick={() => editarPreguntaKahoot(pregunta)}>Modificar</button>
                <button type='button' className='danger-soft' onClick={() => eliminarPreguntaKahoot(pregunta.id)}>Eliminar</button>
              </div>
            </article>
          ))}
          {kahootEnBorrador && kahootPreguntasBorrador.length > 0 && (
            <div className='kahoot-controls'>
              <button type='button' className='danger-soft' onClick={reiniciarKahoot}>Reiniciar Kahoot</button>
              {sesion.tipo === 'maestro' && <button type='button' onClick={iniciarKahoot}>Autorizar e iniciar</button>}
            </div>
          )}
        </div>
      )}
      {kahootPreguntaActiva && (
        <div className='kahoot-live'>
          <div className='kahoot-live-top'><span>Pregunta {(kahoot.preguntaActual || 0) + 1}/{kahootPreguntas.length}</span><b>{kahootSegundos}s</b></div>
          <h2>{kahootPreguntaActiva.pregunta}</h2>
          {!kahootMiRespuesta && sesion.tipo === 'alumno' && kahootSegundos > 0 && (
            <div className='kahoot-options'>
              {KAHOOT_OPCIONES.map((opcion) => <button key={opcion} type='button' onClick={() => responderKahoot(kahootPreguntaActiva.id, opcion)}><strong>{opcion.toUpperCase()}</strong><span>{kahootPreguntaActiva.opciones?.[opcion]}</span></button>)}
            </div>
          )}
          {kahootMiRespuesta && <p className='kahoot-answer-state'>Contestaste {kahootMiRespuesta.opcion.toUpperCase()}.</p>}
          {kahootMostrarResultados && kahootResults}
          {sesion.tipo === 'maestro' && kahootMostrarResultados && (
            <div className='kahoot-controls'>
              {(kahoot.preguntaActual || 0) + 1 < kahootPreguntas.length && <button type='button' onClick={siguientePreguntaKahoot}>Siguiente pregunta</button>}
              <button type='button' className='danger-soft' onClick={finalizarKahoot} disabled={kahootAccion === 'finalizar'}>{kahootAccion === 'finalizar' ? 'Premiando...' : 'Finalizar y premiar'}</button>
            </div>
          )}
        </div>
      )}
      {kahoot?.estado === 'finalizada' && (
        <div className='kahoot-ranking'>
          <h2>Ganadores</h2>
          {kahootRanking.length === 0 && <p className='empty'>No hubo respuestas correctas.</p>}
          {kahootRanking.slice(0, 3).map((item, index) => <article key={item.alumnoId}><strong>{index + 1}. {item.alumno}</strong><span>{item.aciertos} aciertos - premio: {index === 0 ? 3 : index === 1 ? 2 : 1} carta{index === 2 ? '' : 's'}</span></article>)}
          {sesion.tipo === 'maestro' && <button type='button' onClick={nuevaActividadKahoot}>Nueva actividad</button>}
        </div>
      )}
    </section>
  );
}

export default KahootPanel;
