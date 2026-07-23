import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Modal, Field, Spinner, CurrencyToggle } from './ui.jsx';

/**
 * Upload a leasing company's monthly payment schedule (CSV/Excel/photo/PDF) for
 * ONE vehicle. Each row's exact amount becomes a tracked monthly payment for
 * that car + leasing company — no total/monthly formula. Up to ~120 months.
 */
export default function PaymentScheduleModal({ vehicleId, plate, defaultCompanyId, defaultLeaseNumber, onClose, onSaved }) {
  const [companies, setCompanies] = useState([]);
  const [rows, setRows] = useState(null); // null = not uploaded yet
  const [companyId, setCompanyId] = useState(defaultCompanyId || '');
  const [leaseNumber, setLeaseNumber] = useState(defaultLeaseNumber || '');
  const [currency, setCurrency] = useState('MKD');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.get('/companies').then(setCompanies).catch(() => {}); }, []);

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.upload('/amortization/scan-schedule', fd);
      setRows(res.schedule.map((r) => ({ due_date: r.due_date || '', amount: r.amount })));
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  const setRow = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const delRow = (i) => setRows(rows.filter((_, j) => j !== i));
  const addRow = () => setRows([...rows, { due_date: '', amount: '' }]);
  const total = (rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

  async function confirm() {
    setBusy(true); setErr('');
    try {
      const schedule = rows
        .map((r) => ({ due_date: r.due_date || null, amount: Number(r.amount) }))
        .filter((r) => Number.isFinite(r.amount) && r.amount > 0);
      if (!schedule.length) throw new Error('Add at least one payment with an amount.');
      if (!companyId) throw new Error('Pick the leasing company.');
      await api.post('/amortization/from-schedule', {
        vehicle_id: Number(vehicleId), company_id: Number(companyId),
        lease_number: leaseNumber || null, currency,
        purchase_price: purchasePrice === '' ? null : Number(purchasePrice),
        start_date: startDate || null, schedule,
      });
      onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <Modal title={`Payment schedule — ${plate}`} onClose={onClose} wide
      footer={rows && <><button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || !companyId} onClick={confirm}>{busy ? 'Saving…' : `Create ${rows.length} monthly payments`}</button></>}>
      {err && <div className="error-msg">{err}</div>}
      {!rows ? (
        <>
          <p className="muted">Upload the leasing company's monthly payment plan for <b>{plate}</b> — a <b>CSV/Excel</b> file, or a <b>photo/PDF</b> of the schedule. We read each month's amount and create one tracked payment per month for this car (up to 120 months). Nothing saves until you confirm.</p>
          <input className="input" type="file" accept=".csv,.xlsx,text/csv,.pdf,application/pdf,image/*" onChange={onFile} />
          {busy && <><Spinner /><span className="muted" style={{ marginLeft: 8 }}>Reading the schedule…</span></>}
        </>
      ) : (
        <>
          <div className="row2">
            <Field label="Leasing company">
              <select className="select" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">Select…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Lease / contract #"><input className="input" value={leaseNumber} onChange={(e) => setLeaseNumber(e.target.value)} placeholder="e.g. LN-2026-00123" /></Field>
          </div>
          <div className="row2">
            <Field label="Car price (cash, optional)"><input className="input" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} /></Field>
            <Field label="Currency"><CurrencyToggle value={currency} onChange={setCurrency} /></Field>
          </div>
          <Field label="Start date (used only for rows with no date)"><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>

          <div className="muted" style={{ fontSize: 12, margin: '8px 0 4px' }}>{rows.length} payments · total <b>{mkd(total)}</b> — review and edit, then create.</div>
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th style={{ width: 40 }}>#</th><th>Month / date</th><th className="num">Amount</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    <td><input className="input" type="date" value={r.due_date || ''} onChange={(e) => setRow(i, 'due_date', e.target.value)} /></td>
                    <td className="num"><input className="input" type="number" value={r.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} style={{ textAlign: 'right' }} /></td>
                    <td className="num"><button className="btn ghost sm" title="Remove" onClick={() => delRow(i)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={addRow}>+ Add a month</button>
        </>
      )}
    </Modal>
  );
}
