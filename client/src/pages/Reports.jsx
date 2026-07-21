import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd } from '../lib/format.js';
import { Spinner, Badge, EurBadge } from '../components/ui.jsx';

const REPORTS = [
  ['outstanding-vendors', 'Outstanding Vendors', 'Who you owe, by balance'],
  ['outstanding-clients', 'Receivables Report', 'Who owes you, by balance'],
  ['fleet-amortization', 'Fleet Amortization Overview', 'Remaining lease balances (MKD + EUR)'],
  ['vehicle-utilization', 'Vehicle Utilization & RevPAV', 'How hard each car is working'],
];

export default function Reports() {
  const [active, setActive] = useState('outstanding-vendors');
  const [rows, setRows] = useState(null);

  useEffect(() => { setRows(null); api.get(`/reports/${active}`).then(setRows).catch(() => setRows([])); }, [active]);

  function exportCsv() {
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM = Cyrillic-safe in Excel
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${active}.csv`; a.click();
  }

  return (
    <>
      <div className="page-head">
        <div className="page-title">Reports</div>
        <button className="btn ghost" onClick={exportCsv}>⬇ Export CSV</button>
      </div>

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {REPORTS.map(([key, label, desc]) => (
          <div key={key} className="card pad" style={{ cursor: 'pointer', minWidth: 200, borderColor: active === key ? 'var(--brand)' : 'var(--line)' }} onClick={() => setActive(key)}>
            <b>{label}</b><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{desc}</div>
          </div>
        ))}
      </div>

      {!rows ? <Spinner /> : <ReportTable name={active} rows={rows} />}
    </>
  );
}

function ReportTable({ name, rows }) {
  if (!rows.length) return <div className="empty">No data.</div>;

  if (name === 'outstanding-vendors')
    return <Tbl head={['Company', 'Invoiced', 'Paid', 'Open']} body={rows.map((r) => [r.name, mkd(r.total_invoiced), mkd(r.total_paid), mkd(r.open_balance)])} />;
  if (name === 'outstanding-clients')
    return <Tbl head={['Client', 'Billed', 'Received', 'Outstanding']} body={rows.map((r) => [r.name, mkd(r.total_billed), mkd(r.total_received), mkd(r.outstanding_balance)])} />;
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

function Tbl({ head, body }) {
  return (
    <div className="card table-wrap"><table className="tbl">
      <thead><tr>{head.map((h, i) => <th key={i} className={i > 0 ? 'num' : ''}>{h}</th>)}</tr></thead>
      <tbody>{body.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} className={j > 0 ? 'num' : ''}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
