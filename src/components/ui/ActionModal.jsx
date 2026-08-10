import { FaWandMagicSparkles, FaXmark } from 'react-icons/fa6';

function ActionModal({ open, title, eyebrow = 'Accion del maestro', description, fields = [], confirmText = 'Confirmar', cancelText = 'Cancelar', variant = 'default', loading = false, error = '', onClose, onConfirm }) {
  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    onConfirm?.(Object.fromEntries(new FormData(event.currentTarget)));
  };

  return (
    <div className='action-modal' role='dialog' aria-modal='true' aria-labelledby='action-modal-title'>
      <form className={'action-card ' + variant} onSubmit={submit}>
        <button type='button' className='action-close' onClick={onClose} aria-label='Cerrar accion' disabled={loading}><FaXmark /></button>
        <span className='eyebrow'><FaWandMagicSparkles /> {eyebrow}</span>
        <h2 id='action-modal-title'>{title}</h2>
        {description && <p>{description}</p>}
        {fields.length > 0 && (
          <div className='action-fields'>
            {fields.map((field) => (
              <label key={field.name}>
                <span>{field.label}</span>
                <input
                  type={field.type || 'text'}
                  min={field.min}
                  max={field.max}
                  minLength={field.minLength}
                  name={field.name}
                  defaultValue={field.defaultValue ?? ''}
                  autoFocus={field.autoFocus}
                  autoComplete={field.autoComplete}
                />
              </label>
            ))}
          </div>
        )}
        {error && <strong className='action-error'>{error}</strong>}
        <div className='action-buttons'>
          <button type='button' className='ghost action-cancel' onClick={onClose} disabled={loading}>{cancelText}</button>
          <button type='submit' className='authorize action-confirm' disabled={loading}>{loading ? 'Procesando...' : confirmText}</button>
        </div>
      </form>
    </div>
  );
}

export default ActionModal;
