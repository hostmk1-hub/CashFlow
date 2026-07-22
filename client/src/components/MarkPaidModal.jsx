import { useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Modal, Field } from './ui.jsx';

/**
 * Mark a single invoice (or one installment) as paid: choose method
 * (cash/card/bank), the payment date, the amount (prefilled with the remaining
 * or the installment amount), and optionally attach a proof of payment. Posts
 * to /invoices/:id/pay, then uploads the proof to the created payment.
 */
export default function MarkPaidModal({ invoiceId, defaultAmount, remaining, label, onClose, onDone }) {
  const [amount, setAmount] = useState(defaultAmount != null ? String(defaultAmount) : '');
  const [method, setMethod] = useState('bank');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [proof, setProof] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true); setErr('');
    try {
      const body = { method, paidAt };
      if (amount && Number(amount) > 0) body.amount = Number(amount);
      const res = await api.post(`/invoices/${invoiceId}/pay`, body);
      if (proof && res?.payment?.id) {
        const fd = new FormData(); fd.append('file', proof);
        await api.upload(`/payments/${res.payment.id}/proof`, fd);
      }
      onDone(res);
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title={`Mark paid${label ? ` — ${label}` : ''}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={confirm}>{busy ? 'Processing…' : 'Confirm payment'}</button></>}>
      {err && <div className="error-msg">{err}</div>}
      {remaining != null && <div className="muted" style={{ marginBottom: 10 }}>Remaining on this invoice: <b>{mkd(remaining)}</b></div>}
      <div className="row2">
        <Field label="Amount (leave blank to pay the full remaining)">
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={remaining != null ? String(remaining) : '0'} autoFocus />
        </Field>
        <Field label="Payment date">
          <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </Field>
      </div>
      <Field label="Method">
        <div className="seg">
          {['cash', 'card', 'bank'].map((m) => <button key={m} type="button" className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m}</button>)}
        </div>
      </Field>
      <Field label="Proof of payment (optional — receipt/slip photo or PDF)">
        <input className="input" type="file" accept="image/*,.pdf,application/pdf" onChange={(e) => setProof(e.target.files[0] || null)} />
      </Field>
    </Modal>
  );
}
