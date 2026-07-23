import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { brojVoBukvi } from '../lib/brojVoBukvi.js';
import { Modal, Field, Spinner, StatusBadge, Empty, CurrencyToggle } from '../components/ui.jsx';
import CompanyInvoiceSettings from '../components/CompanyInvoiceSettings.jsx';

// UI status choices → matching Macedonian labels for the manager.
const STATUS_LABEL = { draft: 'Нацрт (draft)', sent: 'Неплатена', partial: 'Делумно', paid: 'Платена', overdue: 'Задоцнета', cancelled: 'Откажана' };
const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export default function InvoiceManager() {
  const [rows, setRows] = useState(null);
  const [clients, setClients] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [editing, setEditing] = useState(null);     // invoice being edited (full)
  const [creating, setCreating] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [filters, setFilters] = useState({ search: '', status: '', date_from: '', date_to: '' });
  const [err, setErr] = useState('');

  const loadClients = () => api.get('/companies').then((all) => setClients(all.filter((c) => c.type === 'client' || c.type === 'both')));
  const load = () => {
    const qs = new URLSearchParams();
    if (filters.search) qs.set('search', filters.search);
    if (filters.status) qs.set('status', filters.status);
    if (filters.date_from) qs.set('date_from', filters.date_from);
    if (filters.date_to) qs.set('date_to', filters.date_to);
    api.get(`/client-invoices?${qs}`).then((r) => { setRows(r); setSelected(new Set()); }).catch(() => setRows([]));
  };
  useEffect(() => { load(); }, [filters]);
  useEffect(() => { loadClients(); api.get('/vehicles').then(setVehicles).catch(() => {}); }, []);

  const totals = useMemo(() => {
    const r = rows || [];
    const inv = r.reduce((s, i) => s + Number(i.amount), 0);
    const paid = r.reduce((s, i) => s + Number(i.paid_amount), 0);
    return { invoiced: inv, paid, unpaid: inv - paid, count: r.length };
  }, [rows]);

  async function openEdit(row) {
    try { setEditing(await api.get(`/client-invoices/${row.id}`)); }
    catch (e) { setErr(e.message); }
  }
  async function markPaid(row) {
    if (!window.confirm(`Mark invoice ${row.invoice_number} as paid?`)) return;
    try { await api.patch(`/client-invoices/${row.id}/status`, { status: 'paid' }); load(); }
    catch (e) { alert(e.message); }
  }
  async function duplicate(row) {
    try { const inv = await api.post(`/client-invoices/${row.id}/duplicate`); await load(); openEdit(inv); }
    catch (e) { alert(e.message); }
  }
  async function del(row) {
    if (!window.confirm(`Delete invoice ${row.invoice_number}? This can't be undone.`)) return;
    try { await api.del(`/client-invoices/${row.id}`); load(); }
    catch (e) { alert(e.message); }
  }
  async function bulkMarkPaid() {
    if (!selected.size || !window.confirm(`Mark ${selected.size} invoice(s) as paid?`)) return;
    for (const id of selected) { try { await api.patch(`/client-invoices/${id}/status`, { status: 'paid' }); } catch { /* skip */ } }
    load();
  }
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => (s.size === (rows || []).length ? new Set() : new Set((rows || []).map((r) => r.id))));

  return (
    <>
      <div className="page-head">
        <div className="page-title">Invoice Manager <span className="muted" style={{ fontSize: 14 }}>· Фактури</span></div>
        <div className="toolbar">
          <button className="btn ghost" onClick={() => setCompanyOpen(true)}>⚙ Company details</button>
          <button className="btn" onClick={() => setCreating(true)}>+ New Invoice</button>
        </div>
      </div>
      {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16, gap: 12 }}>
        <StatCard label="Total invoiced" value={mkd(totals.invoiced)} sub={`${totals.count} invoice(s)`} />
        <StatCard label="Unpaid / outstanding" value={mkd(totals.unpaid)} tone="warn" />
        <StatCard label="Paid / received" value={mkd(totals.paid)} tone="pos" />
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Search client or number…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          <select className="select" style={{ maxWidth: 180 }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <label className="muted" style={{ fontSize: 12 }}>From <input className="input" type="date" style={{ width: 150 }} value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} /></label>
          <label className="muted" style={{ fontSize: 12 }}>To <input className="input" type="date" style={{ width: 150 }} value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} /></label>
          {(filters.search || filters.status || filters.date_from || filters.date_to) &&
            <button className="btn ghost sm" onClick={() => setFilters({ search: '', status: '', date_from: '', date_to: '' })}>Clear</button>}
          {selected.size > 0 && <button className="btn sm" onClick={bulkMarkPaid}>✓ Mark {selected.size} paid</button>}
        </div>
      </div>

      {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No invoices match. Create your first invoice.</Empty> : (
        <div className="card table-wrap">
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 28 }}><input type="checkbox" checked={selected.size === rows.length && rows.length > 0} onChange={toggleAll} /></th>
              <th>Број</th><th>Датум</th><th>Купувач</th><th className="num">Вкупно</th><th>Статус</th><th></th>
            </tr></thead>
            <tbody>{rows.map((i) => (
              <tr key={i.id}>
                <td><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} /></td>
                <td><b>{i.invoice_number}</b></td>
                <td className="muted">{date(i.issue_date)}</td>
                <td>{i.company_name}</td>
                <td className="num">{mkd(i.amount)}</td>
                <td><StatusBadge status={i.status} /></td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" title="View / print PDF" onClick={() => api.openFile(`/client-invoices/${i.id}/pdf`).catch((e) => alert(e.message))}>🖨 PDF</button>{' '}
                  <button className="btn ghost sm" title="Edit" onClick={() => openEdit(i)}>✎</button>{' '}
                  <button className="btn ghost sm" title="Duplicate" onClick={() => duplicate(i)}>⧉</button>{' '}
                  {i.status !== 'paid' && i.status !== 'cancelled' && <><button className="btn sm" title="Mark as paid" onClick={() => markPaid(i)}>✓</button>{' '}</>}
                  <button className="btn ghost sm" title="Delete" onClick={() => del(i)}>🗑</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <InvoiceEditor
          invoice={editing}
          clients={clients}
          vehicles={vehicles}
          onClientAdded={loadClients}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
      {companyOpen && (
        <Modal title="Company details (for invoices)" onClose={() => setCompanyOpen(false)} wide>
          <CompanyInvoiceSettings onSaved={() => {}} />
        </Modal>
      )}
    </>
  );
}

function StatCard({ label, value, sub, tone }) {
  const color = tone === 'warn' ? 'var(--neg, #dc2626)' : tone === 'pos' ? 'var(--green, #16a34a)' : 'var(--text)';
  return (
    <div className="card pad">
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

const blankItem = (vatRate) => ({ description: '', quantity: 1, unit_price: '', vat_rate: vatRate });

function InvoiceEditor({ invoice, clients, vehicles, onClientAdded, onClose, onSaved }) {
  const editing = !!invoice;
  const [company, setCompany] = useState(null); // company invoice settings (defaults)
  const [addClient, setAddClient] = useState(false);
  const [wordsTouched, setWordsTouched] = useState(editing && !!invoice.amount_in_words);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [f, setF] = useState(editing
    ? {
        company_id: String(invoice.company_id || ''), vehicle_id: invoice.vehicle_id ? String(invoice.vehicle_id) : '',
        invoice_number: invoice.invoice_number || '', currency: invoice.currency || 'MKD',
        issue_date: String(invoice.issue_date).slice(0, 10), due_date: String(invoice.due_date).slice(0, 10),
        vat_enabled: !!invoice.vat_enabled, vat_rate: Number(invoice.vat_rate) || 18,
        status: invoice.status || 'draft', notes: invoice.notes || '',
        amount_in_words: invoice.amount_in_words || '',
        items: (invoice.items || []).map((it) => ({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), vat_rate: Number(it.vat_rate) })),
      }
    : {
        company_id: '', vehicle_id: '', invoice_number: '', currency: 'MKD',
        issue_date: new Date().toISOString().slice(0, 10), due_date: new Date().toISOString().slice(0, 10),
        vat_enabled: false, vat_rate: 18, status: 'draft', notes: '', amount_in_words: '',
        items: [blankItem(0)],
      });

  // Pull company defaults (VAT on/off + rate) for new invoices.
  useEffect(() => {
    api.get('/settings/company').then((c) => {
      setCompany(c);
      if (!editing) setF((prev) => ({ ...prev, vat_enabled: !!c.vatEnabled, vat_rate: Number(c.vatRate) || 18, items: [blankItem(c.vatEnabled ? Number(c.vatRate) || 18 : 0)] }));
    }).catch(() => {});
  }, []);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setItem = (i, k, v) => setF((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const addItem = () => setF((p) => ({ ...p, items: [...p.items, blankItem(p.vat_enabled ? p.vat_rate : 0)] }));
  const rmItem = (i) => setF((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }));

  function toggleVat(on) {
    setF((p) => ({ ...p, vat_enabled: on, items: p.items.map((it) => ({ ...it, vat_rate: on ? (Number(it.vat_rate) || p.vat_rate) : 0 })) }));
  }

  // Live totals in the invoice currency.
  const calc = useMemo(() => {
    let net = 0, vat = 0;
    const lines = f.items.map((it) => {
      const base = r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0));
      const rate = f.vat_enabled ? Number(it.vat_rate) || 0 : 0;
      const vatAmt = r2((base * rate) / 100);
      net = r2(net + base); vat = r2(vat + vatAmt);
      return { base, vatAmt, total: r2(base + vatAmt) };
    });
    return { lines, net, vat, grand: r2(net + vat) };
  }, [f.items, f.vat_enabled]);

  const words = wordsTouched ? f.amount_in_words : brojVoBukvi(calc.grand);
  const curSym = f.currency === 'EUR' ? '€' : 'ден';
  const fmt = (n) => new Intl.NumberFormat('mk-MK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

  async function save(sendFlag) {
    setErr('');
    const items = f.items.filter((it) => it.description.trim());
    if (!f.company_id) return setErr('Choose a client (Купувач).');
    if (!items.length) return setErr('Add at least one line item.');
    setBusy(true);
    try {
      const body = {
        company_id: Number(f.company_id), vehicle_id: f.vehicle_id ? Number(f.vehicle_id) : null,
        invoice_number: f.invoice_number.trim() || undefined, currency: f.currency,
        vat_enabled: f.vat_enabled, vat_rate: Number(f.vat_rate) || 0,
        issue_date: f.issue_date, due_date: f.due_date || f.issue_date,
        items: items.map((it) => ({ description: it.description, quantity: Number(it.quantity) || 0, unit_price: Number(it.unit_price) || 0, vat_rate: f.vat_enabled ? Number(it.vat_rate) || 0 : 0 })),
        amount_in_words: wordsTouched ? f.amount_in_words : words,
        notes: f.notes || null,
        status: f.status,
      };
      if (editing) await api.put(`/client-invoices/${invoice.id}`, body);
      else await api.post('/client-invoices', { ...body, send: sendFlag });
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <Modal title={editing ? `Edit Invoice ${invoice.invoice_number}` : 'New Invoice (Фактура)'} onClose={onClose} wide
      footer={editing
        ? <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save changes'}</button></>
        : <><button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn ghost" disabled={busy} onClick={() => save(false)}>Save as Draft</button>
            <button className="btn" disabled={busy} onClick={() => save(true)}>Save & Send</button></>}>
      {err && <div className="error-msg">{err}</div>}

      <div className="row2">
        <Field label="Client (Купувач)">
          <div className="toolbar">
            <select className="select" value={f.company_id} onChange={set('company_id')}>
              <option value="">Select…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="btn ghost sm" onClick={() => setAddClient(true)}>＋ New</button>
          </div>
        </Field>
        <Field label="Vehicle (optional)">
          <select className="select" value={f.vehicle_id} onChange={set('vehicle_id')}>
            <option value="">—</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
          </select>
        </Field>
      </div>

      <div className="row3">
        <Field label="Invoice number (Број)"><input className="input" value={f.invoice_number} onChange={set('invoice_number')} placeholder={editing ? '' : 'auto (YY-NNNN)'} /></Field>
        <Field label="Date (Датум)"><input className="input" type="date" value={f.issue_date} onChange={set('issue_date')} /></Field>
        <Field label="Due date"><input className="input" type="date" value={f.due_date} onChange={set('due_date')} /></Field>
      </div>

      <div className="row3">
        <Field label="Currency"><CurrencyToggle value={f.currency} onChange={(c) => setF({ ...f, currency: c })} /></Field>
        <Field label="ДДВ (VAT)">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', height: 38 }}>
            <input type="checkbox" checked={f.vat_enabled} onChange={(e) => toggleVat(e.target.checked)} /> Charge ДДВ
          </label>
        </Field>
        <Field label="ДДВ rate %"><input className="input" type="number" value={f.vat_rate} disabled={!f.vat_enabled} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, vat_rate: v, items: p.items.map((it) => ({ ...it, vat_rate: p.vat_enabled ? v : 0 })) })); }} /></Field>
      </div>

      <div className="field">
        <label>Line items (Ставки)</label>
        <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
          <table className="tbl">
            <thead><tr>
              <th style={{ width: 30 }}>Р.б</th><th>Назив на производот</th>
              <th className="num" style={{ width: 80 }}>Количина</th><th className="num" style={{ width: 110 }}>Цена</th>
              {f.vat_enabled && <th className="num" style={{ width: 70 }}>ДДВ%</th>}
              {f.vat_enabled && <th className="num" style={{ width: 100 }}>Пресметан ДДВ</th>}
              <th className="num" style={{ width: 110 }}>Вкупно</th><th style={{ width: 30 }}></th>
            </tr></thead>
            <tbody>{f.items.map((it, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td><input className="input" value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="Description" /></td>
                <td><input className="input num" type="number" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} /></td>
                <td><input className="input num" type="number" value={it.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value)} /></td>
                {f.vat_enabled && <td><input className="input num" type="number" value={it.vat_rate} onChange={(e) => setItem(i, 'vat_rate', e.target.value)} /></td>}
                {f.vat_enabled && <td className="num muted">{fmt(calc.lines[i]?.vatAmt)}</td>}
                <td className="num">{fmt(calc.lines[i]?.total)}</td>
                <td>{f.items.length > 1 && <button type="button" className="btn ghost sm" onClick={() => rmItem(i)}>✕</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={addItem}>+ Add line</button>
      </div>

      <div className="row2">
        <Field label="Износ со букви (amount in words)">
          <textarea className="input" rows={2} value={words} onChange={(e) => { setWordsTouched(true); setF({ ...f, amount_in_words: e.target.value }); }} />
          {wordsTouched && <button type="button" className="btn ghost sm" style={{ marginTop: 4 }} onClick={() => { setWordsTouched(false); setF({ ...f, amount_in_words: '' }); }}>↻ Auto from total</button>}
        </Field>
        <div>
          <div className="preview-box" style={{ lineHeight: 1.9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>НЕТО ИЗНОС</span><b>{fmt(calc.net)} {curSym}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Пресметан ДДВ {f.vat_enabled ? Number(f.vat_rate) || 0 : 0}%</span><b>{fmt(calc.vat)} {curSym}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 4 }}><span>Вкупно</span><b>{fmt(calc.grand)} {curSym}</b></div>
          </div>
          <Field label="Status (Статус)">
            <select className="select" value={f.status} onChange={set('status')}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <Field label="Notes (optional)"><input className="input" value={f.notes} onChange={set('notes')} /></Field>

      {addClient && <QuickClientModal onClose={() => setAddClient(false)} onAdded={async (c) => { setAddClient(false); await onClientAdded(); setF((p) => ({ ...p, company_id: String(c.id) })); }} />}
    </Modal>
  );
}

function QuickClientModal({ onClose, onAdded }) {
  const [f, setF] = useState({ name: '', tax_number: '', address: '', phone: '', email: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr('');
    try {
      if (!f.name.trim()) return setErr('Name is required.');
      const c = await api.post('/companies', { ...f, type: 'client' });
      onAdded(c);
    } catch (e) { setErr(e.message); }
  }
  return (
    <Modal title="New client (Купувач)" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Add client</button></>}>
      {err && <div className="error-msg">{err}</div>}
      <Field label="Name"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
      <div className="row2">
        <Field label="Даночен број (tax number)"><input className="input" value={f.tax_number} onChange={set('tax_number')} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set('phone')} /></Field>
      </div>
      <Field label="Address"><input className="input" value={f.address} onChange={set('address')} /></Field>
      <Field label="Email"><input className="input" value={f.email} onChange={set('email')} /></Field>
    </Modal>
  );
}
