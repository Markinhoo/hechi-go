import { useEffect, useRef, useState } from 'react';

export default function DuelChallenge({ rival, balance, practice, busy, error, onClose, onSubmit }) {
  const dialog=useRef(null);
  const [amount,setAmount]=useState('0');
  useEffect(()=>{dialog.current.showModal();},[]);
  const maximum=Math.max(0,Math.min(balance??0,rival.maxApuesta??0));
  const value=Number(amount);
  const valid=amount.trim()!=='' && Number.isSafeInteger(value) && value>=0 && value<=maximum;
  return <dialog ref={dialog} className="duel-challenge" aria-label="Apuesta del reto" onCancel={e=>{e.preventDefault();if(!busy) onClose();}}>
    <form onSubmit={e=>{e.preventDefault();if(valid && !busy) onSubmit(value);}}>
      <h3>Retar a {rival.nombre}</h3>
      <p>Tu saldo: <strong>{balance??0} galeones</strong></p>
      <p>Máximo que ambos pueden apostar: <strong>{maximum} galeones por alumno</strong>.</p>
      <label htmlFor="arena-wager">Tu apuesta (0 para jugar sin apuesta)</label>
      <input id="arena-wager" type="number" inputMode="numeric" min="0" max={maximum} step="1" required value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} />
      <div className="duel-controls"><button type="button" disabled={busy} onClick={()=>setAmount('0')}>Sin apuesta</button><button type="button" disabled={busy || maximum===0} onClick={()=>setAmount(String(maximum))}>Apostar máximo</button></div>
      {maximum===0 && <p>Solo pueden jugar sin apuesta porque uno de los dos no tiene saldo disponible.</p>}
      {valid && value>0 && <p>Cada uno aporta {value}. El ganador recibe el fondo de {value*2} galeones, que incluye su propia apuesta. Si empatan, cada uno recupera {value}.</p>}
      <p>{practice?'Duelo de práctica: sin premio base; la apuesta sí se disputa.':'Premio adicional: victoria 80 · empate 50 para cada uno · derrota 0. Sujeto a los cupos de recompensa al aceptar.'}</p>
      <small>El rival verá el importe antes de aceptar. El saldo se descuenta a ambos al aceptar el reto.</small>
      {error && <p role="alert">{error}</p>}
      {!valid && <p role="status">Escribe un número entero entre 0 y {maximum}.</p>}
      <div className="duel-controls"><button type="submit" disabled={busy || !valid}>{busy?'Enviando…':'Enviar reto'}</button><button type="button" disabled={busy} onClick={onClose}>Cancelar</button></div>
    </form>
  </dialog>;
}
