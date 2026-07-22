import { query } from '../../shared/db.js';

// Per-invoice "due now" (MKD): the portion whose scheduled date has arrived.
//  • Plain invoice → the whole remaining, but only once its due_date is here.
//  • Installment invoice → only the installments whose month has arrived
//    (periods elapsed × monthly amount), minus what's already been paid,
//    clamped to the remaining balance. Future installments aren't owed yet.
const DUE_NOW_EXPR = `
  CASE
    WHEN installment_count IS NULL OR installment_count <= 1 THEN
      CASE WHEN due_date <= CURRENT_DATE THEN (amount - paid_amount) ELSE 0 END
    ELSE
      GREATEST(0, LEAST(
        amount - paid_amount,
        LEAST(
          installment_count,
          CASE WHEN due_date > CURRENT_DATE THEN 0
               ELSE (EXTRACT(YEAR FROM age(CURRENT_DATE, due_date)) * 12
                     + EXTRACT(MONTH FROM age(CURRENT_DATE, due_date)))::int + 1 END
        ) * ROUND(amount / installment_count) - paid_amount
      ))
  END`;

export async function dashboard(tenantId) {
  const q = (sql, params = [tenantId]) => query(sql, params).then((r) => r.rows);

  const [
    payables, dueNow, receivables, leaseDebt, dailyToday, monthIncome, monthExpense,
    topOwed, topOwing, overdueClients, upcoming, bestWorst, cashFlow,
  ] = await Promise.all([
    q(`SELECT COALESCE(SUM(amount - paid_amount),0) AS open_payables FROM invoices WHERE tenant_id=$1 AND status!='paid'`),
    q(`SELECT COALESCE(SUM(${DUE_NOW_EXPR}),0) AS due_now FROM invoices WHERE tenant_id=$1 AND status!='paid'`),
    q(`SELECT COALESCE(SUM(outstanding_balance),0) AS outstanding FROM client_balances WHERE tenant_id=$1`),
    q(`SELECT COALESCE(SUM(remaining),0) AS lease_debt FROM vehicle_amortization_progress WHERE tenant_id=$1`),
    q(`SELECT COALESCE(SUM(cash_amount+card_amount),0) AS today FROM daily_income WHERE tenant_id=$1 AND income_date=CURRENT_DATE`),
    q(`SELECT COALESCE(SUM(cash_amount+card_amount),0) AS month_income FROM daily_income WHERE tenant_id=$1 AND date_trunc('month',income_date)=date_trunc('month',CURRENT_DATE)`),
    q(`SELECT COALESCE(SUM(amount),0) AS month_expense FROM invoices WHERE tenant_id=$1 AND date_trunc('month',due_date)=date_trunc('month',CURRENT_DATE)`),
    q(`SELECT cb.id, cb.name, cb.open_balance, COALESCE(dn.due_now, 0) AS due_now
       FROM company_balances cb
       LEFT JOIN (
         SELECT company_id, SUM(${DUE_NOW_EXPR}) AS due_now
         FROM invoices WHERE tenant_id=$1 AND status!='paid' AND company_id IS NOT NULL
         GROUP BY company_id
       ) dn ON dn.company_id = cb.id
       WHERE cb.tenant_id=$1 AND cb.open_balance>0
       ORDER BY cb.open_balance DESC LIMIT 5`),
    q(`SELECT id, name, outstanding_balance FROM client_balances WHERE tenant_id=$1 AND outstanding_balance>0 ORDER BY outstanding_balance DESC LIMIT 5`),
    q(`SELECT COUNT(*)::int AS overdue FROM client_invoices WHERE tenant_id=$1 AND status IN ('sent','partial','overdue') AND due_date < CURRENT_DATE`),
    q(`SELECT description, due_date, amount FROM invoices WHERE tenant_id=$1 AND status!='paid' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' ORDER BY due_date LIMIT 10`),
    q(`SELECT plate, make, model, net_pnl FROM vehicle_pnl WHERE tenant_id=$1 AND month=date_trunc('month',CURRENT_DATE) ORDER BY net_pnl DESC`),
    q(`SELECT income_date::text AS date, cash_amount+card_amount AS income FROM daily_income WHERE tenant_id=$1 AND income_date >= CURRENT_DATE - INTERVAL '30 days' ORDER BY income_date`),
  ]);

  const income = Number(monthIncome[0].month_income);
  const expense = Number(monthExpense[0].month_expense);
  return {
    openPayables: Number(payables[0].open_payables),
    dueNowPayables: Number(dueNow[0].due_now),
    outstandingReceivables: Number(receivables[0].outstanding),
    leaseDebt: Number(leaseDebt[0].lease_debt),
    todayIncome: Number(dailyToday[0].today),
    monthIncome: income,
    monthExpense: expense,
    netProfit: income - expense,
    topOwed,
    topOwing,
    overdueClients: overdueClients[0].overdue,
    upcoming,
    bestVehicle: bestWorst[0] || null,
    worstVehicle: bestWorst[bestWorst.length - 1] || null,
    cashFlow,
  };
}

export async function reminders(tenantId) {
  const q = (sql) => query(sql, [tenantId]).then((r) => r.rows);
  const [leases, overdue, salaries, recurring] = await Promise.all([
    q(`SELECT description, due_date, amount FROM invoices WHERE tenant_id=${'$1'} AND status!='paid' AND source='amortization' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`),
    q(`SELECT invoice_number, due_date, (amount - paid_amount) AS owed, company_id FROM client_invoices WHERE tenant_id=$1 AND status IN ('sent','partial','overdue') AND due_date < CURRENT_DATE`),
    q(`SELECT description, due_date, amount FROM invoices WHERE tenant_id=$1 AND status!='paid' AND source='salary' AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`),
    q(`SELECT description, day_of_month FROM recurring_templates WHERE tenant_id=$1 AND active=true AND day_of_month = EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '1 day')::int`),
  ]);
  const items = [
    ...leases.map((r) => ({ type: 'lease', text: `Lease "${r.description}" due ${r.due_date}`, amount: r.amount })),
    ...overdue.map((r) => ({ type: 'overdue', text: `Client invoice ${r.invoice_number} overdue (due ${r.due_date})`, amount: r.owed })),
    ...salaries.map((r) => ({ type: 'salary', text: `Salary "${r.description}" due ${r.due_date}`, amount: r.amount })),
    ...recurring.map((r) => ({ type: 'recurring', text: `Recurring "${r.description}" generates tomorrow` })),
  ];
  return { count: items.length, items };
}

export async function calendar(tenantId, month) {
  // month = 'YYYY-MM'; default current
  const m = month || new Date().toISOString().slice(0, 7);
  const { rows: payable } = await query(
    `SELECT id, description, due_date::text AS date, amount, 'payable' AS kind FROM invoices
     WHERE tenant_id=$1 AND to_char(due_date,'YYYY-MM')=$2`,
    [tenantId, m],
  );
  const { rows: receivable } = await query(
    `SELECT id, description, due_date::text AS date, amount, 'receivable' AS kind FROM client_invoices
     WHERE tenant_id=$1 AND to_char(due_date,'YYYY-MM')=$2 AND status != 'draft'`,
    [tenantId, m],
  );
  const { rows: recurring } = await query(
    `SELECT id, description, day_of_month, amount, 'recurring' AS kind FROM recurring_templates
     WHERE tenant_id=$1 AND active=true`,
    [tenantId],
  );
  const recurringEvents = recurring.map((r) => ({
    ...r,
    date: `${m}-${String(r.day_of_month).padStart(2, '0')}`,
  }));
  return [...payable, ...receivable, ...recurringEvents];
}

export async function search(tenantId, term) {
  if (!term) return { vehicles: [], companies: [], invoices: [] };
  const like = `%${term}%`;
  const [vehicles, companies, invoices] = await Promise.all([
    query(`SELECT id, plate, make, model FROM vehicles WHERE tenant_id=$1 AND plate ILIKE $2 LIMIT 8`, [tenantId, like]).then((r) => r.rows),
    query(`SELECT id, name, phone FROM companies WHERE tenant_id=$1 AND (name ILIKE $2 OR phone ILIKE $2) LIMIT 8`, [tenantId, like]).then((r) => r.rows),
    query(`SELECT id, invoice_number, description FROM invoices WHERE tenant_id=$1 AND invoice_number ILIKE $2 LIMIT 8`, [tenantId, like]).then((r) => r.rows),
  ]);
  return { vehicles, companies, invoices };
}

// ── Reports ──────────────────────────────────────────────────
export function cashFlowReport(tenantId, from, to) {
  return query(
    `SELECT income_date::text AS date, cash_amount, card_amount FROM daily_income
     WHERE tenant_id=$1 AND income_date BETWEEN $2 AND $3 ORDER BY income_date`,
    [tenantId, from || '1900-01-01', to || '2999-01-01'],
  ).then((r) => r.rows);
}
export function outstandingVendors(tenantId) {
  return query(`SELECT * FROM company_balances WHERE tenant_id=$1 AND open_balance>0 ORDER BY open_balance DESC`, [tenantId]).then((r) => r.rows);
}
export function outstandingClients(tenantId) {
  return query(`SELECT * FROM client_balances WHERE tenant_id=$1 AND outstanding_balance>0 ORDER BY outstanding_balance DESC`, [tenantId]).then((r) => r.rows);
}
export function fleetAmortization(tenantId) {
  return query(
    `SELECT vap.*, ap.currency, ap.monthly_amount, c.name AS leasing_company
     FROM vehicle_amortization_progress vap
     JOIN amortization_plans ap ON ap.id = vap.plan_id
     JOIN companies c ON c.id = ap.company_id
     WHERE vap.tenant_id=$1 ORDER BY vap.remaining DESC`,
    [tenantId],
  ).then((r) => r.rows);
}
export function vehicleUtilization(tenantId) {
  return query(
    `SELECT * FROM vehicle_pnl WHERE tenant_id=$1 AND month IS NOT NULL ORDER BY month DESC, plate`,
    [tenantId],
  ).then((r) => r.rows);
}

// Vehicle Cost Report — total expenses per plate (optional date range).
export function vehicleCost(tenantId, from, to) {
  return query(
    `SELECT v.plate, v.make, v.model,
            COUNT(i.id)::int AS invoice_count,
            COALESCE(SUM(i.amount),0) AS total_expenses
     FROM vehicles v
     LEFT JOIN invoices i ON i.vehicle_id = v.id AND i.tenant_id = v.tenant_id
       AND i.due_date BETWEEN $2 AND $3
     WHERE v.tenant_id = $1
     GROUP BY v.id, v.plate, v.make, v.model
     ORDER BY total_expenses DESC`,
    [tenantId, from || '1900-01-01', to || '2999-01-01'],
  ).then((r) => r.rows);
}

// Salary Report — worker salary invoices for the current month (paid/unpaid).
export function salaryReport(tenantId) {
  return query(
    `SELECT w.name AS worker, w.position, i.description, i.amount, i.paid_amount,
            i.status, i.due_date
     FROM invoices i JOIN workers w ON w.id = i.worker_id
     WHERE i.tenant_id = $1 AND i.source = 'salary'
       AND date_trunc('month', i.due_date) = date_trunc('month', CURRENT_DATE)
     ORDER BY w.name`,
    [tenantId],
  ).then((r) => r.rows);
}

// Upcoming Payments — everything due in the next N days (lease/salary/recurring/client).
export async function upcomingPayments(tenantId, days = 30) {
  const payables = (await query(
    `SELECT 'payable' AS kind, description, due_date, (amount - paid_amount) AS amount
     FROM invoices WHERE tenant_id=$1 AND status != 'paid'
       AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
    [tenantId, String(days)],
  )).rows;
  const receivables = (await query(
    `SELECT 'receivable' AS kind, description, due_date, (amount - paid_amount) AS amount
     FROM client_invoices WHERE tenant_id=$1 AND status NOT IN ('draft','paid','cancelled')
       AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::interval`,
    [tenantId, String(days)],
  )).rows;
  return [...payables, ...receivables].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
}

// ── Due Payments by month, grouped by company ──────────────────────────────
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function ymAdd(dateStr, n) { const d = new Date(dateStr); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }

// Expand one payable invoice into the schedule rows that fall inside [start,end].
function expandMonth(inv, start, end) {
  const kind = inv.source === 'amortization' ? 'lease' : (inv.installment_count > 1 ? 'installment' : 'invoice');
  const rows = [];
  if (inv.installment_count && inv.installment_count > 1) {
    const count = inv.installment_count;
    const total = r2(Number(inv.amount));
    const per = Math.round(total / count);          // whole-denar, last absorbs remainder
    const paidAmt = Number(inv.paid_amount);
    let cumulative = 0;
    for (let k = 0; k < count; k++) {
      const amount = k === count - 1 ? r2(total - per * (count - 1)) : per;
      cumulative = r2(cumulative + amount);
      const mo = ymAdd(inv.due_date, k);
      if (mo >= start && mo <= end) {
        rows.push({ kind, label: `${inv.description} · ${k + 1}/${count}`, category: inv.category, month: mo, amount, payAmount: amount, paid: cumulative <= paidAmt + 0.001 });
      }
    }
  } else {
    const mo = String(inv.due_date).slice(0, 10);
    if (mo >= start && mo <= end) {
      const remaining = r2(Number(inv.amount) - Number(inv.paid_amount));
      rows.push({ kind, label: inv.description, category: inv.category, month: mo, amount: r2(Number(inv.amount)), payAmount: remaining, paid: inv.status === 'paid' });
    }
  }
  return rows;
}

/**
 * Everything payable in a given month (YYYY-MM), grouped by company/worker.
 * Installment plans and leases are expanded to the month's installment; regular
 * invoices land on their due date. Each group carries lease / installment /
 * other subtotals plus a due total, and each row keeps its invoiceId + payAmount
 * so it can be marked paid straight from the report.
 */
export async function duePayments(tenantId, month) {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
  const monthStart = `${m}-01`;
  const [yy, mm] = m.split('-').map(Number);
  const monthEnd = new Date(yy, mm, 0).toISOString().slice(0, 10);

  const { rows: invoices } = await query(
    `SELECT i.id, i.company_id, i.worker_id, COALESCE(c.name, w.name) AS party_name,
            (i.worker_id IS NOT NULL) AS is_worker,
            i.description, i.amount, i.paid_amount, i.due_date, i.status, i.source,
            i.category, i.installment_count
     FROM invoices i
     LEFT JOIN companies c ON c.id = i.company_id
     LEFT JOIN workers w ON w.id = i.worker_id
     WHERE i.tenant_id = $1`,
    [tenantId],
  );

  const groups = new Map();
  for (const inv of invoices) {
    const rows = expandMonth(inv, monthStart, monthEnd);
    if (!rows.length) continue;
    const key = inv.company_id ? `c${inv.company_id}` : `w${inv.worker_id}`;
    if (!groups.has(key)) {
      groups.set(key, { id: inv.company_id || inv.worker_id, party_name: inv.party_name || '—', is_worker: inv.is_worker, items: [] });
    }
    for (const row of rows) groups.get(key).items.push({ invoiceId: inv.id, ...row });
  }

  const companies = [...groups.values()].map((g) => {
    const sum = (pred) => r2(g.items.filter(pred).reduce((s, x) => s + x.payAmount, 0));
    return {
      id: g.id, party_name: g.party_name, is_worker: g.is_worker,
      leaseTotal: sum((x) => x.kind === 'lease' && !x.paid),
      installmentTotal: sum((x) => x.kind === 'installment' && !x.paid),
      invoiceTotal: sum((x) => x.kind === 'invoice' && !x.paid),
      dueTotal: sum((x) => !x.paid),
      paidTotal: sum((x) => x.paid),
      items: g.items.sort((a, b) => new Date(a.month) - new Date(b.month)),
    };
  }).sort((a, b) => b.dueTotal - a.dueTotal);

  return {
    month: m, monthStart, monthEnd, companies,
    grandDue: r2(companies.reduce((s, c) => s + c.dueTotal, 0)),
    grandPaid: r2(companies.reduce((s, c) => s + c.paidTotal, 0)),
    grandLease: r2(companies.reduce((s, c) => s + c.leaseTotal, 0)),
    grandInstallment: r2(companies.reduce((s, c) => s + c.installmentTotal, 0)),
  };
}

// Company Statement — full vendor ledger for one company (printable).
export async function companyStatement(tenantId, companyId) {
  const company = (await query(`SELECT * FROM companies WHERE tenant_id=$1 AND id=$2`, [tenantId, companyId])).rows[0];
  const invoices = (await query(
    `SELECT 'invoice' AS entry, description, due_date AS date, amount, paid_amount, status
     FROM invoices WHERE tenant_id=$1 AND company_id=$2 ORDER BY due_date`,
    [tenantId, companyId],
  )).rows;
  const payments = (await query(
    `SELECT 'payment' AS entry, note AS description, paid_at AS date, amount, method
     FROM payments WHERE tenant_id=$1 AND company_id=$2 ORDER BY paid_at`,
    [tenantId, companyId],
  )).rows;
  const totals = (await query(`SELECT * FROM company_balances WHERE tenant_id=$1 AND id=$2`, [tenantId, companyId])).rows[0];
  return { company, totals, invoices, payments };
}

// Client Statement — full receivables ledger for one client (printable).
export async function clientStatement(tenantId, companyId) {
  const company = (await query(`SELECT * FROM companies WHERE tenant_id=$1 AND id=$2`, [tenantId, companyId])).rows[0];
  const invoices = (await query(
    `SELECT invoice_number, description, issue_date, due_date, amount, paid_amount, status
     FROM client_invoices WHERE tenant_id=$1 AND company_id=$2 ORDER BY issue_date`,
    [tenantId, companyId],
  )).rows;
  const payments = (await query(
    `SELECT amount, method, paid_at, note FROM client_payments WHERE tenant_id=$1 AND company_id=$2 ORDER BY paid_at`,
    [tenantId, companyId],
  )).rows;
  const totals = (await query(`SELECT * FROM client_balances WHERE tenant_id=$1 AND id=$2`, [tenantId, companyId])).rows[0];
  return { company, totals, invoices, payments };
}
