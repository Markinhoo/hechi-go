import { FaXmark } from 'react-icons/fa6';
import { obtenerCasa } from '../../utils/gameUtils';

function CardModal({ carta, onClose, casasRivales = [], onSelectRival }) {
  if (!carta) return null;
  const casa = obtenerCasa(carta.casaId);
  const puntosTexto = carta.puntos > 0 ? '+' + carta.puntos : String(carta.puntos);
  const esperaRival = carta.tipo === 'rival' && carta.pendienteRival;

  return (
    <section className='card-modal' role='dialog' aria-modal='true'>
      <button type='button' className='modal-close' onClick={onClose} aria-label='Cerrar carta'><FaXmark /></button>
      <div className='modal-card-wrap'>
        <div className='modal-card-flip'>
          <div className='modal-card-face modal-card-back'><img src='/hechi/card-back.png' alt='' /></div>
          <div className='modal-card-face modal-card-front'><img src={'/hechi/card-' + carta.numero + '.png'} alt={'Carta ' + carta.numero} /></div>
        </div>
      </div>
      <article className={'modal-effect ' + (carta.puntos < 0 ? 'negative' : '')} style={{ '--house': casa.color, '--metal': casa.metal }}>
        <span>{carta.titulo}</span>
        <h2>{puntosTexto} puntos</h2>
        <p>{carta.descripcion}</p>
        {esperaRival && (
          <div className='rival-options' aria-label='Selecciona una casa rival'>
            <small>Elige la casa rival que perdera 3 puntos</small>
            <div>
              {casasRivales.map((rival) => (
                <button
                  key={rival.id}
                  type='button'
                  className='rival-choice'
                  style={{ '--house': rival.color, '--metal': rival.metal }}
                  onClick={() => onSelectRival?.(rival.id)}
                >
                  {rival.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

export default CardModal;
