import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Modal, Field, Spinner, Empty } from '../components/ui.jsx';
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
        <button className="btn" onClick={() => setEditing({})}>+ Add Worker</button>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No workers yet.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Position</th><th className="num">Net salary</th><th className="num">Payday</th><th className="num">Open balance</th><th></th></tr></thead>
            <tbody>{rows.map((w) => (
              <tr key={w.id}>
                <td><b>{w.name}</b></td><td className="muted">{w.position || '—'}</td>
                <td className="num">{mkd(w.net_salary)}</td><td className="num">day {w.payday_day}</td>
                <td className="num">{mkd(w.open_balance)}</td>
                <td className="num">
                  <button className="btn ghost sm" onClick={() => setEditing(w)}>Edit</button>{' '}
                  <button className="btn sm" onClick={() => setPaying(w)}>Pay</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
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
    <Modal title={isNew ? 'Add Worker' : 'Edit Worker'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <Field label="Name"><input className="input" value={f.name} onChange={set('name')} /></Field>
      <Field label="Position"><input className="input" value={f.position || ''} onChange={set('position')} /></Field>
      <div className="row2">
        <Field label="Net salary (MKD)"><input className="input" type="number" value={f.net_salary} onChange={set('net_salary')} /></Field>
        <Field label="Payday (1-28)"><input className="input" type="number" min={1} max={28} value={f.payday_day} onChange={set('payday_day')} /></Field>
      </div>
    </Modal>
  );
}
