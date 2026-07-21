import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Modal, Field, Spinner, Badge, Empty } from '../components/ui.jsx';

function utilTone(u) { if (u == null) return 'gray'; return u >= 70 ? 'green' : u >= 40 ? 'yellow' : 'red'; }

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
        <button className="btn" onClick={() => setEditing({})}>+ Add Vehicle</button>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No vehicles yet.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr>
              <th className="sortable" onClick={() => setSort('plate')}>Plate</th>
              <th>Make / Model</th><th>Year</th>
              <th className="num sortable" onClick={() => setSort('remaining')}>Remaining lease</th>
              <th className="num">Years left</th>
              <th className="sortable" onClick={() => setSort('utilization_pct')}>Utilization</th>
              <th className="num sortable" onClick={() => setSort('rev_pav')}>RevPAV</th>
            </tr></thead>
            <tbody>{sorted.map((v) => (
              <tr key={v.id} className="clickable" onClick={() => nav(`/vehicles/${v.id}`)}>
                <td><b>{v.plate}</b></td><td>{v.make} {v.model}</td><td className="muted">{v.year}</td>
                <td className="num">{v.remaining != null ? mkd(v.remaining) : '—'}</td>
                <td className="num">{v.years_left ?? '—'}</td>
                <td>{v.utilization_pct != null ? <Badge tone={utilTone(Number(v.utilization_pct))}>{v.utilization_pct}%</Badge> : <span className="muted">—</span>}</td>
                <td className="num">{v.rev_pav != null ? mkd(v.rev_pav) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
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
    <Modal title={isNew ? 'Add Vehicle' : 'Edit Vehicle'} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <Field label="Plate"><input className="input" value={f.plate} onChange={set('plate')} placeholder="SK-1234-AB" /></Field>
      <div className="row2">
        <Field label="Make"><input className="input" value={f.make} onChange={set('make')} /></Field>
        <Field label="Model"><input className="input" value={f.model} onChange={set('model')} /></Field>
      </div>
      <div className="row2">
        <Field label="Year"><input className="input" type="number" value={f.year} onChange={set('year')} /></Field>
        <Field label="RENTALsyst ID"><input className="input" value={f.rentalsyst_id || ''} onChange={set('rentalsyst_id')} /></Field>
      </div>
    </Modal>
  );
}
