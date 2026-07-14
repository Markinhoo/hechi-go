import { useMemo, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaHatWizard, FaRotate, FaUserPlus, FaWandMagicSparkles } from 'react-icons/fa6';

const TOTAL_CARTAS = 28;
const CLASS_KEY = 'hechi-pocket-class-v2';
const PLAYER_KEY = 'hechi-pocket-player-v2';

const casas = [
  { id: 'gryffindor', nombre: 'Gryffindor', color: '#8f1628', metal: '#f0c75e', escudo: '/houses/gryffindor.png' },
  { id: 'slytherin', nombre: 'Slytherin', color: '#0d5c45', metal: '#c8d2d8', escudo: '/houses/slytherin.png' },
  { id: 'ravenclaw', nombre: 'Ravenclaw', color: '#174b7a', metal: '#c99445', escudo: '/houses/ravenclaw.png' },
  { id: 'hufflepuff', nombre: 'Hufflepuff', color: '#e0ad25', metal: '#1f1a18', escudo: '/houses/hufflepuff.png' }
];

const efectosCartas = Array.from({ length: TOTAL_CARTAS }, (_, index) => {
  const numero = index + 1;
  if ([4, 12, 21, 28].includes(numero)) return { puntos: 40, titulo: 'Hechizo supremo', descripcion: 'La casa recibe una gran recompensa por una participacion brillante.' };
  if ([7, 14, 23].includes(numero)) return { puntos: 30, titulo: 'Reliquia poderosa', descripcion: 'La casa sube con fuerza en el marcador.' };
  if ([5, 10, 15, 20, 25].includes(numero)) return { puntos: 20, titulo: 'Encantamiento mayor', descripcion: 'La participacion suma una ventaja importante.' };
  if (numero % 2 === 0) return { puntos: 15, titulo: 'Carta especial', descripcion: 'Buen aporte para la casa.' };
  return { puntos: 10, titulo: 'Carta comun', descripcion: 'Suma base por participacion autorizada.' };
});

function randomEntero(maximo) {
  const valores = new Uint32Array(1);
  crypto.getRandomValues(valores);
  return valores[0] % maximo;
}

function calcularObjetivos(total) {
  const base = Math.floor(total / casas.length);
  const sobrantes = total % casas.length;
  return casas.reduce((acc, casa, index) => ({ ...acc, [casa.id]: base + (index < sobrantes ? 1 : 0) }), {});
}

function crearEstadoInicial(total) {
  return {
    total,
    objetivos: calcularObjetivos(total),
    alumnos: [],
    puntajes: casas.reduce((acc, casa) => ({ ...acc, [casa.id]: 0 }), {}),
    sobreActivo: 0,
    ultimaCarta: null,
    historial: []
  };
}

function normalizarEstado(estado) {
  if (!estado) return null;
  const total = estado.total || Math.max(4, estado.alumnos?.length || 4);
  return {
    ...crearEstadoInicial(total),
    ...estado,
    total,
    objetivos: estado.objetivos || calcularObjetivos(total),
    alumnos: (estado.alumnos || []).map((alumno) => ({ oportunidades: 0, cartas: [], puntos: 0, ...alumno })),
    puntajes: { ...casas.reduce((acc, casa) => ({ ...acc, [casa.id]: 0 }), {}), ...(estado.puntajes || {}) },
    historial: estado.historial || []
  };
}

function cargarEstado() {
  try {
    return normalizarEstado(JSON.parse(localStorage.getItem(CLASS_KEY) || 'null'));
  } catch {
    return null;
  }
}

function guardarEstado(estado) {
  localStorage.setItem(CLASS_KEY, JSON.stringify(estado));
}

function cargarJugador() {
  try {
    return JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null');
  } catch {
    return null;
  }
}

function guardarJugador(jugador) {
  localStorage.setItem(PLAYER_KEY, JSON.stringify(jugador));
}

function contarPorCasa(alumnos, casaId) {
  return alumnos.filter((alumno) => alumno.casaId === casaId).length;
}

function elegirCasaDisponible(estado) {
  const opciones = casas
    .map((casa) => {
      const actual = contarPorCasa(estado.alumnos, casa.id);
      const objetivo = estado.objetivos[casa.id] || 1;
      return { casa, actual, objetivo, carga: actual / objetivo };
    })
    .filter((item) => item.actual < item.objetivo)
    .sort((a, b) => a.carga - b.carga || a.actual - b.actual);

  if (opciones.length) return opciones[randomEntero(Math.min(2, opciones.length))].casa;
  return casas[randomEntero(casas.length)];
}

function obtenerCasa(casaId) {
  return casas.find((casa) => casa.id === casaId) || casas[0];
}

function efectoCarta(numero) {
  return efectosCartas[numero - 1] || efectosCartas[0];
}

function AdminSetup({ onCrear }) {
  const [total, setTotal] = useState(30);
  const objetivos = useMemo(() => calcularObjetivos(Math.max(4, Number(total) || 4)), [total]);

  return (
    <main className='auth-shell'>
      <section className='auth-card setup-card'>
        <span className='eyebrow'><FaHatWizard /> Ceremonia de seleccion</span>
        <h1>HECHI GO</h1>
        <p>El administrador define cuantos aprendices hay en la clase. El juego reparte las casas de la forma mas pareja posible.</p>
        <label className='field-label' htmlFor='class-size'>Total de alumnos</label>
        <input id='class-size' type='number' min='4' max='120' value={total} onChange={(event) => setTotal(event.target.value)} />
        <div className='house-preview'>
          {casas.map((casa) => (
            <span key={casa.id} style={{ '--house': casa.color, '--metal': casa.metal }}>
              <img src={casa.escudo} alt='' />
              <b>{casa.nombre}</b>
              <small>{objetivos[casa.id]} lugares</small>
            </span>
          ))}
        </div>
        <button type='button' onClick={() => onCrear(Math.max(4, Number(total) || 4))}>Iniciar clase magica</button>
      </section>
    </main>
  );
}

function NameLogin({ estado, onEntrar }) {
  const [nombre, setNombre] = useState('');
  const cupoLleno = estado.alumnos.length >= estado.total;

  const entrar = (event) => {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio || cupoLleno) return;
    onEntrar(limpio);
  };

  return (
    <main className='auth-shell'>
      <section className='auth-card login-card'>
        <span className='eyebrow'><FaUserPlus /> Registro de aprendiz</span>
        <h1>HECHI GO</h1>
        <p>Escribe tu nombre y el sombrero te asignara una casa disponible de forma balanceada.</p>
        <form onSubmit={entrar}>
          <input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder='Nombre del aprendiz' autoFocus />
          <button type='submit' disabled={cupoLleno}>{cupoLleno ? 'Clase completa' : 'Entrar al gran salon'}</button>
        </form>
        <div className='house-preview compact'>
          {casas.map((casa) => (
            <span key={casa.id} style={{ '--house': casa.color, '--metal': casa.metal }}>
              <img src={casa.escudo} alt='' />
              <b>{casa.nombre}</b>
              <small>{contarPorCasa(estado.alumnos, casa.id)}/{estado.objetivos[casa.id]}</small>
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

function App() {
  const [estado, setEstado] = useState(cargarEstado);
  const [jugador, setJugador] = useState(cargarJugador);
  const [mensaje, setMensaje] = useState('Gira el carrusel y elige una carta para abrir.');
  const [arrastre, setArrastre] = useState({ activo: false, inicio: 0, delta: 0 });

  const jugadorActual = jugador ? estado?.alumnos.find((alumno) => alumno.id === jugador.id) : null;
  const casaJugador = obtenerCasa(jugadorActual?.casaId);
  const sobres = Array.from({ length: 7 }, (_, index) => index);

  const actualizar = (siguiente) => {
    setEstado(siguiente);
    guardarEstado(siguiente);
  };

  const crearClase = (total) => {
    const nueva = crearEstadoInicial(total);
    actualizar(nueva);
    localStorage.removeItem(PLAYER_KEY);
    setJugador(null);
  };

  const entrar = (nombre) => {
    const casa = elegirCasaDisponible(estado);
    const nuevo = { id: crypto.randomUUID(), nombre, casaId: casa.id, cartas: [], puntos: 0, oportunidades: 0 };
    const siguiente = { ...estado, alumnos: [...estado.alumnos, nuevo] };
    actualizar(siguiente);
    guardarJugador({ id: nuevo.id });
    setJugador({ id: nuevo.id });
    setMensaje(nombre + ' fue asignado a ' + casa.nombre + '. Espera autorizacion del maestro para abrir carta.');
  };

  const moverSobre = (direccion) => {
    const siguiente = (estado.sobreActivo + direccion + sobres.length) % sobres.length;
    actualizar({ ...estado, sobreActivo: siguiente, ultimaCarta: null });
  };

  const autorizarParticipacion = (alumnoId) => {
    const alumnos = estado.alumnos.map((alumno) => alumno.id === alumnoId
      ? { ...alumno, oportunidades: (alumno.oportunidades || 0) + 1 }
      : alumno);
    const autorizado = alumnos.find((alumno) => alumno.id === alumnoId);
    actualizar({ ...estado, alumnos });
    setMensaje('Participacion autorizada para ' + autorizado.nombre + '. Ahora puede abrir una carta.');
  };

  const abrirCarta = () => {
    if (!jugadorActual) return;
    if ((jugadorActual.oportunidades || 0) <= 0) {
      setMensaje('Necesitas que el maestro autorice tu participacion antes de abrir carta.');
      return;
    }

    const numero = randomEntero(TOTAL_CARTAS) + 1;
    const efecto = efectoCarta(numero);
    const carta = {
      numero,
      puntos: efecto.puntos,
      titulo: efecto.titulo,
      descripcion: efecto.descripcion,
      casaId: jugadorActual.casaId,
      alumnoId: jugadorActual.id,
      alumno: jugadorActual.nombre
    };
    const alumnos = estado.alumnos.map((alumno) => alumno.id === jugadorActual.id
      ? { ...alumno, oportunidades: Math.max(0, (alumno.oportunidades || 0) - 1), puntos: alumno.puntos + efecto.puntos, cartas: [...alumno.cartas, numero] }
      : alumno);
    const puntajes = { ...estado.puntajes, [jugadorActual.casaId]: estado.puntajes[jugadorActual.casaId] + efecto.puntos };
    const siguiente = { ...estado, alumnos, puntajes, ultimaCarta: carta, historial: [carta, ...estado.historial].slice(0, 12) };
    actualizar(siguiente);
    setMensaje(casaJugador.nombre + ' gana ' + efecto.puntos + ' puntos. ' + efecto.descripcion);
  };

  const iniciarArrastre = (event) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setArrastre({ activo: true, inicio: event.clientX, delta: 0 });
  };

  const moverArrastre = (event) => {
    if (!arrastre.activo) return;
    setArrastre((actual) => ({ ...actual, delta: Math.max(-120, Math.min(120, event.clientX - actual.inicio)) }));
  };

  const cerrarArrastre = () => {
    if (!arrastre.activo) return;
    if (Math.abs(arrastre.delta) > 42) moverSobre(arrastre.delta < 0 ? 1 : -1);
    setArrastre({ activo: false, inicio: 0, delta: 0 });
  };

  const salir = () => {
    localStorage.removeItem(PLAYER_KEY);
    setJugador(null);
  };

  const reiniciar = () => {
    if (!window.confirm('Quieres reiniciar toda la clase y borrar casas, puntos y alumnos?')) return;
    localStorage.removeItem(CLASS_KEY);
    localStorage.removeItem(PLAYER_KEY);
    setEstado(null);
    setJugador(null);
  };

  if (!estado) return <AdminSetup onCrear={crearClase} />;
  if (!jugadorActual) return <NameLogin estado={estado} onEntrar={entrar} />;

  return (
    <main className='game-shell'>
      <header className='hero'>
        <div>
          <span className='eyebrow'><FaWandMagicSparkles /> Carta encantada</span>
          <h1>HECHI GO</h1>
          <p>El maestro autoriza participaciones; cada oportunidad permite abrir una carta y sumar puntos para la casa.</p>
        </div>
        <div className='hero-actions'>
          <span className='player-badge' style={{ '--house': casaJugador.color, '--metal': casaJugador.metal }}>{jugadorActual.nombre} - {casaJugador.nombre} - {jugadorActual.oportunidades || 0} oportunidades</span>
          <button type='button' className='ghost' onClick={salir}>Cambiar jugador</button>
          <button type='button' className='ghost' onClick={reiniciar}><FaRotate /> Reiniciar clase</button>
        </div>
      </header>

      <section className='house-board'>
        {casas.map((casa) => (
          <article key={casa.id} className='house-card' style={{ '--house': casa.color, '--metal': casa.metal }}>
            <img className='house-crest' src={casa.escudo} alt='' />
            <span>{contarPorCasa(estado.alumnos, casa.id)}/{estado.objetivos[casa.id]} aprendices</span>
            <h2>{casa.nombre}</h2>
            <strong>{estado.puntajes[casa.id]} pts</strong>
          </article>
        ))}
      </section>

      <section className='pocket-layout'>
        <aside className='panel roster'>
          <h2>Gran salon</h2>
          <div className='students'>
            {[...estado.alumnos].sort((a, b) => b.puntos - a.puntos).map((alumno, index) => {
              const casa = obtenerCasa(alumno.casaId);
              return (
                <div className='student-row' key={alumno.id} style={{ '--house': casa.color, '--metal': casa.metal }}>
                  <span className='rank'>{index + 1}</span>
                  <span><strong>{alumno.nombre}</strong><small>{casa.nombre} - {alumno.cartas.length} cartas - {alumno.oportunidades || 0} oportunidades</small></span>
                  <b>{alumno.puntos} pts</b>
                  <button type='button' className='authorize' onClick={() => autorizarParticipacion(alumno.id)}>Autorizar</button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className='pack-stage'>
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
                return (
                  <button
                    type='button'
                    key={sobre}
                    className={'pack-card ' + (normal === 0 ? 'active' : '')}
                    style={{ '--offset': normal, '--distance': Math.abs(normal), '--drag': arrastre.delta + 'px' }}
                    onClick={() => normal === 0 ? abrirCarta() : actualizar({ ...estado, sobreActivo: index, ultimaCarta: null })}
                  >
                    <img src='/hechi/card-back.png' alt='Reverso de carta HECHI' draggable='false' />
                  </button>
                );
              })}
            </div>
            <button className='carousel-nav' type='button' onClick={() => moverSobre(1)} aria-label='Carta siguiente'><FaArrowRight /></button>
          </div>

          <button type='button' className='open-pack' onClick={abrirCarta}>Abrir carta</button>
          <p className='message'>{mensaje}</p>

          {estado.ultimaCarta && (
            <article className='pull-result' style={{ '--house': obtenerCasa(estado.ultimaCarta.casaId).color, '--metal': obtenerCasa(estado.ultimaCarta.casaId).metal }}>
              <img src={'/hechi/card-' + estado.ultimaCarta.numero + '.png'} alt={'Carta ' + estado.ultimaCarta.numero} />
              <div>
                <span>{estado.ultimaCarta.titulo}</span>
                <h2>+{estado.ultimaCarta.puntos} puntos</h2>
                <p>{estado.ultimaCarta.descripcion}</p>
              </div>
            </article>
          )}
        </section>

        <aside className='panel history'>
          <h2>Ultimos hechizos</h2>
          {estado.historial.length === 0 && <p className='empty'>Aun no se abre ninguna carta.</p>}
          {estado.historial.map((item, index) => {
            const casa = obtenerCasa(item.casaId);
            return (
              <div className='history-row' key={item.alumnoId + '-' + item.numero + '-' + index} style={{ '--house': casa.color, '--metal': casa.metal }}>
                <strong>{item.alumno}</strong>
                <span>{casa.nombre} +{item.puntos}</span>
              </div>
            );
          })}
        </aside>
      </section>
    </main>
  );
}

export default App;