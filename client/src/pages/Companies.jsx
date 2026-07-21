import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Empty } from '../components/ui.jsx';
import { Card } from '../components/ui/card.jsx';
import { Button } from '../components/ui/button.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input, Textarea } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Select } from '../components/ui/select.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table.jsx';
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '../components/ui/dialog.jsx';

const CATEGORIES = ['leasing', 'service', 'tires', 'other'];
const TYPE_VARIANT = { vendor: 'gray', client: 'green', both: 'blue' };

export default function Companies() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/companies').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Companies</div>
        <Button onClick={() => setEditing({})}>+ Add Company</Button>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No companies yet.</Empty> : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead>
                <TableHead>Phone</TableHead><TableHead className="text-right">Open balance</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} clickable onClick={() => nav(`/companies/${c.id}`)}>
                  <TableCell className="font-semibold">{c.name}</TableCell>
                  <TableCell><Badge variant={TYPE_VARIANT[c.type]}>{c.type}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{c.category || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{mkd(c.open_balance)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(c); }}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {editing && <CompanyModal company={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function CompanyModal({ company, onClose, onSaved }) {
  const isNew = !company.id;
  const [f, setF] = useState({ name: '', type: 'vendor', category: '', phone: '', note: '', ...company });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    try {
      const body = { name: f.name, type: f.type, category: f.category || null, phone: f.phone || null, note: f.note || null };
      if (isNew) await api.post('/companies', body);
      else await api.put(`/companies/${company.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  }

  return (
    <Dialog onOpenChange={onClose}>
      <DialogHeader title={isNew ? 'Add Company' : 'Edit Company'} onClose={onClose} />
      <DialogBody className="space-y-3">
        {err && <div className="error-msg">{err}</div>}
        <div><Label>Name</Label><Input value={f.name} onChange={set('name')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <Select value={f.type} onChange={set('type')}>
              <option value="vendor">Vendor</option><option value="client">Client</option><option value="both">Both</option>
            </Select>
          </div>
          <div><Label>Category</Label>
            <Select value={f.category || ''} onChange={set('category')}>
              <option value="">—</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </div>
        <div><Label>Phone</Label><Input value={f.phone || ''} onChange={set('phone')} /></div>
        <div><Label>Note</Label><Textarea rows={2} value={f.note || ''} onChange={set('note')} /></div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save</Button>
      </DialogFooter>
    </Dialog>
  );
}
