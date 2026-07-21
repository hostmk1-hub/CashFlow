import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Field, Spinner, Badge, Empty } from '../components/ui.jsx';

export default function DailyIncome() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ income_date: new Date().toISOString().slice(0, 10), cash_amount: '', card_amount: '', note: '' });
  const [err, setErr] = useState('');

  const load = () => api.get('/daily-income').then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  async function save() {
    setErr('');
    try {
      await api.post('/daily-income', { ...f, cash_amount: Number(f.cash_amount || 0), card_amount: Number(f.card_amount || 0) });
      setF({ ...f, cash_amount: '', card_amount: '', note: '' });
      load();
    } catch (e) { setErr(e.message); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="page-head"><div className="page-title">Daily Income</div></div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h3 className="card-title">Quick entry</h3>
        {err && <div className="error-msg">{err}</div>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr) auto', alignItems: 'end', gap: 12 }}>
          <Field label="Date"><input className="input" type="date" value={f.income_date} onChange={set('income_date')} /></Field>
          <Field label="Cash"><input className="input" type="number" value={f.cash_amount} onChange={set('cash_amount')} /></Field>
          <Field label="Card"><input className="input" type="number" value={f.card_amount} onChange={set('card_amount')} /></Field>
          <Field label="Note"><input className="input" value={f.note} onChange={set('note')} /></Field>
          <button className="btn" onClick={save} style={{ marginBottom: 14 }}>Save</button>
        </div>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No entries yet.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th className="num">Cash</th><th className="num">Card</th><th className="num">Total</th><th>Source</th><th>Note</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td>{date(r.income_date)}</td><td className="num">{mkd(r.cash_amount)}</td><td className="num">{mkd(r.card_amount)}</td>
                <td className="num"><b>{mkd(Number(r.cash_amount) + Number(r.card_amount))}</b></td>
                <td><Badge tone={r.source === 'api' ? 'green' : 'gray'}>{r.source === 'api' ? 'Synced' : 'manual'}</Badge></td>
                <td className="muted">{r.note || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
