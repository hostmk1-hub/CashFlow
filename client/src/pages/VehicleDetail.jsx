import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../lib/api.js';
import { mkd, date } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Spinner, Badge, Modal, Field, CurrencyToggle, EurBadge, AiBadge, Dropzone } from '../components/ui.jsx';
import PaymentScheduleModal from '../components/PaymentScheduleModal.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';
import EditPaymentModal from '../components/EditPaymentModal.jsx';

const ROLE_RANK = { staff: 1, manager: 2, admin: 3, owner: 4 };
function utilTone(u) { return u >= 70 ? 'green' : u >= 40 ? 'yellow' : 'red'; }
function addMonthsStr(dateStr, n) { const d = new Date(dateStr); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }

export default function VehicleDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { activeTenant } = useAuth();
  const isAdmin = (ROLE_RANK[activeTenant?.role] || 0) >= 3;
  const [d, setD] = useState(null);
  const [inst, setInst] = useState(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [amortOpen, setAmortOpen] = useState(false);
  const [amortEdit, setAmortEdit] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [marking, setMarking] = useState(null);       // installment row to mark paid
  const [editingPayment, setEditingPayment] = useState(null); // payment id to edit/undo

  const loadInst = () => api.get(`/vehicles/${id}/installments`).then(setInst).catch(() => setInst(null));
  const load = () => { api.get(`/vehicles/${id}`).then(setD).catch(() => {}); loadInst(); };
  useEffect(() => { load(); api.get('/companies').then(setCompanies).catch(() => {}); }, [id]);
  async function deleteLease(planId) {
    if (!confirm('Delete this lease plan and its unpaid installment invoices? Paid installments must be removed first.')) return;
    try { await api.del(`/amortization/${planId}`); load(); }
    catch (e) { alert(e.message); }
  }
  async function undoPayment(paymentId) {
    if (!window.confirm('Undo this payment? The installment will return to unpaid and the balance will be restored. This action is logged.')) return;
    try { await api.del(`/payments/${paymentId}`); load(); }
    catch (e) { alert(e.message); }
  }
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
        <div className="toolbar">
          <button className="btn ghost" onClick={() => setScanOpen(true)}>📷 Scan Invoice / Expense</button>
          <button className="btn ghost" onClick={() => setScheduleOpen(true)}>📅 Upload Payment Schedule</button>
          <button className="btn ghost" onClick={() => setAmortOpen(true)}>+ Amortization Plan</button>
          <button className="btn" onClick={() => setIncomeOpen(true)}>+ Monthly Income</button>
        </div>
      </div>

      {underperforming && (
        <div className="error-msg" style={{ marginBottom: 16 }}>
          ⚠️ Underperforming Vehicle: utilization is {latest.utilization_pct}% and income ({mkd(latest.total_income)}) is not covering the monthly lease debt ({mkd(monthlyLease)}). Coverage ratio {coverage.toFixed(2)}.
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
        <div className="card pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title" style={{ margin: 0 }}>Amortization</h3>
            {plan && (
              <div className="toolbar">
                <button className="btn ghost sm" title="Edit lease plan" onClick={() => setAmortEdit(plan)}>✎ Edit lease</button>
                <button className="btn ghost sm" title="Delete lease plan" style={{ color: 'var(--neg)' }} onClick={() => deleteLease(plan.id)}>🗑 Delete</button>
              </div>
            )}
          </div>
          {plan ? (
            <>
              <div style={{ height: 10, background: '#eef1f4', borderRadius: 6, overflow: 'hidden', margin: '10px 0' }}>
                <div style={{ width: `${paidPct}%`, height: '100%', background: 'var(--brand)' }} />
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{paidPct}% paid off</div>
              <div className="grid row2" style={{ marginTop: 12, fontSize: 13 }}>
                <div>Leasing company: <b>{plan.company_name}</b></div>
                <div>Lease / contract #: <b>{plan.lease_number || '—'}</b></div>
                {plan.purchase_price != null && <div>Car price (cash): <b>{mkd(plan.purchase_price)}</b></div>}
                <div>Lease total: <b>{plan.total_amount != null ? mkd(plan.total_amount) : '—'}</b> {plan.total_amount != null && <EurBadge currency={plan.currency} />}</div>
                <div>Monthly: <b>{plan.monthly_amount != null ? mkd(plan.monthly_amount) : '—'}</b></div>
                <div>Lease starts: <b>{plan.start_date ? date(plan.start_date) : '—'}</b></div>
                <div>Last month: <b>{plan.start_date && plan.months_total ? date(addMonthsStr(plan.start_date, plan.months_total - 1)) : '—'}</b></div>
                <div>Remaining: <b>{mkd(prog?.remaining || 0)}</b></div>
                <div>Installments left: <b>{prog?.installments_left ?? '—'}</b></div>
                <div>Years left: <b>{prog?.years_left ?? '—'}</b></div>
              </div>
              {plan.purchase_price != null && Number(plan.purchase_price) > 0 && (
                <div className="preview-box" style={{ marginTop: 12 }}>
                  Leasing cost (markup over cash price): <b className="tone-warn">{mkd(Number(plan.total_amount) - Number(plan.purchase_price))}</b>
                  {' '}· <b>{Math.round(((Number(plan.total_amount) - Number(plan.purchase_price)) / Number(plan.purchase_price)) * 100)}%</b>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div className="muted" style={{ marginBottom: 10 }}>No lease plan yet. Upload the leasing company's monthly payment schedule and we’ll create the tracked payments for this car.</div>
              <div className="toolbar" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={() => setScheduleOpen(true)}>📅 Upload Payment Schedule</button>
                <button className="btn ghost" onClick={() => setAmortOpen(true)}>+ Manual / scan plan</button>
              </div>
            </div>
          )}
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

      {inst && inst.rows.length > 0 && (
        <div className="card table-wrap" style={{ marginBottom: 16 }}>
          <div className="pad" style={{ paddingBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h3 className="card-title" style={{ margin: 0 }}>Installments</h3>
            <div className="toolbar" style={{ fontSize: 13 }}>
              <span className="muted">Due now <b style={{ color: 'var(--neg,#dc2626)' }}>{mkd(inst.totalDueNow)}</b></span>
              <span className="muted">Upcoming <b>{mkd(inst.totalUpcoming)}</b></span>
              <span className="muted">Paid <b style={{ color: 'var(--green,#16a34a)' }}>{mkd(inst.totalPaid)}</b></span>
            </div>
          </div>
          <table className="tbl">
            <thead><tr><th>Installment</th><th>Month</th><th className="num">Amount</th><th>Status</th><th className="num"></th></tr></thead>
            <tbody>{inst.rows.map((r) => (
              <tr key={r.invoiceId}>
                <td>{r.label}</td>
                <td className="muted">{r.month ? date(r.month) : '—'}</td>
                <td className="num">{mkd(r.amount)}{r.status === 'paid' && Number(r.paid_amount) !== Number(r.amount) ? <span className="muted"> (paid {mkd(r.paid_amount)})</span> : ''}</td>
                <td><Badge tone={r.status === 'paid' ? 'green' : r.status === 'due' ? 'red' : 'gray'}>{r.status === 'paid' ? 'Paid' : r.status === 'due' ? 'Due' : 'Upcoming'}</Badge></td>
                <td className="num">
                  {r.status !== 'paid'
                    ? <button className="btn ghost sm" onClick={() => setMarking(r)}>Mark paid</button>
                    : isAdmin && r.last_payment_id
                      ? <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn ghost sm" onClick={() => setEditingPayment(r.last_payment_id)}>Edit</button>
                          <button className="btn ghost sm" style={{ color: 'var(--neg,#dc2626)' }} onClick={() => undoPayment(r.last_payment_id)}>Undo</button>
                        </div>
                      : <span className="muted">—</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

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
      {amortOpen && <AmortizationModal vehicleId={id} companies={companies} onClose={() => setAmortOpen(false)} onSaved={() => { setAmortOpen(false); load(); }} />}
      {amortEdit && <AmortizationModal plan={amortEdit} vehicleId={id} companies={companies} onClose={() => setAmortEdit(null)} onSaved={() => { setAmortEdit(null); load(); }} />}
      {scanOpen && <VehicleScanModal vehicleId={id} plate={d.vehicle.plate} companies={companies} onClose={() => setScanOpen(false)} onSaved={() => { setScanOpen(false); load(); }} />}
      {scheduleOpen && <PaymentScheduleModal vehicleId={id} plate={d.vehicle.plate} defaultCompanyId={plan?.company_id} defaultLeaseNumber={plan?.lease_number} onClose={() => setScheduleOpen(false)} onSaved={() => { setScheduleOpen(false); load(); }} />}
      {marking && <MarkPaidModal invoiceId={marking.invoiceId} defaultAmount={marking.remaining} remaining={marking.remaining} label={marking.label} onClose={() => setMarking(null)} onDone={() => { setMarking(null); load(); }} />}
      {editingPayment && <EditPaymentModal paymentId={editingPayment} onClose={() => setEditingPayment(null)} onDone={() => { setEditingPayment(null); load(); }} />}
    </>
  );
}

const EXPENSE_CATS = ['leasing', 'insurance', 'repairs', 'service', 'tires', 'other'];

// Upload an invoice/expense (photo or PDF) directly on a car. Gemini reads it,
// we force the vehicle to THIS car, and save it as an expense against it.
function VehicleScanModal({ vehicleId, plate, companies, onClose, onSaved }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.value });

  async function onFile(file) {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const d = await api.upload('/invoices/scan', fd);
      // Force the vehicle to the car we're on; keep any detected company/category.
      setDraft({ ...d, matched_vehicle_id: Number(vehicleId), category: d.category || '', installments: 1 });
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setErr('');
    try { await api.post('/invoices/scan/confirm', { ...draft, matched_vehicle_id: Number(vehicleId) }); onSaved(); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <Modal title={`Scan Invoice / Expense — ${plate}`} onClose={onClose} wide
      footer={draft && <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={confirm}>Save to this car</button></>}>
      {err && <div className="error-msg">{err}</div>}
      {!draft ? (
        <>
          <p className="muted">Upload a photo or PDF of the invoice/expense. Gemini reads the fields and it’s saved against <b>{plate}</b>. Nothing saves until you confirm.</p>
          <Dropzone accept="image/*,application/pdf" onFiles={(files) => onFile(files[0])} busy={busy} hint="Photo or PDF" />
        </>
      ) : (
        <>
          {draft.ai_tier && <div style={{ marginBottom: 8 }}><AiBadge tier={draft.ai_tier} model={draft.ai_model} /></div>}
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Saving to <b>{plate}</b>{draft.matched_vehicle_by === 'lease_number' ? ' (matched by lease number)' : ''}.</div>
          <div className="row2">
            <Field label="Invoice #"><input className="input" value={draft.invoice_number || ''} onChange={set('invoice_number')} /></Field>
            <Field label="Date"><input className="input" type="date" value={draft.date || ''} onChange={set('date')} /></Field>
          </div>
          <Field label="Description"><input className="input" value={draft.description || ''} onChange={set('description')} /></Field>
          <div className="row2">
            <Field label="Amount"><input className="input" type="number" value={draft.amount || ''} onChange={set('amount')} /></Field>
            <Field label="Currency"><CurrencyToggle value={draft.currency} onChange={(c) => setDraft({ ...draft, currency: c })} /></Field>
          </div>
          <div className="row2">
            <Field label={`Company ${draft.vendor_name ? '(detected: ' + draft.vendor_name + ')' : ''}`}>
              <select className="select" value={draft.matched_company_id || ''} onChange={(e) => setDraft({ ...draft, matched_company_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— pick company —</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select className="select" value={draft.category || ''} onChange={set('category')}>
                <option value="">—</option>{EXPENSE_CATS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
              </select>
            </Field>
          </div>
        </>
      )}
    </Modal>
  );
}

function AmortizationModal({ vehicleId, plan, companies, onClose, onSaved }) {
  const editing = !!plan;
  const [mode, setMode] = useState('manual'); // manual | scan
  const [f, setF] = useState(editing
    ? {
        company_id: plan.company_id || '', lease_number: plan.lease_number || '',
        purchase_price: plan.purchase_price ?? '', total_amount: plan.total_amount == null ? '' : String(plan.total_amount),
        down_payment: plan.down_payment ?? 0, monthly_amount: plan.monthly_amount == null ? '' : String(plan.monthly_amount),
        months_total: plan.months_total ?? '', interest_rate: plan.interest_rate ?? '',
        start_date: plan.start_date ? String(plan.start_date).slice(0, 10) : '', currency: plan.currency || 'MKD',
        generate_invoices: false, down_payment_paid: false,
      }
    : { company_id: '', lease_number: '', purchase_price: '', total_amount: '', down_payment: 0, monthly_amount: '', months_total: 12, interest_rate: '', start_date: new Date().toISOString().slice(0, 10), currency: 'MKD', generate_invoices: true, down_payment_paid: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [scanInfo, setScanInfo] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function onScan(file) {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const draft = await api.upload('/amortization/scan', fd);
      // pre-fill the manual form with extracted numbers + detected leasing company,
      // then let the user review before saving.
      setF((prev) => ({
        ...prev,
        company_id: draft.matched_company_id || prev.company_id,
        lease_number: draft.lease_number || prev.lease_number,
        total_amount: draft.total_amount ?? '', down_payment: draft.down_payment ?? 0,
        monthly_amount: draft.monthly_amount ?? '', months_total: draft.months_total ?? 12,
        interest_rate: draft.interest_rate ?? '', start_date: draft.start_date ?? prev.start_date,
        currency: draft.currency || 'MKD',
      }));
      setScanInfo({ vendor: draft.vendor_name, matched: !!draft.matched_company_id, tier: draft.ai_tier, model: draft.ai_model });
      setMode('manual');
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      const num = (v) => (v === '' || v == null ? null : Number(v));
      const common = {
        company_id: Number(f.company_id), lease_number: f.lease_number || null,
        total_amount: num(f.total_amount), purchase_price: num(f.purchase_price),
        monthly_amount: num(f.monthly_amount), months_total: num(f.months_total),
        interest_rate: num(f.interest_rate),
        start_date: f.start_date || null, currency: f.currency,
      };
      if (editing) {
        await api.put(`/amortization/${plan.id}`, common);
      } else {
        await api.post('/amortization', {
          ...common, vehicle_id: Number(vehicleId), down_payment: Number(f.down_payment || 0),
          generate_invoices: f.generate_invoices, down_payment_paid: f.down_payment_paid,
        });
      }
      onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <Modal title={editing ? 'Edit Lease Plan' : 'Amortization Plan'} onClose={onClose} wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !f.company_id} onClick={save}>{editing ? 'Save changes' : (f.monthly_amount && f.months_total ? 'Create plan + generate installments' : 'Save lease')}</button></>}>
      {err && <div className="error-msg">{err}</div>}
      {editing && <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Editing moves the installments to the selected leasing company; the monthly amount updates on installments that aren’t paid yet. Changing the term length won’t add or remove months.</div>}
      {!editing && (
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')}>Manual</button>
        <button type="button" className={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')}>📷 Scan Document</button>
      </div>
      )}
      {mode === 'scan' ? (
        <>
          <p className="muted">Upload a photo/PDF of the lease schedule. Gemini extracts the numbers (Cyrillic supported) and pre-fills the form for review — nothing saves until you confirm.</p>
          <Dropzone accept="image/*,application/pdf" onFiles={(files) => onScan(files[0])} busy={busy} hint="Photo or PDF of the lease schedule" />
        </>
      ) : (
        <>
          {scanInfo && (
            <div className="preview-box" style={{ marginBottom: 12 }}>
              {scanInfo.tier && <div style={{ marginBottom: 6 }}><AiBadge tier={scanInfo.tier} model={scanInfo.model} /></div>}
              📄 Read from the uploaded document. {scanInfo.matched
                ? <>Leasing company matched to <b>the selection below</b> — please double-check.</>
                : scanInfo.vendor
                  ? <>Detected leasing company <b>“{scanInfo.vendor}”</b> but no match in your companies — pick it below (or add the company first).</>
                  : <>Review the numbers below, then confirm.</>}
            </div>
          )}
          <div className="row2">
            <Field label="Leasing company"><select className="select" value={f.company_id} onChange={set('company_id')}><option value="">Select…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Lease / contract number"><input className="input" value={f.lease_number} onChange={set('lease_number')} placeholder="e.g. LN-2026-00123" /></Field>
          </div>
          <div className="row2">
            <Field label="Car purchase price (cash)"><input className="input" type="number" value={f.purchase_price} onChange={set('purchase_price')} placeholder="what the car actually costs" /></Field>
            <Field label="Currency"><CurrencyToggle value={f.currency} onChange={(c) => setF({ ...f, currency: c })} /></Field>
          </div>
          <Field label="Lease total (down + all installments)"><input className="input" type="number" value={f.total_amount} onChange={set('total_amount')} /></Field>
          {Number(f.purchase_price) > 0 && Number(f.total_amount) > 0 && (
            <div className="preview-box">
              Leasing company charges <b>{new Intl.NumberFormat('mk-MK').format(Number(f.total_amount) - Number(f.purchase_price))} {f.currency === 'EUR' ? '€' : 'ден'}</b> over the cash price
              {' '}(<b>{Math.round(((Number(f.total_amount) - Number(f.purchase_price)) / Number(f.purchase_price)) * 100)}%</b> markup).
              <div className="muted" style={{ marginTop: 4 }}>Car {new Intl.NumberFormat('mk-MK').format(Number(f.purchase_price))} · Lease total {new Intl.NumberFormat('mk-MK').format(Number(f.total_amount))} {f.currency === 'EUR' ? '€' : 'ден'}</div>
            </div>
          )}
          <div className="row2">
            <Field label="First / down payment"><input className="input" type="number" value={f.down_payment} onChange={set('down_payment')} placeholder="0" /></Field>
            <Field label="Monthly installment"><input className="input" type="number" value={f.monthly_amount} onChange={set('monthly_amount')} /></Field>
          </div>
          {Number(f.down_payment) > 0 && (
            <Field>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={f.down_payment_paid} onChange={(e) => setF({ ...f, down_payment_paid: e.target.checked })} />
                Down payment already paid (prepaid before taking the car)
              </label>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {f.down_payment_paid
                  ? `Records ${new Intl.NumberFormat('mk-MK').format(Number(f.down_payment))} ${f.currency === 'EUR' ? '€' : 'ден'} as a settled expense (shows in this car's expenses + the leasing company ledger).`
                  : 'Creates an unpaid invoice for the down payment (you can pay it later).'}
              </div>
            </Field>
          )}
          <div className="row2">
            <Field label="Months total"><input className="input" type="number" value={f.months_total} onChange={set('months_total')} /></Field>
            <Field label="Interest rate %"><input className="input" type="number" value={f.interest_rate} onChange={set('interest_rate')} /></Field>
          </div>
          <Field label="Start date"><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></Field>
          <Field><label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={f.generate_invoices} onChange={(e) => setF({ ...f, generate_invoices: e.target.checked })} /> Auto-generate monthly installment invoices</label>
            {f.generate_invoices && Number(f.months_total) > 0 && Number(f.monthly_amount) > 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Creates <b>{Number(f.months_total)}</b> monthly installments of <b>{new Intl.NumberFormat('mk-MK').format(Number(f.monthly_amount))} {f.currency === 'EUR' ? '€' : 'ден'}</b> each, starting {f.start_date}. They’ll show in the Installments tab and the Due Payments report.
              </div>
            )}
          </Field>
        </>
      )}
    </Modal>
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
