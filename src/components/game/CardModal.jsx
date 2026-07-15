import { FaXmark } from 'react-icons/fa6';
import { obtenerCasa } from '../../utils/gameUtils';

function CardModal({ carta, onClose }) {
  if (!carta) return null;

  return (
    <section className='card-modal' role='dialog' aria-modal='true'>
      <button type='button' className='modal-close' onClick={onClose} aria-label='Cerrar carta'><FaXmark /></button>
      <div className='modal-card-wrap'>
        <div className='modal-card-flip'>
          <div className='modal-card-face modal-card-back'><img src='/hechi/card-back.png' alt='' /></div>
          <div className='modal-card-face modal-card-front'><img src={'/hechi/card-' + carta.numero + '.png'} alt={'Carta ' + carta.numero} /></div>
        </div>
      </div>
      <article className='modal-effect' style={{ '--house': obtenerCasa(carta.casaId).color, '--metal': obtenerCasa(carta.casaId).metal }}>
        <span>{carta.titulo}</span>
        <h2>+{carta.puntos} puntos</h2>
        <p>{carta.descripcion}</p>
      </article>
    </section>
  );
}

export default CardModal;
