function MagicSurface({ children, destellos, flashesPantalla = [], onSpark }) {
  return (
    <div className='magic-surface' onPointerMove={onSpark} onPointerDown={(event) => onSpark(event, true)}>
      {children}
      <div className='spark-layer' aria-hidden='true'>
        {destellos.map((d) => <span key={d.id} className={d.intenso ? 'spark burst' : 'spark'} style={{ left: d.x, top: d.y }} />)}
      </div>
      <div className='camera-flash-layer' aria-hidden='true'>
        {flashesPantalla.map((id) => <span key={id} className='camera-flash' />)}
      </div>
    </div>
  );
}

export default MagicSurface;
