import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Modal, Field, Spinner, StatusBadge, EurBadge, Empty, CurrencyToggle } from '../components/ui.jsx';
import PayModal from '../components/PayModal.jsx';

export default function InvoiceManager() {
  const [rows, setRows] = useState(null);
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(null);

  const load = () => api.get('/client-invoices').then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
    api.get('/companies?type=client').then((all) => setClients(all));
    api.get('/companies').then((all) => setClients(all.filter((c) => c.type === 'client' || c.type === 'both')));
    api.get('/vehicles').then(setVehicles);
  }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Invoice Manager <span className="muted" style={{ fontSize: 14 }}>· receivables</span></div>
        <button className="btn" onClick={() => setCreating(true)}>+ New Invoice</button>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No client invoices yet.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Client</th><th>Invoice #</th><th>Issued</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th><th></th></tr></thead>
            <tbody>{rows.map((i) => (
              <tr key={i.id}>
                <td><b>{i.company_name}</b></td><td>{i.invoice_number}</td>
                <td className="muted">{date(i.issue_date)}</td><td className="muted">{date(i.due_date)}</td>
                <td className="num">{mkd(i.amount)} <EurBadge currency={i.currency} original={i.original_amount} /></td>
                <td className="num">{mkd(i.paid_amount)}</td><td><StatusBadge status={i.status} /></td>
                <td className="num">
                  {i.status === 'draft' && <button className="btn ghost sm" onClick={() => api.post(`/client-invoices/${i.id}/send`).then(load)}>Send</button>}
                  {' '}<button className="btn sm" onClick={() => setRecording({ id: i.company_id, name: i.company_name })}>Record Payment</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {creating && <CreateModal clients={clients} vehicles={vehicles} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {recording && <PayModal company={recording} receivable onClose={() => setRecording(null)} onDone={() => { setRecording(null); load(); }} />}
    </>
  );
}

function CreateModal({ clients, vehicles, onClose, onSaved }) {
  const [f, setF] = useState({ company_id: '', vehicle_id: '', description: '', amount: '', currency: 'MKD', issue_date: new Date().toISOString().slice(0, 10), due_date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(send) {
    setErr('');
    try {
      await api.post('/client-invoices', { ...f, company_id: Number(f.company_id), vehicle_id: f.vehicle_id || null, amount: Number(f.amount), send });
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title="New Client Invoice" onClose={onClose}
      footer={<><button className="btn ghost" onClick={() => save(false)}>Save as Draft</button><button className="btn" onClick={() => save(true)}>Save & Send</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <Field label="Client"><select className="select" value={f.company_id} onChange={set('company_id')}><option value="">Select…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Vehicle (optional)"><select className="select" value={f.vehicle_id} onChange={set('vehicle_id')}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={set('description')} /></Field>
      <div className="row2">
        <Field label="Amount"><input className="input" type="number" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Currency"><CurrencyToggle value={f.currency} onChange={(c) => setF({ ...f, currency: c })} /></Field>
      </div>
      <div className="row2">
        <Field label="Issue date"><input className="input" type="date" value={f.issue_date} onChange={set('issue_date')} /></Field>
        <Field label="Due date"><input className="input" type="date" value={f.due_date} onChange={set('due_date')} /></Field>
      </div>
    </Modal>
  );
}
