import { useEffect, useMemo, useState } from 'react';
import { FaHatWizard } from 'react-icons/fa6';
import { casas, TEACHER_KEY } from '../../data/gameData';
import { db, supabase } from '../../services/hechiApi';
import { calcularObjetivos, cargarLocal, generarToken, guardarLocal } from '../../utils/gameUtils';

function MaestroAcceso({ onEntrar, mensaje, setMensaje }) {
  const previo = cargarLocal(TEACHER_KEY);
  const [authUser, setAuthUser] = useState(null);
  const [email, setEmail] = useState(previo?.email || '');
  const [password, setPassword] = useState('');
  const [grupo, setGrupo] = useState('9A');
  const [total, setTotal] = useState(30);
  const [clases, setClases] = useState([]);
  const [cargandoClases, setCargandoClases] = useState(false);
  const objetivos = useMemo(() => calcularObjetivos(Math.max(4, Number(total) || 4)), [total]);

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
    await supabase.auth.signOut();
    setAuthUser(null);
    setClases([]);
    setMensaje('Sesion de maestro cerrada.');
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

        <div className={!authUser ? 'locked-class-tools class-management-grid' : 'class-management-grid'}>
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
                  <button type='button' onClick={() => abrirClase(clase)}>Abrir</button>
                </article>
              ))}
            </div>
          </section>
        </div>
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
    </main>
  );
}

export default MaestroAcceso;
