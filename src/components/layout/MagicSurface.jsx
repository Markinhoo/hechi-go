function MagicSurface({ children, destellos, onSpark }) {
  return (
    <div className='magic-surface' onPointerMove={onSpark} onPointerDown={(event) => onSpark(event, true)}>
      {children}
      <div className='spark-layer' aria-hidden='true'>
        {destellos.map((d) => <span key={d.id} className={d.intenso ? 'spark burst' : 'spark'} style={{ left: d.x, top: d.y }} />)}
      </div>
    </div>
  );
}

export default MagicSurface;
