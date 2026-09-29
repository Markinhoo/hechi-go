import { useEffect } from 'react';

export default function DuelCombat({ item, cards, onComplete }) {
  const { event: e, lado } = item;
  const fusion = e.tipo === 'fusion';
  useEffect(() => {
    const timer = setTimeout(onComplete, 2600);
    return () => clearTimeout(timer);
  }, [onComplete]);
  const image = id => cards[id]?.imagen || '/hechi/card-back.png';
  const label = id => cards[id]?.nombre || 'Carta oculta';
  return <div className={'duel-combat-overlay ' + (fusion ? 'is-fusion' : '')} role="dialog" aria-label={fusion ? 'Fusión de criaturas' : 'Resolución del combate'} aria-modal="true">
    <div className="duel-combat-stage">
      <h2>{fusion ? (e.bonusAtk ? '¡Refuerzo mágico!' : '¡Fusión!') : e.trampa ? '¡Trampa activada!' : e.directo ? '¡Ataque directo!' : '¡Combate!'}</h2>
      <div className="duel-combat-pair">
        {fusion && <div className="combat-vortex" aria-hidden="true" />}
        <figure className="combat-attacker"><img src={image(fusion ? e.ingredientes[0] : e.atacante.id)} alt={label(fusion ? e.ingredientes[0] : e.atacante.id)} />
          {!fusion && <figcaption>ATQ {e.ataque}</figcaption>}</figure>
        <span className="combat-versus">{fusion ? '+' : '⚔'}</span>
        <figure className={'combat-defender' + (!fusion && !e.directo && !e.trampa ? ' receives-impact' : '')}>
          {fusion || !e.directo ? <img src={image(fusion ? e.ingredientes[1] : e.defensor?.id)} alt={label(fusion ? e.ingredientes[1] : e.defensor?.id)} /> : <div className="combat-direct">VIDA<br />{e.actor === lado ? 'RIVAL' : 'TUYA'}</div>}
          {!fusion && e.defensa != null && <figcaption>{e.defensor?.posicion === 'defensa' ? 'DEF' : 'ATQ'} {e.defensa}</figcaption>}
        </figure>
      </div>
      {e.trampa && <div className="combat-trap"><img src={image(e.trampa)} alt={label(e.trampa)} /><strong>{label(e.trampa)}<small>Ataque cancelado</small></strong></div>}
      <div className="combat-outcome" role="status">
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
