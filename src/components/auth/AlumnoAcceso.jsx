import { useState } from 'react';
import { FaUserPlus } from 'react-icons/fa6';
import { PLAYER_KEY } from '../../data/gameData';
import { db } from '../../services/hechiApi';
import { cargarLocal, guardarLocal, limpiarTexto } from '../../utils/gameUtils';

function AlumnoAcceso({ onEntrar, mensaje, setMensaje }) {
  const previo = cargarLocal(PLAYER_KEY);
  const [token, setToken] = useState(previo?.token || '');
  const [nombre, setNombre] = useState(previo?.nombre || '');
  const [password, setPassword] = useState(previo?.password || '');

  const entrar = async (event) => {
    event.preventDefault();
    setMensaje('Creando o abriendo tu usuario de clase...');
    const tokenLimpio = limpiarTexto(token);
    const { data, error } = await db.rpc('entrar_alumno', { p_token: tokenLimpio, p_nombre: nombre.trim(), p_password: password });
    if (error) return setMensaje(error.message);
    guardarLocal(PLAYER_KEY, { token: tokenLimpio, nombre: nombre.trim(), password, alumnoId: data.alumno_id });
    onEntrar(data, { token: tokenLimpio, nombre: nombre.trim(), password, alumnoId: data.alumno_id });
  };

  return (
    <main className='auth-shell'>
      <section className='auth-card login-card'>
        <span className='eyebrow'><FaUserPlus /> Alumno</span>
        <h1>Crear usuario</h1>
        <p>Tu usuario solo sirve para entrar a la clase del token. No puede crear clases.</p>
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

export default AlumnoAcceso;
