import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Modal, Field, Spinner, Badge, Empty } from '../components/ui.jsx';

const CATEGORIES = ['leasing', 'service', 'tires', 'other'];
const TYPE_TONE = { vendor: 'gray', client: 'green', both: 'blue' };

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
        <button className="btn" onClick={() => setEditing({})}>+ Add Company</button>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No companies yet.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Type</th><th>Category</th><th>Phone</th><th className="num">Open balance</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => nav(`/companies/${c.id}`)}>
                  <td><b>{c.name}</b></td>
                  <td><Badge tone={TYPE_TONE[c.type]}>{c.type}</Badge></td>
                  <td className="muted">{c.category || '—'}</td>
                  <td className="muted">{c.phone || '—'}</td>
                  <td className="num"><b>{mkd(c.open_balance)}</b></td>
                  <td className="num"><button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setEditing(c); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <Modal title={isNew ? 'Add Company' : 'Edit Company'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <Field label="Name"><input className="input" value={f.name} onChange={set('name')} /></Field>
      <div className="row2">
        <Field label="Type">
          <select className="select" value={f.type} onChange={set('type')}>
            <option value="vendor">Vendor</option><option value="client">Client</option><option value="both">Both</option>
          </select>
        </Field>
        <Field label="Category">
          <select className="select" value={f.category || ''} onChange={set('category')}>
            <option value="">—</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Phone"><input className="input" value={f.phone || ''} onChange={set('phone')} /></Field>
      <Field label="Note"><textarea className="input" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </Modal>
  );
}
