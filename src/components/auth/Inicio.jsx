import { FaHatWizard } from 'react-icons/fa6';

function Inicio({ onModo }) {
  return (
    <main className='auth-shell'>
      <section className='auth-card setup-card welcome-card'>
        <span className='eyebrow'><FaHatWizard /> Acceso HECHI</span>
        <h1>HECHI GO</h1>
        <p>El maestro entra con su login autorizado. Los alumnos solo se unen a una clase usando el token, su nombre y contrasena.</p>
        <div className='mode-grid'>
          <button type='button' onClick={() => onModo('maestro')}>Soy maestro</button>
          <button type='button' className='secondary' onClick={() => onModo('alumno')}>Soy alumno</button>
        </div>
      </section>
    </main>
  );
}

export default Inicio;
