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
  const [kahootGuardandoPregunta, setKahootGuardandoPregunta] = useState(false);
  const [kahootImportando, setKahootImportando] = useState(false);
  const [kahootMostrarAyuda, setKahootMostrarAyuda] = useState(false);
  const [kahootArrastrando, setKahootArrastrando] = useState(false);
  const [kahootFotos, setKahootFotos] = useState({});

  useEffect(() => {
    const id = window.setInterval(() => setKahootNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const kahoot = estado.kahoot;
  const kahootPreguntas = kahoot?.preguntas || [];
  const kahootEnBorrador = kahoot?.estado === 'borrador';
  const kahootBorradorPropioAlumno = sesion.tipo === 'alumno' && kahootEnBorrador && kahoot?.creadorAlumnoId === sesion.alumnoId;
  const kahootBorradorEditableMaestro = sesion.tipo === 'maestro' && kahootEnBorrador;
  const kahootPuedePreparar = !kahoot || kahoot.estado !== 'activa';
  const kahootPuedeAgregarPreguntas = !kahoot || kahoot.estado === 'finalizada' || kahootBorradorPropioAlumno || kahootBorradorEditableMaestro;
  const kahootSubtitulo = kahootEnBorrador && kahoot?.creadorNombre ? 'Borrador de ' + kahoot.creadorNombre : (kahoot?.estado === 'finalizada' ? 'Actividad finalizada' : kahootPreguntas.length + ' preguntas listas');
  const kahootPreguntasBorrador = kahoot?.estado === 'borrador' ? kahootPreguntas : [];
  const kahootActiva = kahoot?.estado === 'activa';
  const kahootPreguntaActiva = kahootActiva ? kahootPreguntas[kahoot.preguntaActual] : null;
  const kahootActivaSinPregunta = kahootActiva && kahootPreguntas.length > 0 && !kahootPreguntaActiva;
  const kahootRespuestas = kahootPreguntaActiva?.respuestas || [];
  const kahootInicio = kahoot?.iniciadaAt ? new Date(kahoot.iniciadaAt).getTime() : kahootNow;
  const kahootSegundos = kahootPreguntaActiva ? Math.max(0, 20 - Math.floor((kahootNow - kahootInicio) / 1000)) : 0;
  const kahootMiRespuesta = sesion.tipo === 'alumno' && kahootPreguntaActiva ? kahootRespuestas.find((respuesta) => respuesta.alumnoId === sesion.alumnoId) : null;
  const kahootParticipantes = estado.alumnos || [];
  const kahootTodosRespondieron = kahootPreguntaActiva && kahootParticipantes.length > 0 && kahootRespuestas.length >= kahootParticipantes.length;
  const kahootMostrarResultados = Boolean(kahootPreguntaActiva && (kahootSegundos <= 0 || kahootTodosRespondieron || sesion.tipo === 'maestro'));
  const kahootConteos = KAHOOT_OPCIONES.reduce((resumen, opcion) => ({
    ...resumen,
    [opcion]: kahootRespuestas.filter((respuesta) => respuesta.opcion === opcion)
  }), {});
  const kahootRanking = Object.values((kahootPreguntas || []).flatMap((pregunta) => pregunta.respuestas || []).reduce((resumen, respuesta) => {
    const previo = resumen[respuesta.alumnoId] || { alumnoId: respuesta.alumnoId, alumno: respuesta.alumno, casaId: respuesta.casaId, aciertos: 0, tiempo: 0, puntosRapidez: 0 };
    resumen[respuesta.alumnoId] = {
      ...previo,
      aciertos: previo.aciertos + (respuesta.correcta ? 1 : 0),
      tiempo: previo.tiempo + respuesta.tiempoMs,
      puntosRapidez: previo.puntosRapidez + (respuesta.correcta ? Math.max(0, 20000 - respuesta.tiempoMs) : 0)
    };
    return resumen;
  }, {})).sort((a, b) => b.aciertos - a.aciertos || b.puntosRapidez - a.puntosRapidez || a.tiempo - b.tiempo || a.alumnoId.localeCompare(b.alumnoId));
  const kahootGanadoresPremio = kahootRanking.filter((item) => item.aciertos > 0).slice(0, 3);

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

  const importarWordKahoot = async (archivo) => {
    if (!archivo || kahootImportando) return;
    setKahootImportando(true);
    setKahootError('');
    try {
      if (!/\.docx$/i.test(archivo.name)) throw new Error('Selecciona un documento .docx.');
      const { examFromWord } = await import('../../utils/examWord');
      const preguntas = await examFromWord(archivo);
      const { data, error } = await db.rpc('kahoot_importar_word', {
        p_token: sesion.token, p_preguntas: preguntas,
        p_alumno_id: sesion.tipo === 'alumno' ? sesion.alumnoId : null,
        p_password: sesion.tipo === 'alumno' ? sesion.password : null
      });
      if (error) throw error;
      setEstado(data);
      setMensaje(`${preguntas.length} preguntas importadas. Revísalas antes de iniciar.`);
    } catch (error) {
      setKahootError(error.message);
      setMensaje('No se pudo importar el Word: ' + error.message);
    } finally { setKahootImportando(false); }
  };

  useEffect(() => {
    if (kahoot?.estado !== 'finalizada' && sesion.tipo !== 'alumno') return;
    let vigente = true;
    db.rpc('kahoot_listar_fotos', {
      p_token: sesion.token,
      p_alumno_id: sesion.tipo === 'alumno' ? sesion.alumnoId : null,
      p_password: sesion.tipo === 'alumno' ? sesion.password : null
    }).then(({ data, error }) => { if (vigente && !error) setKahootFotos(data || {}); });
    return () => { vigente = false; };
  }, [kahoot?.estado, sesion.tipo, sesion.token, sesion.alumnoId, sesion.password]);

  const crearPreguntaKahoot = async (event) => {
    event?.preventDefault?.();
    if (kahootGuardandoPregunta) return;
    setKahootError('');
    const campos = ['pregunta', 'opcionA', 'opcionB', 'opcionC', 'opcionD'];
    if (campos.some((campo) => !kahootForm[campo].trim())) {
      const mensaje = 'Completa la pregunta y sus cuatro respuestas.';
      setKahootError(mensaje);
      return setMensaje(mensaje);
    }
    setKahootGuardandoPregunta(true);
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
    setKahootGuardandoPregunta(false);
    if (error) {
      setKahootError(error.message);
      return setMensaje('No se pudo guardar la pregunta: ' + error.message);
    }
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
    setKahootError('');
    await asegurarContextoKahoot();
    const { data, error } = await db.rpc('kahoot_reiniciar', {
      p_token: sesion.token,
      p_alumno_id: sesion.tipo === 'alumno' ? sesion.alumnoId : null,
      p_password: sesion.tipo === 'alumno' ? sesion.password : null
    });
    if (error) {
      setKahootError(error.message);
      return setMensaje('No se pudo reiniciar el Kahoot: ' + error.message);
    }
    limpiarKahootForm();
    setEstado(data);
    setMensaje('Kahoot reiniciado.');
  };

  const iniciarKahoot = async () => {
    if (sesion.tipo !== 'maestro') return;
    setKahootError('');
    const { data, error } = await db.rpc('kahoot_iniciar', { p_token: sesion.token });
    if (error) {
      setKahootError(error.message);
      return setMensaje('No se pudo iniciar el Kahoot: ' + error.message);
    }
    setKahootNow(Date.now());
    setEstado(data);
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
    setMensaje(ganadoresConAciertos.length > 0 ? 'Kahoot finalizado. Se repartieron oportunidades solo a quienes tuvieron aciertos.' : 'Kahoot finalizado. No hubo respuestas correctas para premiar.');
  };

  const nuevaActividadKahoot = async () => {
    if (sesion.tipo !== 'maestro') return;
    setKahootError('');
    const { data, error } = await db.rpc('kahoot_nueva_actividad', { p_token: sesion.token });
    if (error) {
      setKahootError(error.message);
      return setMensaje('No se pudo crear nueva actividad: ' + error.message);
    }
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
        <button type='submit' disabled={kahootGuardandoPregunta}>{kahootGuardandoPregunta ? 'Guardando...' : (kahootEditandoId ? 'Guardar cambios' : 'Agregar pregunta')}</button>
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
      {kahootPuedePreparar && <p className='kahoot-note'>{kahoot?.estado === 'finalizada' ? 'Agrega una pregunta para comenzar una nueva actividad.' : (sesion.tipo === 'maestro' && kahootEnBorrador && kahoot?.creadorAlumnoId ? 'Revisa el borrador, agrega preguntas si hace falta y autorízalo cuando esté listo.' : 'Agrega todas las preguntas que quieras antes de iniciar.')}</p>}
      {kahootError && <p className='kahoot-error'>{kahootError}</p>}
      {kahootPuedeAgregarPreguntas && <section className='kahoot-word-upload' aria-label='Cargar Kahoot desde Word'>
        <div className='kahoot-word-heading'><strong>Cargar Kahoot desde Word</strong><button type='button' className='kahoot-word-info' aria-label='Cómo preparar el documento Word' aria-expanded={kahootMostrarAyuda} aria-controls='kahoot-word-help' onClick={() => setKahootMostrarAyuda(actual => !actual)}>ⓘ</button></div>
        {kahootMostrarAyuda && <p id='kahoot-word-help' className='kahoot-word-help'>Usa un documento .docx con preguntas numeradas (1., 2. …), cuatro opciones A), B), C), D) y una sección «Clave rápida de respuestas» con entradas como 01-C. También acepta «Respuesta: C» debajo de cada pregunta. Máximo 100 preguntas.</p>}
        <label className={'kahoot-word-dropzone'+(kahootArrastrando ? ' dragging' : '')+(kahootImportando ? ' loading' : '')}
          onDragEnter={event => { event.preventDefault(); if (!kahootImportando) setKahootArrastrando(true); }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect=kahootImportando ? 'none' : 'copy'; }}
          onDragLeave={event => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget)) setKahootArrastrando(false); }}
          onDrop={event => { event.preventDefault(); setKahootArrastrando(false); void importarWordKahoot(event.dataTransfer.files?.[0]); }}>
          <span aria-hidden='true' className='kahoot-word-drop-icon'>⇧</span>
          <b>{kahootImportando ? 'Importando preguntas…' : 'Arrastra aquí tu documento Word'}</b>
          <small>{kahootImportando ? 'Espera un momento' : 'o toca para elegir un archivo .docx'}</small>
          <input type='file' accept='.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' disabled={kahootImportando} onChange={event => { void importarWordKahoot(event.target.files?.[0]); event.target.value=''; }} />
        </label>
      </section>}
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
      {kahootActivaSinPregunta && (
        <div className='kahoot-live'>
          <p className='kahoot-error'>El Kahoot quedo activo pero ya no hay una pregunta disponible. Se cerrara automaticamente para premiar.</p>
          {sesion.tipo === 'maestro' && <button type='button' className='danger-soft' onClick={finalizarKahoot}>Finalizar y premiar ahora</button>}
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
          <p className='kahoot-note'>La siguiente pregunta aparece cuando todos respondan o termine el tiempo.</p>
        </div>
      )}
      {kahoot?.estado === 'finalizada' && (
        <div className='kahoot-ranking'>
          <h2>Ganadores</h2>
          {kahootGanadoresPremio.length === 0 && <p className='empty'>No hubo respuestas correctas para premiar.</p>}
          <div className='kahoot-podium'>
            {[kahootGanadoresPremio[1], kahootGanadoresPremio[0], kahootGanadoresPremio[2]].map((item, podiumIndex) => item && (
              <article className={`kahoot-podium-place place-${podiumIndex === 1 ? 1 : podiumIndex === 0 ? 2 : 3}`} key={item.alumnoId}>
                <div className='kahoot-podium-avatar'>{kahootFotos[item.alumnoId] ? <img src={kahootFotos[item.alumnoId]} alt={`Foto de ${item.alumno}`} /> : <span>{item.alumno?.charAt(0) || '?'}</span>}</div>
                <b>{podiumIndex === 1 ? '🥇' : podiumIndex === 0 ? '🥈' : '🥉'}</b>
                <strong>{item.alumno}</strong>
                <span>{item.aciertos} aciertos · {item.puntosRapidez.toLocaleString('es-MX')} puntos de rapidez</span>
                <small>Premio: {podiumIndex === 1 ? 3 : podiumIndex === 0 ? 2 : 1} {podiumIndex === 2 ? 'oportunidad' : 'oportunidades'}</small>
              </article>
            ))}
          </div>
          {sesion.tipo === 'maestro' && <button type='button' onClick={nuevaActividadKahoot}>Nueva actividad</button>}
        </div>
      )}
    </section>
  );
}

export default KahootPanel;
