import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Spinner, Badge, Modal, Field, CurrencyToggle, EurBadge } from '../components/ui.jsx';

function utilTone(u) { return u >= 70 ? 'green' : u >= 40 ? 'yellow' : 'red'; }

export default function VehicleDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [incomeOpen, setIncomeOpen] = useState(false);

  const load = () => api.get(`/vehicles/${id}`).then(setD).catch(() => {});
  useEffect(() => { load(); }, [id]);
  if (!d) return <Spinner />;

  const plan = d.plans[0];
  const prog = d.amortization[0];
  const latest = d.pnl[0];
  const monthlyLease = plan ? Number(plan.monthly_amount) : 0;
  const coverage = latest && monthlyLease ? Number(latest.total_income) / monthlyLease : null;
  const underperforming = latest && coverage != null && coverage < 1.0;

  const paidPct = prog ? Math.min(100, Math.round((Number(prog.paid_so_far) / Number(prog.total_amount)) * 100)) : 0;
  const chartData = [...d.pnl].reverse().map((p) => ({
    month: p.month.slice(0, 7), income: Number(p.total_income), expenses: Number(p.total_expenses), util: Number(p.utilization_pct),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ cursor: 'pointer' }} onClick={() => nav('/vehicles')}>← Vehicles</div>
          <div className="page-title">{d.vehicle.plate} · {d.vehicle.make} {d.vehicle.model}</div>
        </div>
        <button className="btn" onClick={() => setIncomeOpen(true)}>+ Monthly Income</button>
      </div>

      {underperforming && (
        <div className="error-msg" style={{ marginBottom: 16 }}>
          ⚠️ Underperforming Vehicle: utilization is {latest.utilization_pct}% and income ({mkd(latest.total_income)}) is not covering the monthly lease debt ({mkd(monthlyLease)}). Coverage ratio {coverage.toFixed(2)}.
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <div className="card pad">
          <h3 className="card-title">Amortization</h3>
          {plan ? (
            <>
              <div style={{ height: 10, background: '#eef1f4', borderRadius: 6, overflow: 'hidden', margin: '10px 0' }}>
                <div style={{ width: `${paidPct}%`, height: '100%', background: 'var(--brand)' }} />
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{paidPct}% paid off</div>
              <div className="grid row2" style={{ marginTop: 12, fontSize: 13 }}>
                <div>Total: <b>{mkd(plan.total_amount)}</b> <EurBadge currency={plan.currency} /></div>
                <div>Monthly: <b>{mkd(plan.monthly_amount)}</b></div>
                <div>Remaining: <b>{mkd(prog?.remaining || 0)}</b></div>
                <div>Installments left: <b>{prog?.installments_left ?? '—'}</b></div>
                <div>Years left: <b>{prog?.years_left ?? '—'}</b></div>
                <div>Leasing: <b>{plan.company_name}</b></div>
              </div>
            </>
          ) : <div className="muted">No amortization plan. Add one from the API or scanner.</div>}
        </div>

        <div className="card pad">
          <h3 className="card-title">Performance & Yield</h3>
          {latest ? (
            <div className="grid" style={{ gap: 10 }}>
              <div>Utilization <Badge tone={utilTone(Number(latest.utilization_pct))}>{latest.utilization_pct}%</Badge> <span className="muted">({latest.days_rented} days)</span></div>
              <div>RevPAV: <b>{mkd(latest.rev_pav)}</b> <span className="muted">/ available day</span></div>
              <div>Coverage ratio: <b className={coverage != null && coverage < 1 ? 'red' : 'green'} style={{ color: coverage != null && coverage < 1 ? 'var(--red)' : 'var(--green)' }}>{coverage != null ? coverage.toFixed(2) : '—'}</b></div>
              <div>Net P&L (this month): <b>{mkd(latest.net_pnl)}</b></div>
            </div>
          ) : <div className="muted">No income entered yet.</div>}
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="card pad" style={{ marginBottom: 16 }}>
          <h3 className="card-title">Monthly trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => (v / 1000) + 'k'} />
              <Tooltip formatter={(v, n) => n === 'util' ? v + '%' : mkd(v)} /><Legend />
              <Line dataKey="income" stroke="#16a34a" strokeWidth={2} /><Line dataKey="expenses" stroke="#dc2626" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card table-wrap">
          <div className="pad" style={{ paddingBottom: 0 }}><h3 className="card-title">Expenses</h3></div>
          <table className="tbl"><thead><tr><th>Description</th><th>Due</th><th className="num">Amount</th></tr></thead>
            <tbody>{d.expenses.map((e) => <tr key={e.id}><td>{e.description} <EurBadge currency={e.currency} original={e.original_amount} /></td><td className="muted">{date(e.due_date)}</td><td className="num">{mkd(e.amount)}</td></tr>)}
            {d.expenses.length === 0 && <tr><td colSpan={3} className="muted">No expenses.</td></tr>}</tbody></table>
        </div>
        <div className="card table-wrap">
          <div className="pad" style={{ paddingBottom: 0 }}><h3 className="card-title">Monthly income</h3></div>
          <table className="tbl"><thead><tr><th>Month</th><th className="num">Amount</th><th className="num">Days rented</th></tr></thead>
            <tbody>{d.income.map((i) => <tr key={i.id}><td>{i.month.slice(0, 7)}</td><td className="num">{mkd(i.amount)}</td><td className="num">{i.days_rented}</td></tr>)}
            {d.income.length === 0 && <tr><td colSpan={3} className="muted">No income entries.</td></tr>}</tbody></table>
        </div>
      </div>

      {incomeOpen && <IncomeModal vehicleId={id} onClose={() => setIncomeOpen(false)} onSaved={() => { setIncomeOpen(false); load(); }} />}
    </>
  );
}

function IncomeModal({ vehicleId, onClose, onSaved }) {
  const [f, setF] = useState({ month: new Date().toISOString().slice(0, 7) + '-01', amount: '', days_rented: 0, currency: 'MKD' });
  const [err, setErr] = useState('');
  async function save() {
    setErr('');
    try { await api.post(`/vehicles/${vehicleId}/income`, { ...f, amount: Number(f.amount), days_rented: Number(f.days_rented) }); onSaved(); }
    catch (e) { setErr(e.message); }
  }
  return (
    <Modal title="Monthly Income" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <Field label="Month"><input className="input" type="month" value={f.month.slice(0, 7)} onChange={(e) => setF({ ...f, month: e.target.value + '-01' })} /></Field>
      <div className="row2">
        <Field label="Amount"><input className="input" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Currency"><CurrencyToggle value={f.currency} onChange={(c) => setF({ ...f, currency: c })} /></Field>
      </div>
      <Field label="Days rented (0-31)"><input className="input" type="number" min={0} max={31} value={f.days_rented} onChange={(e) => setF({ ...f, days_rented: e.target.value })} /></Field>
    </Modal>
  );
}
