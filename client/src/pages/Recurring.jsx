import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Modal, Field, Spinner, Badge, Empty } from '../components/ui.jsx';

export default function Recurring() {
  const [rows, setRows] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get('/recurring').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); api.get('/companies').then(setCompanies); api.get('/workers').then(setWorkers); }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Recurring</div>
        <button className="btn" onClick={() => setEditing({})}>+ Add Template</button>
      </div>
      <p className="muted" style={{ marginTop: -12, marginBottom: 16 }}>A daily cron (00:05) auto-generates an invoice each month for every active template — never re-enter a lease or salary manually.</p>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No recurring templates.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Description</th><th>Linked to</th><th className="num">Amount</th><th className="num">Day</th><th>Active</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td>{r.description}</td><td className="muted">{r.company_name || r.worker_name}</td>
                <td className="num">{mkd(r.amount)}</td><td className="num">{r.day_of_month}</td>
                <td><Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'active' : 'off'}</Badge></td>
                <td className="num"><button className="btn ghost sm" onClick={() => setEditing(r)}>Edit</button>{' '}
                  <button className="btn danger sm" onClick={() => api.del(`/recurring/${r.id}`).then(load)}>Delete</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {editing && <TemplateModal template={editing} companies={companies} workers={workers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function TemplateModal({ template, companies, workers, onClose, onSaved }) {
  const isNew = !template.id;
  const [f, setF] = useState({ target: template.worker_id ? 'worker' : 'company', company_id: '', worker_id: '', description: '', amount: '', day_of_month: 1, active: true, ...template });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr('');
    try {
      const body = { description: f.description, amount: Number(f.amount), day_of_month: Number(f.day_of_month), active: f.active,
        ...(f.target === 'company' ? { company_id: Number(f.company_id) } : { worker_id: Number(f.worker_id) }) };
      if (isNew) await api.post('/recurring', body); else await api.put(`/recurring/${template.id}`, body);
      onSaved();
    } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title={isNew ? 'Add Template' : 'Edit Template'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      {err && <div className="error-msg">{err}</div>}
      {isNew && (
        <Field label="Type">
          <div className="seg">
            <button type="button" className={f.target === 'company' ? 'on' : ''} onClick={() => setF({ ...f, target: 'company' })}>Company</button>
            <button type="button" className={f.target === 'worker' ? 'on' : ''} onClick={() => setF({ ...f, target: 'worker' })}>Worker</button>
          </div>
        </Field>
      )}
      {isNew && (f.target === 'company'
        ? <Field label="Company"><select className="select" value={f.company_id} onChange={set('company_id')}><option value="">Select…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        : <Field label="Worker"><select className="select" value={f.worker_id} onChange={set('worker_id')}><option value="">Select…</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>)}
      <Field label="Description"><input className="input" value={f.description} onChange={set('description')} /></Field>
      <div className="row2">
        <Field label="Amount"><input className="input" type="number" value={f.amount} onChange={set('amount')} /></Field>
        <Field label="Day of month (1-28)"><input className="input" type="number" min={1} max={28} value={f.day_of_month} onChange={set('day_of_month')} /></Field>
      </div>
      <Field><label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label></Field>
    </Modal>
  );
}
