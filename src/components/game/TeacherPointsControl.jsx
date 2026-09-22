import { useRef, useState } from 'react';

function TeacherPointsControl({ alumno, onApply }) {
  const [cantidad, setCantidad] = useState('0');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const enCurso = useRef(false);
  const puntos = Number(cantidad);
  const valido = cantidad.trim() !== '' && Number.isInteger(puntos) && puntos !== 0 && Math.abs(puntos) <= 100 && alumno.puntos + puntos >= 0;
  const cambiar = (paso) => {
    setCantidad(String(Math.max(-100, Math.min(100, (Number(cantidad) || 0) + paso))));
    setError('');
  };
  const aplicar = async () => {
    if (!valido || enCurso.current) return;
    enCurso.current = true;
    setProcesando(true);
    setError('');
    try {
      await onApply(alumno, puntos);
      setCantidad('0');
    } catch (error) {
      setError(error.message || 'No se pudieron ajustar los puntos.');
    } finally {
      enCurso.current = false;
      setProcesando(false);
    }
  };
  return (
    <div className='teacher-points-control' role='group' aria-label={'Ajustar puntos de ' + alumno.nombre}>
      <span>Ajustar puntos</span>
      <div className='teacher-points-stepper'>
        <button type='button' aria-label='Restar un punto al ajuste' disabled={procesando || puntos <= -100} onClick={() => cambiar(-1)}>−</button>
        <input type='number' step='1' min='-100' max='100' aria-label='Cantidad de puntos a sumar o restar' value={cantidad} disabled={procesando} onChange={(event) => { setCantidad(event.target.value); setError(''); }} />
        <button type='button' aria-label='Sumar un punto al ajuste' disabled={procesando || puntos >= 100} onClick={() => cambiar(1)}>+</button>
      </div>
      <small>{Number.isInteger(puntos) && cantidad.trim() !== '' ? (puntos > 0 ? '+' : '') + puntos + ' puntos para el alumno y su casa' : 'Escribe una cantidad entera'}</small>
      {puntos < 0 && alumno.puntos + puntos < 0 && <small>No puedes quitar más de {alumno.puntos} puntos.</small>}
      {Math.abs(puntos) > 100 && <small>Máximo 100 puntos por ajuste.</small>}
      <button type='button' className='teacher-points-apply' disabled={!valido || procesando} onClick={aplicar}>{procesando ? 'Aplicando…' : 'Aplicar'}</button>
      {error && <span role='alert'>{error}</span>}
    </div>
  );
}
export default TeacherPointsControl;
