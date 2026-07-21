import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Empty } from '../components/ui.jsx';
import { Card } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../components/ui/dialog.jsx';
import PayModal from '../components/PayModal.jsx';

export default function Workers() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);

  const load = () => api.get('/workers').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Workers</div>
        <Button onClick={() => setEditing({})}>+ Add Worker</Button>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No workers yet.</Empty> : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Position</TableHead>
                <TableHead className="text-right">Net salary</TableHead><TableHead className="text-right">Payday</TableHead>
                <TableHead className="text-right">Open balance</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-semibold">{w.name}</TableCell>
                  <TableCell className="text-muted-foreground">{w.position || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{mkd(w.net_salary)}</TableCell>
                  <TableCell className="text-right">day {w.payday_day}</TableCell>
                  <TableCell className="text-right tabular-nums">{mkd(w.open_balance)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(w)}>Edit</Button>
                    <Button size="sm" onClick={() => setPaying(w)}>Pay</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && <WorkerModal worker={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {paying && <PayModal worker={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
    </>
  );
}

function WorkerModal({ worker, onClose, onSaved }) {
  const isNew = !worker.id;
  const [f, setF] = useState({ name: '', position: '', net_salary: '', payday_day: 5, ...worker });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr('');
    try {
      const body = { name: f.name, position: f.position || null, net_salary: Number(f.net_salary), payday_day: Number(f.payday_day) };
      if (isNew) await api.post('/workers', body); else await api.put(`/workers/${worker.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <Dialog onOpenChange={onClose}>
      <DialogHeader title={isNew ? 'Add Worker' : 'Edit Worker'} onClose={onClose} />
      <DialogBody className="space-y-3">
        {err && <div className="error-msg">{err}</div>}
        <div><Label>Name</Label><Input value={f.name} onChange={set('name')} /></div>
        <div><Label>Position</Label><Input value={f.position || ''} onChange={set('position')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Net salary (MKD)</Label><Input type="number" value={f.net_salary} onChange={set('net_salary')} /></div>
          <div><Label>Payday (1-28)</Label><Input type="number" min={1} max={28} value={f.payday_day} onChange={set('payday_day')} /></div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save</Button>
      </DialogFooter>
    </Dialog>
  );
}
