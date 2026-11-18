import { useEffect } from 'react';
import '../../styles/welcome.css';

function WelcomeTransition({ name, photo, onComplete }) {
  useEffect(() => {
    const timeout = window.setTimeout(onComplete, 2100);
    return () => window.clearTimeout(timeout);
  }, [onComplete]);

  return (
    <div className='welcome-screen' role='status' aria-live='polite'>
      <div className='welcome-content'>
        <div className='welcome-avatar-ring'>
          <img src={photo || '/utd-crest-login.png'} alt='' className={photo ? 'welcome-profile-photo' : 'welcome-crest-photo'} />
        </div>
        <p>Bienvenido</p>
        {name && <strong>{name}</strong>}
      </div>
    </div>
  );
}

export default WelcomeTransition;
