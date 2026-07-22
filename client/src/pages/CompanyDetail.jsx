import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { Spinner, StatusBadge, EurBadge, Badge } from '../components/ui.jsx';
import PayModal from '../components/PayModal.jsx';

function HeaderStat({ label, value, tone }) {
  return <div className="card stat"><div className="label">{label}</div><div className={`value ${tone || ''}`}>{value}</div></div>;
}

export default function CompanyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('invoices');
  const [paying, setPaying] = useState(false);
  const [inst, setInst] = useState(null);

  const load = () => {
    api.get(`/companies/${id}/ledger`).then(setD).catch(() => {});
    api.get(`/companies/${id}/installments`).then(setInst).catch(() => {});
  };
  useEffect(() => { load(); }, [id]);
  if (!d) return <Spinner />;

  async function markInstallmentPaid(row) {
    const body = { method: 'bank' };
    if (row.kind === 'plan-installment') body.amount = row.amount; // pay one installment
    try { await api.post(`/invoices/${row.invoiceId}/pay`, body); load(); }
    catch (e) { alert(e.message); }
  }

  const isClient = d.company.type === 'client' || d.company.type === 'both';
  const hasInstallments = inst && inst.rows && inst.rows.length > 0;
  const tabs = ['invoices', 'payments', ...(hasInstallments ? ['installments'] : []), ...(isClient ? ['client-invoices', 'client-payments'] : []), 'vehicles'];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="muted" style={{ cursor: 'pointer' }} onClick={() => nav('/companies')}>← Companies</div>
          <div className="page-title">{d.company.name} <Badge tone="blue">{d.company.type}</Badge></div>
        </div>
        <button className="btn" onClick={() => setPaying(true)}>💸 Pay This Company</button>
      </div>

      <div className="grid stat-grid" style={{ marginBottom: 16 }}>
        <HeaderStat label="Total invoiced" value={mkd(d.payables.totals.total_invoiced)} />
        <HeaderStat label="Total paid" value={mkd(d.payables.totals.total_paid)} tone="green" />
        <HeaderStat label="Open balance (you owe)" value={mkd(d.payables.totals.open_balance)} tone="red" />
      </div>

      {isClient && d.receivables && (
        <div className="grid stat-grid" style={{ marginBottom: 16 }}>
          <HeaderStat label="Total billed" value={mkd(d.receivables.totals.total_billed)} />
          <HeaderStat label="Total received" value={mkd(d.receivables.totals.total_received)} tone="green" />
          <HeaderStat label="Outstanding (they owe)" value={mkd(d.receivables.totals.outstanding_balance)} tone="red" />
        </div>
      )}

      <div className="seg" style={{ marginBottom: 12 }}>
        {tabs.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t.replace('-', ' ')}</button>)}
      </div>

      <BalanceBar
        {...((tab === 'client-invoices' || tab === 'client-payments')
          ? { label: 'They owe you', total: d.receivables?.totals.total_billed || 0, paid: d.receivables?.totals.total_received || 0, remaining: d.receivables?.totals.outstanding_balance || 0 }
          : { label: 'You owe them', total: d.payables.totals.total_invoiced, paid: d.payables.totals.total_paid, remaining: d.payables.totals.open_balance })}
      />

      <div className="card table-wrap">
        {tab === 'invoices' && <Ledger rows={d.payables.invoices} kind="invoice" />}
        {tab === 'payments' && <Ledger rows={d.payables.payments} kind="payment" />}
        {tab === 'installments' && (
          <table className="tbl">
            <thead><tr><th>Month</th><th>Payment</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {inst.rows.map((r, i) => (
                <tr key={i} style={{ opacity: r.paid ? 0.6 : 1 }}>
                  <td>{new Date(r.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>
                  <td>{r.label}</td>
                  <td className="num">{mkd(r.amount)}</td>
                  <td>{r.paid ? <Badge tone="green">paid</Badge> : <Badge tone="yellow">due</Badge>}</td>
                  <td className="num">{!r.paid && <button className="btn ghost sm" onClick={() => markInstallmentPaid(r)}>Mark paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'client-invoices' && <Ledger rows={d.receivables?.invoices || []} kind="invoice" />}
        {tab === 'client-payments' && <Ledger rows={d.receivables?.payments || []} kind="payment" />}
        {tab === 'vehicles' && (
          <table className="tbl"><thead><tr><th>Plate</th><th>Make/Model</th></tr></thead>
            <tbody>{d.linkedVehicles.map((v) => <tr key={v.id} className="clickable" onClick={() => nav(`/vehicles/${v.id}`)}><td>{v.plate}</td><td>{v.make} {v.model}</td></tr>)}
            {d.linkedVehicles.length === 0 && <tr><td colSpan={2} className="muted">No linked vehicles.</td></tr>}</tbody></table>
        )}
      </div>

      {paying && <PayModal company={d.company} onClose={() => setPaying(false)} onDone={() => { setPaying(false); load(); }} />}
    </>
  );
}

function BalanceBar({ label, total, paid, remaining }) {
  const t = Number(total) || 0;
  const p = Number(paid) || 0;
  const pct = t > 0 ? Math.min(100, Math.round((p / t) * 100)) : 0;
  return (
    <div className="card pad" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>TOTAL DEBT</div>
          <div style={{ fontSize: 22, fontWeight: 700 }} className="tabnum">{mkd(total)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>PAID</div>
          <div className="tone-pos tabnum" style={{ fontSize: 22, fontWeight: 700 }}>{mkd(paid)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>REMAINING · {label}</div>
          <div className={remaining > 0 ? 'tone-neg' : 'tone-pos'} style={{ fontSize: 26, fontWeight: 700 }}>{mkd(remaining)}</div>
        </div>
      </div>
      <div className="bar"><span style={{ width: `${pct}%` }} /></div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>{pct}% settled</span>
        <span>{mkd(paid)} of {mkd(total)}</span>
      </div>
    </div>
  );
}

function Ledger({ rows, kind }) {
  if (!rows.length) return <div className="empty">Nothing here yet.</div>;
  if (kind === 'invoice') {
    return (
      <table className="tbl">
        <thead><tr><th>Description</th><th>Due</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{r.description} <EurBadge currency={r.currency} original={r.original_amount} /></td>
            <td className="muted">{date(r.due_date)}</td><td className="num">{mkd(r.amount)}</td>
            <td className="num">{mkd(r.paid_amount)}</td><td><StatusBadge status={r.status} /></td></tr>
        ))}</tbody>
      </table>
    );
  }
  return (
    <table className="tbl">
      <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id}><td className="muted">{date(r.paid_at)}</td><td><Badge tone="gray">{r.method}</Badge></td>
          <td className="num">{mkd(r.amount)} <EurBadge currency={r.currency} original={r.original_amount} /></td></tr>
      ))}</tbody>
    </table>
  );
}
