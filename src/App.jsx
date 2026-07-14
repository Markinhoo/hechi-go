import { useMemo, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaHatWizard, FaRotate, FaUserPlus, FaWandMagicSparkles } from 'react-icons/fa6';
import { TOTAL_CARTAS } from './services/hechiGame';

const CLASS_KEY = 'hechi-pocket-class-v1';
const PLAYER_KEY = 'hechi-pocket-player-v1';

const casas = [
  { id: 'gryffindor', nombre: 'Gryffindor', color: '#8f1628', metal: '#f0c75e' },
  { id: 'slytherin', nombre: 'Slytherin', color: '#0d5c45', metal: '#c8d2d8' },
  { id: 'ravenclaw', nombre: 'Ravenclaw', color: '#174b7a', metal: '#c99445' },
  { id: 'hufflepuff', nombre: 'Hufflepuff', color: '#e0ad25', metal: '#1f1a18' }
];

function randomEntero(maximo) {
  const valores = new Uint32Array(1);
  crypto.getRandomValues(valores);
  return valores[0] % maximo;
}
function crearEstadoInicial(total) {
  const objetivos = calcularObjetivos(total);
  return {
    total,
    objetivos,
    alumnos: [],
    puntajes: casas.reduce((acc, casa) => ({ ...acc, [casa.id]: 0 }), {}),
    sobreActivo: 0,
    ultimaCarta: null,
    historial: []
  };
}

function cargarEstado() {
  try {
    return JSON.parse(localStorage.getItem(CLASS_KEY) || 'null');
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

function calcularObjetivos(total) {
  const base = Math.floor(total / casas.length);
  const sobrantes = total % casas.length;
  return casas.reduce((acc, casa, index) => ({
    ...acc,
    [casa.id]: base + (index < sobrantes ? 1 : 0)
  }), {});
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

  if (opciones.length) return opciones[0].casa;
  return casas[randomEntero(casas.length)];
}

function obtenerCasa(casaId) {
  return casas.find((casa) => casa.id === casaId) || casas[0];
}

function valorCarta(numero) {
  if (numero % 11 === 0) return { puntos: 30, titulo: 'Reliquia legendaria' };
  if (numero % 7 === 0) return { puntos: 20, titulo: 'Hechizo mayor' };
  if (numero % 5 === 0) return { puntos: 15, titulo: 'Encantamiento brillante' };
  if (numero % 3 === 0) return { puntos: 10, titulo: 'Carta rara' };
  return { puntos: 5, titulo: 'Carta comun' };
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
        <p>Escribe tu nombre y el sombrero te asignara una casa disponible al azar balanceado.</p>
        <form onSubmit={entrar}>
          <input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder='Nombre del aprendiz' autoFocus />
          <button type='submit' disabled={cupoLleno}>{cupoLleno ? 'Clase completa' : 'Entrar al gran salon'}</button>
        </form>
        <div className='house-preview compact'>
          {casas.map((casa) => (
            <span key={casa.id} style={{ '--house': casa.color, '--metal': casa.metal }}>
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
  const [mensaje, setMensaje] = useState('Gira el carrusel y elige un sobre para abrir.');

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
    const nuevo = { id: crypto.randomUUID(), nombre, casaId: casa.id, cartas: [], puntos: 0 };
    const siguiente = { ...estado, alumnos: [...estado.alumnos, nuevo] };
    actualizar(siguiente);
    guardarJugador({ id: nuevo.id });
    setJugador({ id: nuevo.id });
    setMensaje(nombre + ' fue asignado a ' + casa.nombre + '.');
  };

  const moverSobre = (direccion) => {
    const siguiente = (estado.sobreActivo + direccion + sobres.length) % sobres.length;
    actualizar({ ...estado, sobreActivo: siguiente, ultimaCarta: null });
  };

  const abrirSobre = () => {
    if (!jugadorActual) return;

    const numero = randomEntero(TOTAL_CARTAS) + 1;
    const efecto = valorCarta(numero);
    const carta = { numero, puntos: efecto.puntos, titulo: efecto.titulo, casaId: jugadorActual.casaId, alumnoId: jugadorActual.id, alumno: jugadorActual.nombre };
    const alumnos = estado.alumnos.map((alumno) => alumno.id === jugadorActual.id
      ? { ...alumno, puntos: alumno.puntos + efecto.puntos, cartas: [...alumno.cartas, numero] }
      : alumno);
    const puntajes = { ...estado.puntajes, [jugadorActual.casaId]: estado.puntajes[jugadorActual.casaId] + efecto.puntos };
    const siguiente = { ...estado, alumnos, puntajes, ultimaCarta: carta, historial: [carta, ...estado.historial].slice(0, 12) };
    actualizar(siguiente);
    setMensaje(casaJugador.nombre + ' gana ' + efecto.puntos + ' puntos por ' + efecto.titulo + '.');
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
          <span className='eyebrow'><FaWandMagicSparkles /> Sobre encantado</span>
          <h1>HECHI GO</h1>
          <p>Gira el carrusel, abre un sobre y suma puntos para tu casa.</p>
        </div>
        <div className='hero-actions'>
          <span className='player-badge' style={{ '--house': casaJugador.color, '--metal': casaJugador.metal }}>{jugadorActual.nombre} Ã‚Â· {casaJugador.nombre}</span>
          <button type='button' className='ghost' onClick={salir}>Cambiar jugador</button>
          <button type='button' className='ghost' onClick={reiniciar}><FaRotate /> Reiniciar clase</button>
        </div>
      </header>

      <section className='house-board'>
        {casas.map((casa) => (
          <article key={casa.id} className='house-card' style={{ '--house': casa.color, '--metal': casa.metal }}>
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
                  <span><strong>{alumno.nombre}</strong><small>{casa.nombre} Ã‚Â· {alumno.cartas.length} cartas</small></span>
                  <b>{alumno.puntos} pts</b>
                </div>
              );
            })}
          </div>
        </aside>

        <section className='pack-stage'>
          <div className='carousel-shell'>
            <button className='carousel-nav' type='button' onClick={() => moverSobre(-1)} aria-label='Sobre anterior'><FaArrowLeft /></button>
            <div className='pack-carousel'>
              {sobres.map((sobre, index) => {
                const offset = index - estado.sobreActivo;
                const normal = offset > 3 ? offset - sobres.length : offset < -3 ? offset + sobres.length : offset;
                return (
                  <button
                    type='button'
                    key={sobre}
                    className={'pack-card ' + (normal === 0 ? 'active' : '')}
                    style={{ '--offset': normal, '--distance': Math.abs(normal) }}
                    onClick={() => normal === 0 ? abrirSobre() : actualizar({ ...estado, sobreActivo: index, ultimaCarta: null })}
                  >
                    <img src='/hechi/card-back.png' alt='Reverso del sobre HECHI' />
                  </button>
                );
              })}
            </div>
            <button className='carousel-nav' type='button' onClick={() => moverSobre(1)} aria-label='Sobre siguiente'><FaArrowRight /></button>
          </div>

          <button type='button' className='open-pack' onClick={abrirSobre}>Abrir sobre seleccionado</button>
          <p className='message'>{mensaje}</p>

          {estado.ultimaCarta && (
            <article className='pull-result' style={{ '--house': obtenerCasa(estado.ultimaCarta.casaId).color, '--metal': obtenerCasa(estado.ultimaCarta.casaId).metal }}>
              <img src={'/hechi/card-' + estado.ultimaCarta.numero + '.png'} alt={'Carta ' + estado.ultimaCarta.numero} />
              <div>
                <span>{estado.ultimaCarta.titulo}</span>
                <h2>+{estado.ultimaCarta.puntos} puntos</h2>
                <p>{obtenerCasa(estado.ultimaCarta.casaId).nombre} recibe el puntaje.</p>
              </div>
            </article>
          )}
        </section>

        <aside className='panel history'>
          <h2>Ultimos hechizos</h2>
          {estado.historial.length === 0 && <p className='empty'>Aun no se abre ningun sobre.</p>}
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