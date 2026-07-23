import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, Badge, Empty } from '../components/ui.jsx';

const ACTION_TONE = {
  'payment.create': 'green', 'invoice.pay': 'green',
  'payment.update': 'yellow', 'invoice.update': 'yellow',
  'payment.delete': 'red', 'invoice.delete': 'red',
};
const ACTIONS = ['', 'payment.create', 'payment.update', 'payment.delete', 'invoice.pay', 'invoice.update', 'invoice.delete'];

function ts(v) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AuditLog() {
  const [rows, setRows] = useState(null);
  const [action, setAction] = useState('');

  const load = () => {
    const qs = action ? `?action=${encodeURIComponent(action)}` : '';
    api.get(`/audit${qs}`).then(setRows).catch(() => setRows([]));
  };
  useEffect(() => { load(); }, [action]);

  return (
    <>
      <div className="page-head">
        <div className="page-title">Audit Log</div>
        <select className="select" style={{ maxWidth: 220 }} value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a === '' ? 'All actions' : a}</option>)}
        </select>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>Every payment and invoice change — record, edit, mark-paid, undo/delete — with who did it and when.</p>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No activity recorded yet.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{ts(r.created_at)}</td>
                <td>{r.user_name || r.user_email || <span className="muted">system</span>}</td>
                <td><Badge tone={ACTION_TONE[r.action] || 'gray'}>{r.action}</Badge></td>
                <td>{r.summary || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
