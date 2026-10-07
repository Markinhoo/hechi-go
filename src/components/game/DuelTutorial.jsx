import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DuelCombat from './DuelCombat';
import { createTutorial, tutorialReducer, tutorialSteps, tutorialTargets } from '../../utils/duelTutorial';
import '../../styles/duel-tutorial.css';

export default function DuelTutorial({ Card, CardInspection, cards, sound, onExit }) {
  const [state, dispatch] = useReducer(tutorialReducer, undefined, createTutorial);
  const [drag, setDrag] = useState(null);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const {step,hand,field,rivalField,supports,selected,event} = state;
  const targets = tutorialTargets(step);
  const enabled = target => targets.includes(target);
  const send = action => {
    const next = tutorialReducer(state,action);
    if(next === state) return;
    if(action.type === 'FLIP' || step === 'defense') sound.play('flip');
    else if(action.type === 'PLACE' || step === 'trapDrop' || step === 'boostTarget') sound.play('place');
    else if(action.type === 'HAND' || action.type === 'FIELD') sound.play('browse');
    dispatch(action);
  };
  const completeAnimation = useCallback(() => dispatch({type:'ANIMATION_DONE'}), []);
  useEffect(() => {
    if(!['cpuOpening','cpuTrap','cpuRebound'].includes(step)) return;
    const timer = setTimeout(() => dispatch({type:'CPU'}),2600);
    return () => clearTimeout(timer);
  }, [step]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; sound.stop(); };
  }, [sound]);
  const placement = ['flip','place','fusionConfirm'].includes(step);
  const cpu = step.startsWith('cpu') || step === 'trapAnimation' || step === 'reboundAnimation';
  const title = tutorialSteps[step][0], instruction = tutorialSteps[step][1];
  const targetStyle = target => enabled(target) ? {'--tutorial-glow':'#ffd36b'} : undefined;
  const beginDrag = e => {
    suppressClick.current=false;
    const button = e.target.closest('[data-uid]');
    if(!button || !['summon','drop'].includes(step) || button.dataset.uid !== 'owl' || e.button !== 0) return;
    suppressClick.current=false;
    gesture.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,uid:'owl',moved:false};
  };
  const moveDrag = e => {
    const g=gesture.current;
    if(!g || g.pointer !== e.pointerId) return;
    if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>8) g.moved=true;
    if(g.moved) { e.currentTarget.setPointerCapture(e.pointerId); setDrag({x:e.clientX,y:e.clientY}); }
  };
  const endDrag = e => {
    const g=gesture.current;
    if(!g || g.pointer !== e.pointerId) return;
    gesture.current=null; setDrag(null);
    if(!g.moved) return;
    suppressClick.current=true;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-tutorial-drop]')?.dataset.tutorialDrop;
    if(target==='field:0') send({type:'DROP',uid:'owl',zone:'field',index:0});
  };
  return createPortal(<section className="duel-arena duel-fullscreen duel-tutorial" aria-label="Tutorial contra la computadora" aria-describedby="duel-tutorial-guide" data-step={step} onPointerDownCapture={sound.unlock} onKeyDownCapture={sound.unlock}>
    <div className="tutorial-layout">
      <header className="tutorial-header">
        <div><small>COMPUTADORA</small><strong>VIDA {state.rivalLife}</strong></div>
        <div className="tutorial-turn"><b>{cpu?'Turno rival':'Tu turno'} · {state.round}</b><small>Sin límite de tiempo</small></div>
        <button onClick={onExit}>Salir del tutorial</button>
      </header>
      <aside id="duel-tutorial-guide" className="tutorial-guide" aria-live="polite" aria-atomic="true">
        <small>ENTRENAMIENTO · {Object.keys(tutorialSteps).indexOf(step)+1}/{Object.keys(tutorialSteps).length}</small>
        <h2>{title}</h2><p>{instruction}</p>
        {step === 'welcome' && <><p>Sin galeones, puntos ni consumo de cupos. Puedes salir cuando quieras.</p><button onClick={() => send({type:'START'})}>Comenzar tutorial</button></>}
        {step === 'complete' && <><p>En los duelos normales tienes 90 segundos por turno. Vence llevando la vida rival a cero o agotando su mazo.</p><button onClick={onExit}>Volver a buscar rivales</button></>}
      </aside>
      <div className="tutorial-board" inert={event || placement || step==='welcome' || step==='complete' ? true : undefined}>
        <div className="tutorial-card-backs" aria-label="Mano de la computadora: cartas ocultas">{Array.from({length:5},(_,i)=><img key={i} src="/hechi/card-back.png" alt="" />)}</div>
        <div className="duel-field" aria-label="Campo de la computadora">
          {rivalField.map((c,i)=>c ? <Card key={i} card={c} disabled={!enabled('rival:'+i)} style={targetStyle('rival:'+i)} label={'Atacar rival '+(i+1)+': '+cards[c.id].nombre} onClick={()=>send({type:'RIVAL',index:i})} /> : <button key={i} className="duel-empty" disabled={!enabled('rival:'+i)} style={targetStyle('rival:'+i)} aria-label={'Ataque directo '+(i+1)} onClick={()=>send({type:'RIVAL',index:i})}>Vacío</button>)}
          {event?.directo && <span key={event.id} className="duel-direct-flash" role="status" aria-label={'Ataque directo: '+event.danoRival+' de daño'} />}
        </div>
        <div className="tutorial-divider">↑ Rival · Tu campo ↓</div>
        <div className="duel-field" aria-label="Tu campo de entrenamiento">
          {field.map((c,i)=>c ? <Card key={i} card={c} selected={selected.includes(c.uid)} disabled={!enabled('field:'+i) || step==='inspect'} style={targetStyle('field:'+i)} label={'Tu criatura '+(i+1)+': '+cards[c.id].nombre} onInspect={step==='inspect' && i===0 ? ()=>send({type:'INSPECT',index:i}) : undefined} onClick={()=>send({type:'FIELD',index:i})} /> : <button key={i} className="duel-empty" data-tutorial-drop={'field:'+i} disabled={!enabled('field:'+i) && !(step==='summon' && i===0)} style={targetStyle('field:'+i)} aria-label={'Invocar en espacio '+(i+1)} onClick={()=>send({type:'FIELD',index:i})}>Espacio {i+1}</button>)}
        </div>
        <div className="duel-supports" aria-label="Tus trampas de entrenamiento">
          {supports.map((c,i)=>c ? <Card key={i} card={c} disabled label="Invisibilidad preparada" /> : <button key={i} className="duel-support-empty" disabled={!enabled('support:'+i)} style={targetStyle('support:'+i)} aria-label={'Preparar trampa '+(i+1)} onClick={()=>send({type:'SUPPORT',index:i})}>Magia / trampa</button>)}
        </div>
      </div>
      <div className="duel-hand-dock" inert={event || placement || step==='welcome' || step==='complete' ? true : undefined}>
        <h3>Tu mano ({hand.length}/5)</h3><div className="duel-own-life"><small>TÚ</small><strong>VIDA {state.life}</strong></div>
        <div className="duel-hand" aria-label="Tu mano de entrenamiento" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={()=>{gesture.current=null;setDrag(null);suppressClick.current=true;}}>
          {hand.map((c,i)=><Card key={c.uid} card={c} selected={selected.includes(c.uid)} disabled={!enabled('hand:'+c.uid)} compatible={['fusionFirst','fusionSecond','fusionDrop'].includes(step) && ['bow','doxy'].includes(c.uid)} pairs={['fusionFirst','fusionSecond','fusionDrop'].includes(step) && ['bow','doxy'].includes(c.uid) ? [{number:1,color:'#ffd36b'}] : []}
            style={{'--fan-offset':i-(hand.length-1)/2,'--fan-order':i,'--pair-color':'#ffd36b',...targetStyle('hand:'+c.uid)}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}send({type:'HAND',uid:c.uid});}} />)}
        </div>
      </div>
      <footer className="tutorial-footer"><span>{selected.length===2 ? 'Acromántula · ATQ 1800 · DEF 1400' : '☝ Sigue el borde dorado'}</span><button disabled={!enabled('end')} style={targetStyle('end')} onClick={()=>send({type:'END'})}>Terminar turno</button></footer>
    </div>
    {drag && <div className="duel-drag-ghost" aria-hidden="true" style={{left:drag.x,top:drag.y}}><Card card={hand.find(c=>c.uid==='owl')} disabled /></div>}
    {placement && <div className="tutorial-placement" role="dialog" aria-modal="true" aria-label="Colocar carta de entrenamiento">
      <strong>{step==='fusionConfirm'?'Acromántula · ATQ 1800 · DEF 1400':'Lechuza · ATQ 1000 · DEF 1600'}</strong>
      <div className="duel-placement-flip"><Card card={{id:step==='fusionConfirm'?'acromantula':'lechuza',oculta:step==='place'}} disabled={!enabled('flip')} style={targetStyle('flip')} label="Girar carta de entrenamiento" onClick={()=>send({type:'FLIP'})} /></div>
      <button disabled={!enabled('place')} style={targetStyle('place')} onClick={()=>send({type:'PLACE'})}>{step==='fusionConfirm'?'Confirmar fusión':'Colocar boca abajo'}</button>
    </div>}
    {step==='closeInspection' && <CardInspection card={field[0]} onClose={()=>send({type:'CLOSE'})} />}
    {event && <DuelCombat key={event.id} item={{event,lado:'a'}} cards={cards} sound={sound} onComplete={completeAnimation} />}
  </section>,document.body);
}
