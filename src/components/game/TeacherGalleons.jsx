import { useRef, useState } from 'react';
import '../../styles/teacher-galleons.css';

export default function TeacherGalleons({ alumnos = [], onSave }) {
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visible = alumnos.filter(a => normalize(a.nombre).includes(normalize(search.trim())));
  const amount = Number(edit?.value);
  const valid = edit && /^\d+$/.test(edit.value) && Number.isSafeInteger(amount) && amount <= 2147483647;
  const save = async event => {
    event.preventDefault();
    if (!valid || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await onSave(edit.alumno, amount, edit.previous);
      setMessage(`${edit.alumno.nombre}: saldo actualizado a ${amount} galeones.`);
      setEdit(null);
    } catch (failure) { setError(failure.message || 'No se pudo guardar el saldo.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <section className="panel teacher-galleons" aria-label="Galeones de los alumnos">
    <h2>Galeones</h2>
    <p>Consulta el saldo de todos tus alumnos. Al editar, escribe el total que deben tener.</p>
    <label>Buscar alumno<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {message && <p role="status">{message}</p>}
    {edit && <form onSubmit={save} aria-label={'Editar galeones de ' + edit.alumno.nombre}>
      <h3>{edit.alumno.nombre}</h3>
      <p>Saldo al abrir: {edit.previous} galeones</p>
      <label>Nuevo saldo<input autoFocus type="number" min="0" max="2147483647" step="1" value={edit.value} disabled={busy} onChange={e => { setEdit({...edit,value:e.target.value}); setError(''); }} /></label>
      <small>Se reemplazará el saldo por esta cantidad. No cambia puntos ni participaciones.</small>
      {error && <p role="alert">{error}</p>}
      <div><button type="submit" disabled={!valid || busy}>{busy ? 'Guardando…' : 'Guardar saldo'}</button><button type="button" disabled={busy} onClick={() => { setEdit(null); setError(''); }}>Cancelar</button></div>
    </form>}
    <ul>{visible.map(alumno => <li key={alumno.id}>
      <span><strong>{alumno.nombre}</strong><small>{alumno.galeones ?? 0} galeones</small></span>
      <button type="button" disabled={busy || Boolean(edit)} aria-label={'Editar galeones de ' + alumno.nombre} onClick={() => { setEdit({alumno,previous:alumno.galeones ?? 0,value:String(alumno.galeones ?? 0)}); setError(''); setMessage(''); }}>Editar</button>
    </li>)}</ul>
    {!visible.length && <p>{alumnos.length ? 'No hay alumnos con ese nombre.' : 'Aún no hay alumnos en esta clase.'}</p>}
  </section>;
}
