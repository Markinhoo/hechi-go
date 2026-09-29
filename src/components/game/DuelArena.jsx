import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DuelCombat from './DuelCombat';
import { db } from '../../services/hechiApi';
import { bestiario } from '../../data/bestiaryData';
import catalog from '../../data/duelCatalog.json';
import { duelCombination } from '../../utils/duelCombinations';
import '../../styles/duel-arena.css';

const cards = Object.fromEntries(catalog.cards.map(c => [c.id, { ...bestiario.find(b => b.id === c.id), tipo: 'criatura', ...c }]).concat(catalog.spells.map(c => [c.id, { ...c, imagen: '/hechi/card-' + c.numero + '.png' }])));
const rpcDefault = (name, args) => db.rpc(name, args);
const name = id => cards[id]?.nombre || id;
const rarity = { comun: 'Común', rara: 'Especial', epica: 'Épica', legendaria: 'Legendaria' };

function Card({ card, selected, onClick, disabled, label, style, browsing, compatible, drop }) {
  const c = cards[card?.id];
  return <button type="button" style={style} data-uid={card?.uid} title={compatible ? 'Combinación disponible' : undefined} className={'duel-card ' + (selected ? 'is-selected ' : '') + (browsing ? 'is-browsing ' : '') + (compatible ? 'is-compatible' : '')}
    data-drop={drop} data-position={card?.posicion} data-rarity={c?.rareza} disabled={disabled} onClick={onClick} aria-pressed={Boolean(selected)}
    aria-label={label || (c ? c.tipo === 'criatura' ? c.nombre + ', ataque ' + (c.atk + (card.bonusAtk || 0)) + ', defensa ' + c.def : c.nombre + ', ' + c.tipo + ': ' + c.efecto : 'Carta oculta')}>
    <span className="duel-card-face">{c && !card.oculta ? <><span className="duel-card-art"><img draggable={false} src={c.imagen} alt="" /></span><span className="duel-card-stats">{c.tipo === "criatura" ? <><b>ATQ {c.atk + (card.bonusAtk || 0)}</b><b>DEF {c.def}</b></> : <b>{c.tipo === "magia" ? "MAGIA" : "TRAMPA"}</b>}</span>
      {card.posicion && <small>{card.posicion === 'ataque' ? 'Ataque' : 'Defensa'} · {card.afinidad}{card.oculta ? ' · Oculta' : ''}</small>}
    </> : <><span className="duel-card-art"><img draggable={false} className="duel-card-back" src="/hechi/card-back.png" alt="Carta boca abajo" /></span><small>{card?.posicion}</small></>}</span>
  </button>;
}

export default function DuelArena({ sesion, rpc = rpcDefault }) {
  const teacher = sesion.tipo === 'maestro';
  const [arena, setArena] = useState(null);
  const [error, setError] = useState('');
  const [pending, setBusy] = useState(false);
  const [combatQueue, setCombatQueue] = useState([]);
  const [intro, setIntro] = useState(null);
  const [browsing, setBrowsing] = useState(null);
  const handGesture = useRef(null);
  const suppressHandClick = useRef(false);
  const busy = pending || combatQueue.length > 0;
  const seenEvents = useRef({duel:null,ids:new Set()});
  const introducedDuels = useRef(new Set());
  const finishCombat = useCallback(() => setCombatQueue(queue => queue.slice(1)), []);
  const receiveEvents = useCallback(d => {
    if (!d) return;
    if (d.estado === 'activo' && !introducedDuels.current.has(d.id)) {
      introducedDuels.current.add(d.id);
      setIntro({id:d.id,expires:Date.now()+9000});
    }
    const events = d.eventos || [];
    if (seenEvents.current.duel !== d.id) { seenEvents.current={duel:d.id,ids:new Set(events.map(e=>e.id))}; return; }
    const fresh=events.filter(e=>!seenEvents.current.ids.has(e.id));
    if (!fresh.length) return;
    fresh.forEach(e=>seenEvents.current.ids.add(e.id));
    setCombatQueue(queue=>[...queue,...fresh.map(event=>({event,lado:d.lado}))]);
  }, []);
  const [practice, setPractice] = useState(false);
  const [selected, setSelected] = useState([]);
  const [slot, setSlot] = useState(null);
  const [rivalSearch, setRivalSearch] = useState('');
  const [placement, setPlacement] = useState(null);
  const [drag, setDrag] = useState(null);
  const [lastId, setLastId] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const request = useRef(false);
  const alive = useRef(false);
  const polling = useRef(false);
  const revision = useRef(0);
  const args = useCallback(() => ({ p_token: sesion.token, p_alumno_id: teacher ? null : sesion.alumnoId,
    p_password: teacher ? null : sesion.password }), [sesion.token, sesion.alumnoId, sesion.password, teacher]);
  const refresh = useCallback(async () => {
    const started = revision.current;
    const { data, error: failure } = await rpc('obtener_arena', args());
    if (!alive.current || started !== revision.current) return;
    if (failure) setError(failure.message || 'No se pudo cargar la arena.');
    else { receiveEvents(data.activo || data.duelos?.find(d=>d.id===seenEvents.current.duel)); setArena(data); if (data.activo) setLastId(data.activo.id); }
  }, [rpc, args, receiveEvents]);
  useEffect(() => {
    alive.current = true;
    let stopped = false;
    const poll = async () => {
      if (stopped || request.current || polling.current) return;
      polling.current = true;
      try { await refresh(); } catch { if (!stopped) setError('No se pudo conectar. Volveremos a intentarlo.'); }
      finally { polling.current = false; }
    };
    void poll();
    const timer = setInterval(poll, 1800);
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => { stopped = true; alive.current = false; clearInterval(timer); clearInterval(tick); };
  }, [refresh]);
  const duel = arena?.activo || arena?.duelos?.find(d => d.id === lastId);
  const playing = duel?.estado === 'activo';
  const fullscreen = !teacher && playing && !lobbyOpen;
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [fullscreen]);
  const mine = playing && duel.turno === duel.lado;
  const remaining = duel ? Math.max(0, Math.ceil((Date.parse(duel.venceEn) - clock) / 1000)) : 0;
  useEffect(() => {
    if (playing && remaining === 0 && !request.current) void refresh();
  }, [playing, remaining, refresh]);
  const hand = duel?.yo?.mano || [];
  const chosen = selected.map(uid => hand.find(c => c.uid === uid)).filter(Boolean);
  const combination = chosen.length === 2 ? duelCombination(chosen[0], chosen[1], duel?.hechizo) : null;
  const result = cards[chosen.length === 2 ? combination?.id : chosen[0]?.id];
  const compatible = new Set();
  if (mine && remaining > 0 && !busy && !duel.invoco && duel.fase !== 'batalla') {
    for (const a of hand) for (const b of hand) {
      if (chosen.length && !chosen.some(c => c.uid === a.uid)) continue;
      if (duelCombination(a, b, duel.hechizo)) { compatible.add(a.uid); compatible.add(b.uid); }
    }
  }
  const affinity = result?.stars?.[0];
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rivals = (arena?.rivales || []).filter(r => normalize(r.nombre).includes(normalize(rivalSearch.trim())));
  const placing = placement && placement.duel === duel?.id && placement.version === duel?.version && mine && remaining > 0 && !busy;
  const ownCard = slot === null ? null : duel?.yo?.campo[slot];
  const canAttack = mine && remaining > 0 && duel.ronda > 1 && Boolean(ownCard) && !ownCard.ataco && !busy;
  const act = async (method, extra = {}, teacherOnly = false) => {
    if (busy || request.current) return;
    request.current = true;
    revision.current += 1;
    setBusy(true); setError('');
    try {
      const { data, error: failure } = await rpc(method, { ...(teacherOnly ? { p_token: sesion.token } : args()), ...extra });
      if (failure) throw new Error(failure.message);
      if (data?.id) {
        receiveEvents(data);
        setLastId(data.id);
        setArena(old => ({ ...old, activo: ['activo', 'pendiente'].includes(data.estado) ? data : null,
          duelos: [data, ...(old?.duelos || []).filter(d => d.id !== data.id)] }));
      } else if (data?.duelos) setArena(data);
      setSelected([]); setSlot(extra.p_accion === 'posicion' ? extra.p_datos.casilla : null); setConfirmQuit(false); setPlacement(null);
      await refresh();
    } catch (e) {
      setError(e.message || 'No se pudo realizar la acción.');
      await refresh().catch(() => {});
    } finally { request.current = false; setBusy(false); }
  };
  const action = (p_accion, p_datos = {}) => act('accion_duelo_arena', { p_duelo: duel.id, p_version: duel.version, p_accion, p_datos });
  const choose = uid => {
    setPlacement(null);
    const next = hand.find(c => c.uid === uid);
    setSelected(prev => {
      if (prev.includes(uid)) return prev.filter(id => id !== uid);
      const previous = hand.find(c => c.uid === prev.at(-1));
      return duelCombination(previous, next, duel.hechizo) ? [previous.uid, uid] : [uid];
    });
    setSlot(null);
  };
  const handDisabled = c => !mine || busy || (cards[c.id]?.tipo === 'criatura' ? duel.invoco : duel.hechizo) || duel.fase === 'batalla' || !remaining;
  const browseHand = e => {
    const gesture = handGesture.current;
    if (!gesture || e.pointerId !== gesture.pointer) return;
    if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 8) gesture.moved = true;
    if (gesture.startY - e.clientY > 18) gesture.dragging = true;
    if (gesture.dragging) { setDrag({uid:gesture.uid,x:e.clientX,y:e.clientY}); return; }
    const nearest = gesture.cards.reduce((best, card) => Math.abs(card.x-e.clientX) < Math.abs(best.x-e.clientX) ? card : best);
    gesture.uid = nearest.uid;
    setBrowsing(nearest.uid);
  };
  const prepareDrop = (target, uids = selected) => {
    const picked = uids.map(uid => hand.find(c => c.uid === uid)).filter(Boolean);
    if (!picked.length || !mine || busy || !remaining || picked.some(handDisabled)) return;
    const combined = picked.length === 2 ? duelCombination(picked[0], picked[1], duel.hechizo) : null;
    const card = cards[picked.length === 2 ? combined?.id : picked[0].id];
    if (!card) return;
    const [kind, value] = target.split(':'); const index = Number(value);
    if (kind === 'field' ? card.tipo !== 'criatura' || duel.invoco || duel.yo.campo[index] :
        kind === 'target' ? card.objetivo !== 'criatura' || !duel.yo.campo[index] :
        kind === 'support' ? card.tipo === 'criatura' || card.objetivo === 'criatura' || duel.yo.apoyos?.[index] : true) return;
    setSelected(uids); setSlot(null);
    setPlacement({kind,index,duel:duel.id,version:duel.version});
  };
  const confirmPlacement = hidden => {
    if (!placing || !result) return;
    if (placement.kind === 'field') void action('invocar', {uid:chosen[0].uid,uid2:chosen[1]?.uid,casilla:placement.index,afinidad:affinity,posicion:'ataque',oculta:chosen.length === 1 && hidden});
    else void cast(placement.kind === 'support' ? placement.index : null, placement.kind === 'target' ? placement.index : undefined);
  };
  const cast = (index, target) => {
    if (!mine || busy || !remaining || duel.hechizo || chosen.length !== 1 || result?.tipo === 'criatura') return;
    return action('hechizo', { uid: chosen[0].uid, casilla: index, objetivo: target });
  };

  const content = <section className={'duel-arena panel student-tab-panel' + (fullscreen ? ' duel-fullscreen' : '')} aria-label="Arena del bestiario">
    {combatQueue[0] && <DuelCombat key={combatQueue[0].event.id} item={combatQueue[0]} cards={cards} onComplete={finishCombat} />}
    {error && <p className="duel-error" role="alert">{error}</p>}
    {!arena && <p role="status">Cargando arena…</p>}
    {teacher && arena && <div className="duel-controls">
      <button disabled={busy} onClick={() => act('configurar_arena', { p_abierta: !arena.abierta }, true)}>
        {arena.abierta ? 'Cerrar arena' : 'Abrir arena'}</button>
      <p>Al cerrar, los duelos en curso pueden terminar. Se cancelan los retos pendientes.</p>
    </div>}

    {!teacher && duel?.estado === 'pendiente' && <article className="duel-invite">
      <h3>{duel.nombre1} desafía a {duel.nombre2}</h3>
      <p>{duel.recompensa ? 'Con recompensa: al aceptar se reserva un cupo para ambos.' : 'Práctica: sin puntos ni consumo de cupos.'}</p>
      {duel.jugador2 === sesion.alumnoId && <button disabled={busy} onClick={() => act('responder_reto_arena', { p_duelo: duel.id, p_aceptar: true })}>Aceptar duelo</button>}
      <button disabled={busy} onClick={() => act('responder_reto_arena', { p_duelo: duel.id, p_aceptar: false })}>
        {duel.jugador1 === sesion.alumnoId ? 'Cancelar reto' : 'Rechazar'}</button>
    </article>}
    {fullscreen && <div className="duel-play-surface" inert={combatQueue.length ? true : undefined}>
      <button className="duel-menu-toggle" aria-label="Menú del duelo" aria-expanded={menuOpen} aria-controls="duel-menu" onClick={() => setMenuOpen(value => !value)}>☰</button>
      {drag && <img className="duel-drag-ghost" src={cards[hand.find(c=>c.uid===drag.uid)?.id]?.imagen} alt="" style={{left:drag.x,top:drag.y}} />}
      {placing && result && <aside className="duel-placement" role="dialog" aria-label="Colocar carta" onKeyDown={e=>{if(e.key==='Escape') setPlacement(null);}}>
        <strong>{result.nombre} · Espacio {placement.index + 1}</strong>
        {result.tipo === 'criatura' && <small>{affinity} · ATQ {result.atk + (combination?.bonusAtk || 0)}</small>}
        <div className="duel-controls">
          {result.tipo !== 'trampa' && <button onClick={()=>confirmPlacement(false)}>Boca arriba</button>}
          {(result.tipo === 'trampa' || (result.tipo === 'criatura' && chosen.length === 1)) && <button onClick={()=>confirmPlacement(true)}>Boca abajo</button>}
          <button onClick={()=>setPlacement(null)}>Cancelar</button>
        </div>
        {chosen.length === 2 && <small>Las combinaciones se colocan boca arriba.</small>}
      </aside>}
      <div className="duel-turn-toast" hidden={combatQueue.length > 0} key={duel.id + ':' + duel.ronda} role="status" aria-live="polite">
        <small>{mine ? 'INICIO DE TURNO' : 'FIN DE TU TURNO'}</small>
        <strong>{mine ? '¡Te toca jugar!' : 'Ahora juega tu rival'}</strong>
      </div>
      {intro?.id === duel.id && clock < intro.expires && <p className="duel-intro-toast" role="status">Arrastra una carta a un espacio libre y elige boca arriba o boca abajo para colocarla. Para atacar, toca tu criatura y después una del rival. Vuelve a tocar tu criatura seleccionada para cambiar su posición.</p>}
      <div className="duel-scoreboard duel-hud">
        <div className="duel-rival-hand" role="img" aria-label={'Mano rival: ' + duel.rival.cantidadMano + ' cartas boca abajo'}>{Array.from({length:Math.max(0,Math.min(5,duel.rival.cantidadMano || 0))},(_,i) => <img key={i} draggable={false} src="/hechi/card-back.png" alt="" style={{'--fan-offset':i-(Math.min(5,duel.rival.cantidadMano)-1)/2}} />)}</div>
        <div className="duel-hud-turn"><strong>{mine ? "Tu turno" : "Turno rival"}</strong><span>{remaining}s · Turno {duel.ronda}</span></div>
        <div className="duel-hud-player rival"><small>{duel.lado === "a" ? duel.nombre2 : duel.nombre1}</small><strong>VIDA {duel.rival.vida}</strong><span>Mazo {duel.rival.restantes} · Mano {duel.rival.cantidadMano}</span></div>
      </div>
      <div className="duel-battlefield">
      <div className="duel-supports" aria-label="Magia y trampas rivales">{(duel.rival.apoyos || [null,null,null,null,null]).map((c,i) => c ? <Card key={i} card={c} disabled label="Trampa rival oculta" /> : <div key={i} className="duel-support-empty">Magia / trampa</div>)}</div>
      <div className="duel-field" aria-label="Campo rival">
        {duel.rival.campo.map((c, i) => c ? <Card key={i} card={c} disabled={!canAttack}
          label={'Atacar espacio rival ' + (i + 1) + (c.id ? ': ' + name(c.id) : ': carta oculta')}
          onClick={() => action('atacar', { casilla: slot, objetivo: i })} /> :
          <button className="duel-empty" key={i} aria-label={"Ataque directo en espacio rival " + (i+1)} disabled={!canAttack || duel.rival.campo.some(Boolean)} onClick={() => action("atacar", { casilla: slot })}>{canAttack && !duel.rival.campo.some(Boolean) ? "Ataque directo" : "Vacío"}</button>)}
      </div>
      <div className="duel-field" aria-label="Tu campo">
        {duel.yo.campo.map((c, i) => c ? <Card key={i} card={c} drop={'target:'+i} selected={slot === i} disabled={!mine || busy}
          label={'Tu espacio ' + (i + 1) + ': ' + name(c.id)} onClick={() => { if (result?.objetivo === 'criatura') { void cast(null, i); } else if (slot === i) { void action('posicion', { casilla: i }); } else { setSelected([]); setSlot(i); setPlacement(null); } }} /> :
          <button key={i} data-drop={'field:'+i} className={'duel-empty ' + (slot === i ? 'is-selected' : '')} disabled={!mine || busy}
            aria-label={'Invocar en espacio ' + (i + 1)} aria-pressed={slot === i} onClick={() => prepareDrop('field:'+i)}>Espacio {i + 1}</button>)}
      </div>
      <div className="duel-supports" aria-label="Tu zona de magia y trampas">{(duel.yo.apoyos || [null,null,null,null,null]).map((c,i) => c ? <Card key={i} card={c} disabled label={name(c.id) + ", trampa preparada"} /> : <button key={i} data-drop={"support:"+i} className="duel-support-empty" aria-label={"Usar magia o trampa en espacio " + (i+1)} disabled={!mine || busy || !remaining || duel.hechizo || !result || result.tipo === "criatura" || result.objetivo === "criatura"} onClick={() => cast(i)}>Magia / trampa</button>)}</div>
      </div>
      <div className="duel-hand-dock">
      <div className="duel-own-life"><small>TÚ</small><strong>VIDA {duel.yo.vida}</strong><span>Mazo {duel.yo.restantes}</span></div>
      <h3>Tu mano <small>({hand.length}/5)</small></h3>
      <div className="duel-hand" aria-label="Tu mano de cartas"
        onPointerDown={e => {
          suppressHandClick.current = false;
          const buttons = [...e.currentTarget.querySelectorAll('button:not(:disabled)')];
          if (!buttons.length || e.button !== 0) return;
          const target = e.target.closest('button');
          if (!target || target.disabled) return;
          handGesture.current = {pointer:e.pointerId,startX:e.clientX,startY:e.clientY,top:e.currentTarget.getBoundingClientRect().top,moved:false,uid:target.dataset.uid,cards:buttons.map(button => ({uid:button.dataset.uid,x:button.getBoundingClientRect().left+button.getBoundingClientRect().width/2}))};
          setBrowsing(target.dataset.uid);
        }}
        onPointerMove={e => { browseHand(e); if (handGesture.current?.moved && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerUp={e => {
          const gesture = handGesture.current;
          if (!gesture || gesture.pointer !== e.pointerId) return;
          handGesture.current = null; setBrowsing(null); setDrag(null);
          if (gesture.dragging) {
            suppressHandClick.current = true;
            const target = document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-drop]')?.dataset.drop;
            if (target) prepareDrop(target, selected.includes(gesture.uid) ? selected : [gesture.uid]);
            return;
          }
          if (gesture.moved) { suppressHandClick.current = true; const card=hand.find(c=>c.uid===gesture.uid); if(card && !handDisabled(card)) choose(gesture.uid); }
        }}
        onPointerCancel={() => { handGesture.current=null; setBrowsing(null); setDrag(null); }}>
        {hand.map((c,i) => <Card key={c.uid} card={c} selected={selected.includes(c.uid)} browsing={browsing===c.uid} compatible={compatible.has(c.uid)}
          style={{'--fan-offset':i-(hand.length-1)/2,'--fan-order':i}} disabled={handDisabled(c)}
          onClick={() => { if (suppressHandClick.current) { suppressHandClick.current=false; return; } choose(c.uid); }} />)}
      </div>
      </div>
      <p className="duel-message" role="status" key={duel.version}>{duel.mensaje}</p>
      <div className="duel-controls duel-turn">
        <button disabled={!mine || busy || !remaining} onClick={() => action('terminar')}>Terminar turno</button>
        <span>{remaining > 0 ? remaining + "s para jugar · El turno pasa automáticamente" : "Cambiando de turno…"}</span>

        <button disabled={busy} onClick={() => setConfirmQuit(true)}>Rendirse</button>
      </div>
      {confirmQuit && <div className="duel-invite" role="alert"><p>Rendirse cancela el duelo sin puntos para nadie. El cupo reservado sigue consumido.</p>
        <button disabled={busy} onClick={() => action('rendirse')}>Confirmar rendición</button><button onClick={() => setConfirmQuit(false)}>Seguir jugando</button></div>}
    </div>}
    {!teacher && duel && !['pendiente', 'activo'].includes(duel.estado) && <article className="duel-invite" role="status">
      <h3>{duel.ganador ? (duel.ganador === sesion.alumnoId ? '¡Victoria!' : 'Duelo terminado') : 'Duelo cerrado'}</h3>
      <p>{duel.mensaje}</p><p>{duel.premioEntregado ? 'El ganador recibió 3 puntos.' : 'Sin puntos otorgados.'}</p>
      <button onClick={() => setLastId(null)}>Volver a los retos</button></article>}
    {!teacher && arena && (!arena.activo || lobbyOpen) && <div className="duel-lobby">
      <h3>Elige un rival</h3>
      {playing && <p>Hay un duelo en curso. <button onClick={() => { setLobbyOpen(false); setMenuOpen(false); }}>Reanudar duelo</button></p>}
      <label><input type="checkbox" checked={practice} onChange={e => setPractice(e.target.checked)} /> Jugar en práctica</label>
      {!arena.abierta && <p>El maestro abrirá la arena cuando sea momento de jugar.</p>}
      <label className="duel-rival-search">Buscar rival<input type="search" placeholder="Nombre del jugador" value={rivalSearch} onChange={e=>setRivalSearch(e.target.value)} /></label>
      {arena.rivales.length > 0 && rivals.length === 0 && <p role="status">No hay jugadores con ese nombre.</p>}
      <div className="duel-rivals">{rivals.map(r => <div key={r.id}><span>{r.nombre}<small>{r.ocupado ? 'En otro duelo o reto' : practice || !r.conPremio ? 'Práctica' : 'Con recompensa'}</small></span>
        <button disabled={busy || Boolean(arena.activo) || r.ocupado || !arena.abierta} onClick={() => { setLobbyOpen(false); void act('retar_arena', { p_rival: r.id, p_practica: practice }); }}>Retar</button></div>)}</div>
      {arena.rivales.length === 0 && <p>Aún no hay otros alumnos en la clase.</p>}
    </div>}
    <div id="duel-menu" className={fullscreen ? 'duel-menu-panel' : ''} hidden={fullscreen && !menuOpen} onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false); }}>
    {fullscreen && <div className="duel-controls"><button onClick={() => setMenuOpen(false)}>Cerrar menú</button><button onClick={() => { setLobbyOpen(true); setMenuOpen(false); setSelected([]); setSlot(null); setPlacement(null); }}>Salir al listado de retos</button></div>}
    <header className="duel-heading"><div><small>DUELOS DEL BESTIARIO</small><h2>Arena de criaturas</h2></div>
      <span className="duel-badge">{arena?.abierta ? 'Arena abierta' : 'Arena cerrada'}</span></header>
    <p>Las 24 criaturas están disponibles para todos. Cada mazo tiene 75 cartas: 61 criaturas y 14 de magia o trampa, sin necesidad de comprarlas.</p>
    {!teacher && arena && <p className="duel-reward">{arena.cupos} de 3 duelos con recompensa disponibles hoy · Victoria +3 puntos · Derrota 0</p>}
    <details className="duel-guide"><summary>Cómo jugar · Mazo y fusiones</summary>
      <p>4,000 de vida, cinco espacios y mano de cinco cartas. Al comenzar tu turno recuperas tu mano hasta cinco. Puedes invocar una criatura o fusionar dos cartas de tu mano por turno, antes de atacar.</p>
      <p>Toca una vez tu criatura para seleccionarla y después toca una criatura rival para atacar. Un segundo toque sobre tu criatura seleccionada alterna su posición entre ataque y defensa. Cada monstruo puede atacar una vez, desde ataque o defensa. Al atacar se pone en ataque automáticamente. El turno pasa cuando todos hayan atacado, o puedes terminarlo antes. En el primer turno no se ataca: al colocar la primera criatura, pasa el turno al rival. Puedes atacar directamente si el campo rival está vacío.</p>
      <p>Contra ataque: gana el ATQ mayor, destruye la criatura menor y la diferencia se resta a su vida. Si empatan, ambas se destruyen. Contra defensa: ATQ mayor destruye sin restar vida; ATQ menor te resta la diferencia, sin destruir tu criatura.</p>
      <p>Cada criatura tiene una afinidad predeterminada; se usa la primera afinidad de su ficha. Cada afinidad vence a la siguiente y recibe +300 en combate: fuego → tierra → aire → agua → sombra → luz → fuego. Las cartas boca abajo revelan su identidad al combatir; las fusiones entran boca arriba.</p>
      <p>Ganas al agotar la vida rival o si el rival no puede completar su mano. Empate al terminar 60 turnos. Cada turno dura hasta 90 segundos; al agotarse el tiempo, pasa automáticamente al rival.</p>
      <p>Máximo tres duelos con recompensa al día por alumno y uno contra cada rival, ganes o pierdas. Si cualquiera agotó sus cupos, ambos juegan práctica. Se reinician a medianoche de Ciudad de México. Rendirse no devuelve el cupo ni da puntos.</p>
      <div className="duel-catalog">{Object.values(cards).map(c => <article key={c.id}><img loading="lazy" src={c.imagen} alt="" /><strong>{c.nombre}</strong><small>{rarity[c.rareza]} · {c.copies} copias</small><small>{c.tipo === 'criatura' ? c.atk + ' ATQ / ' + c.def + ' DEF · ' + c.stars.join(' / ') : c.tipo + ': ' + c.efecto}</small></article>)}</div>
      <p>Puedes usar una magia o colocar una trampa por turno, además de tu criatura. Engorgio se aplica tocando una criatura propia; las otras cartas se juegan tocando un espacio libre de Magia / trampa. Las trampas se activan automáticamente ante el siguiente ataque rival: una por ataque, de izquierda a derecha, y se consumen al activarse. Solo afectan al duelo.</p>
      <h3>Recetas de fusión</h3><ul>{catalog.fusions.map(([a, b, c]) => <li key={a + b}>{name(a)} + {name(b)} → <strong>{name(c)}</strong></li>)}</ul>
    </details>
    {arena?.duelos.length > 0 && <details className="duel-guide" open={teacher}><summary>Duelos recientes</summary>
      {arena.duelos.map(d => <article className="duel-history" key={d.id}><strong>{d.nombre1} vs. {d.nombre2}</strong>
        <span>{d.estado} · {d.recompensa ? 'Con recompensa' : 'Práctica'} · {d.mensaje}</span></article>)}</details>}
    </div>
  </section>;
  return fullscreen ? createPortal(content, document.body) : content;
}
