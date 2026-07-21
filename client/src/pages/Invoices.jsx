import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Modal, Field, Spinner, StatusBadge, EurBadge, Badge, Empty, CurrencyToggle } from '../components/ui.jsx';

export default function Invoices() {
  const [rows, setRows] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [filters, setFilters] = useState({ status: '', currency: '', source: '' });
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api.get(`/invoices${qs ? '?' + qs : ''}`).then(setRows).catch(() => setRows([]));
  };
  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    api.get('/companies').then(setCompanies);
    api.get('/vehicles').then(setVehicles);
    api.get('/workers').then(setWorkers);
  }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Invoices</div>
        <div className="toolbar">
          <button className="btn ghost" onClick={() => setScanning(true)}>📷 Scan Invoice</button>
          <button className="btn" onClick={() => setAdding(true)}>+ Add Invoice</button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <select className="select" style={{ width: 150 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option><option value="open">Open</option><option value="partial">Partial</option><option value="paid">Paid</option>
        </select>
        <select className="select" style={{ width: 150 }} value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
          <option value="">All sources</option>{['manual', 'recurring', 'amortization', 'salary', 'scanned'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" style={{ width: 130 }} value={filters.currency} onChange={(e) => setFilters({ ...filters, currency: e.target.value })}>
          <option value="">All currencies</option><option value="MKD">MKD</option><option value="EUR">EUR</option>
        </select>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No invoices match.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Description</th><th>Company / Worker</th><th>Vehicle</th><th className="num">Amount</th><th className="num">Paid</th><th>Due</th><th>Source</th><th>Status</th></tr></thead>
            <tbody>{rows.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td>{i.company_name || i.worker_name || '—'}</td>
                <td className="muted">{i.vehicle_plate || '—'}</td>
                <td className="num">{mkd(i.amount)} <EurBadge currency={i.currency} original={i.original_amount} /></td>
                <td className="num">{mkd(i.paid_amount)}</td>
                <td className="muted">{date(i.due_date)}</td>
                <td><Badge tone="gray">{i.source}</Badge></td>
                <td><StatusBadge status={i.status} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {adding && <AddInvoiceModal companies={companies} vehicles={vehicles} workers={workers} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
      {scanning && <ScanModal companies={companies} vehicles={vehicles} onClose={() => setScanning(false)} onSaved={() => { setScanning(false); load(); }} />}
    </>
  );
}

function AddInvoiceModal({ companies, vehicles, workers, onClose, onSaved }) {
  const [f, setF] = useState({ target: 'company', company_id: '', worker_id: '', vehicle_id: '', description: '', amount: '', currency: 'MKD', due_date: new Date().toISOString().slice(0, 10) });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr('');
    try {
      const body = {
        description: f.description, amount: Number(f.amount), currency: f.currency, due_date: f.due_date,
        vehicle_id: f.vehicle_id || null,
        ...(f.target === 'company' ? { company_id: Number(f.company_id) } : { worker_id: Number(f.worker_id) }),
      };
      await api.post('/invoices', body);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title="Add Invoice" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <Field label="Type">
        <div className="seg">
          <button type="button" className={f.target === 'company' ? 'on' : ''} onClick={() => setF({ ...f, target: 'company' })}>Company expense</button>
          <button type="button" className={f.target === 'worker' ? 'on' : ''} onClick={() => setF({ ...f, target: 'worker' })}>Worker salary</button>
        </div>
      </Field>
      {f.target === 'company' ? (
        <Field label="Company"><select className="select" value={f.company_id} onChange={set('company_id')}><option value="">Select…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      ) : (
        <Field label="Worker"><select className="select" value={f.worker_id} onChange={set('worker_id')}><option value="">Select…</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
      )}
      <Field label="Vehicle (optional)"><select className="select" value={f.vehicle_id} onChange={set('vehicle_id')}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
      <Field label="Description"><input className="input" value={f.description} onChange={set('description')} /></Field>
      <div className="row2">
        <Field label="Amount"><input className="input" type="number" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Currency"><CurrencyToggle value={f.currency} onChange={(c) => setF({ ...f, currency: c })} /></Field>
      </div>
      <Field label="Due date"><input className="input" type="date" value={f.due_date} onChange={set('due_date')} /></Field>
    </Modal>
  );
}

function ScanModal({ companies, vehicles, onClose, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const d = await api.upload('/invoices/scan', fd);
      setDraft(d);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setErr('');
    try { await api.post('/invoices/scan/confirm', draft); onSaved(); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  }
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <Modal title="Scan Invoice / Receipt" onClose={onClose} wide
      footer={draft && <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={confirm}>Confirm & save</button></>}>
      {err && <div className="error-msg">{err}</div>}
      {!draft ? (
        <>
          <p className="muted">Upload a photo or PDF. Gemini extracts the fields (Cyrillic/Latin/Turkish supported) and matches the plate + vendor. Nothing saves until you confirm.</p>
          <input type="file" accept="image/*,application/pdf" onChange={onFile} />
          {busy && <Spinner />}
        </>
      ) : (
        <>
          <div className="row2">
            <Field label="Invoice #"><input className="input" value={draft.invoice_number || ''} onChange={set('invoice_number')} /></Field>
            <Field label="Date"><input className="input" type="date" value={draft.date || ''} onChange={set('date')} /></Field>
          </div>
          <Field label="Description"><input className="input" value={draft.description || ''} onChange={set('description')} /></Field>
          <div className="row2">
            <Field label="Amount"><input className="input" type="number" value={draft.amount || ''} onChange={set('amount')} /></Field>
            <Field label="Currency"><CurrencyToggle value={draft.currency} onChange={(c) => setDraft({ ...draft, currency: c })} /></Field>
          </div>
          <Field label={`Company ${draft.vendor_name ? '(detected: ' + draft.vendor_name + ')' : ''}`}>
            <select className="select" value={draft.matched_company_id || ''} onChange={(e) => setDraft({ ...draft, matched_company_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— pick company —</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={`Vehicle ${draft.detected_plate ? '(detected plate: ' + draft.detected_plate + ')' : ''}`}>
            <select className="select" value={draft.matched_vehicle_id || ''} onChange={(e) => setDraft({ ...draft, matched_vehicle_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
            </select>
          </Field>
        </>
      )}
    </Modal>
  );
}
