import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../../services/hechiApi';
import { bestiario } from '../../data/bestiaryData';
import catalog from '../../data/duelCatalog.json';
import '../../styles/duel-arena.css';

const cards = Object.fromEntries(catalog.cards.map(c => [c.id, { ...bestiario.find(b => b.id === c.id), ...c }]));
const rpcDefault = (name, args) => db.rpc(name, args);
const name = id => cards[id]?.nombre || id;
const rarity = { comun: 'Común', rara: 'Especial', epica: 'Épica', legendaria: 'Legendaria' };

function Card({ card, selected, onClick, disabled, label }) {
  const c = cards[card?.id];
  return <button type="button" className={'duel-card ' + (selected ? 'is-selected' : '')}
    data-rarity={c?.rareza} disabled={disabled} onClick={onClick} aria-pressed={Boolean(selected)}
    aria-label={label || (c ? c.nombre + ', ataque ' + c.atk + ', defensa ' + c.def : 'Carta oculta')}>
    {c ? <><img src={c.imagen} alt="" /><strong>{c.nombre}</strong><small>{c.atk} ATQ · {c.def} DEF</small>
      {card.posicion && <small>{card.posicion === 'ataque' ? 'Ataque' : 'Defensa'} · {card.afinidad}{card.oculta ? ' · Oculta' : ''}</small>}
    </> : <><span className="duel-card-back">✦</span><strong>Boca abajo</strong><small>{card?.posicion}</small></>}
  </button>;
}

export default function DuelArena({ sesion, rpc = rpcDefault }) {
  const teacher = sesion.tipo === 'maestro';
  const [arena, setArena] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState(false);
  const [selected, setSelected] = useState([]);
  const [slot, setSlot] = useState(null);
  const [star, setStar] = useState('');
  const [position, setPosition] = useState('ataque');
  const [hidden, setHidden] = useState(false);
  const [lastId, setLastId] = useState(null);
  const [clock, setClock] = useState(() => Date.now());
  const [confirmQuit, setConfirmQuit] = useState(false);
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
    else setArena(data);
  }, [rpc, args]);
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
  const mine = playing && duel.turno === duel.lado;
  const remaining = duel ? Math.max(0, Math.ceil((Date.parse(duel.venceEn) - clock) / 1000)) : 0;
  const hand = duel?.yo?.mano || [];
  const chosen = selected.map(uid => hand.find(c => c.uid === uid)).filter(Boolean);
  const fusion = chosen.length === 2 ? catalog.fusions.find(([a, b]) =>
    [a, b].sort().join('+') === chosen.map(c => c.id).sort().join('+'))?.[2] : null;
  const result = cards[chosen.length === 2 ? fusion : chosen[0]?.id];
  const affinity = result?.stars.includes(star) ? star : result?.stars[0];
  const ownCard = slot === null ? null : duel?.yo?.campo[slot];
  const canAttack = mine && remaining > 0 && duel.ronda > 1 && ownCard?.posicion === 'ataque' && !ownCard.ataco && !busy;
  const act = async (method, extra = {}, teacherOnly = false) => {
    if (busy || request.current) return;
    request.current = true;
    revision.current += 1;
    setBusy(true); setError('');
    try {
      const { data, error: failure } = await rpc(method, { ...(teacherOnly ? { p_token: sesion.token } : args()), ...extra });
      if (failure) throw new Error(failure.message);
      if (data?.id) {
        setLastId(data.id);
        setArena(old => ({ ...old, activo: ['activo', 'pendiente'].includes(data.estado) ? data : null,
          duelos: [data, ...(old?.duelos || []).filter(d => d.id !== data.id)] }));
      } else if (data?.duelos) setArena(data);
      setSelected([]); setSlot(null); setConfirmQuit(false);
      await refresh();
    } catch (e) {
      setError(e.message || 'No se pudo realizar la acción.');
      await refresh().catch(() => {});
    } finally { request.current = false; setBusy(false); }
  };
  const action = (p_accion, p_datos = {}) => act('accion_duelo_arena', { p_duelo: duel.id, p_version: duel.version, p_accion, p_datos });
  const choose = uid => setSelected(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev.slice(-1), uid]);

  return <section className="duel-arena panel student-tab-panel" aria-label="Arena del bestiario">
    <header className="duel-heading"><div><small>DUELOS DEL BESTIARIO</small><h2>Arena de criaturas</h2></div>
      <span className="duel-badge">{arena?.abierta ? 'Arena abierta' : 'Arena cerrada'}</span></header>
    <p>Las 24 criaturas están disponibles para todos. Cada mazo tiene 61 cartas, sin necesidad de comprarlas.</p>
    {error && <p className="duel-error" role="alert">{error}</p>}
    {!arena && <p role="status">Cargando arena…</p>}
    {teacher && arena && <div className="duel-controls">
      <button disabled={busy} onClick={() => act('configurar_arena', { p_abierta: !arena.abierta }, true)}>
        {arena.abierta ? 'Cerrar arena' : 'Abrir arena'}</button>
      <p>Al cerrar, los duelos en curso pueden terminar. Se cancelan los retos pendientes.</p>
    </div>}
    {!teacher && arena && <p className="duel-reward">{arena.cupos} de 3 duelos con recompensa disponibles hoy · Victoria +3 puntos · Derrota 0</p>}
    {!teacher && duel?.estado === 'pendiente' && <article className="duel-invite">
      <h3>{duel.nombre1} desafía a {duel.nombre2}</h3>
      <p>{duel.recompensa ? 'Con recompensa: al aceptar se reserva un cupo para ambos.' : 'Práctica: sin puntos ni consumo de cupos.'}</p>
      {duel.jugador2 === sesion.alumnoId && <button disabled={busy} onClick={() => act('responder_reto_arena', { p_duelo: duel.id, p_aceptar: true })}>Aceptar duelo</button>}
      <button disabled={busy} onClick={() => act('responder_reto_arena', { p_duelo: duel.id, p_aceptar: false })}>
        {duel.jugador1 === sesion.alumnoId ? 'Cancelar reto' : 'Rechazar'}</button>
    </article>}
    {!teacher && playing && <>
      <div className="duel-scoreboard">
        <div><small>TÚ</small><strong>{duel.yo.vida} / 4000</strong><span>Mazo: {duel.yo.restantes}</span></div>
        <div><strong>Turno {duel.ronda}</strong><span>{mine ? 'Tu turno' : 'Turno rival'}</span><small>{duel.recompensa ? 'Con recompensa' : 'Práctica'}</small></div>
        <div><small>{duel.lado === 'a' ? duel.nombre2 : duel.nombre1}</small><strong>{duel.rival.vida} / 4000</strong><span>Mazo: {duel.rival.restantes} · Mano: {duel.rival.cantidadMano}</span></div>
      </div>
      <p className="duel-message" role="status" key={duel.version}>{duel.mensaje}</p>
      <div className="duel-field" aria-label="Campo rival">
        {duel.rival.campo.map((c, i) => c ? <Card key={i} card={c} disabled={!canAttack}
          label={'Atacar espacio rival ' + (i + 1) + (c.id ? ': ' + name(c.id) : ': carta oculta')}
          onClick={() => action('atacar', { casilla: slot, objetivo: i })} /> :
          <div className="duel-empty" key={i}>Vacío</div>)}
      </div>
      <p className="duel-hint">{canAttack ? 'Elige una criatura rival para atacar.' : 'Selecciona una criatura de tu campo o cartas de tu mano.'}</p>
      <div className="duel-field" aria-label="Tu campo">
        {duel.yo.campo.map((c, i) => c ? <Card key={i} card={c} selected={slot === i} disabled={!mine || busy}
          label={'Tu espacio ' + (i + 1) + ': ' + name(c.id)} onClick={() => { setSlot(i); setSelected([]); }} /> :
          <button key={i} className={'duel-empty ' + (slot === i ? 'is-selected' : '')} disabled={!mine || busy}
            aria-label={'Invocar en espacio ' + (i + 1)} aria-pressed={slot === i} onClick={() => setSlot(i)}>Espacio {i + 1}</button>)}
      </div>
      <div className="duel-controls">
        {ownCard && <><button disabled={!mine || busy || ownCard.ataco || ownCard.cambio || !remaining}
          onClick={() => action('posicion', { casilla: slot })}>Cambiar a {ownCard.posicion === 'ataque' ? 'defensa' : 'ataque'}</button>
          {!duel.rival.campo.some(Boolean) && <button disabled={!canAttack} onClick={() => action('atacar', { casilla: slot })}>Ataque directo</button>}</>}
      </div>
      <h3>Tu mano <small>({hand.length}/5)</small></h3>
      <div className="duel-hand">{hand.map(c => <Card key={c.uid} card={c} selected={selected.includes(c.uid)}
        disabled={!mine || busy || duel.invoco || duel.fase === 'batalla' || !remaining} onClick={() => choose(c.uid)} />)}</div>
      {chosen.length > 0 && <div className="duel-summon">
        <strong>{chosen.length === 2 ? (result ? 'Fusión: ' + result.nombre : 'Estas cartas no tienen una receta juntas.') : 'Invocar: ' + result?.nombre}</strong>
        {result && <><div className="duel-controls">
          <label>Afinidad<select value={affinity} onChange={e => setStar(e.target.value)}>{result.stars.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Posición<select value={position} onChange={e => setPosition(e.target.value)}><option value="ataque">Ataque</option><option value="defensa">Defensa</option></select></label>
          {chosen.length === 1 && <label><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> Boca abajo</label>}
        </div><p>Elige un espacio vacío de tu campo.</p>
        <button disabled={!mine || busy || !remaining || duel.invoco || duel.fase === 'batalla' || slot === null || Boolean(ownCard)}
          onClick={() => action('invocar', { uid: chosen[0].uid, uid2: chosen[1]?.uid, casilla: slot, afinidad: affinity, posicion: position, oculta: hidden })}>
          {chosen.length === 2 ? 'Fusionar e invocar' : 'Invocar criatura'}</button></>}
      </div>}
      <div className="duel-controls duel-turn">
        <button disabled={!mine || busy || !remaining} onClick={() => action('terminar')}>Terminar turno</button>
        <span>{remaining}s para actuar antes de cancelar por inactividad</span>
        {!remaining && <button disabled={busy} onClick={() => action('vencido')}>Cancelar por inactividad</button>}
        <button disabled={busy} onClick={() => setConfirmQuit(true)}>Rendirse</button>
      </div>
      {confirmQuit && <div className="duel-invite" role="alert"><p>Rendirse cancela el duelo sin puntos para nadie. El cupo reservado sigue consumido.</p>
        <button disabled={busy} onClick={() => action('rendirse')}>Confirmar rendición</button><button onClick={() => setConfirmQuit(false)}>Seguir jugando</button></div>}
    </>}
    {!teacher && duel && !['pendiente', 'activo'].includes(duel.estado) && <article className="duel-invite" role="status">
      <h3>{duel.ganador ? (duel.ganador === sesion.alumnoId ? '¡Victoria!' : 'Duelo terminado') : 'Duelo cerrado'}</h3>
      <p>{duel.mensaje}</p><p>{duel.premioEntregado ? 'El ganador recibió 3 puntos.' : 'Sin puntos otorgados.'}</p>
      <button onClick={() => setLastId(null)}>Volver a los retos</button></article>}
    {!teacher && arena && !arena.activo && <div className="duel-lobby">
      <h3>Elige un rival</h3>
      <label><input type="checkbox" checked={practice} onChange={e => setPractice(e.target.checked)} /> Jugar en práctica</label>
      {!arena.abierta && <p>El maestro abrirá la arena cuando sea momento de jugar.</p>}
      <div className="duel-rivals">{arena.rivales.map(r => <div key={r.id}><span>{r.nombre}<small>{r.ocupado ? 'En otro duelo o reto' : practice || !r.conPremio ? 'Práctica' : 'Con recompensa'}</small></span>
        <button disabled={busy || r.ocupado || !arena.abierta} onClick={() => act('retar_arena', { p_rival: r.id, p_practica: practice })}>Retar</button></div>)}</div>
      {arena.rivales.length === 0 && <p>Aún no hay otros alumnos en la clase.</p>}
    </div>}
    <details className="duel-guide"><summary>Cómo jugar · Mazo y fusiones</summary>
      <p>4,000 de vida, cinco espacios y mano de cinco cartas. Al comenzar tu turno recuperas tu mano hasta cinco. Puedes invocar una criatura o fusionar dos cartas de tu mano por turno, antes de atacar.</p>
      <p>Selecciona tu atacante y después una criatura rival. Cada criatura ataca una vez por turno; en el primer turno nadie ataca. Puedes atacar directamente si el campo rival está vacío.</p>
      <p>Contra ataque: gana el ATQ mayor, destruye la criatura menor y la diferencia se resta a su vida. Si empatan, ambas se destruyen. Contra defensa: ATQ mayor destruye sin restar vida; ATQ menor te resta la diferencia, sin destruir tu criatura.</p>
      <p>Al invocar, elige una de sus dos afinidades. Cada afinidad vence a la siguiente y recibe +300 en combate: fuego → tierra → aire → agua → sombra → luz → fuego. Las cartas boca abajo revelan su identidad al combatir; las fusiones entran boca arriba.</p>
      <p>Ganas al agotar la vida rival o si el rival no puede completar su mano. Empate al terminar 60 turnos. Tras 90 segundos sin acciones se puede cancelar sin premio.</p>
      <p>Máximo tres duelos con recompensa al día por alumno y uno contra cada rival, ganes o pierdas. Si cualquiera agotó sus cupos, ambos juegan práctica. Se reinician a medianoche de Ciudad de México. Rendirse o abandonar no devuelve el cupo ni da puntos.</p>
      <div className="duel-catalog">{Object.values(cards).map(c => <article key={c.id}><img loading="lazy" src={c.imagen} alt="" /><strong>{c.nombre}</strong><small>{rarity[c.rareza]} · {c.copies} copias</small><small>{c.atk} ATQ / {c.def} DEF · {c.stars.join(' / ')}</small></article>)}</div>
      <h3>Recetas de fusión</h3><ul>{catalog.fusions.map(([a, b, c]) => <li key={a + b}>{name(a)} + {name(b)} → <strong>{name(c)}</strong></li>)}</ul>
    </details>
    {arena?.duelos.length > 0 && <details className="duel-guide" open={teacher}><summary>Duelos recientes</summary>
      {arena.duelos.map(d => <article className="duel-history" key={d.id}><strong>{d.nombre1} vs. {d.nombre2}</strong>
        <span>{d.estado} · {d.recompensa ? 'Con recompensa' : 'Práctica'} · {d.mensaje}</span></article>)}</details>}
  </section>;
}