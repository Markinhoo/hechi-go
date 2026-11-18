import { useEffect, useState } from 'react';
import { FaHatWizard } from 'react-icons/fa6';
import { PLAYER_KEY, TEACHER_KEY } from '../../data/gameData';
import { db, supabase } from '../../services/hechiApi';
import { cargarLocal, guardarLocal, limpiarTexto } from '../../utils/gameUtils';
import { readProfilePhoto, saveProfilePhoto } from '../../utils/profilePhotoCache';
import '../../styles/welcome.css';

function LoginAcceso({ onAlumno, onMaestro, mensaje, setMensaje }) {
  const alumnoPrevio = cargarLocal(PLAYER_KEY);
  const maestroPrevio = cargarLocal(TEACHER_KEY);
  const [identificador, setIdentificador] = useState(maestroPrevio?.email || alumnoPrevio?.nombre || '');
  const [token, setToken] = useState(alumnoPrevio?.token || '');
  const [password, setPassword] = useState(alumnoPrevio?.password || '');
  const [fotoRespuesta, setFotoRespuesta] = useState({ key: '', photo: null });
  const [entrando, setEntrando] = useState(false);

  const esCorreo = identificador.includes('@');

  useEffect(() => {
    if (esCorreo || identificador.trim().length < 2 || token.trim().length < 6) return undefined;
    const nombre = identificador.trim();
    const tokenLimpio = limpiarTexto(token);
    let activo = true;
    const timeout = window.setTimeout(async () => {
      const { data, error } = await db.rpc('perfil_vista_login', { p_token: tokenLimpio, p_nombre: nombre });
      if (!activo || error) return;
      setFotoRespuesta({ key: `${tokenLimpio}:${nombre.toLocaleLowerCase('es')}`, photo: data || null });
      if (data) saveProfilePhoto(tokenLimpio, nombre, data);
    }, 300);
    return () => { activo = false; window.clearTimeout(timeout); };
  }, [esCorreo, identificador, token]);

  const fotoKey = `${limpiarTexto(token)}:${identificador.trim().toLocaleLowerCase('es')}`;
  const fotoActual = esCorreo ? null : fotoRespuesta.key === fotoKey ? fotoRespuesta.photo : readProfilePhoto(token, identificador);

  const entrar = async (event) => {
    event.preventDefault();
    if (entrando) return;
    setEntrando(true);
    try {
      if (esCorreo) {
        setMensaje('Validando login...');
        const { error } = await supabase.auth.signInWithPassword({ email: identificador.trim(), password });
        if (error) return setMensaje(error.message);
        guardarLocal(TEACHER_KEY, { ...(maestroPrevio || {}), email: identificador.trim() });
        setMensaje('Login de maestro correcto.');
        onMaestro();
        return;
      }

      setMensaje('Entrando a la clase...');
      const tokenLimpio = limpiarTexto(token);
      const nombreAlumno = identificador.trim();
      await supabase.auth.signOut();
      const { data, error } = await db.rpc('entrar_alumno', { p_token: tokenLimpio, p_nombre: nombreAlumno, p_password: password });
      if (error) return setMensaje(error.message);
      const { data: fotoAutenticada, error: errorFoto } = await db.rpc('perfil_obtener_foto', {
        p_token: tokenLimpio, p_alumno_id: data.alumno_id, p_password: password
      });
      const foto = errorFoto ? fotoActual : fotoAutenticada;
      if (foto) saveProfilePhoto(tokenLimpio, nombreAlumno, foto);
      guardarLocal(PLAYER_KEY, { token: tokenLimpio, nombre: nombreAlumno, password, alumnoId: data.alumno_id });
      onAlumno(data, { token: tokenLimpio, nombre: nombreAlumno, password, alumnoId: data.alumno_id }, foto);
    } catch (error) {
      setMensaje(error.message || 'No se pudo iniciar sesión. Inténtalo de nuevo.');
    } finally { setEntrando(false); }
  };

  return (
    <main className='auth-shell crest-auth-shell'>
      <section className='auth-card login-card unified-login-card'>
        <div className='login-identity' aria-live='polite'>
          <img src={fotoActual || '/utd-crest-login.png'} alt={fotoActual ? `Foto de ${identificador.trim()}` : 'Escudo de la Universidad Tecnológica de Durango'} className={fotoActual ? 'login-profile-photo' : 'login-crest-photo'} />
        </div>
        <span className='eyebrow'><FaHatWizard /> Acceso mágico</span>
        <h1>La Copa de las Casas <span>(UTD)</span></h1>
        <p>Entra con tu correo si eres maestro, o con tu usuario y token si eres alumno.</p>
        <form onSubmit={entrar}>
          <label className='field-label'>Correo o usuario</label>
          <input value={identificador} onChange={(event) => setIdentificador(event.target.value)} placeholder='maestro@correo.com o nombre de usuario' required />
          {!esCorreo && (
            <>
              <label className='field-label'>Token de clase</label>
              <input value={token} onChange={(event) => setToken(event.target.value.toUpperCase())} placeholder='TOKEN' required />
            </>
          )}
          <label className='field-label'>Contraseña</label>
          <input type='password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder={esCorreo ? 'Contraseña de maestro' : 'Contraseña de alumno'} required />
          <button type='submit' disabled={entrando}>{entrando ? 'Entrando...' : 'Entrar'}</button>
        </form>
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
    </main>
  );
}

export default LoginAcceso;
