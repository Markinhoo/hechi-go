import { useEffect } from 'react';
import { combatSoundCues } from '../../utils/duelSounds';

function CombatCard({ src, name, shattered }) {
  return <div className={'combat-card-visual' + (shattered ? ' is-shattered' : '')}>
    <img className="combat-card-original" src={src} alt={name} />
    {shattered && <div className="combat-shards" aria-hidden="true">{Array.from({length:12},(_,i)=>{
      const cell=Math.floor(i/2), x=(cell%3)*100/3, y=Math.floor(cell/3)*50;
      const points=i%2 ? `${x}% ${y}%,${x+100/3}% ${y+50}%,${x}% ${y+50}%` : `${x}% ${y}%,${x+100/3}% ${y}%,${x+100/3}% ${y+50}%`;
      return <img key={i} src={src} alt="" style={{clipPath:`polygon(${points})`,'--shard-x':`${(cell%3-1)*65+(i%2?12:-12)}px`,'--shard-y':`${120+cell*16}px`,'--shard-turn':`${(i%2?1:-1)*(35+cell*12)}deg`}} />;
    })}</div>}
  </div>;
}

export default function DuelCombat({ item, cards, onComplete, sound }) {
  const { event: e, lado } = item;
  const fusion = e.tipo === 'fusion';
  const direct = !fusion && e.directo && !e.trampa;
  const rebound = !fusion && !e.trampa && e.defensor?.posicion === 'ataque' && e.danoActor > 0 && e.ataque < e.defensa;
  const duration = direct ? 850 : rebound || e.destruidoActor || e.destruidoRival ? 3300 : 2600;
  useEffect(() => {
    const timer = setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);
  useEffect(() => {
    const timers = combatSoundCues(e).map(([delay, kind]) => setTimeout(() => sound?.play(kind), delay));
    return () => { timers.forEach(clearTimeout); sound?.stop(); };
  }, [e, sound]);
  const image = id => cards[id]?.imagen || '/hechi/card-back.png';
  const label = id => cards[id]?.nombre || 'Carta oculta';
  if (direct) return null;
  return <div className={'duel-combat-overlay ' + (fusion ? 'is-fusion ' : '') + (rebound ? 'is-rebound' : '')} role="dialog" aria-label={fusion ? 'Fusión de criaturas' : 'Resolución del combate'} aria-modal="true">
    <div className="duel-combat-stage">
      <h2>{fusion ? (e.bonusAtk ? '¡Refuerzo mágico!' : '¡Fusión!') : e.trampa ? '¡Trampa activada!' : e.directo ? '¡Ataque directo!' : '¡Combate!'}</h2>
      <div className="duel-combat-pair">
        {fusion && <div className="combat-vortex" aria-hidden="true" />}
        {rebound && <span className="combat-return-beam" aria-hidden="true" />}
        <figure className={'combat-attacker' + (rebound ? ' receives-return' : '')}><CombatCard src={image(fusion ? e.ingredientes[0] : e.atacante.id)} name={label(fusion ? e.ingredientes[0] : e.atacante.id)} shattered={!fusion && !e.trampa && e.destruidoActor} />
          {!fusion && <figcaption>ATQ {e.ataque}</figcaption>}</figure>
        <span className="combat-versus">{fusion ? '+' : '⚔'}</span>
        <figure className={'combat-defender' + (!fusion && !e.directo && !e.trampa ? ' receives-impact' : '')}>
          {fusion || !e.directo ? <CombatCard src={image(fusion ? e.ingredientes[1] : e.defensor?.id)} name={label(fusion ? e.ingredientes[1] : e.defensor?.id)} shattered={!fusion && !e.trampa && e.destruidoRival} /> : <div className="combat-direct">VIDA<br />{e.actor === lado ? 'RIVAL' : 'TUYA'}</div>}
          {!fusion && e.defensa != null && <figcaption>{e.defensor?.posicion === 'defensa' ? 'DEF' : 'ATQ'} {e.defensa}</figcaption>}
        </figure>
      </div>
      {e.trampa && <div className="combat-trap"><img src={image(e.trampa)} alt={label(e.trampa)} /><strong>{label(e.trampa)}<small>Ataque cancelado</small></strong></div>}
      <div className="combat-outcome" role="status">
        {rebound && <span>El rival devuelve el ataque</span>}
        {fusion ? <><img src={image(e.resultado)} alt={label(e.resultado)} /><strong>{label(e.resultado)}{e.bonusAtk > 0 ? ' · +500 ATQ' : ''}</strong></> : <>
          {e.danoActor > 0 && <strong>−{e.danoActor} de vida {e.actor === lado ? 'para ti' : 'para el rival'}</strong>}
          {e.danoRival > 0 && <strong>−{e.danoRival} de vida {e.actor === lado ? 'para el rival' : 'para ti'}</strong>}
          {!e.danoActor && !e.danoRival && <strong>Sin daño a la vida</strong>}
          {e.destruidoActor && <span>{label(e.atacante.id)} destruido</span>}
          {e.destruidoRival && <span>{label(e.defensor?.id)} destruido</span>}
        </>}
      </div>
      <button onClick={onComplete} autoFocus>Continuar</button>
    </div>
  </div>;
}
