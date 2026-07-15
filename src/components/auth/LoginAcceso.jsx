import { useState } from 'react';
import { FaHatWizard } from 'react-icons/fa6';
import { PLAYER_KEY, TEACHER_KEY } from '../../data/gameData';
import { db, supabase } from '../../services/hechiApi';
import { cargarLocal, guardarLocal, limpiarTexto } from '../../utils/gameUtils';

function LoginAcceso({ onAlumno, onMaestro, mensaje, setMensaje }) {
  const alumnoPrevio = cargarLocal(PLAYER_KEY);
  const maestroPrevio = cargarLocal(TEACHER_KEY);
  const [identificador, setIdentificador] = useState(maestroPrevio?.email || alumnoPrevio?.nombre || '');
  const [token, setToken] = useState(alumnoPrevio?.token || '');
  const [password, setPassword] = useState(alumnoPrevio?.password || '');

  const esCorreo = identificador.includes('@');

  const entrar = async (event) => {
    event.preventDefault();
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
    const { data, error } = await db.rpc('entrar_alumno', { p_token: tokenLimpio, p_nombre: nombreAlumno, p_password: password });
    if (error) return setMensaje(error.message);
    guardarLocal(PLAYER_KEY, { token: tokenLimpio, nombre: nombreAlumno, password, alumnoId: data.alumno_id });
    onAlumno(data, { token: tokenLimpio, nombre: nombreAlumno, password, alumnoId: data.alumno_id });
  };

  return (
    <main className='auth-shell'>
      <section className='auth-card login-card unified-login-card'>
        <span className='eyebrow'><FaHatWizard /> Acceso HECHI</span>
        <h1>HECHI GO</h1>
        <p>Entra con tu correo si eres maestro, o con tu usuario y token si eres alumno.</p>
        <form onSubmit={entrar}>
          <label className='field-label'>Correo o usuario</label>
          <input value={identificador} onChange={(event) => setIdentificador(event.target.value)} placeholder='maestro@correo.com o nombre del alumno' required />
          <label className='field-label'>Contrasena</label>
          <input type='password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder={esCorreo ? 'Contrasena de maestro' : 'Contrasena de alumno'} required />
          {!esCorreo && (
            <>
              <label className='field-label'>Token de clase</label>
              <input value={token} onChange={(event) => setToken(event.target.value.toUpperCase())} placeholder='TOKEN' required />
            </>
          )}
          <button type='submit'>Entrar</button>
        </form>
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
    </main>
  );
}

export default LoginAcceso;
