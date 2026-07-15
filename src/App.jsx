import { useState } from 'react';
import Inicio from './components/auth/Inicio';
import AlumnoAcceso from './components/auth/AlumnoAcceso';
import MaestroAcceso from './components/auth/MaestroAcceso';
import GameView from './components/game/GameView';
import MagicSurface from './components/layout/MagicSurface';

function App() {
  const [modo, setModo] = useState('inicio');
  const [sesion, setSesion] = useState(null);
  const [estado, setEstado] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [destellos, setDestellos] = useState([]);

  const crearDestello = (event, intenso = false) => {
    const x = event.clientX;
    const y = event.clientY;
    if (!x && !y) return;
    const id = crypto.randomUUID();
    setDestellos((actual) => [...actual.slice(-18), { id, x, y, intenso }]);
    window.setTimeout(() => setDestellos((actual) => actual.filter((d) => d.id !== id)), intenso ? 900 : 620);
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

  let contenido = <Inicio onModo={setModo} />;

  if (modo === 'maestro') {
    contenido = <MaestroAcceso onEntrar={entrarMaestro} mensaje={mensaje} setMensaje={setMensaje} />;
  } else if (modo === 'alumno') {
    contenido = <AlumnoAcceso onEntrar={entrarAlumno} mensaje={mensaje} setMensaje={setMensaje} />;
  } else if (modo === 'juego' && estado && sesion) {
    contenido = (
      <GameView
        sesion={sesion}
        setSesion={setSesion}
        estado={estado}
        setEstado={setEstado}
        setModo={setModo}
        mensaje={mensaje}
        setMensaje={setMensaje}
      />
    );
  }

  return <MagicSurface destellos={destellos} onSpark={crearDestello}>{contenido}</MagicSurface>;
}

export default App;
