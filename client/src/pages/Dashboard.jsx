import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Spinner, Badge } from '../components/ui.jsx';

function Stat({ label, value, tone }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className={`value ${tone || ''}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [d, setD] = useState(null);

  useEffect(() => { api.get('/dashboard').then(setD).catch(() => {}); }, []);
  if (!d) return <Spinner />;

  return (
    <>
      <div className="page-head"><div className="page-title">Dashboard</div></div>

      <div className="grid stat-grid" style={{ marginBottom: 16 }}>
        <Stat label="Today's income" value={mkd(d.todayIncome)} tone="green" />
        <Stat label="This month income" value={mkd(d.monthIncome)} tone="green" />
        <Stat label="This month expenses" value={mkd(d.monthExpense)} tone="red" />
        <Stat label="Net profit" value={mkd(d.netProfit)} tone={d.netProfit >= 0 ? 'green' : 'red'} />
        <Stat label="Open payables" value={mkd(d.openPayables)} />
        <Stat label="Outstanding receivables" value={mkd(d.outstandingReceivables)} />
        <Stat label="Fleet lease debt" value={mkd(d.leaseDebt)} />
        <Stat label="Overdue client invoices" value={d.overdueClients} tone={d.overdueClients > 0 ? 'red' : ''} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: 16 }}>
        <div className="card pad">
          <h3 className="card-title">Cash flow — last 30 days</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d.cashFlow}>
              <defs>
                <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000) + 'k'} width={38} />
              <Tooltip formatter={(v) => mkd(v)} />
              <Area type="monotone" dataKey="income" stroke="#16a34a" fill="url(#inc)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card pad">
          <h3 className="card-title">Quick actions</h3>
          <div className="grid" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => nav('/invoices')}>➕ Add Expense</button>
            <button className="btn ghost" onClick={() => nav('/invoices')}>📷 Scan Invoice</button>
            <button className="btn ghost" onClick={() => nav('/payments')}>💸 Pay a Company</button>
            <button className="btn ghost" onClick={() => nav('/daily-income')}>💵 Add Daily Income</button>
          </div>
          <h3 className="card-title" style={{ marginTop: 18 }}>Best / worst vehicle</h3>
          {d.bestVehicle ? (
            <div style={{ fontSize: 13 }}>
              <div>🏆 {d.bestVehicle.plate} — <span className="green">{mkd(d.bestVehicle.net_pnl)}</span></div>
              {d.worstVehicle && d.worstVehicle !== d.bestVehicle && (
                <div style={{ marginTop: 4 }}>⚠️ {d.worstVehicle.plate} — {mkd(d.worstVehicle.net_pnl)}</div>
              )}
            </div>
          ) : <div className="muted">No vehicle P&L this month.</div>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="card pad">
          <h3 className="card-title">Top 5 companies you owe</h3>
          {d.topOwed.length === 0 && <div className="muted">Nothing owed.</div>}
          {d.topOwed.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }} onClick={() => nav(`/companies/${c.id}`)}>
              <span>{c.name}</span><b>{mkd(c.open_balance)}</b>
            </div>
          ))}
        </div>
        <div className="card pad">
          <h3 className="card-title">Top 5 clients who owe you</h3>
          {d.topOwing.length === 0 && <div className="muted">Nothing outstanding.</div>}
          {d.topOwing.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', cursor: 'pointer' }} onClick={() => nav(`/companies/${c.id}`)}>
              <span>{c.name}</span><b>{mkd(c.outstanding_balance)}</b>
            </div>
          ))}
        </div>
        <div className="card pad">
          <h3 className="card-title">Upcoming 30 days</h3>
          {d.upcoming.length === 0 && <div className="muted">Nothing due.</div>}
          {d.upcoming.map((u, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
              <span>{u.description} <Badge tone="gray">{date(u.due_date)}</Badge></span><b>{mkd(u.amount)}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
