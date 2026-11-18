import { useCallback, useState } from 'react';
import LoginAcceso from './components/auth/LoginAcceso';
import WelcomeTransition from './components/auth/WelcomeTransition';
import MaestroAcceso from './components/auth/MaestroAcceso';
import GameView from './components/game/GameView';
import MagicSurface from './components/layout/MagicSurface';

function App() {
  const [modo, setModo] = useState('inicio');
  const [sesion, setSesion] = useState(null);
  const [estado, setEstado] = useState(null);
  const [mensaje, setMensaje] = useState('');
  const [destellos, setDestellos] = useState([]);
  const [flashesPantalla, setFlashesPantalla] = useState([]);
  const [bienvenida, setBienvenida] = useState(null);
  const cerrarBienvenida = useCallback(() => setBienvenida(null), []);

  const crearDestello = (event, intenso = false) => {
    const x = event.clientX;
    const y = event.clientY;
    if (!x && !y) return;
    const id = crypto.randomUUID();
    setDestellos((actual) => [...actual.slice(-18), { id, x, y, intenso }]);
    window.setTimeout(() => setDestellos((actual) => actual.filter((d) => d.id !== id)), intenso ? 900 : 620);
  };

  const esperar = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const crearFlashVisual = () => {
    for (let index = 0; index < 3; index += 1) {
      window.setTimeout(() => {
        const id = crypto.randomUUID();
        setFlashesPantalla((actual) => [...actual, id]);
        window.setTimeout(() => setFlashesPantalla((actual) => actual.filter((item) => item !== id)), 260);
      }, index * 140);
    }
  };

  const parpadearCamara = async () => {
    crearFlashVisual();
    if (!navigator.mediaDevices?.getUserMedia) return;
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.();
      if (!track || !capabilities || !('torch' in capabilities)) return;
      for (let index = 0; index < 3; index += 1) {
        await track.applyConstraints({ advanced: [{ torch: true }] });
        await esperar(70);
        await track.applyConstraints({ advanced: [{ torch: false }] });
        await esperar(70);
      }
    } catch {
      // The visual flash already covers browsers without torch support or camera permission.
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  };

  const entrarMaestro = (data) => {
    setSesion({ tipo: 'maestro', token: data.token });
    setEstado(data);
    setModo('juego');
    setMensaje('Comparte este token con tus alumnos: ' + data.token);
    setBienvenida({ name: 'Maestro', photo: null });
  };

  const entrarAlumno = (data, credenciales, photo) => {
    setSesion({ tipo: 'alumno', ...credenciales });
    setEstado(data);
    setModo('juego');
    setMensaje('Bienvenido al gran salon. Espera autorizacion para abrir carta.');
    setBienvenida({ name: data.alumnos?.find((item) => item.id === credenciales.alumnoId)?.nombre || credenciales.nombre, photo });
  };

  const volverLoginPrincipal = () => {
    setBienvenida(null);
    setSesion(null);
    setEstado(null);
    setModo('inicio');
    setMensaje('Sesion de maestro cerrada.');
  };

  let contenido = <LoginAcceso onAlumno={entrarAlumno} onMaestro={() => setModo('maestro')} mensaje={mensaje} setMensaje={setMensaje} />;

  if (modo === 'maestro') {
    contenido = <MaestroAcceso onEntrar={entrarMaestro} onSalir={volverLoginPrincipal} mensaje={mensaje} setMensaje={setMensaje} />;
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
        onCameraFlash={parpadearCamara}
      />
    );
  }

  return <MagicSurface destellos={destellos} flashesPantalla={flashesPantalla} onSpark={crearDestello}>
    {contenido}
    {bienvenida && <WelcomeTransition name={bienvenida.name} photo={bienvenida.photo} onComplete={cerrarBienvenida} />}
  </MagicSurface>;
}

export default App;
