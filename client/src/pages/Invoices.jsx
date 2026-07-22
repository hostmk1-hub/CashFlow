import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Modal, Field, Spinner, StatusBadge, EurBadge, Badge, Empty, CurrencyToggle } from '../components/ui.jsx';

export default function Invoices() {
  const [rows, setRows] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [filters, setFilters] = useState({ status: '', currency: '', source: '', category: '' });
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

  async function markPaid(inv) {
    if (!confirm(`Mark "${inv.description}" as fully paid (${mkd(Number(inv.amount) - Number(inv.paid_amount))} remaining)?`)) return;
    try { await api.post(`/invoices/${inv.id}/pay`, { method: 'bank' }); load(); }
    catch (e) { alert(e.message); }
  }

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
        <select className="select" style={{ width: 150 }} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
          <option value="">All categories</option>{['leasing', 'insurance', 'repairs', 'service', 'tires', 'other'].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select className="select" style={{ width: 130 }} value={filters.currency} onChange={(e) => setFilters({ ...filters, currency: e.target.value })}>
          <option value="">All currencies</option><option value="MKD">MKD</option><option value="EUR">EUR</option>
        </select>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No invoices match.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Description</th><th>Company / Worker</th><th>Vehicle</th><th>Category</th><th className="num">Amount</th><th className="num">Paid</th><th>Due</th><th>Source</th><th>Status</th><th></th></tr></thead>
            <tbody>{rows.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.description}
                  {i.installment_count > 1 && (
                    <div style={{ marginTop: 3 }}>
                      <Badge tone="blue">
                        {Math.min(i.installment_count, Math.round(Number(i.paid_amount) / Number(i.installment_amount || 1)))}/{i.installment_count} installments · {mkd(i.installment_amount)}/mo
                      </Badge>
                    </div>
                  )}
                </td>
                <td>{i.company_name || i.worker_name || '—'}</td>
                <td className="muted">{i.vehicle_plate || '—'}</td>
                <td>{i.category ? <Badge tone={i.category === 'leasing' ? 'blue' : i.category === 'insurance' ? 'yellow' : i.category === 'repairs' ? 'red' : 'gray'}>{i.category}</Badge> : <span className="muted">—</span>}</td>
                <td className="num">{mkd(i.amount)} <EurBadge currency={i.currency} original={i.original_amount} /></td>
                <td className="num">{mkd(i.paid_amount)}</td>
                <td className="muted">{date(i.due_date)}</td>
                <td><Badge tone="gray">{i.source}</Badge></td>
                <td><StatusBadge status={i.status} /></td>
                <td className="num">{i.status !== 'paid' && <button className="btn ghost sm" onClick={() => markPaid(i)}>Mark paid</button>}</td>
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

const INSTALLMENT_PRESETS = [1, 3, 6, 12, 24];
const CATEGORIES = ['leasing', 'insurance', 'repairs', 'service', 'tires', 'other'];

function AddInvoiceModal({ companies, vehicles, workers, onClose, onSaved }) {
  const [f, setF] = useState({ target: 'company', company_id: '', worker_id: '', vehicle_id: '', description: '', amount: '', currency: 'MKD', due_date: new Date().toISOString().slice(0, 10), installments: 1, category: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const n = Math.max(1, Number(f.installments) || 1);
  const total = Number(f.amount) || 0;
  const per = n > 1 ? Math.round((total / n) * 100) / 100 : total;
  function monthsFrom(dateStr, k) { const d = new Date(dateStr); d.setMonth(d.getMonth() + k); return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); }

  async function save() {
    setErr('');
    try {
      const body = {
        description: f.description, amount: Number(f.amount), currency: f.currency, due_date: f.due_date,
        vehicle_id: f.vehicle_id || null, installments: n, category: f.category || null,
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
      <div className="row2">
        <Field label="Vehicle (optional)"><select className="select" value={f.vehicle_id} onChange={set('vehicle_id')}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></Field>
        <Field label="Category"><select className="select" value={f.category} onChange={set('category')}><option value="">—</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</select></Field>
      </div>
      <Field label="Description"><input className="input" value={f.description} onChange={set('description')} /></Field>
      <div className="row2">
        <Field label="Amount"><input className="input" type="number" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Currency"><CurrencyToggle value={f.currency} onChange={(c) => setF({ ...f, currency: c })} /></Field>
      </div>
      <Field label={n > 1 ? 'First installment due' : 'Due date'}><input className="input" type="date" value={f.due_date} onChange={set('due_date')} /></Field>

      <Field label="Installments">
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          {INSTALLMENT_PRESETS.map((p) => (
            <button type="button" key={p} className={n === p ? 'on' : ''} onClick={() => setF({ ...f, installments: p })}>{p === 1 ? 'One-time' : `${p}×`}</button>
          ))}
          <input className="input" type="number" min={1} max={360} style={{ width: 74 }} value={f.installments} onChange={set('installments')} title="Custom number of monthly installments" />
        </div>
      </Field>

      {n > 1 && total > 0 && (
        <div className="preview-box">
          One invoice for the full <b>{new Intl.NumberFormat('mk-MK').format(total)} {f.currency === 'EUR' ? '€' : 'ден'}</b>, payable in <b>{n} monthly installments</b> of about <b>{new Intl.NumberFormat('mk-MK').format(per)} {f.currency === 'EUR' ? '€' : 'ден'}</b> each.
          <div className="muted" style={{ marginTop: 4 }}>Record a payment of ~{new Intl.NumberFormat('mk-MK').format(per)} each month — the balance owed to this company goes down automatically.</div>
        </div>
      )}
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
