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

export default function Vehicles() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sort, setSort] = useState('plate');

  const load = () => api.get('/vehicles').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const sorted = rows ? [...rows].sort((a, b) => {
    if (sort === 'utilization_pct' || sort === 'rev_pav' || sort === 'remaining') return (Number(b[sort]) || 0) - (Number(a[sort]) || 0);
    return String(a.plate).localeCompare(String(b.plate));
  }) : [];

  return (
    <>
      <div className="page-head">
        <div className="page-title">Vehicles</div>
        <Button onClick={() => setEditing({})}>+ Add Vehicle</Button>
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
                <TableHead className="text-right cursor-pointer" onClick={() => setSort('remaining')}>Remaining lease</TableHead>
                <TableHead className="text-right">Years left</TableHead>
                <TableHead className="cursor-pointer" onClick={() => setSort('utilization_pct')}>Utilization</TableHead>
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
                  <TableCell className="text-right tabular-nums">{v.remaining != null ? mkd(v.remaining) : '—'}</TableCell>
                  <TableCell className="text-right">{v.years_left ?? '—'}</TableCell>
                  <TableCell>{v.utilization_pct != null ? <Badge variant={utilVariant(Number(v.utilization_pct))}>{v.utilization_pct}%</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
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
