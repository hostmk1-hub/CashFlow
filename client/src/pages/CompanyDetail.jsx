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

  const load = () => api.get(`/companies/${id}/ledger`).then(setD).catch(() => {});
  useEffect(() => { load(); }, [id]);
  if (!d) return <Spinner />;

  const isClient = d.company.type === 'client' || d.company.type === 'both';
  const tabs = ['invoices', 'payments', ...(isClient ? ['client-invoices', 'client-payments'] : []), 'vehicles'];

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

      <div className="card table-wrap">
        {tab === 'invoices' && <Ledger rows={d.payables.invoices} kind="invoice" />}
        {tab === 'payments' && <Ledger rows={d.payables.payments} kind="payment" />}
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
