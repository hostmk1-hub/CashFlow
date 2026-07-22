import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Modal, Field, CurrencyToggle } from './ui.jsx';

// FIFO payment modal — works for a company (payables), a worker (salary), or a
// client (receivables, when receivable=true). Shows a live allocation preview.
export default function PayModal({ company, worker, receivable, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('MKD');
  const [rate, setRate] = useState(61.8);
  const [method, setMethod] = useState('bank');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [proof, setProof] = useState(null);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const target = company || worker;
  const base = receivable ? '/client-payments' : '/payments';
  const idBody = receivable
    ? { companyId: company.id }
    : company ? { companyId: company.id } : { workerId: worker.id };

  useEffect(() => {
    if (!amount || Number(amount) <= 0) return setPreview(null);
    const body = { ...idBody, amount: Number(amount), currency, exchangeRate: rate };
    const t = setTimeout(() => {
      api.post(`${base}/preview`, body).then(setPreview).catch((e) => setErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [amount, currency, rate]);

  async function confirm() {
    setBusy(true); setErr('');
    try {
      const body = { ...idBody, amount: Number(amount), currency, exchangeRate: rate, method, paidAt };
      const res = await api.post(base, body);
      // Attach proof to the freshly-created payment, if one was chosen.
      if (proof && res?.payment?.id) {
        const fd = new FormData(); fd.append('file', proof);
        await api.upload(`${base}/${res.payment.id}/proof`, fd);
      }
      onDone(res);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title={`Pay ${target.name}`} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || !preview?.allocations?.length} onClick={confirm}>{busy ? 'Processing…' : 'Confirm payment'}</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <div className="row2">
        <Field label="Amount">
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
        </Field>
        <Field label="Currency"><CurrencyToggle value={currency} onChange={setCurrency} /></Field>
      </div>
      {currency === 'EUR' && (
        <Field label="Exchange rate (MKD per EUR)">
          <input className="input" type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} />
        </Field>
      )}
      <div className="row2">
        <Field label="Method">
          <div className="seg">
            {['cash', 'card', 'bank'].map((m) => <button key={m} type="button" className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m}</button>)}
          </div>
        </Field>
        <Field label="Payment date">
          <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
      </div>
      <Field label="Proof of payment (optional — receipt/slip photo or PDF)">
        <input className="input" type="file" accept="image/*,.pdf,application/pdf" onChange={(e) => setProof(e.target.files[0] || null)} />
      </Field>

      {preview && (
        <div className="preview-box">
          <b>{mkd(preview.amountMkd)}</b> will settle {preview.allocations.length} {receivable ? 'client ' : ''}invoice(s):
          <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
            {preview.allocations.map((a) => (
              <li key={a.invoiceId}>#{a.invoiceId} {a.description} — {mkd(a.applied)} {a.closed ? '✅ closed' : '◻ partial'}</li>
            ))}
          </ul>
          <div className="muted">Open before: {mkd(preview.totalOpenBefore)} → after: {mkd(preview.totalOpenAfter)}
            {preview.leftover > 0 && ` · Leftover unallocated: ${mkd(preview.leftover)}`}</div>
        </div>
      )}
    </Modal>
  );
}
