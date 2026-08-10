import { useEffect, useMemo, useState } from 'react';
import { FaArrowLeft, FaArrowRight, FaDoorOpen, FaHatWizard, FaLayerGroup, FaPlus } from 'react-icons/fa6';
import { casas, TEACHER_KEY } from '../../data/gameData';
import { db, supabase } from '../../services/hechiApi';
import { calcularObjetivos, cargarLocal, generarToken, guardarLocal } from '../../utils/gameUtils';
import ActionModal from '../ui/ActionModal';

function MaestroAcceso({ onEntrar, onSalir, mensaje, setMensaje }) {
  const previo = cargarLocal(TEACHER_KEY);
  const [authUser, setAuthUser] = useState(null);
  const [email, setEmail] = useState(previo?.email || '');
  const [password, setPassword] = useState('');
  const [grupo, setGrupo] = useState('9A');
  const [total, setTotal] = useState(30);
  const [clases, setClases] = useState([]);
  const [cargandoClases, setCargandoClases] = useState(false);
  const [accionClase, setAccionClase] = useState(null);
  const [accionError, setAccionError] = useState('');
  const [accionProcesando, setAccionProcesando] = useState(false);
  const [teacherHomeTab, setTeacherHomeTab] = useState('crear');
  const [busquedaClase, setBusquedaClase] = useState('');
  const [indiceClase, setIndiceClase] = useState(0);
  const objetivos = useMemo(() => calcularObjetivos(Math.max(4, Number(total) || 4)), [total]);
  const clasesFiltradas = useMemo(() => {
    const busqueda = busquedaClase.trim().toLowerCase();
    if (!busqueda) return clases;
    return clases.filter((clase) => clase.nombre.toLowerCase().includes(busqueda) || clase.token.toLowerCase().includes(busqueda));
  }, [busquedaClase, clases]);
  const indiceClaseSeguro = clasesFiltradas.length ? Math.min(indiceClase, clasesFiltradas.length - 1) : 0;
  const claseActual = clasesFiltradas[indiceClaseSeguro] || null;
  const teacherHomeTabs = [
    { id: 'crear', label: 'Crear', icon: <FaPlus /> },
    { id: 'clases', label: 'Clases', icon: <FaLayerGroup /> },
    { id: 'sesion', label: 'Sesion', icon: <FaDoorOpen /> }
  ];

  const cargarClases = async () => {
    if (!authUser) return;
    setCargandoClases(true);
    const { data, error } = await db.rpc('listar_clases_maestro');
    setCargandoClases(false);
    if (error) return setMensaje(error.message);
    setClases(data || []);
  };

  useEffect(() => {
    let vivo = true;
    supabase.auth.getUser().then(({ data }) => {
      if (vivo && data?.user) {
        setAuthUser(data.user);
        setEmail(data.user.email || '');
      }
    });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;
    const id = window.setTimeout(async () => {
      setCargandoClases(true);
      const { data, error } = await db.rpc('listar_clases_maestro');
      setCargandoClases(false);
      if (error) return setMensaje(error.message);
      setClases(data || []);
    }, 0);
    return () => window.clearTimeout(id);
  }, [authUser, setMensaje]);

  const iniciarSesion = async (event) => {
    event.preventDefault();
    setMensaje('Validando login del maestro...');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return setMensaje(error.message);
    setAuthUser(data.user);
    guardarLocal(TEACHER_KEY, { email: email.trim() });
    setMensaje('Login correcto. Elige una clase existente o crea una nueva.');
  };

  const cerrarSesion = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return setMensaje(error.message);
    setAuthUser(null);
    setClases([]);
    setPassword('');
    setMensaje('');
    onSalir?.();
  };

  const crear = async () => {
    if (!authUser) return setMensaje('Primero inicia sesion como maestro.');
    const nombreGrupo = grupo.trim();
    if (!nombreGrupo) return setMensaje('Escribe el nombre del grupo, por ejemplo 9A.');
    setMensaje('Creando clase...');
    const nuevoToken = generarToken();
    const { data, error } = await db.rpc('crear_clase', { p_token: nuevoToken, p_total: Math.max(4, Number(total) || 4), p_nombre: nombreGrupo });
    if (error) return setMensaje(error.message);
    guardarLocal(TEACHER_KEY, { email: email.trim() });
    await cargarClases();
    onEntrar(data);
  };

  const abrirClase = async (clase) => {
    if (!authUser) return setMensaje('Primero inicia sesion como maestro.');
    setMensaje('Abriendo ' + clase.nombre + '...');
    const { data, error } = await db.rpc('login_maestro', { p_token: clase.token });
    if (error) return setMensaje(error.message);
    guardarLocal(TEACHER_KEY, { email: email.trim() });
    onEntrar(data);
  };

  const abrirNuevoParcial = (clase) => {
    if (!authUser) return setMensaje('Primero inicia sesion como maestro.');
    setAccionError('');
    setAccionClase(clase);
  };

  const cerrarAccionClase = () => {
    if (accionProcesando) return;
    setAccionClase(null);
    setAccionError('');
  };

  const confirmarNuevoParcial = async () => {
    if (!accionClase || accionProcesando) return;
    setAccionError('');
    setAccionProcesando(true);
    setMensaje('Preparando nuevo parcial para ' + accionClase.nombre + '...');
    const { error } = await db.rpc('reiniciar_clase', { p_token: accionClase.token });
    if (error) {
      setAccionError(error.message);
      setAccionProcesando(false);
      return;
    }
    await cargarClases();
    setMensaje('Nuevo parcial listo para ' + accionClase.nombre + '.');
    setAccionProcesando(false);
    setAccionClase(null);
  };

  const moverClase = (direccion) => {
    if (!clasesFiltradas.length) return;
    setIndiceClase((actual) => (Math.min(actual, clasesFiltradas.length - 1) + direccion + clasesFiltradas.length) % clasesFiltradas.length);
  };

  const createClassPanel = (
    <section className='create-class-panel'>
      <h2>Crear clase nueva</h2>
      <label className='field-label'>Nombre del grupo</label>
      <input value={grupo} onChange={(event) => setGrupo(event.target.value)} placeholder='9A, 9B, 9ABIS...' disabled={!authUser} />
      <label className='field-label'>Total de alumnos</label>
      <input type='number' min='4' max='120' value={total} onChange={(event) => setTotal(event.target.value)} disabled={!authUser} />
      <div className='house-preview compact'>
        {casas.map((casa) => <span key={casa.id} style={{ '--house': casa.color, '--metal': casa.metal }}><img src={casa.escudo} alt='' /><b>{casa.nombre}</b><small>{objetivos[casa.id]}</small></span>)}
      </div>
      <button type='button' onClick={crear} disabled={!authUser}>Crear clase nueva</button>
    </section>
  );

  const savedClassesPanel = (
    <section className='saved-classes-panel'>
      <div className='panel-title-row'>
        <h2>Clases creadas</h2>
        <button type='button' className='ghost dark small' onClick={cargarClases} disabled={!authUser || cargandoClases}>{cargandoClases ? '...' : 'Actualizar'}</button>
      </div>
      {!authUser && <p className='empty'>Inicia sesion para ver tus clases.</p>}
      {authUser && clases.length === 0 && <p className='empty'>Aun no tienes clases guardadas.</p>}
      <div className='class-list'>
        {clases.map((clase) => (
          <article className='class-row' key={clase.id}>
            <div>
              <strong>{clase.nombre}</strong>
              <span>Token {clase.token} - {clase.alumnos}/{clase.total} alumnos - {clase.puntos} pts</span>
            </div>
            <div className='class-row-actions'>
              <button type='button' onClick={() => abrirClase(clase)}>Abrir</button>
              <button type='button' className='new-period-button' onClick={() => abrirNuevoParcial(clase)}>Nuevo parcial</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  const mobileClassesPanel = (
    <section className='saved-classes-panel mobile-classes-panel'>
      <div className='panel-title-row'>
        <h2>Clases creadas</h2>
        <button type='button' className='ghost dark small' onClick={cargarClases} disabled={!authUser || cargandoClases}>{cargandoClases ? '...' : 'Actualizar'}</button>
      </div>
      <label className='student-search class-search'>
        <span>Buscar clase</span>
        <input value={busquedaClase} onChange={(event) => { setBusquedaClase(event.target.value); setIndiceClase(0); }} placeholder='Nombre o token' disabled={!authUser} />
      </label>
      {!authUser && <p className='empty'>Inicia sesion para ver tus clases.</p>}
      {authUser && clases.length === 0 && <p className='empty'>Aun no tienes clases guardadas.</p>}
      {authUser && clases.length > 0 && clasesFiltradas.length === 0 && <p className='empty'>No hay clases con esa busqueda.</p>}
      {claseActual && (
        <div className='mobile-class-carousel'>
          <article className='class-row mobile-class-card'>
            <div>
              <strong>{claseActual.nombre}</strong>
              <span>Token {claseActual.token} - {claseActual.alumnos}/{claseActual.total} alumnos - {claseActual.puntos} pts</span>
            </div>
            <div className='class-row-actions'>
              <button type='button' onClick={() => abrirClase(claseActual)}>Abrir</button>
              <button type='button' className='new-period-button' onClick={() => abrirNuevoParcial(claseActual)}>Nuevo parcial</button>
            </div>
          </article>
          <div className='mobile-class-nav'>
            <button type='button' onClick={() => moverClase(-1)} aria-label='Clase anterior'><FaArrowLeft /></button>
            <span>{indiceClaseSeguro + 1} de {clasesFiltradas.length}</span>
            <button type='button' onClick={() => moverClase(1)} aria-label='Clase siguiente'><FaArrowRight /></button>
          </div>
        </div>
      )}
    </section>
  );

  const sessionPanel = (
    <section className='teacher-session-panel'>
      <h2>Sesion</h2>
      {authUser ? (
        <>
          <p>{authUser.email}</p>
          <button type='button' className='ghost dark' onClick={cerrarSesion}>Cerrar login</button>
        </>
      ) : (
        <p>Inicia sesion para administrar tus clases.</p>
      )}
    </section>
  );

  return (
    <main className='auth-shell teacher-auth-shell'>
      <section className='auth-card setup-card teacher-card multi-class-card'>
        <span className='eyebrow'><FaHatWizard /> Maestro autorizado</span>
        <h1>Mis clases</h1>
        {!authUser ? (
          <form onSubmit={iniciarSesion} className='teacher-auth-form'>
            <label className='field-label'>Correo del maestro</label>
            <input type='email' value={email} onChange={(event) => setEmail(event.target.value)} placeholder='tu correo de Supabase Auth' required />
            <label className='field-label'>Contrasena</label>
            <input type='password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder='Contrasena del maestro' required />
            <button type='submit'>Entrar como maestro</button>
          </form>
        ) : (
          <div className='teacher-session'>
            <span>Sesion activa: {authUser.email}</span>
            <button type='button' className='ghost dark' onClick={cerrarSesion}>Cerrar login</button>
          </div>
        )}

        <div className={!authUser ? 'locked-class-tools class-management-grid teacher-desktop-home' : 'class-management-grid teacher-desktop-home'}>
          {createClassPanel}
          {savedClassesPanel}
        </div>
        {authUser && (
          <section className='teacher-home-mobile-app'>
            <div className='teacher-home-mobile-content'>
              {teacherHomeTab === 'crear' && createClassPanel}
              {teacherHomeTab === 'clases' && mobileClassesPanel}
              {teacherHomeTab === 'sesion' && sessionPanel}
            </div>
            <nav className='teacher-home-bottom-nav' aria-label='Menu de maestro'>
              {teacherHomeTabs.map((tab) => (
                <button key={tab.id} type='button' className={teacherHomeTab === tab.id ? 'active' : ''} onClick={() => setTeacherHomeTab(tab.id)}>
                  {tab.icon}<span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </section>
        )}
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
      <ActionModal
        open={Boolean(accionClase)}
        title='Nuevo parcial'
        eyebrow={accionClase?.nombre || 'Clase'}
        description='Se borraran puntos, cartas del parcial, solicitudes e historial. Se conservan alumnos, casas, galeones y bestiario.'
        confirmText='Iniciar parcial'
        variant='warning'
        loading={accionProcesando}
        error={accionError}
        onClose={cerrarAccionClase}
        onConfirm={confirmarNuevoParcial}
      />
    </main>
  );
}

export default MaestroAcceso;
