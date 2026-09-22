import { useEffect, useRef, useState } from 'react';
import { brilloCarta, BRILLOS_CARTAS } from '../../data/cardVisuals';
import { efectoCarta } from '../../utils/gameUtils';
import { crearTiraRuleta, posicionRuleta } from '../../utils/cardRoulette';

function CardRoulette({ numero, disponibles, elegida = false, onComplete }) {
  const [tira] = useState(() => crearTiraRuleta(disponibles, numero));
  const [fase, setFase] = useState('cargando');
  const dialogo = useRef(null);
  const carril = useRef(null);
  const brilloActual = useRef(null);
  const progresoBarra = useRef(null);
  const saltar = useRef(null);
  const resultado = brilloCarta(numero);

  useEffect(() => {
    const root = dialogo.current;
    const track = carril.current;
    const focoAnterior = document.activeElement;
    root.focus();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let cancelado = false;
    let terminado = false;
    let entregado = false;
    let frame;
    let espera;
    let limiteCarga;
    let posicion = tira.indiceInicial;
    let ancho = 0;
    let paso = 0;
    let activo = -1;
    const pintar = () => {
      track.style.transform = `translate3d(${-posicion * paso - ancho / 2}px,0,0)`;
      const siguiente = Math.round(posicion);
      if (siguiente !== activo) {
        if (activo >= 0) track.children[activo]?.classList.remove('under-pointer');
        track.children[siguiente]?.classList.add('under-pointer');
        activo = siguiente;
        const brillo = brilloCarta(tira.cartas[siguiente]);
        root.style.setProperty('--spin-color', brillo.color);
        brilloActual.current.textContent = brillo.nombre;
      }
    };
    const medir = () => {
      ancho = parseFloat(getComputedStyle(track.children[0]).width);
      paso = ancho + parseFloat(getComputedStyle(track).gap);
      pintar();
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(root);
    const entregar = () => {
      if (cancelado || entregado) return;
      entregado = true;
      clearTimeout(espera);
      onComplete();
    };
    const finalizar = () => {
      if (cancelado || terminado) return;
      terminado = true;
      cancelAnimationFrame(frame);
      posicion = tira.indiceGanador;
      pintar();
      progresoBarra.current.style.transform = 'scaleX(1)';
      setFase('resultado');
      espera = setTimeout(entregar, 1400);
    };
    saltar.current = () => terminado ? entregar() : finalizar();
    const preparar = async () => {
      // Preload the real front images before the strip starts moving.
      const imagenes = [...new Set(tira.cartas)].map((carta) => {
        const img = new Image();
        img.src = '/hechi/card-' + carta + '.png';
        return img.decode().catch(() => {});
      });
      await Promise.race([Promise.all(imagenes), new Promise((resolve) => { limiteCarga = setTimeout(resolve, 1600); })]);
      clearTimeout(limiteCarga);
      if (cancelado || terminado) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finalizar(); return; }
      setFase('girando');
      let inicio;
      const avanzar = (ahora) => {
        if (cancelado || terminado) return;
        inicio ??= ahora + 180;
        const progreso = Math.max(0, Math.min(1, (ahora - inicio) / 4700));
        posicion = posicionRuleta(progreso, tira.indiceInicial, tira.indiceGanador);
        pintar();
        progresoBarra.current.style.transform = `scaleX(${progreso})`;
        if (progreso >= 1) finalizar();
        else frame = requestAnimationFrame(avanzar);
      };
      frame = requestAnimationFrame(avanzar);
    };
    preparar();
    return () => {
      cancelado = true;
      cancelAnimationFrame(frame);
      clearTimeout(espera);
      clearTimeout(limiteCarga);
      observador.disconnect();
      saltar.current = null;
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior?.isConnected) focoAnterior.focus();
    };
  }, [tira, onComplete]);

  return (
    <section ref={dialogo} className={'card-roulette is-' + fase} role='dialog' aria-modal='true' aria-labelledby='roulette-title' tabIndex={-1}
      onKeyDown={(event) => { if (event.key === 'Tab') { event.preventDefault(); event.currentTarget.querySelector('button')?.focus(); } }}>
      <div className='roulette-ambient' aria-hidden='true' />
      <header className='roulette-heading'>
        <span className='roulette-eyebrow'>LA COPA DE LAS CASAS</span>
        <h2 id='roulette-title'>{fase === 'resultado' ? 'Tu hechizo ha llegado' : elegida ? 'Revelando tu elección' : 'La magia está en movimiento'}</h2>
        <p>{fase === 'resultado' ? 'La carta bajo la flecha es tuya.' : 'Sigue las cartas. La flecha marcará tu destino.'}</p>
      </header>
      <div className='roulette-stage'>
        <div className='roulette-pointer' aria-hidden='true'><svg viewBox='0 0 36 40'><path d='M2 2H34V17L18 37 2 17Z' /></svg></div>
        <div className='roulette-center-line' aria-hidden='true' />
        <div className='roulette-window' aria-hidden='true'>
          <div ref={carril} className='roulette-track'>
            {tira.cartas.map((carta, index) => {
              const brillo = brilloCarta(carta);
              return <div key={index} className='roulette-card' data-numero={carta} data-winner={index === tira.indiceGanador ? 'true' : undefined} style={{ '--card-glow': brillo.color }}>
                <img src={'/hechi/card-' + carta + '.png'} alt='' draggable='false' />
                <span>{brillo.nombre}</span>
              </div>;
            })}
          </div>
        </div>
      </div>
      <div className='roulette-status' role='status' aria-live='polite'>
        <span ref={brilloActual} className='roulette-tier' aria-hidden='true'>Común</span>
        <strong>{fase === 'resultado' ? efectoCarta(numero).titulo : fase === 'cargando' ? 'Preparando las cartas…' : '¿Qué hechizo te espera?'}</strong>
        <span className='roulette-result-tier'>{fase === 'resultado' ? resultado.nombre : 'La flecha decide el resultado del giro'}</span>
      </div>
      <div className='roulette-progress' aria-hidden='true'><span ref={progresoBarra} /></div>
      <footer className='roulette-footer'>
        <div className='roulette-legend' aria-label='Categorías de las cartas'>
          {Object.entries(BRILLOS_CARTAS).map(([key, brillo]) => <span key={key} style={{ '--legend-color': brillo.color }}><i />{brillo.nombre}</span>)}
        </div>
        <button type='button' className='roulette-skip' onClick={() => saltar.current?.()}>{fase === 'resultado' ? 'Ver mi carta' : 'Saltar animación'}</button>
      </footer>
    </section>
  );
}
export default CardRoulette;
