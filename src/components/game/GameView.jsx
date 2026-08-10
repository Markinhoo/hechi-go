import { useEffect, useRef, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaBookOpen, FaHouse, FaScroll, FaTrophy, FaWandMagicSparkles } from 'react-icons/fa6';
import { bestiario, precioBestia, RAREZAS_BESTIARIO } from '../../data/bestiaryData';
import { CARTAS_ACTIVAS, casas, PLAYER_KEY } from '../../data/gameData';
import { db } from '../../services/hechiApi';
import { efectoCarta, guardarLocal, obtenerCasa, randomEntero } from '../../utils/gameUtils';
import CardModal from './CardModal';

function GameView({ sesion, setSesion, estado, setEstado, setModo, mensaje, setMensaje }) {
  const [arrastre, setArrastre] = useState({ activo: false, inicio: 0, inicioY: 0, startPos: 0, lastX: 0, lastTime: 0, velocity: 0 });
  const [posicionCarrusel, setPosicionCarrusel] = useState(estado.sobreActivo || 0);
  const [cartaAbierta, setCartaAbierta] = useState(null);
  const [casaDetalleId, setCasaDetalleId] = useState(null);
  const [mostrarCambioPassword, setMostrarCambioPassword] = useState(false);
  const [passwordNuevaAlumno, setPasswordNuevaAlumno] = useState('');
  const [passwordConfirmacionAlumno, setPasswordConfirmacionAlumno] = useState('');
  const [busquedaAlumno, setBusquedaAlumno] = useState('');
  const [indiceAlumno, setIndiceAlumno] = useState(0);
  const [bestiaDetalleId, setBestiaDetalleId] = useState(null);
  const [studentTab, setStudentTab] = useState('inicio');
  const autoAbrirRef = useRef(false);
  const abrirCartaRef = useRef(null);
  const sobres = Array.from({ length: 7 }, (_, index) => index);

  const autorizar = async (alumnoId) => {
    const { data, error } = await db.rpc('autorizar_participacion', { p_token: sesion.token, p_alumno_id: alumnoId });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Participacion autorizada.');
  };

  const rechazar = async (alumnoId) => {
    const { data, error } = await db.rpc('rechazar_participacion', { p_token: sesion.token, p_alumno_id: alumnoId });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Solicitud cancelada.');
  };

  const solicitarCarta = async (abrirCuandoAutoricen = false) => {
    if (sesion.tipo !== 'alumno') return;
    const alumno = estado.alumnos.find((item) => item.id === sesion.alumnoId);
    if (!alumno) return setMensaje('No encuentro tu usuario en esta clase.');
    if (alumno.oportunidades > 0) {
      if (abrirCuandoAutoricen) abrirCarta();
      return setMensaje('Ya tienes una oportunidad autorizada. Ahora abre una carta.');
    }
    if (abrirCuandoAutoricen) autoAbrirRef.current = true;
    const { data, error } = await db.rpc('solicitar_carta', { p_token: sesion.token, p_alumno_id: sesion.alumnoId, p_password: sesion.password });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Solicitud enviada al maestro. La carta se abrira cuando autorice.');
  };

  const cambiarPassword = async (alumno) => {
    if (sesion.tipo !== 'maestro') return;
    const nueva = window.prompt('Restablecer contrasena para ' + alumno.nombre + ' (minimo 3 caracteres)', '12345');
    const passwordNueva = (nueva || '').trim();
    if (!passwordNueva) return setMensaje('Cambio de contrasena cancelado.');
    if (passwordNueva.length < 3) return setMensaje('La nueva contrasena debe tener al menos 3 caracteres.');
    setMensaje('Restableciendo contrasena de ' + alumno.nombre + '...');
    const { data, error } = await db.rpc('cambiar_password_alumno', { p_token: sesion.token, p_alumno_id: alumno.id, p_password: passwordNueva });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Contrasena restablecida para ' + alumno.nombre + '.');
  };

  const cambiarPasswordPropia = async (event) => {
    event?.preventDefault?.();
    if (sesion.tipo !== 'alumno') return;
    const passwordNueva = passwordNuevaAlumno.trim();
    const passwordConfirmacion = passwordConfirmacionAlumno.trim();
    if (!passwordNueva) return setMensaje('Escribe tu nueva contrasena.');
    if (passwordNueva.length < 3) return setMensaje('La nueva contrasena debe tener al menos 3 caracteres.');
    if (passwordNueva !== passwordConfirmacion) return setMensaje('La confirmacion no coincide.');
    setMensaje('Actualizando tu contrasena...');
    const { data, error } = await db.rpc('cambiar_password_propia', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password_actual: sesion.password,
      p_password_nueva: passwordNueva
    });
    if (error) return setMensaje(error.message);
    const sesionActualizada = { ...sesion, password: passwordNueva };
    setSesion(sesionActualizada);
    guardarLocal(PLAYER_KEY, sesionActualizada);
    setEstado(data);
    setMostrarCambioPassword(false);
    setPasswordNuevaAlumno('');
    setPasswordConfirmacionAlumno('');
    setMensaje('Tu contrasena fue actualizada.');
  };

  const quitarPuntosAlumno = async (alumno) => {
    if (sesion.tipo !== 'maestro') return;
    const entrada = window.prompt('Cuantos puntos quieres quitarle a ' + alumno.nombre + '?', '1');
    if (entrada === null) return setMensaje('Quitar puntos cancelado.');
    const puntos = Math.floor(Number(entrada));
    if (!Number.isFinite(puntos) || puntos <= 0) return setMensaje('Escribe una cantidad valida mayor a 0.');
    setMensaje('Quitando ' + puntos + ' puntos a ' + alumno.nombre + '...');
    const { data, error } = await db.rpc('quitar_puntos_alumno', { p_token: sesion.token, p_alumno_id: alumno.id, p_puntos: puntos });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Se quitaron puntos a ' + alumno.nombre + '.');
  };

  const eliminarAlumno = async (alumno) => {
    if (sesion.tipo !== 'maestro') return;
    if (!window.confirm('Eliminar a ' + alumno.nombre + ' de esta clase? Se borraran sus cartas, puntos y solicitudes.')) return;
    const { data, error } = await db.rpc('eliminar_alumno', { p_token: sesion.token, p_alumno_id: alumno.id });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje(alumno.nombre + ' fue eliminado de la clase.');
  };

  const iniciarNuevoParcial = async () => {
    if (sesion.tipo !== 'maestro') return;
    if (!window.confirm('Iniciar un nuevo parcial borrara puntos, cartas del parcial, solicitudes e historial. Se conservan alumnos, casas, galeones y bestiario.')) return;
    const { data, error } = await db.rpc('reiniciar_clase', { p_token: sesion.token });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Nuevo parcial listo. Se conservaron casas, galeones y bestiario.');
  };

  const eliminarClase = async () => {
    if (sesion.tipo !== 'maestro') return;
    if (!window.confirm('Eliminar esta clase borrara definitivamente grupo, alumnos, puntos y token.')) return;
    const { error } = await db.rpc('eliminar_clase', { p_token: sesion.token });
    if (error) return setMensaje(error.message);
    setSesion(null);
    setEstado(null);
    setModo('maestro');
    setMensaje('Clase eliminada.');
  };

  const moverSobre = (direccion, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setPosicionCarrusel((actual) => Math.round(actual + direccion));
  };

  const registrarCarta = async ({ numero, efecto, casaObjetivo = null }) => {
    const { data, error } = await db.rpc('abrir_carta', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_numero: numero,
      p_puntos: efecto.puntos,
      p_titulo: efecto.titulo,
      p_descripcion: efecto.descripcion,
      p_casa_objetivo: casaObjetivo
    });
    if (error) {
      setMensaje(error.message);
      return null;
    }
    setEstado(data);
    return data;
  };

  const abrirCarta = async () => {
    if (sesion.tipo !== 'alumno') return setMensaje('Solo el alumno puede abrir su carta.');
    const alumno = estado.alumnos.find((item) => item.id === sesion.alumnoId);
    if (!alumno || alumno.oportunidades <= 0) return solicitarCarta(true);
    const numero = CARTAS_ACTIVAS[randomEntero(CARTAS_ACTIVAS.length)];
    const efecto = efectoCarta(numero);
    if (efecto.tipo === 'rival') {
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id, pendienteRival: true });
      setMensaje(efecto.titulo + ': elige una casa rival.');
      return null;
    }
    if (efecto.tipo === 'puntosIntercambio') {
      const hayAlumnoDisponible = estado.alumnos.some((item) => item.id !== alumno.id);
      if (!hayAlumnoDisponible) {
        const data = await registrarCarta({ numero, efecto });
        if (!data) return null;
        setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id });
        setMensaje('Confundo no encontro otro alumno para intercambiar puntos.');
        return data;
      }
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id, pendientePuntosIntercambio: true });
      setMensaje('Confundo: elige un alumno para intercambiar puntos.');
      return null;
    }
    if (efecto.tipo === 'companeroBonus') {
      const hayCompaneroDisponible = estado.alumnos.some((item) => item.id !== alumno.id);
      if (!hayCompaneroDisponible) {
        const data = await registrarCarta({ numero, efecto });
        if (!data) return null;
        setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id });
        setMensaje('Amortentia no encontro otro companero disponible.');
        return data;
      }
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id, pendienteCompaneroBonus: true });
      setMensaje('Amortentia: elige un companero para sumar puntos a ambos.');
      return null;
    }
    if (efecto.tipo === 'replicaPuntos') {
      const hayObjetivoDisponible = estado.alumnos.some((item) => item.id !== alumno.id && item.casaId !== estado.casaProtegida);
      if (!hayObjetivoDisponible) {
        const data = await registrarCarta({ numero, efecto });
        if (!data) return null;
        setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id });
        setMensaje('Multijugos no encontro un alumno disponible para replicar.');
        return data;
      }
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id, pendienteReplicaPuntos: true });
      setMensaje('Multijugos: elige el alumno cuyos puntos quieres replicar.');
      return null;
    }
    if (efecto.tipo === 'roboMultiple') {
      const objetivosDisponibles = estado.alumnos.filter((item) => item.id !== alumno.id && item.casaId !== estado.casaProtegida);
      if (objetivosDisponibles.length < 5) {
        const data = await registrarCarta({ numero, efecto });
        if (!data) return null;
        setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id });
        setMensaje('Morsmordre no encontro 5 alumnos disponibles.');
        return data;
      }
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id, pendienteRoboMultiple: true });
      setMensaje('Morsmordre: elige 5 alumnos para quitarles 1 punto.');
      return null;
    }
    if (efecto.tipo === 'decisionChiste') {
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id, pendienteDecisionChiste: true });
      setMensaje('Riddikulus: pasa al frente a contar un chiste.');
      return null;
    }
    if (efecto.tipo === 'otrasCasas') {
      const { data, error } = await db.rpc('restar_puntos_otras_casas', {
        p_token: sesion.token,
        p_alumno_id: sesion.alumnoId,
        p_password: sesion.password,
        p_numero: numero,
        p_puntos: Math.abs(efecto.puntos),
        p_titulo: efecto.titulo,
        p_descripcion: efecto.descripcion
      });
      if (error) return setMensaje(error.message);
      setEstado(data);
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id });
      setMensaje('Sectumsempra quito 2 puntos a las otras casas disponibles.');
      return data;
    }
    if (efecto.tipo === 'intercambio') {
      const hayRivalDisponible = estado.alumnos.some((item) => item.casaId !== alumno.casaId && item.casaId !== estado.casaProtegida);
      if (alumno.casaId === estado.casaProtegida || !hayRivalDisponible) {
        const data = await registrarCarta({ numero, efecto });
        if (!data) return null;
        setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id });
        setMensaje('Imperio no encontro intercambio valido por la proteccion activa.');
        return data;
      }
      setCartaAbierta({ numero, ...efecto, casaId: alumno.casaId, alumnoId: alumno.id, pendienteIntercambio: true });
      setMensaje('Imperio: elige alumnos para intercambiar casas.');
      return null;
    }
    const data = await registrarCarta({ numero, efecto });
    if (!data) return null;
    const puntosFinales = data?.historial?.[0]?.puntos ?? efecto.puntos;
    setCartaAbierta({ numero, ...efecto, puntos: puntosFinales, casaId: alumno.casaId, alumnoId: alumno.id });
    if (efecto.tipo === 'proteccion') {
      setMensaje(obtenerCasa(alumno.casaId).nombre + ' queda protegida y activa x2 para su siguiente accion.');
    } else {
      setMensaje(obtenerCasa(alumno.casaId).nombre + ' gana ' + puntosFinales + ' puntos.');
    }
    return data;
  };

  const seleccionarCasaRival = async (casaObjetivo) => {
    if (!cartaAbierta || cartaAbierta.tipo !== 'rival' || !cartaAbierta.pendienteRival) return;
    const alumno = estado.alumnos.find((item) => item.id === sesion.alumnoId);
    if (!alumno) return setMensaje('No encuentro tu usuario en esta clase.');
    if (casaObjetivo === alumno.casaId) return setMensaje('Debes elegir una casa rival.');
    const efecto = { puntos: cartaAbierta.puntos, titulo: cartaAbierta.titulo, descripcion: cartaAbierta.descripcion, tipo: cartaAbierta.tipo };
    const data = await registrarCarta({ numero: cartaAbierta.numero, efecto, casaObjetivo });
    if (!data) return;
    const rival = obtenerCasa(casaObjetivo);
    const puntosFinales = Math.abs(data?.historial?.[0]?.puntos || cartaAbierta.puntos);
    setCartaAbierta({ ...cartaAbierta, casaObjetivo, pendienteRival: false, puntos: -(puntosFinales) });
    setMensaje(rival.nombre + ' pierde ' + puntosFinales + ' puntos por Crucio.');
  };

  const seleccionarIntercambio = async ({ origenId, destinoId }) => {
    if (!cartaAbierta || cartaAbierta.tipo !== 'intercambio' || !cartaAbierta.pendienteIntercambio) return;
    if (!origenId || !destinoId || origenId === destinoId) return setMensaje('Elige dos alumnos diferentes para el intercambio.');
    const { data, error } = await db.rpc('intercambiar_alumnos', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_numero: cartaAbierta.numero,
      p_titulo: cartaAbierta.titulo,
      p_descripcion: cartaAbierta.descripcion,
      p_origen_id: origenId,
      p_destino_id: destinoId
    });
    if (error) return setMensaje(error.message);
    const origen = estado.alumnos.find((alumno) => alumno.id === origenId);
    const destino = estado.alumnos.find((alumno) => alumno.id === destinoId);
    setEstado(data);
    setCartaAbierta({ ...cartaAbierta, pendienteIntercambio: false });
    setMensaje('Imperio intercambio a ' + (origen?.nombre || 'un alumno') + ' con ' + (destino?.nombre || 'otro alumno') + '.');
  };

  const seleccionarIntercambioPuntos = async (objetivoId) => {
    if (!cartaAbierta || cartaAbierta.tipo !== 'puntosIntercambio' || !cartaAbierta.pendientePuntosIntercambio) return;
    if (!objetivoId || objetivoId === sesion.alumnoId) return setMensaje('Elige otro alumno para intercambiar puntos.');
    const { data, error } = await db.rpc('intercambiar_puntos_alumnos', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_numero: cartaAbierta.numero,
      p_titulo: cartaAbierta.titulo,
      p_descripcion: cartaAbierta.descripcion,
      p_objetivo_id: objetivoId
    });
    if (error) return setMensaje(error.message);
    const objetivo = estado.alumnos.find((alumno) => alumno.id === objetivoId);
    setEstado(data);
    setCartaAbierta({ ...cartaAbierta, pendientePuntosIntercambio: false });
    setMensaje('Confundo aplico intercambio de puntos con ' + (objetivo?.nombre || 'otro alumno') + '.');
  };

  const seleccionarCompaneroBonus = async (companeroId) => {
    if (!cartaAbierta || cartaAbierta.tipo !== 'companeroBonus' || !cartaAbierta.pendienteCompaneroBonus) return;
    if (!companeroId || companeroId === sesion.alumnoId) return setMensaje('Elige otro companero.');
    const { data, error } = await db.rpc('sumar_puntos_companero', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_numero: cartaAbierta.numero,
      p_titulo: cartaAbierta.titulo,
      p_descripcion: cartaAbierta.descripcion,
      p_companero_id: companeroId
    });
    if (error) return setMensaje(error.message);
    const companero = estado.alumnos.find((alumno) => alumno.id === companeroId);
    const puntos = data?.historial?.[0]?.puntos || 2;
    setEstado(data);
    setCartaAbierta({ ...cartaAbierta, pendienteCompaneroBonus: false, puntos });
    setMensaje('Amortentia sumo +' + puntos + ' a ti y a ' + (companero?.nombre || 'otro companero') + '.');
  };

  const seleccionarReplicaPuntos = async (objetivoId) => {
    if (!cartaAbierta || cartaAbierta.tipo !== 'replicaPuntos' || !cartaAbierta.pendienteReplicaPuntos) return;
    if (!objetivoId || objetivoId === sesion.alumnoId) return setMensaje('Elige otro alumno para replicar sus puntos.');
    const { data, error } = await db.rpc('replicar_puntos_alumno', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_numero: cartaAbierta.numero,
      p_titulo: cartaAbierta.titulo,
      p_descripcion: cartaAbierta.descripcion,
      p_objetivo_id: objetivoId
    });
    if (error) return setMensaje(error.message);
    const objetivo = estado.alumnos.find((alumno) => alumno.id === objetivoId);
    const puntos = data?.historial?.[0]?.puntos ?? objetivo?.puntos ?? 0;
    setEstado(data);
    setCartaAbierta({ ...cartaAbierta, pendienteReplicaPuntos: false, puntos });
    setMensaje('Multijugos replico +' + puntos + ' puntos de ' + (objetivo?.nombre || 'otro alumno') + '.');
  };

  const seleccionarRoboMultiple = async (objetivoIds) => {
    if (!cartaAbierta || cartaAbierta.tipo !== 'roboMultiple' || !cartaAbierta.pendienteRoboMultiple) return;
    if (!Array.isArray(objetivoIds) || objetivoIds.length !== 5) return setMensaje('Elige exactamente 5 alumnos.');
    const { data, error } = await db.rpc('morsmordre_robar_puntos', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_numero: cartaAbierta.numero,
      p_titulo: cartaAbierta.titulo,
      p_descripcion: cartaAbierta.descripcion,
      p_objetivo_ids: objetivoIds
    });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setCartaAbierta({ ...cartaAbierta, pendienteRoboMultiple: false, puntos: 5 });
    setMensaje('Morsmordre quito 1 punto a 5 alumnos y sumo +5 a tu casa.');
  };

  const seleccionarDecisionChiste = async (acepta) => {
    if (!cartaAbierta || cartaAbierta.tipo !== 'decisionChiste' || !cartaAbierta.pendienteDecisionChiste) return;
    const { data, error } = await db.rpc('riddikulus_decision_chiste', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_numero: cartaAbierta.numero,
      p_titulo: cartaAbierta.titulo,
      p_descripcion: cartaAbierta.descripcion,
      p_acepta: acepta
    });
    if (error) return setMensaje(error.message);
    const puntos = acepta ? 2 : -2;
    setEstado(data);
    setCartaAbierta({ ...cartaAbierta, pendienteDecisionChiste: false, puntos });
    setMensaje(acepta ? 'Riddikulus sumo +2 por contar el chiste.' : 'Riddikulus resto -2 por negarse a contar el chiste.');
  };

  const usarCartaGuardada = async (carta) => {
    if (sesion.tipo !== 'alumno') return;
    if (!window.confirm('Usar ' + carta.titulo + '? Se eliminara de tus cartas guardadas.')) return;
    const { data, error } = await db.rpc('usar_carta_guardada', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_carta_id: carta.id
    });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje(carta.titulo + ' usada como justificante.');
  };

  const comprarBestia = async (bestia) => {
    if (sesion.tipo !== 'alumno') return;
    const { data, error } = await db.rpc('comprar_bestia', {
      p_token: sesion.token,
      p_alumno_id: sesion.alumnoId,
      p_password: sesion.password,
      p_bestia_id: bestia.id
    });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Compraste ' + bestia.nombre + ' para tu Bestiario Magico.');
  };

  useEffect(() => {
    abrirCartaRef.current = abrirCarta;
  });

  const iniciarArrastre = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const ahora = performance.now();
    setArrastre({ activo: true, inicio: event.clientX, inicioY: event.clientY, startPos: posicionCarrusel, lastX: event.clientX, lastTime: ahora, velocity: 0 });
  };

  const moverArrastre = (event) => {
    if (!arrastre.activo) return;
    const ahora = performance.now();
    const delta = event.clientX - arrastre.inicio;
    const deltaY = event.clientY - arrastre.inicioY;
    if (event.pointerType !== 'mouse' && Math.abs(delta) < Math.abs(deltaY) * 0.75) return;
    event.preventDefault?.();
    const siguiente = arrastre.startPos - delta / 118;
    const dt = Math.max(1, ahora - arrastre.lastTime);
    const velocity = (event.clientX - arrastre.lastX) / dt;
    setPosicionCarrusel(siguiente);
    setArrastre((actual) => ({ ...actual, lastX: event.clientX, lastTime: ahora, velocity }));
  };

  const cerrarArrastre = () => {
    if (!arrastre.activo) return;
    const impulso = -arrastre.velocity * 1.65;
    setPosicionCarrusel((actual) => Math.round(actual + impulso));
    setArrastre({ activo: false, inicio: 0, inicioY: 0, startPos: 0, lastX: 0, lastTime: 0, velocity: 0 });
  };

  useEffect(() => {
    if (!sesion?.token || !estado?.token) return undefined;
    const id = window.setInterval(async () => {
      const { data } = await db.rpc('cargar_clase', { p_token: sesion.token });
      if (data) setEstado(data);
    }, 900);
    return () => window.clearInterval(id);
  }, [sesion?.token, estado?.token, setEstado]);

  useEffect(() => {
    if (sesion.tipo !== 'alumno' || !autoAbrirRef.current) return;
    const alumno = estado.alumnos.find((item) => item.id === sesion.alumnoId);
    if (!alumno || alumno.oportunidades <= 0) return;
    autoAbrirRef.current = false;
    abrirCartaRef.current?.();
  }, [estado.alumnos, sesion.alumnoId, sesion.tipo]);

  const salir = () => { setSesion(null); setEstado(null); setModo('inicio'); setCartaAbierta(null); };
  const alumnoActual = sesion.tipo === 'alumno' ? estado.alumnos.find((alumno) => alumno.id === sesion.alumnoId) : null;
  const casaActual = obtenerCasa(alumnoActual?.casaId);
  const puntajesCasas = casas.map((casa) => ({ ...casa, puntos: estado.puntajes?.[casa.id] ?? 0 }));
  const maxPuntos = Math.max(...puntajesCasas.map((casa) => casa.puntos));
  const ganadoras = puntajesCasas.filter((casa) => casa.puntos === maxPuntos);
  const casaGanadora = maxPuntos > 0 && ganadoras.length === 1 ? ganadoras[0] : null;
  const heroStyle = { '--winner-house': casaGanadora?.color || '#2f4f3d', '--winner-metal': casaGanadora?.metal || '#ffd66d' };
  const tituloClase = 'Copa de las Casas - ' + (estado.nombre || 'Clase');
  const casaDetalle = casas.find((casa) => casa.id === casaDetalleId);
  const alumnosCasaDetalle = casaDetalle ? estado.alumnos.filter((alumno) => alumno.casaId === casaDetalle.id) : [];
  const resumenCasaDetalle = alumnosCasaDetalle.reduce((resumen, alumno) => ({
    positivos: resumen.positivos + (alumno.puntosPositivos ?? Math.max(alumno.puntos, 0)),
    negativos: resumen.negativos + (alumno.puntosNegativos ?? 0)
  }), { positivos: 0, negativos: 0 });
  const alumnosOrdenados = [...estado.alumnos].sort((a, b) => b.puntos - a.puntos);
  const busquedaNormalizada = busquedaAlumno.trim().toLowerCase();
  const alumnosFiltrados = busquedaNormalizada ? alumnosOrdenados.filter((alumno) => alumno.nombre.toLowerCase().includes(busquedaNormalizada)) : alumnosOrdenados;
  const indiceAlumnoSeguro = alumnosFiltrados.length ? Math.min(indiceAlumno, alumnosFiltrados.length - 1) : 0;
  const alumnoCarrusel = alumnosFiltrados[indiceAlumnoSeguro] || null;
  const casaCarrusel = obtenerCasa(alumnoCarrusel?.casaId);
  const rankingAlumno = alumnoCarrusel ? alumnosOrdenados.findIndex((alumno) => alumno.id === alumnoCarrusel.id) + 1 : 0;
  const bestiasAlumno = alumnoActual?.bestiario || [];
  const bestiasCompradas = new Set(bestiasAlumno);
  const bestiaDetalle = bestiario.find((bestia) => bestia.id === bestiaDetalleId);

  const moverAlumno = (direccion) => {
    if (!alumnosFiltrados.length) return;
    setIndiceAlumno((actual) => (Math.min(actual, alumnosFiltrados.length - 1) + direccion + alumnosFiltrados.length) % alumnosFiltrados.length);
  };
  const panelAlumno = (
    <aside className='panel student-help-panel'>
      <p className='tap-card-hint'>Toca la carta central para pedir autorizacion. Cuando el maestro autorice, se abrira automaticamente.</p>
      <div className='stored-cards-panel'>
        <div>
          <strong>Cartas guardadas</strong>
          <small>Presentalas al maestro cuando quieras usarlas.</small>
        </div>
        {(!alumnoActual?.cartasGuardadas || alumnoActual.cartasGuardadas.length === 0) && <p>No tienes cartas guardadas todavia.</p>}
        <div className='stored-cards-list'>
          {(alumnoActual?.cartasGuardadas || []).map((carta) => (
            <article className='stored-card' key={carta.id}>
              <img src={'/hechi/card-' + carta.numero + '.png'} alt={carta.titulo} />
              <span><b>{carta.titulo}</b><small>{carta.descripcion}</small></span>
              <button type='button' onClick={() => usarCartaGuardada(carta)}>Usar</button>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
  const bestiaryPanel = (
    <section className='panel bestiary-panel student-tab-panel'>
      <div className='bestiary-heading'>
        <span>
          <strong>Bestiario Magico</strong>
          <small>{bestiasAlumno.length}/{bestiario.length} criaturas descubiertas</small>
        </span>
        <b>{alumnoActual?.galeones || 0} galeones</b>
      </div>
      <div className='bestiary-market'>
        {bestiario.map((bestia) => {
          const comprada = bestiasCompradas.has(bestia.id);
          const precio = precioBestia(bestia);
          const puedeComprar = !comprada && (alumnoActual?.galeones || 0) >= precio;
          const rareza = RAREZAS_BESTIARIO[bestia.rareza];
          return (
            <article className={'beast-card ' + (comprada ? 'owned' : 'locked')} key={bestia.id}>
              <button type='button' className='beast-preview' onClick={() => setBestiaDetalleId(bestia.id)}>
                <img src={bestia.imagen} alt={bestia.nombre} />
                <span>{comprada ? 'Descubierta' : rareza.nombre}</span>
              </button>
              <div>
                <strong>{bestia.nombre}</strong>
                <small>{rareza.nombre} - {precio} galeones</small>
              </div>
              <button type='button' disabled={comprada || !puedeComprar} onClick={() => comprarBestia(bestia)}>
                {comprada ? 'Tuya' : 'Comprar'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
  const studentTabs = [
    { id: 'inicio', label: 'Inicio', icon: <FaHouse /> },
    { id: 'puntaje', label: 'Puntaje', icon: <FaTrophy /> },
    { id: 'bestiario', label: 'Bestiario', icon: <FaBookOpen /> },
    { id: 'hechizos', label: 'Hechizos', icon: <FaScroll /> }
  ];
  const houseBoard = (
    <section className='house-board student-score-view'>
      {casas.map((casa) => (
        <button key={casa.id} type='button' className='house-card' style={{ '--house': casa.color, '--metal': casa.metal }} onClick={() => setCasaDetalleId(casa.id)}>
          <img className='house-crest' src={casa.escudo} alt='' />
          <span>{estado.conteos[casa.id]}/{estado.objetivos[casa.id]} aprendices</span>
          <h2>{casa.nombre}</h2>
          <strong>{estado.puntajes[casa.id]} pts</strong>
          <dl className='house-score-breakdown'>
            <div><dt>+</dt><dd>{estado.puntajesPositivos?.[casa.id] ?? estado.puntajes[casa.id]}</dd></div>
            <div><dt>-</dt><dd>{estado.puntajesNegativos?.[casa.id] ?? 0}</dd></div>
            <div><dt>Total</dt><dd>{estado.puntajes[casa.id]}</dd></div>
          </dl>
          {estado.casaProtegida === casa.id && <em className='house-status protected'>Protegida</em>}
          {estado.casaMultiplicador === casa.id && <em className='house-status multiplier'>x2 pendiente</em>}
        </button>
      ))}
    </section>
  );

  return (
    <main className={'game-shell app-fixed mobile-scroll-page ' + (sesion.tipo === 'alumno' ? 'student-view' : 'teacher-view')}>
      <header className='hero compact-hero house-cup-hero' style={heroStyle}>
        <div>
          <span className='eyebrow'><FaWandMagicSparkles /> {sesion.tipo === 'maestro' ? 'Vista maestro' : 'Vista alumno'}</span>
          <h1>{tituloClase}</h1>
          <p>{sesion.tipo === 'maestro' ? ('Token de clase: ' + estado.token + (casaGanadora ? ' - Va ganando ' + casaGanadora.nombre : '')) : ('Token ' + estado.token + ' - espera autorizacion para abrir carta.')}</p>
        </div>
        <div className='hero-actions'>
          {sesion.tipo === 'alumno' && <span className='player-badge' style={{ '--house': casaActual.color, '--metal': casaActual.metal }}>{alumnoActual?.nombre} - {casaActual.nombre} - {alumnoActual?.oportunidades || 0} oportunidades</span>}
          {sesion.tipo === 'alumno' && <button type='button' className='ghost change-own-password' onClick={() => setMostrarCambioPassword(true)}>Cambiar contrasena</button>}
          {sesion.tipo === 'maestro' && <button type='button' className='ghost' onClick={iniciarNuevoParcial}>Nuevo parcial</button>}
          {sesion.tipo === 'maestro' && <button type='button' className='ghost danger-soft' onClick={eliminarClase}>Eliminar clase</button>}
          <button type='button' className='ghost' onClick={salir}>Salir</button>
        </div>
      </header>

      {sesion.tipo === 'maestro' && houseBoard}

      {sesion.tipo === 'alumno' ? (
        <section className='student-tabs-area'>
          <div className='student-tab-switcher'>
            {studentTabs.map((tab) => (
              <button key={tab.id} type='button' className={studentTab === tab.id ? 'active' : ''} onClick={() => setStudentTab(tab.id)}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            ))}
          </div>

          {studentTab === 'inicio' && (
            <section className='student-home-tab'>
              <section className='pack-stage'>
                <div className='carousel-shell'>
                  <button className='carousel-nav' type='button' onClick={(event) => moverSobre(-1, event)} aria-label='Carta anterior'><FaArrowLeft /></button>
                  <div
                    className={'pack-carousel ' + (arrastre.activo ? 'dragging' : '')}
                    onPointerDown={iniciarArrastre}
                    onPointerMove={moverArrastre}
                    onPointerUp={cerrarArrastre}
                    onPointerCancel={cerrarArrastre}
                    onPointerLeave={cerrarArrastre}
                  >
                    {Array.from({ length: 13 }, (_, item) => item - 6).map((offset) => {
                      const centro = Math.round(posicionCarrusel);
                      const progreso = posicionCarrusel - centro;
                      const visualOffset = offset - progreso;
                      const cartaId = ((centro + offset) % sobres.length + sobres.length) % sobres.length;
                      const distancia = Math.min(3.4, Math.abs(visualOffset));
                      return (
                        <button type='button' key={centro + '-' + offset} className={'pack-card ' + (Math.abs(visualOffset) < 0.45 ? 'active' : '')} style={{ '--offset': visualOffset, '--distance': distancia }} onClick={() => Math.abs(visualOffset) < 0.45 ? abrirCarta() : setPosicionCarrusel(centro + offset)}>
                          <img src='/hechi/card-back.png' alt={'Carta ' + (cartaId + 1)} draggable='false' />
                        </button>
                      );
                    })}
                  </div>
                  <button className='carousel-nav' type='button' onClick={(event) => moverSobre(1, event)} aria-label='Carta siguiente'><FaArrowRight /></button>
                </div>
                <p className='message'>{mensaje}</p>
              </section>
              {panelAlumno}
            </section>
          )}

          {studentTab === 'bestiario' && bestiaryPanel}

          {studentTab === 'puntaje' && houseBoard}

          {studentTab === 'hechizos' && (
            <aside className='panel history parchment-panel student-tab-panel'>
              <h2>Ultimos hechizos</h2>
              {estado.historial.length === 0 && <p className='empty'>Aun no se abre ninguna carta.</p>}
              {estado.historial.map((item) => {
                const casaHistorial = obtenerCasa(item.casaId);
                const puntosHistorial = item.puntos > 0 ? '+' + item.puntos : String(item.puntos);
                return <div className='history-row' key={item.id} style={{ '--house': casaHistorial.color, '--metal': casaHistorial.metal }}><strong>{item.alumno}</strong><span>{casaHistorial.nombre} {puntosHistorial}</span></div>;
              })}
            </aside>
          )}

          <nav className='student-bottom-nav' aria-label='Navegacion de alumno'>
            {studentTabs.map((tab) => (
              <button key={tab.id} type='button' className={studentTab === tab.id ? 'active' : ''} onClick={() => setStudentTab(tab.id)} aria-label={tab.label}>
                {tab.icon}<span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </section>
      ) : (
        <section className='pocket-layout no-scroll-grid'>
          <aside className='panel roster hall-panel'>
            <div className='roster-heading'>
              <h2>Gran salon</h2>
              <span>{alumnosFiltrados.length}/{estado.alumnos.length}</span>
            </div>
            <label className='student-search'>
              <span>Buscar alumno</span>
              <input
                value={busquedaAlumno}
                onChange={(event) => {
                  setBusquedaAlumno(event.target.value);
                  setIndiceAlumno(0);
                }}
                placeholder='Nombre del alumno'
              />
            </label>
            {alumnoCarrusel ? (
              <div className='student-carousel' style={{ '--house': casaCarrusel.color, '--metal': casaCarrusel.metal }}>
                <div className='student-carousel-card'>
                  <span className='rank'>{rankingAlumno}</span>
                  <div>
                    <strong>{alumnoCarrusel.nombre}</strong>
                    <small>{casaCarrusel.nombre} - {alumnoCarrusel.cartas.length} cartas - {alumnoCarrusel.oportunidades} oportunidades</small>
                  </div>
                  <b>{alumnoCarrusel.puntos} pts</b>
                  <div className='student-actions'>
                    <button type='button' className='authorize password' onClick={() => cambiarPassword(alumnoCarrusel)}>Cambiar contrasena</button>
                    <button type='button' className='authorize remove-points' onClick={() => quitarPuntosAlumno(alumnoCarrusel)}>Quitar puntos</button>
                    <button type='button' className='authorize delete-student' onClick={() => eliminarAlumno(alumnoCarrusel)}>Eliminar</button>
                  </div>
                </div>
                <div className='student-carousel-nav'>
                  <button type='button' className='authorize carousel-control arrow-control' onClick={() => moverAlumno(-1)} aria-label='Alumno anterior'><FaArrowLeft /></button>
                  <span>{indiceAlumnoSeguro + 1} de {alumnosFiltrados.length}</span>
                  <button type='button' className='authorize carousel-control arrow-control' onClick={() => moverAlumno(1)} aria-label='Alumno siguiente'><FaArrowRight /></button>
                </div>
              </div>
            ) : (
              <p className='empty'>No hay alumnos con esa busqueda.</p>
            )}
          </aside>

          <section className='pack-stage teacher-requests-stage'>
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
                      <div className='request-actions'>
                        <button type='button' onClick={() => autorizar(solicitud.alumnoId)}>Autorizar</button>
                        <button type='button' className='reject-request' onClick={() => rechazar(solicitud.alumnoId)}>No autorizar</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
            <p className='message'>{mensaje}</p>
          </section>

          <aside className='panel history parchment-panel'>
            <h2>Ultimos hechizos</h2>
            {estado.historial.length === 0 && <p className='empty'>Aun no se abre ninguna carta.</p>}
            {estado.historial.map((item) => {
              const casaHistorial = obtenerCasa(item.casaId);
              const puntosHistorial = item.puntos > 0 ? '+' + item.puntos : String(item.puntos);
              return <div className='history-row' key={item.id} style={{ '--house': casaHistorial.color, '--metal': casaHistorial.metal }}><strong>{item.alumno}</strong><span>{casaHistorial.nombre} {puntosHistorial}</span></div>;
            })}
          </aside>
        </section>
      )}

      {casaDetalle && (
        <div className='house-detail-modal' role='dialog' aria-modal='true' aria-labelledby='house-detail-title'>
          <div className='house-detail-card' style={{ '--house': casaDetalle.color, '--metal': casaDetalle.metal }}>
            <button type='button' className='house-detail-close' onClick={() => setCasaDetalleId(null)} aria-label='Cerrar detalle'>x</button>
            <header>
              <img src={casaDetalle.escudo} alt='' />
              <div>
                <span>Casa</span>
                <h2 id='house-detail-title'>{casaDetalle.nombre}</h2>
                <p>{alumnosCasaDetalle.length} alumnos - {estado.puntajes[casaDetalle.id] ?? 0} pts</p>
              </div>
            </header>
            <div className='house-detail-table-wrap'>
              <table className='house-detail-table'>
                <thead>
                  <tr>
                    <th>Nombres</th>
                    <th>Positivos</th>
                    <th>Negativos</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnosCasaDetalle.map((alumno) => (
                    <tr key={alumno.id}>
                      <td>{alumno.nombre}</td>
                      <td>{alumno.puntosPositivos ?? Math.max(alumno.puntos, 0)}</td>
                      <td>{alumno.puntosNegativos ?? 0}</td>
                    </tr>
                  ))}
                  <tr className='house-detail-total'>
                    <td>Total</td>
                    <td>{resumenCasaDetalle.positivos}</td>
                    <td>{resumenCasaDetalle.negativos}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mostrarCambioPassword && (
        <div className='password-modal' role='dialog' aria-modal='true' aria-labelledby='password-modal-title'>
          <form className='password-card' onSubmit={cambiarPasswordPropia}>
            <button type='button' className='house-detail-close' onClick={() => setMostrarCambioPassword(false)} aria-label='Cerrar cambio de contrasena'>x</button>
            <h2 id='password-modal-title'>Cambiar contrasena</h2>
            <label>
              <span>Nueva contrasena</span>
              <input type='password' value={passwordNuevaAlumno} onChange={(event) => setPasswordNuevaAlumno(event.target.value)} minLength='3' autoComplete='new-password' />
            </label>
            <label>
              <span>Confirmar contrasena</span>
              <input type='password' value={passwordConfirmacionAlumno} onChange={(event) => setPasswordConfirmacionAlumno(event.target.value)} minLength='3' autoComplete='new-password' />
            </label>
            <button type='submit' className='authorize password'>Guardar contrasena</button>
          </form>
        </div>
      )}

      {bestiaDetalle && (
        <div className='beast-detail-modal' role='dialog' aria-modal='true' aria-labelledby='beast-detail-title'>
          <article className='beast-detail-card'>
            <button type='button' className='house-detail-close' onClick={() => setBestiaDetalleId(null)} aria-label='Cerrar detalle'>x</button>
            <img src={bestiaDetalle.imagen} alt={bestiaDetalle.nombre} />
            <span>{RAREZAS_BESTIARIO[bestiaDetalle.rareza].nombre} - {precioBestia(bestiaDetalle)} galeones</span>
            <h2 id='beast-detail-title'>{bestiaDetalle.nombre}</h2>
            <p>{bestiaDetalle.descripcion}</p>
            <strong>{bestiasCompradas.has(bestiaDetalle.id) ? 'Ya vive en tu Bestiario Magico.' : 'Aun no la has comprado.'}</strong>
          </article>
        </div>
      )}

      <CardModal
        carta={cartaAbierta}
        casasRivales={casas.filter((casa) => casa.id !== alumnoActual?.casaId && casa.id !== estado.casaProtegida)}
        alumnosIntercambio={estado.alumnos.filter((alumno) => alumno.casaId !== estado.casaProtegida)}
        alumnosPuntos={estado.alumnos}
        alumnosCompanero={estado.alumnos}
        alumnosReplica={estado.alumnos.filter((alumno) => alumno.casaId !== estado.casaProtegida)}
        alumnosRobo={estado.alumnos.filter((alumno) => alumno.casaId !== estado.casaProtegida)}
        onSelectRival={seleccionarCasaRival}
        onSelectExchange={seleccionarIntercambio}
        onSelectPointSwap={seleccionarIntercambioPuntos}
        onSelectCompanionBonus={seleccionarCompaneroBonus}
        onSelectReplica={seleccionarReplicaPuntos}
        onSelectRobbery={seleccionarRoboMultiple}
        onSelectJokeDecision={seleccionarDecisionChiste}
        onClose={() => {
          if (cartaAbierta?.pendienteRival) return setMensaje('Primero elige la casa rival para aplicar la carta.');
          if (cartaAbierta?.pendienteIntercambio) return setMensaje('Primero completa el intercambio de Imperio.');
          if (cartaAbierta?.pendientePuntosIntercambio) return setMensaje('Primero completa el intercambio de puntos de Confundo.');
          if (cartaAbierta?.pendienteCompaneroBonus) return setMensaje('Primero elige el companero para Amortentia.');
          if (cartaAbierta?.pendienteReplicaPuntos) return setMensaje('Primero elige el alumno para Multijugos.');
          if (cartaAbierta?.pendienteRoboMultiple) return setMensaje('Primero elige 5 alumnos para Morsmordre.');
          if (cartaAbierta?.pendienteDecisionChiste) return setMensaje('Primero elige si contaras el chiste de Riddikulus.');
          return setCartaAbierta(null);
        }}
      />
    </main>
  );
}

export default GameView;
