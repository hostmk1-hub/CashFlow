import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Badge, EurBadge } from '../components/ui.jsx';

const REPORTS = [
  ['cash-flow', 'Cash Flow', 'Daily cash + card income'],
  ['outstanding-vendors', 'Outstanding Vendors', 'Who you owe, by balance'],
  ['outstanding-clients', 'Receivables Report', 'Who owes you, by balance'],
  ['fleet-amortization', 'Fleet Amortization', 'Remaining lease balances (MKD + EUR)'],
  ['vehicle-utilization', 'Utilization & RevPAV', 'How hard each car is working'],
  ['vehicle-cost', 'Vehicle Cost Report', 'Expenses by plate'],
  ['salary', 'Salary Report', "This month's salary run (paid/unpaid)"],
  ['upcoming-payments', 'Upcoming Payments', 'Everything due in the next 30 days'],
];

export default function Reports() {
  const [active, setActive] = useState('outstanding-vendors');
  const [rows, setRows] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [statement, setStatement] = useState(null);

  useEffect(() => { setRows(null); api.get(`/reports/${active}`).then(setRows).catch(() => setRows([])); }, [active]);

  async function exportXlsx() {
    setExporting(true);
    try { await api.download(`/reports/${active}/export.xlsx`, `${active}.xlsx`); }
    catch (e) { alert(e.message); }
    finally { setExporting(false); }
  }

  return (
    <>
      <div className="page-head">
        <div className="page-title">Reports</div>
        <button className="btn ghost" onClick={exportXlsx} disabled={exporting}>{exporting ? 'Exporting…' : '⬇ Export Excel'}</button>
      </div>

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {REPORTS.map(([key, label, desc]) => (
          <div key={key} className="card pad" style={{ cursor: 'pointer', minWidth: 190, borderColor: active === key ? 'var(--brand)' : 'var(--line)' }} onClick={() => setActive(key)}>
            <b>{label}</b><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{desc}</div>
          </div>
        ))}
      </div>

      {!rows ? <Spinner /> : <ReportTable name={active} rows={rows} />}

      <StatementSection onOpen={setStatement} />
      {statement && <StatementModal {...statement} onClose={() => setStatement(null)} />}
    </>
  );
}

function ReportTable({ name, rows }) {
  if (!rows.length) return <div className="empty">No data.</div>;

  if (name === 'outstanding-vendors')
    return <Tbl head={['Company', 'Invoiced', 'Paid', 'Open']} body={rows.map((r) => [r.name, mkd(r.total_invoiced), mkd(r.total_paid), mkd(r.open_balance)])} />;
  if (name === 'outstanding-clients')
    return <Tbl head={['Client', 'Billed', 'Received', 'Outstanding']} body={rows.map((r) => [r.name, mkd(r.total_billed), mkd(r.total_received), mkd(r.outstanding_balance)])} />;
  if (name === 'cash-flow')
    return <Tbl head={['Date', 'Cash', 'Card']} body={rows.map((r) => [r.date, mkd(r.cash_amount), mkd(r.card_amount)])} />;
  if (name === 'vehicle-cost')
    return <Tbl head={['Plate', 'Make/Model', 'Invoices', 'Total expenses']} body={rows.map((r) => [r.plate, `${r.make} ${r.model}`, r.invoice_count, mkd(r.total_expenses)])} />;
  if (name === 'salary')
    return <Tbl head={['Worker', 'Position', 'Amount', 'Paid', 'Status']} body={rows.map((r) => [r.worker, r.position, mkd(r.amount), mkd(r.paid_amount), r.status])} />;
  if (name === 'upcoming-payments')
    return <Tbl head={['Kind', 'Description', 'Due', 'Amount']} body={rows.map((r) => [r.kind, r.description, r.due_date?.slice(0, 10), mkd(r.amount)])} />;
  if (name === 'fleet-amortization')
    return (
      <div className="card table-wrap"><table className="tbl">
        <thead><tr><th>Plate</th><th>Leasing</th><th className="num">Monthly</th><th className="num">Remaining (MKD)</th><th className="num">EUR</th><th className="num">Years left</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td>{r.plate}</td><td>{r.leasing_company} <EurBadge currency={r.currency} /></td>
            <td className="num">{mkd(r.monthly_amount)}</td><td className="num">{mkd(r.remaining)}</td>
            <td className="num">{r.currency === 'EUR' ? '€' + Math.round(Number(r.remaining) / 61.8) : '—'}</td>
            <td className="num">{r.years_left}</td></tr>
        ))}</tbody>
      </table></div>
    );
  if (name === 'vehicle-utilization')
    return (
      <div className="card table-wrap"><table className="tbl">
        <thead><tr><th>Plate</th><th>Month</th><th className="num">Income</th><th className="num">Days</th><th>Utilization</th><th className="num">RevPAV</th><th className="num">Net P&L</th></tr></thead>
        <tbody>{rows.map((r, i) => {
          const u = Number(r.utilization_pct);
          return <tr key={i}><td>{r.plate}</td><td>{r.month?.slice(0, 7)}</td><td className="num">{mkd(r.total_income)}</td>
            <td className="num">{r.days_rented}</td><td><Badge tone={u >= 70 ? 'green' : u >= 40 ? 'yellow' : 'red'}>{r.utilization_pct}%</Badge></td>
            <td className="num">{mkd(r.rev_pav)}</td><td className="num">{mkd(r.net_pnl)}</td></tr>;
        })}</tbody>
      </table></div>
    );
  return null;
}

function StatementSection({ onOpen }) {
  const [type, setType] = useState('company');
  const [companies, setCompanies] = useState([]);
  const [id, setId] = useState('');
  useEffect(() => { api.get('/companies').then(setCompanies).catch(() => {}); }, []);
  const list = type === 'client' ? companies.filter((c) => c.type === 'client' || c.type === 'both') : companies;

  return (
    <div className="card pad" style={{ marginTop: 20 }}>
      <h3 className="card-title">Statements (printable)</h3>
      <div className="toolbar">
        <div className="seg">
          <button className={type === 'company' ? 'on' : ''} onClick={() => setType('company')}>Company (vendor)</button>
          <button className={type === 'client' ? 'on' : ''} onClick={() => setType('client')}>Client</button>
        </div>
        <select className="select" style={{ width: 240 }} value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Select…</option>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" disabled={!id} onClick={() => onOpen({ type, companyId: id })}>View / Print</button>
      </div>
    </div>
  );
}

function StatementModal({ type, companyId, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/reports/${type}-statement/${companyId}`).then(setD).catch(() => {}); }, [type, companyId]);
  if (!d) return null;
  const isClient = type === 'client';
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{isClient ? 'Client' : 'Company'} Statement — {d.company?.name}</h3>
          <div><button className="btn ghost sm" onClick={() => window.print()}>🖨 Print</button> <button className="x-btn" onClick={onClose}>×</button></div>
        </div>
        <div className="modal-body">
          <div className="preview-box" style={{ marginBottom: 12 }}>
            {isClient
              ? <>Billed: <b>{mkd(d.totals?.total_billed)}</b> · Received: <b>{mkd(d.totals?.total_received)}</b> · Outstanding: <b>{mkd(d.totals?.outstanding_balance)}</b></>
              : <>Invoiced: <b>{mkd(d.totals?.total_invoiced)}</b> · Paid: <b>{mkd(d.totals?.total_paid)}</b> · Open: <b>{mkd(d.totals?.open_balance)}</b></>}
          </div>
          <h4>Invoices</h4>
          <table className="tbl"><thead><tr><th>Description</th><th>Date</th><th className="num">Amount</th><th className="num">Paid</th><th>Status</th></tr></thead>
            <tbody>{d.invoices.map((i, k) => <tr key={k}><td>{i.description}</td><td className="muted">{(i.date || i.issue_date || i.due_date || '').slice(0, 10)}</td><td className="num">{mkd(i.amount)}</td><td className="num">{mkd(i.paid_amount)}</td><td>{i.status}</td></tr>)}</tbody>
          </table>
          <h4 style={{ marginTop: 14 }}>Payments</h4>
          <table className="tbl"><thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
            <tbody>{d.payments.map((p, k) => <tr key={k}><td className="muted">{(p.paid_at || p.date || '').slice(0, 10)}</td><td>{p.method}</td><td className="num">{mkd(p.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Tbl({ head, body }) {
  return (
    <div className="card table-wrap"><table className="tbl">
      <thead><tr>{head.map((h, i) => <th key={i} className={i > 0 ? 'num' : ''}>{h}</th>)}</tr></thead>
      <tbody>{body.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} className={j > 0 ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
