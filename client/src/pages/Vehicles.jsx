import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Empty } from '../components/ui.jsx';
import { Card } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/input.jsx';
import { Select } from '../components/ui/select.jsx';
import { Label } from '../components/ui/label.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../components/ui/dialog.jsx';

function utilVariant(u) { if (u == null) return 'gray'; return u >= 70 ? 'green' : u >= 40 ? 'yellow' : 'red'; }

// Monthly lease shown in EUR. EUR leases divide by their stored rate (exact);
// MKD leases approximate with the default 61.8.
function monthlyEur(v) {
  if (v.monthly_amount == null) return '—';
  const rate = v.lease_currency === 'EUR' ? Number(v.lease_rate) || 61.8 : 61.8;
  const eur = Number(v.monthly_amount) / rate;
  return '€' + new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(eur);
}
// Lease end month/year, e.g. "07.2029" (start + months_total, the month after the last payment... last payment month).
function leaseEnd(v) {
  if (!v.lease_start || !v.months_total) return '—';
  const d = new Date(v.lease_start);
  d.setMonth(d.getMonth() + (Number(v.months_total) - 1)); // month of the final installment
  return String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
}
// Inclusive month count from start to finish (both months counted).
function monthsBetween(a, b) {
  const s = new Date(a), f = new Date(b);
  if (isNaN(s) || isNaN(f)) return 0;
  const m = (f.getFullYear() - s.getFullYear()) * 12 + (f.getMonth() - s.getMonth()) + 1;
  return m > 0 ? m : 0;
}
// start + N months → the month of the final installment (as YYYY-MM-DD).
function addMonthsDate(dateStr, n) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function fmtMon(d) { const x = new Date(d); return isNaN(x) ? '—' : String(x.getMonth() + 1).padStart(2, '0') + '.' + x.getFullYear(); }

export default function Vehicles() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sort, setSort] = useState('plate');
  async function del(v, e) {
    e.stopPropagation();
    if (!confirm(`Delete vehicle ${v.plate}? This can't be undone.`)) return;
    try { await api.del(`/vehicles/${v.id}`); load(); }
    catch (err) { alert(err.message); }
  }
  const [q, setQ] = useState('');
  const [lease, setLease] = useState('');   // '', 'yes', 'no'
  const [leasing, setLeasing] = useState(''); // leasing company name

  const load = () => api.get(`/vehicles${q ? '?q=' + encodeURIComponent(q) : ''}`).then(setRows).catch(() => setRows([]));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);

  const leasingCompanies = rows ? [...new Set(rows.map((v) => v.leasing_company).filter(Boolean))] : [];
  const filtered = (rows || []).filter((v) =>
    (lease === '' || (lease === 'yes' ? v.monthly_amount != null : v.monthly_amount == null)) &&
    (leasing === '' || v.leasing_company === leasing));
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'rev_pav' || sort === 'remaining') return (Number(b[sort]) || 0) - (Number(a[sort]) || 0);
    return String(a.plate).localeCompare(String(b.plate));
  });

  return (
    <>
      <div className="page-head">
        <div className="page-title">Vehicles</div>
        <Button onClick={() => setEditing({})}>+ Add Vehicle</Button>
      </div>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 220 }} placeholder="Search plate / make / model…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 150 }} value={lease} onChange={(e) => setLease(e.target.value)}>
          <option value="">All vehicles</option><option value="yes">Has lease</option><option value="no">No lease</option>
        </select>
        <select className="select" style={{ width: 190 }} value={leasing} onChange={(e) => setLeasing(e.target.value)}>
          <option value="">All leasing companies</option>{leasingCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No vehicles yet.</Empty> : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">#</TableHead>
                <TableHead>Lease #</TableHead>
                <TableHead className="cursor-pointer" onClick={() => setSort('plate')}>Plate</TableHead>
                <TableHead>Leasing</TableHead>
                <TableHead>Make / Model</TableHead><TableHead>Year</TableHead>
                <TableHead className="text-right">Monthly (€)</TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => setSort('remaining')}>Remaining lease</TableHead>
                <TableHead>Lease end</TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => setSort('rev_pav')}>RevPAV</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((v, idx) => (
                <TableRow key={v.id} clickable onClick={() => nav(`/vehicles/${v.id}`)}>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-[13px]">{v.lease_number || '—'}</TableCell>
                  <TableCell className="font-semibold">{v.plate}</TableCell>
                  <TableCell className="text-muted-foreground">{v.leasing_company ? (v.leasing_company.length > 16 ? v.leasing_company.slice(0, 16) + '…' : v.leasing_company) : '—'}</TableCell>
                  <TableCell>{v.make} {v.model}</TableCell>
                  <TableCell className="text-muted-foreground">{v.year}</TableCell>
                  <TableCell className="text-right tabular-nums">{monthlyEur(v)}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.remaining != null ? mkd(v.remaining) : '—'}</TableCell>
                  <TableCell className="tabular-nums">{leaseEnd(v)}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.rev_pav != null ? mkd(v.rev_pav) : '—'}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <button className="btn ghost sm" title="Edit vehicle" onClick={(e) => { e.stopPropagation(); setEditing(v); }}>✎</button>
                    {' '}<button className="btn ghost sm" title="Delete vehicle" onClick={(e) => del(v, e)}>🗑</button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && <VehicleModal vehicle={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function VehicleModal({ vehicle, onClose, onSaved }) {
  const isNew = !vehicle.id;
  const [f, setF] = useState({ plate: '', make: '', model: '', year: new Date().getFullYear(), rentalsyst_id: '', ...vehicle });
  const [companies, setCompanies] = useState([]);
  const [planId, setPlanId] = useState(null);
  const [l, setL] = useState({ company_id: '', lease_number: '', purchase_price: '', monthly_amount: '', total_amount: '', months_total: '', start_date: '', finish_date: '', currency: 'MKD' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLease = (k) => (e) => setL({ ...l, [k]: e.target.value });

  useEffect(() => {
    api.get('/companies').then(setCompanies).catch(() => {});
    if (!isNew) {
      api.get(`/vehicles/${vehicle.id}`).then((d) => {
        const p = d.plans?.[0];
        if (p) {
          setPlanId(p.id);
          const start = p.start_date ? String(p.start_date).slice(0, 10) : '';
          setL({
            company_id: p.company_id || '', lease_number: p.lease_number || '',
            purchase_price: p.purchase_price ?? '', monthly_amount: p.monthly_amount == null ? '' : String(p.monthly_amount),
            total_amount: p.total_amount == null ? '' : String(p.total_amount), months_total: p.months_total ?? '',
            start_date: start,
            finish_date: start && p.months_total ? addMonthsDate(start, p.months_total - 1) : '',
            currency: p.currency || 'MKD',
          });
        }
      }).catch(() => {});
    }
  }, []);

  async function save() {
    setBusy(true); setErr('');
    try {
      const num = (v) => (v === '' || v == null ? null : Number(v));
      // Did the user provide / is there any lease info to persist?
      const leaseTouched = planId || l.company_id || l.lease_number || l.purchase_price ||
        l.monthly_amount || l.total_amount || l.months_total || l.start_date;
      // A lease record must belong to a leasing company (DB requires it).
      if (leaseTouched && !l.company_id) throw new Error('Pick the leasing company to save the lease details.');

      const body = { plate: f.plate, make: f.make, model: f.model, year: Number(f.year), rentalsyst_id: f.rentalsyst_id || null };
      let vid = vehicle.id;
      if (isNew) { const created = await api.post('/vehicles', body); vid = created.id; }
      else await api.put(`/vehicles/${vehicle.id}`, body);

      if (leaseTouched) {
        // Prefer an explicit finish date to derive the number of payments.
        const months = (l.start_date && l.finish_date) ? monthsBetween(l.start_date, l.finish_date) : num(l.months_total);
        const leasePayload = {
          company_id: Number(l.company_id), lease_number: l.lease_number || null,
          purchase_price: num(l.purchase_price), monthly_amount: num(l.monthly_amount),
          total_amount: num(l.total_amount), months_total: months || null,
          start_date: l.start_date || null, currency: l.currency,
        };
        if (planId) {
          await api.put(`/amortization/${planId}`, leasePayload);
        } else {
          // Generate installments only when the full schedule was entered.
          const canGenerate = !!(leasePayload.monthly_amount && leasePayload.months_total && leasePayload.start_date);
          await api.post('/amortization', { ...leasePayload, vehicle_id: Number(vid), down_payment: 0, generate_invoices: canGenerate, down_payment_paid: false });
        }
      }
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <Dialog onOpenChange={onClose} className="max-w-xl">
      <DialogHeader title={isNew ? 'Add Vehicle' : 'Edit Vehicle'} onClose={onClose} />
      <DialogBody className="space-y-4">
        {err && <div className="error-msg">{err}</div>}
        <div><Label>Plate</Label><Input value={f.plate} onChange={set('plate')} placeholder="SK-1234-AB" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Make</Label><Input value={f.make} onChange={set('make')} /></div>
          <div><Label>Model</Label><Input value={f.model} onChange={set('model')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Year</Label><Input type="number" value={f.year} onChange={set('year')} /></div>
          <div><Label>RENTALsyst ID</Label><Input value={f.rentalsyst_id || ''} onChange={set('rentalsyst_id')} /></div>
        </div>

        <div className="pt-1 mt-1 border-t border-border">
          <div className="text-sm font-semibold mt-3 mb-1">Lease details {planId ? '' : <span className="text-muted-foreground font-normal">(optional — fill to attach a lease)</span>}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Leasing company</Label>
            <Select value={l.company_id} onChange={setLease('company_id')}>
              <option value="">Select…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>Lease / contract #</Label><Input value={l.lease_number} onChange={setLease('lease_number')} placeholder="e.g. LN-2026-00123" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Car price (cash)</Label><Input type="number" value={l.purchase_price} onChange={setLease('purchase_price')} /></div>
          <div><Label>Currency</Label>
            <Select value={l.currency} onChange={setLease('currency')}><option value="MKD">MKD</option><option value="EUR">EUR</option></Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Monthly payment</Label><Input type="number" value={l.monthly_amount} onChange={setLease('monthly_amount')} /></div>
          <div><Label>Total lease</Label><Input type="number" value={l.total_amount} onChange={setLease('total_amount')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Start date</Label><Input type="date" value={l.start_date} onChange={setLease('start_date')} /></div>
          <div><Label>Finish date</Label><Input type="date" value={l.finish_date} onChange={setLease('finish_date')} /></div>
        </div>
        {(() => {
          const months = (l.start_date && l.finish_date) ? monthsBetween(l.start_date, l.finish_date) : (Number(l.months_total) || 0);
          if (!(l.company_id && months > 0 && (l.monthly_amount || l.total_amount))) return null;
          const monthly = Number(l.monthly_amount) || 0;
          const total = Number(l.total_amount) || monthly * months;
          const impliedMonthly = monthly || (total && months ? Math.round(total / months) : 0);
          const mismatch = monthly && total && Math.abs(monthly * months - total) > months; // >1 денар/mo drift
          return (
            <div className="preview-box" style={{ borderLeft: `3px solid ${mismatch ? 'var(--neg)' : 'var(--pos)'}` }}>
              <b>{months}</b> monthly payments of <b>{mkd(impliedMonthly)}</b> · Total <b>{mkd(total)}</b><br />
              Starts <b>{fmtMon(l.start_date)}</b> → ends <b>{l.finish_date ? fmtMon(l.finish_date) : fmtMon(addMonthsDate(l.start_date, months - 1))}</b>
              {mismatch
                ? <div className="text-[12px]" style={{ color: 'var(--neg)', marginTop: 4 }}>⚠ Monthly × months ({mkd(monthly * months)}) doesn’t match the total ({mkd(total)}) — double-check.</div>
                : <div className="text-[12px] text-muted-foreground" style={{ marginTop: 4 }}>✓ Looks consistent.</div>}
            </div>
          );
        })()}
        {planId && <div className="text-[12px] text-muted-foreground">Editing the lease moves its installments to the selected company and updates the monthly amount on unpaid installments; the term length isn’t regenerated.</div>}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </DialogFooter>
    </Dialog>
  );
}
