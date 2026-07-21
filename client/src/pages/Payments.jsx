import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Spinner, Badge, Empty, Modal, Field } from '../components/ui.jsx';
import PayModal from '../components/PayModal.jsx';

export default function Payments() {
  const [rows, setRows] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(null);

  const load = () => api.get('/payments').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); api.get('/companies').then(setCompanies); }, []);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Payments</div>
        <button className="btn" onClick={() => setPicking(true)}>💸 Pay Company / Worker</button>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No payments recorded.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Paid to</th><th>Method</th><th className="num">Amount</th><th>Invoices closed</th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className="muted">{date(p.paid_at)}</td>
                <td><b>{p.company_name || p.worker_name}</b></td>
                <td><Badge tone="gray">{p.method}</Badge></td>
                <td className="num">{mkd(p.amount)}</td>
                <td className="muted">{p.allocations.map((a) => `#${a.invoice_id} (${mkd(a.amount)})`).join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {picking && <PickModal companies={companies} onClose={() => setPicking(false)} onPick={(c) => { setPicking(false); setPaying(c); }} />}
      {paying && <PayModal company={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
    </>
  );
}

function PickModal({ companies, onClose, onPick }) {
  const [id, setId] = useState('');
  return (
    <Modal title="Choose a company" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={!id} onClick={() => onPick(companies.find((c) => String(c.id) === id))}>Continue</button></>}>
      <Field label="Company"><select className="select" value={id} onChange={(e) => setId(e.target.value)}><option value="">Select…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <p className="muted">To pay a worker, use the Pay button on the Workers page.</p>
    </Modal>
  );
}
