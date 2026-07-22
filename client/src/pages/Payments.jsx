import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Spinner, Badge, Empty, Modal, Field } from '../components/ui.jsx';
import PayModal from '../components/PayModal.jsx';

export default function Payments() {
  const [rows, setRows] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/payments').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); api.get('/companies').then(setCompanies); }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Payments</div>
        <button className="btn" onClick={() => setPicking(true)}>💸 Pay Company / Worker</button>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No payments recorded.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Paid to</th><th>Method</th><th className="num">Amount</th><th>Invoices closed</th><th>Proof</th><th></th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className="muted">{date(p.paid_at)}</td>
                <td><b>{p.company_name || p.worker_name}</b></td>
                <td><Badge tone="gray">{p.method}</Badge></td>
                <td className="num">{mkd(p.amount)}</td>
                <td className="muted">{p.allocations.map((a) => `#${a.invoice_id} (${mkd(a.amount)})`).join(', ') || '—'}</td>
                <td>{p.proof_url
                  ? <button className="btn ghost sm" title="View proof of payment" onClick={() => api.openFile(`/payments/${p.id}/proof`).catch((e) => alert(e.message))}>📎 View</button>
                  : <span className="muted">—</span>}</td>
                <td className="num"><button className="btn ghost sm" onClick={() => setEditing(p)}>Edit</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {picking && <PickModal companies={companies} onClose={() => setPicking(false)} onPick={(c) => { setPicking(false); setPaying(c); }} />}
      {paying && <PayModal company={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
      {editing && <EditPaymentModal payment={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </>
  );
}

function EditPaymentModal({ payment, onClose, onDone }) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method);
  const [paidAt, setPaidAt] = useState(String(payment.paid_at).slice(0, 10));
  const [proof, setProof] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErr('');
    try {
      await api.patch(`/payments/${payment.id}`, { amount: Number(amount), method, paidAt });
      if (proof) { const fd = new FormData(); fd.append('file', proof); await api.upload(`/payments/${payment.id}/proof`, fd); }
      onDone();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  async function remove() {
    if (!confirm('Delete this payment? The invoice balance it settled will be restored.')) return;
    setBusy(true); setErr('');
    try { await api.del(`/payments/${payment.id}`); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title={`Edit payment — ${payment.company_name || payment.worker_name}`} onClose={onClose}
      footer={<><button className="btn ghost" style={{ color: 'var(--neg)' }} disabled={busy} onClick={remove}>Delete</button>
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

function PickModal({ companies, onClose, onPick }) {
  const [id, setId] = useState('');
  return (
    <Modal title="Choose a company" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={!id} onClick={() => onPick(companies.find((c) => String(c.id) === id))}>Continue</button></>}>
      <Field label="Company"><select className="select" value={id} onChange={(e) => setId(e.target.value)}><option value="">Select…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <p className="muted">To pay a worker, use the Pay button on the Workers page.</p>
    </Modal>
  );
}
