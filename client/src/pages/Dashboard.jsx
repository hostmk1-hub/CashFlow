import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Badge } from '../components/ui.jsx';
import * as Ic from '../components/icons.jsx';

function Kpi({ icon: Icon, tone, label, value, delta, deltaLabel, i }) {
  return (
    <div className="card kpi rise" style={{ animationDelay: `${i * 45}ms` }}>
      <div className="top">
        <span className="label">{label}</span>
        <span className={`ico bg-${tone}`}><Icon /></span>
      </div>
      <div className="value">{value}</div>
      {delta != null && (
        <div className={`delta tone-${delta >= 0 ? 'pos' : 'neg'}`}>
          {delta >= 0 ? <Ic.TrendUp width={14} height={14} /> : <Ic.TrendDown width={14} height={14} />}
          {Math.abs(delta)}% <span className="muted" style={{ fontWeight: 500 }}>{deltaLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    api.get('/dashboard').then(setD).catch(() => {});
    api.get('/notifications').then(setAlerts).catch(() => {});
  }, []);
  if (!d) return <Spinner />;

  async function resolveAlert(id) {
    try { await api.post(`/notifications/${id}/resolve`); setAlerts((a) => a.filter((x) => x.id !== id)); } catch { /* ignore */ }
  }
  const marginPct = d.monthIncome ? Math.round((d.netProfit / d.monthIncome) * 100) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Financial overview · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <div className="toolbar">
          <button className="btn ghost" onClick={() => nav('/invoices')}><Ic.Scan /> Scan Invoice</button>
          <button className="btn" onClick={() => nav('/payments')}><Ic.CreditCard /> Pay a Company</button>
        </div>
      </div>

      {alerts.map((a) => (
        <div key={a.id} className={a.level === 'critical' ? 'error-msg' : 'preview-box'} style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic.AlertTriangle width={16} height={16} /> <b>{a.title}</b>{a.message ? ` — ${a.message}` : ''}</span>
          <button className="btn ghost sm" onClick={() => resolveAlert(a.id)}>Dismiss</button>
        </div>
      ))}

      <div className="grid stat-grid" style={{ marginBottom: 16 }}>
        <Kpi i={0} icon={Ic.Wallet} tone="info" label="Today's income" value={mkd(d.todayIncome)} />
        <Kpi i={1} icon={Ic.TrendUp} tone="pos" label="Income this month" value={mkd(d.monthIncome)} />
        <Kpi i={2} icon={Ic.Receipt} tone="neg" label="Expenses this month" value={mkd(d.monthExpense)} />
        <Kpi i={3} icon={Ic.Dollar} tone={d.netProfit >= 0 ? 'brand' : 'neg'} label="Net profit" value={mkd(d.netProfit)} delta={marginPct} deltaLabel="margin" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: 16 }}>
        <div className="card pad rise" style={{ animationDelay: '180ms' }}>
          <div className="card-title">Cash flow <span className="sub">· last 30 days</span></div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={d.cashFlow} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(v) => (v / 1000) + 'k'} width={44} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--ink)', fontSize: 13 }} formatter={(v) => [mkd(v), 'Income']} labelStyle={{ color: 'var(--muted)' }} />
              <Area type="monotone" dataKey="income" stroke="#34d399" fill="url(#inc)" strokeWidth={2.4} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid rise" style={{ animationDelay: '220ms', gridTemplateRows: 'repeat(2, 1fr)' }}>
          <MiniStat icon={Ic.FileText} tone="warn" label="Open payables" value={mkd(d.openPayables)} onClick={() => nav('/payments')} />
          <MiniStat icon={Ic.FileCheck} tone="pos" label="Outstanding receivables" value={mkd(d.outstandingReceivables)} sub={d.overdueClients > 0 ? `${d.overdueClients} overdue` : null} onClick={() => nav('/invoice-manager')} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <MiniStat wide icon={Ic.Truck} tone="brand" label="Fleet lease debt" value={mkd(d.leaseDebt)} onClick={() => nav('/vehicles')} />
        <div className="card pad" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {d.bestVehicle ? (
            <>
              <div style={{ flex: 1 }}>
                <div className="label muted" style={{ fontSize: 12, fontWeight: 600 }}>Top performer</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{d.bestVehicle.plate}</div>
                <div className="tone-pos" style={{ fontWeight: 600, marginTop: 2 }}>{mkd(d.bestVehicle.net_pnl)}</div>
              </div>
              {d.worstVehicle && d.worstVehicle !== d.bestVehicle && (
                <div style={{ flex: 1, borderLeft: '1px solid var(--line)', paddingLeft: 20 }}>
                  <div className="label muted" style={{ fontSize: 12, fontWeight: 600 }}>Needs attention</div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginTop: 4 }}>{d.worstVehicle.plate}</div>
                  <div className="tone-neg" style={{ fontWeight: 600, marginTop: 2 }}>{mkd(d.worstVehicle.net_pnl)}</div>
                </div>
              )}
            </>
          ) : <div className="muted">No vehicle P&L this month.</div>}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <ListCard title="Top companies you owe" icon={Ic.Building} rows={d.topOwed} valueKey="open_balance" onRow={(c) => nav(`/companies/${c.id}`)} />
        <ListCard title="Clients who owe you" icon={Ic.Users} rows={d.topOwing} valueKey="outstanding_balance" onRow={(c) => nav(`/companies/${c.id}`)} />
        <div className="card pad">
          <div className="card-title"><Ic.Calendar width={16} height={16} /> Upcoming 30 days</div>
          {d.upcoming.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nothing due.</div>}
          {d.upcoming.slice(0, 6).map((u, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13, borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{u.description}</span>
              <b className="tabnum">{mkd(u.amount)}</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function MiniStat({ icon: Icon, tone, label, value, sub, wide, onClick }) {
  return (
    <div className="card kpi" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="top">
        <span className="label">{label}</span>
        <span className={`ico bg-${tone}`}><Icon /></span>
      </div>
      <div className="value" style={{ fontSize: wide ? 26 : 22 }}>{value}</div>
      {sub && <div className="delta tone-neg" style={{ marginTop: 6 }}><Ic.AlertTriangle width={13} height={13} /> {sub}</div>}
    </div>
  );
}

function ListCard({ title, icon: Icon, rows, valueKey, onRow }) {
  return (
    <div className="card pad">
      <div className="card-title"><Icon width={16} height={16} /> {title}</div>
      {rows.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nothing here.</div>}
      {rows.map((c, i) => (
        <div key={c.id} onClick={() => onRow(c)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', overflow: 'hidden' }}>
            <div className="avatar" style={{ width: 26, height: 26, borderRadius: 8, fontSize: 11 }}>{c.name.slice(0, 2).toUpperCase()}</div>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
          </span>
          <b className="tabnum">{mkd(c[valueKey])}</b>
        </div>
      ))}
    </div>
  );
}
