// Small shared UI primitives used across pages.
export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

const STATUS_TONE = { open: 'yellow', partial: 'blue', paid: 'green', draft: 'gray', sent: 'blue', overdue: 'red', cancelled: 'gray' };
export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status] || 'gray'}>{status}</Badge>;
}

export function EurBadge({ currency, original }) {
  if (currency !== 'EUR') return null;
  return <Badge tone="eur" title={original ? `€${original} original` : 'Originally in EUR'}>EUR</Badge>;
}

/**
 * Shows which Gemini tier actually ran a scan: green glowing dot + "Gemini Lite"
 * for the free key, red glowing dot + "Gemini Pro" for the paid-key fallback.
 */
export function AiBadge({ tier, model }) {
  if (!tier) return null;
  const free = tier === 'free';
  return (
    <span className={`ai-badge ${free ? 'ai-free' : 'ai-paid'}`} title={model ? `Model: ${model}` : ''}>
      <span className="ai-dot" />
      {free ? 'Gemini Lite' : 'Gemini Pro'}
    </span>
  );
}

export function CurrencyToggle({ value, onChange }) {
  return (
    <div className="seg">
      <button type="button" className={value === 'MKD' ? 'on' : ''} onClick={() => onChange('MKD')}>MKD</button>
      <button type="button" className={value === 'EUR' ? 'on' : ''} onClick={() => onChange('EUR')}>EUR</button>
    </div>
  );
}
