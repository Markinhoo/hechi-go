import { useState } from 'react';
import { FaHatWizard } from 'react-icons/fa6';
import { PLAYER_KEY, TEACHER_KEY } from '../../data/gameData';
import { db, supabase } from '../../services/hechiApi';
import { cargarLocal, guardarLocal, limpiarTexto } from '../../utils/gameUtils';

function LoginAcceso({ onAlumno, onMaestro, mensaje, setMensaje }) {
  const alumnoPrevio = cargarLocal(PLAYER_KEY);
  const maestroPrevio = cargarLocal(TEACHER_KEY);
  const [identificador, setIdentificador] = useState(maestroPrevio?.email || alumnoPrevio?.token || '');
  const [nombre, setNombre] = useState(alumnoPrevio?.nombre || '');
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
    const tokenLimpio = limpiarTexto(identificador);
    const { data, error } = await db.rpc('entrar_alumno', { p_token: tokenLimpio, p_nombre: nombre.trim(), p_password: password });
    if (error) return setMensaje(error.message);
    guardarLocal(PLAYER_KEY, { token: tokenLimpio, nombre: nombre.trim(), password, alumnoId: data.alumno_id });
    onAlumno(data, { token: tokenLimpio, nombre: nombre.trim(), password, alumnoId: data.alumno_id });
  };

  return (
    <main className='auth-shell'>
      <section className='auth-card login-card unified-login-card'>
        <span className='eyebrow'><FaHatWizard /> Acceso HECHI</span>
        <h1>HECHI GO</h1>
        <p>Entra con tu correo de maestro o con el token de clase si eres alumno.</p>
        <form onSubmit={entrar}>
          <label className='field-label'>Correo maestro o token de clase</label>
          <input value={identificador} onChange={(event) => setIdentificador(event.target.value)} placeholder='maestro@correo.com o TOKEN' required />
          {!esCorreo && (
            <>
              <label className='field-label'>Nombre del alumno</label>
              <input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder='Nombre del alumno' required />
            </>
          )}
          <label className='field-label'>Contrasena</label>
          <input type='password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder={esCorreo ? 'Contrasena de maestro' : 'Contrasena de alumno'} required />
          <button type='submit'>{esCorreo ? 'Entrar como maestro' : 'Entrar como alumno'}</button>
        </form>
        {mensaje && <p className='form-message'>{mensaje}</p>}
      </section>
    </main>
  );
}

export default LoginAcceso;
