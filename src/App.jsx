import { useMemo, useState } from 'react';
import { FaHatWizard, FaUserPlus, FaWandMagicSparkles, FaXmark } from 'react-icons/fa6';
import { supabase } from './lib/supabaseClient';

const TOTAL_CARTAS = 28;
const PLAYER_KEY = 'hechi-pocket-player-v3';
const TEACHER_KEY = 'hechi-pocket-teacher-v3';
const db = supabase.schema('hechi');

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

function generarToken() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => abc[randomEntero(abc.length)]).join('');
}

function calcularObjetivos(total) {
  const base = Math.floor(total / casas.length);
  const sobrantes = total % casas.length;
  return casas.reduce((acc, casa, index) => ({ ...acc, [casa.id]: base + (index < sobrantes ? 1 : 0) }), {});
}

function obtenerCasa(casaId) {
  return casas.find((casa) => casa.id === casaId) || casas[0];
}

function efectoCarta(numero) {
  return efectosCartas[numero - 1] || efectosCartas[0];
}

function cargarLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

function guardarLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function Inicio({ onModo }) {
  return (
    <main className='auth-shell'>
      <section className='auth-card setup-card'>
        <span className='eyebrow'><FaHatWizard /> Acceso HECHI</span>
        <h1>HECHI GO</h1>
        <p>El maestro crea una clase y comparte el token. Los alumnos entran con token, nombre y contrasena.</p>
        <div className='mode-grid'>
          <button type='button' onClick={() => onModo('maestro')}>Soy maestro</button>
          <button type='button' className='secondary' onClick={() => onModo('alumno')}>Soy alumno</button>
        </div>
      </section>
    </main>
  );
}

function MaestroAcceso({ onEntrar, mensaje, setMensaje }) {
  const [token, setToken] = useState(cargarLocal(TEACHER_KEY)?.token || '');
  const [pin, setPin] = useState(cargarLocal(TEACHER_KEY)?.pin || '');
  const [total, setTotal] = useState(30);
  const objetivos = useMemo(() => calcularObjetivos(Math.max(4, Number(total) || 4)), [total]);

  const crear = async () => {
    setMensaje('Creando clase...');
    const nuevoToken = generarToken();
    const { data, error } = await db.rpc('crear_clase', { p_token: nuevoToken, p_total: Math.max(4, Number(total) || 4), p_pin: pin.trim() || 'maestro' });
    if (error) return setMensaje(error.message);
    guardarLocal(TEACHER_KEY, { token: data.token, pin: pin.trim() || 'maestro' });
    onEntrar(data, pin.trim() || 'maestro');
  };

  const entrar = async (event) => {
    event.preventDefault();
    setMensaje('Entrando como maestro...');
    const { data, error } = await db.rpc('login_maestro', { p_token: token.trim().toUpperCase(), p_pin: pin });
    if (error) return setMensaje(error.message);
    guardarLocal(TEACHER_KEY, { token: token.trim().toUpperCase(), pin });
    onEntrar(data, pin);
  };

  return (
    <main className='auth-shell'>
      <section className='auth-card setup-card'>
        <span className='eyebrow'><FaHatWizard /> Maestro</span>
        <h1>Crear clase</h1>
        <label className='field-label'>PIN maestro</label>
        <input value={pin} onChange={(event) => setPin(event.target.value)} placeholder='PIN para administrar la clase' />
        <label className='field-label'>Total de alumnos</label>
        <input type='number' min='4' max='120' value={total} onChange={(event) => setTotal(event.target.value)} />
        <div className='house-preview compact'>
          {casas.map((casa) => <span key={casa.id} style={{ '--house': casa.color, '--metal': casa.metal }}><img src={casa.escudo} alt='' /><b>{casa.nombre}</b><small>{objetivos[casa.id]}</small></span>)}
        </div>
        <button type='button' onClick={crear}>Iniciar clase magica</button>
        <form onSubmit={entrar} className='teacher-login'>
          <label className='field-label'>Entrar a clase existente</label>
          <input value={token} onChange={(event) => setToken(event.target.value.toUpperCase())} placeholder='TOKEN' />
          <button type='submit' className='secondary'>Entrar con token</button>
        </form>
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
    </main>
  );
}

function AlumnoAcceso({ onEntrar, mensaje, setMensaje }) {
  const previo = cargarLocal(PLAYER_KEY);
  const [token, setToken] = useState(previo?.token || '');
  const [nombre, setNombre] = useState(previo?.nombre || '');
  const [password, setPassword] = useState(previo?.password || '');

  const entrar = async (event) => {
    event.preventDefault();
    setMensaje('Entrando a la clase...');
    const { data, error } = await db.rpc('entrar_alumno', { p_token: token.trim().toUpperCase(), p_nombre: nombre.trim(), p_password: password });
    if (error) return setMensaje(error.message);
    guardarLocal(PLAYER_KEY, { token: token.trim().toUpperCase(), nombre: nombre.trim(), password, alumnoId: data.alumno_id });
    onEntrar(data, { token: token.trim().toUpperCase(), nombre: nombre.trim(), password, alumnoId: data.alumno_id });
  };

  return (
    <main className='auth-shell'>
      <section className='auth-card login-card'>
        <span className='eyebrow'><FaUserPlus /> Alumno</span>
        <h1>Unirse a clase</h1>
        <form onSubmit={entrar}>
          <input value={token} onChange={(event) => setToken(event.target.value.toUpperCase())} placeholder='Token de clase' required />
          <input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder='Nombre del alumno' required />
          <input type='password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder='Contrasena' required />
          <button type='submit'>Entrar al gran salon</button>
        </form>
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
    </main>
  );
}

function App() {
  const [modo, setModo] = useState('inicio');
  const [sesion, setSesion] = useState(null);
  const [estado, setEstado] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [arrastre, setArrastre] = useState({ activo: false, inicio: 0, delta: 0 });
  const [cartaAbierta, setCartaAbierta] = useState(null);
  const [destellos, setDestellos] = useState([]);
  const sobres = Array.from({ length: 7 }, (_, index) => index);

  const crearDestello = (event, intenso = false) => {
    const x = event.clientX;
    const y = event.clientY;
    if (!x && !y) return;
    const id = crypto.randomUUID();
    setDestellos((actual) => [...actual.slice(-18), { id, x, y, intenso }]);
    window.setTimeout(() => setDestellos((actual) => actual.filter((d) => d.id !== id)), intenso ? 900 : 620);
  };

  const envolver = (contenido) => (
    <div className='magic-surface' onPointerMove={crearDestello} onPointerDown={(event) => crearDestello(event, true)}>
      {contenido}
      <div className='spark-layer' aria-hidden='true'>{destellos.map((d) => <span key={d.id} className={d.intenso ? 'spark burst' : 'spark'} style={{ left: d.x, top: d.y }} />)}</div>
    </div>
  );

  const refrescar = async (token) => {
    const { data, error } = await db.rpc('cargar_clase', { p_token: token });
    if (error) throw error;
    setEstado(data);
    return data;
  };

  const entrarMaestro = (data, pin) => {
    setSesion({ tipo: 'maestro', token: data.token, pin });
    setEstado(data);
    setModo('juego');
    setMensaje('Comparte este token con tus alumnos: ' + data.token);
  };

  const entrarAlumno = (data, credenciales) => {
    setSesion({ tipo: 'alumno', ...credenciales });
    setEstado(data);
    setModo('juego');
    setMensaje('Bienvenido al gran salon. Espera autorizacion para abrir carta.');
  };

  const autorizar = async (alumnoId) => {
    const { data, error } = await db.rpc('autorizar_participacion', { p_token: sesion.token, p_pin: sesion.pin, p_alumno_id: alumnoId });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Participacion autorizada.');
  };

  const cambiarPassword = async (alumno) => {
    const nueva = window.prompt('Nueva contrasena para ' + alumno.nombre);
    if (!nueva) return;
    const { data, error } = await db.rpc('cambiar_password_alumno', { p_token: sesion.token, p_pin: sesion.pin, p_alumno_id: alumno.id, p_password: nueva });
    if (error) return setMensaje(error.message);
    setEstado(data);
    setMensaje('Contrasena actualizada para ' + alumno.nombre + '.');
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

  const iniciarArrastre = (event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setArrastre({ activo: true, inicio: event.clientX, delta: 0 }); };
  const moverArrastre = (event) => { if (arrastre.activo) setArrastre((actual) => ({ ...actual, delta: Math.max(-150, Math.min(150, event.clientX - actual.inicio)) })); };
  const cerrarArrastre = () => { if (!arrastre.activo) return; if (Math.abs(arrastre.delta) > 34) moverSobre(arrastre.delta < 0 ? 1 : -1); setArrastre({ activo: false, inicio: 0, delta: 0 }); };

  const salir = () => { setSesion(null); setEstado(null); setModo('inicio'); setCartaAbierta(null); };

  if (modo === 'inicio') return envolver(<Inicio onModo={setModo} />);
  if (modo === 'maestro') return envolver(<MaestroAcceso onEntrar={entrarMaestro} mensaje={mensaje} setMensaje={setMensaje} />);
  if (modo === 'alumno') return envolver(<AlumnoAcceso onEntrar={entrarAlumno} mensaje={mensaje} setMensaje={setMensaje} />);
  if (!estado || !sesion) return envolver(<Inicio onModo={setModo} />);

  const alumnoActual = sesion.tipo === 'alumno' ? estado.alumnos.find((alumno) => alumno.id === sesion.alumnoId) : null;
  const casaActual = obtenerCasa(alumnoActual?.casaId);

  return envolver(
    <main className='game-shell app-fixed'>
      <header className='hero compact-hero'>
        <div>
          <span className='eyebrow'><FaWandMagicSparkles /> {sesion.tipo === 'maestro' ? 'Vista maestro' : 'Vista alumno'}</span>
          <h1>HECHI GO</h1>
          <p>{sesion.tipo === 'maestro' ? 'Token de clase: ' + estado.token : 'Token ' + estado.token + ' - espera autorizacion para abrir carta.'}</p>
        </div>
        <div className='hero-actions'>
          {sesion.tipo === 'alumno' && <span className='player-badge' style={{ '--house': casaActual.color, '--metal': casaActual.metal }}>{alumnoActual?.nombre} - {casaActual.nombre} - {alumnoActual?.oportunidades || 0} oportunidades</span>}
          <button type='button' className='ghost' onClick={() => refrescar(estado.token)}>Actualizar</button>
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
                  {sesion.tipo === 'maestro' && <button type='button' className='authorize' onClick={() => autorizar(alumno.id)}>Autorizar</button>}
                  {sesion.tipo === 'maestro' && <button type='button' className='authorize password' onClick={() => cambiarPassword(alumno)}>Contrasena</button>}
                </div>
              );
            })}
          </div>
        </aside>

        <section className='pack-stage'>
          <div className='carousel-shell mobile-no-arrows'>
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
                  <button type='button' key={sobre} className={'pack-card ' + (normal === 0 ? 'active' : '')} style={{ '--offset': normal, '--distance': Math.abs(normal), '--drag': arrastre.delta + 'px' }} onClick={() => normal === 0 ? abrirCarta() : setEstado({ ...estado, sobreActivo: index })}>
                    <img src='/hechi/card-back.png' alt='Reverso de carta HECHI' draggable='false' />
                  </button>
                );
              })}
            </div>
          </div>
          <button type='button' className='open-pack' onClick={abrirCarta}>Abrir carta</button>
          <p className='message'>{mensaje}</p>
        </section>

        <aside className='panel history parchment-panel'>
          <h2>Ultimos hechizos</h2>
          {estado.historial.length === 0 && <p className='empty'>Aun no se abre ninguna carta.</p>}
          {estado.historial.map((item) => <div className='history-row' key={item.id} style={{ '--house': obtenerCasa(item.casaId).color, '--metal': obtenerCasa(item.casaId).metal }}><strong>{item.alumno}</strong><span>{obtenerCasa(item.casaId).nombre} +{item.puntos}</span></div>)}
        </aside>
      </section>

      {cartaAbierta && <section className='card-modal' role='dialog' aria-modal='true'><button type='button' className='modal-close' onClick={() => setCartaAbierta(null)} aria-label='Cerrar carta'><FaXmark /></button><div className='modal-card-wrap'><div className='modal-card-flip'><div className='modal-card-face modal-card-back'><img src='/hechi/card-back.png' alt='' /></div><div className='modal-card-face modal-card-front'><img src={'/hechi/card-' + cartaAbierta.numero + '.png'} alt={'Carta ' + cartaAbierta.numero} /></div></div></div><article className='modal-effect' style={{ '--house': obtenerCasa(cartaAbierta.casaId).color, '--metal': obtenerCasa(cartaAbierta.casaId).metal }}><span>{cartaAbierta.titulo}</span><h2>+{cartaAbierta.puntos} puntos</h2><p>{cartaAbierta.descripcion}</p></article></section>}
    </main>
  );
}

export default App;