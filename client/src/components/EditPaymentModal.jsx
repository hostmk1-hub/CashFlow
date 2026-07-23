import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal, Field, Spinner } from './ui.jsx';

/**
 * Admin edit / undo of an existing payment. Accepts either a full `payment`
 * object (with allocations) or a `paymentId` to fetch on open. Editing the
 * amount re-applies it across the same invoice(s) FIFO; deleting reverses the
 * allocations and restores the invoice balances. Both actions confirm first.
 */
export default function EditPaymentModal({ payment: initial, paymentId, onClose, onDone }) {
  const [payment, setPayment] = useState(initial || null);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    if (!payment && paymentId) {
      api.get(`/payments/${paymentId}`).then(setPayment).catch((e) => setLoadErr(e.message));
    }
  }, [paymentId]);

  if (loadErr) {
    return <Modal title="Edit payment" onClose={onClose}
      footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
      <div className="error-msg">{loadErr}</div>
    </Modal>;
  }
  if (!payment) {
    return <Modal title="Edit payment" onClose={onClose}><Spinner /></Modal>;
  }
  return <Editor payment={payment} onClose={onClose} onDone={onDone} />;
}

function Editor({ payment, onClose, onDone }) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method);
  const [paidAt, setPaidAt] = useState(String(payment.paid_at).slice(0, 10));
  const [proof, setProof] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const changed = Number(amount) !== Number(payment.amount) || method !== payment.method || paidAt !== String(payment.paid_at).slice(0, 10) || proof;
    if (!changed) { onClose(); return; }
    if (!window.confirm('Save these changes to the payment? Invoice balances will be recalculated.')) return;
    setBusy(true); setErr('');
    try {
      await api.patch(`/payments/${payment.id}`, { amount: Number(amount), method, paidAt });
      if (proof) { const fd = new FormData(); fd.append('file', proof); await api.upload(`/payments/${payment.id}/proof`, fd); }
      onDone();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Undo / delete this payment? The invoice balance it settled will be restored. This is logged.')) return;
    setBusy(true); setErr('');
    try { await api.del(`/payments/${payment.id}`); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title={`Edit payment — ${payment.company_name || payment.worker_name || `#${payment.id}`}`} onClose={onClose}
      footer={<><button className="btn ghost" style={{ color: 'var(--neg)' }} disabled={busy} onClick={remove}>Undo / Delete</button>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>Changing the amount re-applies it across the invoice(s) this payment covered ({payment.allocations?.map((a) => `#${a.invoice_id}`).join(', ') || '—'}).</div>
      <div className="row2">
        <Field label="Amount (MKD)"><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Payment date"><input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
      </div>
      <Field label="Method">
        <div className="seg">
          {['cash', 'card', 'bank'].map((m) => <button key={m} type="button" className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m}</button>)}
        </div>
      </Field>
      <Field label={payment.proof_url ? 'Replace proof of payment (optional)' : 'Add proof of payment (optional)'}>
        <input className="input" type="file" accept="image/*,.pdf,application/pdf" onChange={(e) => setProof(e.target.files[0] || null)} />
        {payment.proof_url && <button type="button" className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => api.openFile(`/payments/${payment.id}/proof`).catch((e) => alert(e.message))}>📎 View current proof</button>}
      </Field>
    </Modal>
  );
}
