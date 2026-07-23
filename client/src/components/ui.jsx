// Small shared UI primitives used across pages.
import { useState, useRef } from 'react';
import { compressImage } from '../lib/image.js';

/**
 * Drag-and-drop file zone (also click-to-browse). Calls onFiles(File[]) — always
 * an array. Pass multiple to allow selecting/dropping several files at once.
 */
export function Dropzone({ accept, multiple = false, onFiles, busy, hint }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const pick = async (fileList) => {
    let files = Array.from(fileList || []);
    if (!files.length) return;
    // Shrink big photos before handing them up (faster upload, avoids stalls).
    files = await Promise.all(files.map((f) => compressImage(f)));
    onFiles(multiple ? files : [files[0]]);
  };
  return (
    <div
      className={`dropzone${over ? ' over' : ''}${busy ? ' busy' : ''}`}
      role="button" tabIndex={0}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) pick(e.dataTransfer.files); }}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      {busy ? <Spinner /> : (
        <div className="dz-inner">
          <div className="dz-icon">⬆</div>
          <div className="dz-text"><b>Drag &amp; drop</b> {multiple ? 'files' : 'a file'} here, or <span className="dz-link">browse</span></div>
          {hint && <div className="dz-hint muted">{hint}</div>}
        </div>
      )}
    </div>
  );
}

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
