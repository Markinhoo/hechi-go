import { useEffect, useMemo, useState } from 'react';
import { FaBolt, FaCloud, FaRightFromBracket, FaRotate, FaStar, FaTrophy, FaUserPlus } from 'react-icons/fa6';
import { supabase } from './lib/supabaseClient';
import {
  TOTAL_CARTAS,
  cargarClase,
  cargarLocal,
  cerrarClase,
  crearAlumno,
  elegirCarta,
  guardarLocal,
  limpiarLocal,
  registrarParticipacion
} from './services/hechiGame';

const estadoInicial = {
  clase: null,
  alumnos: [],
  alumnoActivoId: '',
  puntosElegidos: 1,
  cartaActual: null
};

function crearAlumnoLocal(nombre) {
  return { id: crypto.randomUUID(), nombre, puntos: 0, cartas: [], participaciones: 0 };
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [loading, setLoading] = useState(false);

  const acceder = async (modo) => {
    setLoading(true);
    setMensaje('');

    const credenciales = { email: email.trim(), password };
    const { error } = modo === 'registro'
      ? await supabase.auth.signUp(credenciales)
      : await supabase.auth.signInWithPassword(credenciales);

    if (error) {
      setMensaje(error.message);
    } else if (modo === 'registro') {
      setMensaje('Cuenta creada. Si Supabase pide confirmacion, revisa tu correo.');
    }

    setLoading(false);
  };

  return (
    <main className='auth-shell'>
      <section className='auth-card'>
        <span className='eyebrow'>Juego para clase</span>
        <h1>HECHI GO</h1>
        <p>Registra participaciones, asigna puntos y descubre cartas HECHI con tu grupo.</p>
        <form onSubmit={(event) => { event.preventDefault(); acceder('login'); }}>
          <input type='email' value={email} onChange={(event) => setEmail(event.target.value)} placeholder='Correo' autoComplete='email' required />
          <input type='password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder='Contraseña' autoComplete='current-password' required minLength='6' />
          <button type='submit' disabled={loading}>Entrar</button>
          <button type='button' className='secondary' onClick={() => acceder('registro')} disabled={loading}>Crear cuenta</button>
        </form>
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
    </main>
  );
}

function GameApp({ session }) {
  const [estado, setEstado] = useState(estadoInicial);
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('Cargando clase...');
  const [modoDatos, setModoDatos] = useState('supabase');
  const [guardando, setGuardando] = useState(false);

  const alumnoActivo = estado.alumnos.find((alumno) => alumno.id === estado.alumnoActivoId);
  const ranking = useMemo(
    () => [...estado.alumnos].sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre)),
    [estado.alumnos]
  );

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        const datos = await cargarClase(session.user.id);
        if (!activo) return;
        setEstado({ ...estadoInicial, ...datos, alumnoActivoId: datos.alumnos[0]?.id || '' });
        setModoDatos('supabase');
        setMensaje('Clase conectada a Supabase.');
      } catch (error) {
        console.error(error);
        const local = cargarLocal() || estadoInicial;
        if (!activo) return;
        setEstado({ ...estadoInicial, ...local, alumnoActivoId: local.alumnoActivoId || local.alumnos?.[0]?.id || '' });
        setModoDatos('local');
        setMensaje('Modo local activo. Aplica la migracion de Supabase para guardar en la nube.');
      }
    }

    cargar();

    return () => {
      activo = false;
    };
  }, [session.user.id]);

  const aplicarEstado = (cambios) => {
    setEstado((actual) => {
      const siguiente = { ...actual, ...cambios };
      if (modoDatos === 'local') guardarLocal(siguiente);
      return siguiente;
    });
  };

  const agregarAlumno = async (event) => {
    event.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio || guardando) return;

    setGuardando(true);

    try {
      const alumno = modoDatos === 'supabase'
        ? await crearAlumno(estado.clase.id, nombreLimpio)
        : crearAlumnoLocal(nombreLimpio);
      const siguiente = { alumnos: [...estado.alumnos, alumno], alumnoActivoId: alumno.id, cartaActual: null };
      aplicarEstado(siguiente);
      guardarLocal({ ...estado, ...siguiente });
      setNombre('');
      setMensaje(nombreLimpio + ' esta listo para jugar.');
    } catch (error) {
      console.error(error);
      setMensaje('No pude guardar el alumno. Revisa Supabase e intenta otra vez.');
    } finally {
      setGuardando(false);
    }
  };

  const participar = async () => {
    if (!alumnoActivo || guardando) {
      setMensaje('Primero agrega o selecciona un alumno.');
      return;
    }

    const puntos = Math.max(0, Number(estado.puntosElegidos) || 0);
    const carta = elegirCarta(alumnoActivo.cartas);
    const esNueva = !alumnoActivo.cartas.includes(carta);
    const alumnoLocal = {
      ...alumnoActivo,
      puntos: alumnoActivo.puntos + puntos,
      participaciones: alumnoActivo.participaciones + 1,
      cartas: esNueva ? [...alumnoActivo.cartas, carta] : alumnoActivo.cartas
    };

    setGuardando(true);

    try {
      const alumnoGuardado = modoDatos === 'supabase'
        ? await registrarParticipacion({ claseId: estado.clase.id, alumno: alumnoActivo, puntos, carta, esNueva })
        : alumnoLocal;
      const alumnos = estado.alumnos.map((alumno) => alumno.id === alumnoActivo.id ? alumnoGuardado : alumno);
      const siguiente = { alumnos, cartaActual: carta, puntosElegidos: puntos };
      aplicarEstado(siguiente);
      guardarLocal({ ...estado, ...siguiente });
      setMensaje(alumnoActivo.nombre + ' gano ' + puntos + ' punto' + (puntos === 1 ? '' : 's') + (esNueva ? ' y una carta nueva.' : '.'));
    } catch (error) {
      console.error(error);
      setMensaje('No pude guardar la participacion. Intenta otra vez.');
    } finally {
      setGuardando(false);
    }
  };

  const reiniciar = async () => {
    if (!window.confirm('Quieres borrar la clase actual y comenzar una nueva?')) return;
    setGuardando(true);

    try {
      if (modoDatos === 'supabase' && estado.clase?.id) {
        await cerrarClase(estado.clase.id);
        const datos = await cargarClase(session.user.id);
        setEstado({ ...estadoInicial, ...datos });
      } else {
        limpiarLocal();
        setEstado(estadoInicial);
      }
      setMensaje('Clase reiniciada. Agrega al primer alumno.');
    } catch (error) {
      console.error(error);
      setMensaje('No pude reiniciar la clase. Intenta otra vez.');
    } finally {
      setGuardando(false);
    }
  };

  const salir = async () => {
    await supabase.auth.signOut();
  };

  return (
    <main className='game-shell'>
      <header className='hero'>
        <div>
          <span className='eyebrow'><FaBolt /> Aventura en clase</span>
          <h1>HECHI GO</h1>
          <p>Premia participaciones, descubre cartas y sigue el progreso de tu grupo.</p>
        </div>
        <div className='hero-actions'>
          <span className={'sync sync-' + modoDatos}><FaCloud /> {modoDatos === 'supabase' ? 'Supabase' : 'Local'}</span>
          <button type='button' className='ghost' onClick={reiniciar} disabled={guardando}><FaRotate /> Reiniciar</button>
          <button type='button' className='ghost' onClick={salir}><FaRightFromBracket /> Salir</button>
        </div>
      </header>

      <section className='layout'>
        <aside className='panel roster'>
          <h2>Equipo</h2>
          <form onSubmit={agregarAlumno} className='student-form'>
            <input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder='Nombre del alumno' disabled={guardando} />
            <button aria-label='Agregar alumno' disabled={guardando}><FaUserPlus /></button>
          </form>
          <div className='students'>
            {ranking.map((alumno, index) => (
              <button type='button' key={alumno.id} className={alumno.id === estado.alumnoActivoId ? 'active' : ''} onClick={() => aplicarEstado({ alumnoActivoId: alumno.id, cartaActual: null })}>
                <span className='rank'>{index + 1}</span>
                <span><strong>{alumno.nombre}</strong><small>{alumno.cartas.length}/{TOTAL_CARTAS} cartas</small></span>
                <b>{alumno.puntos} pts</b>
              </button>
            ))}
            {!estado.alumnos.length && <p className='empty'>Agrega alumnos para comenzar.</p>}
          </div>
        </aside>

        <section className='stage'>
          <div className='scorebar'>
            <div><span>Jugador</span><strong>{alumnoActivo?.nombre || 'Sin seleccionar'}</strong></div>
            <div><span>Puntos</span><strong>{alumnoActivo?.puntos || 0}</strong></div>
            <div><span>Cartas</span><strong>{alumnoActivo?.cartas.length || 0}/{TOTAL_CARTAS}</strong></div>
          </div>

          <div className={'card-reveal ' + (estado.cartaActual ? 'revealed' : '')} key={estado.cartaActual || 'back'}>
            {estado.cartaActual
              ? <img src={'/hechi/card-' + estado.cartaActual + '.png'} alt={'Carta HECHI ' + estado.cartaActual} />
              : <div className='card-back'><img src='/logo.png' alt='' /><strong>HECHI</strong><span>Que carta aparecera?</span></div>}
          </div>

          <div className='award'>
            <label htmlFor='points'>Cuantos puntos genera?</label>
            <div className='point-options'>
              {[1, 2, 3, 5, 10].map((puntos) => (
                <button type='button' key={puntos} className={estado.puntosElegidos === puntos ? 'active' : ''} onClick={() => aplicarEstado({ puntosElegidos: puntos })}><FaStar /> {puntos}</button>
              ))}
              <input id='points' type='number' min='0' max='100' value={estado.puntosElegidos} onChange={(event) => aplicarEstado({ puntosElegidos: Math.max(0, Number(event.target.value)) })} />
            </div>
            <button type='button' className='participate' onClick={participar} disabled={!alumnoActivo || guardando}><FaBolt /> Registrar participacion</button>
            <p className='message'>{guardando ? 'Guardando...' : mensaje}</p>
          </div>
        </section>

        <aside className='panel collection'>
          <h2><FaTrophy /> Coleccion</h2>
          <p>{alumnoActivo ? 'Cartas de ' + alumnoActivo.nombre : 'Selecciona un alumno'}</p>
          <div className='mini-grid'>
            {Array.from({ length: TOTAL_CARTAS }, (_, index) => index + 1).map((numero) => alumnoActivo?.cartas.includes(numero)
              ? <img key={numero} src={'/hechi/card-' + numero + '.png'} alt={'Carta ' + numero} />
              : <span key={numero}>{numero}</span>)}
          </div>
        </aside>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return <main className='loading'>Cargando HECHI GO...</main>;
  return session ? <GameApp session={session} /> : <AuthScreen />;
}

export default App;