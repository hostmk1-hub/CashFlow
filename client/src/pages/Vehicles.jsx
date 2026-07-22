import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Empty } from '../components/ui.jsx';
import { Card } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/input.jsx';
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

export default function Vehicles() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sort, setSort] = useState('plate');
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
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr('');
    try {
      const body = { plate: f.plate, make: f.make, model: f.model, year: Number(f.year), rentalsyst_id: f.rentalsyst_id || null };
      if (isNew) await api.post('/vehicles', body); else await api.put(`/vehicles/${vehicle.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <Dialog onOpenChange={onClose}>
      <DialogHeader title={isNew ? 'Add Vehicle' : 'Edit Vehicle'} onClose={onClose} />
      <DialogBody className="space-y-3">
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
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save</Button>
      </DialogFooter>
    </Dialog>
  );
}
