import { query } from '../../shared/db.js';

export async function dashboard(tenantId) {
  const q = (sql, params = [tenantId]) => query(sql, params).then((r) => r.rows);

  const [
    payables, receivables, leaseDebt, dailyToday, monthIncome, monthExpense,
    topOwed, topOwing, overdueClients, upcoming, bestWorst, cashFlow,
  ] = await Promise.all([
    q(`SELECT COALESCE(SUM(amount - paid_amount),0) AS open_payables FROM invoices WHERE tenant_id=$1 AND status!='paid'`),
    q(`SELECT COALESCE(SUM(outstanding_balance),0) AS outstanding FROM client_balances WHERE tenant_id=$1`),
    q(`SELECT COALESCE(SUM(remaining),0) AS lease_debt FROM vehicle_amortization_progress WHERE tenant_id=$1`),
    q(`SELECT COALESCE(SUM(cash_amount+card_amount),0) AS today FROM daily_income WHERE tenant_id=$1 AND income_date=CURRENT_DATE`),
    q(`SELECT COALESCE(SUM(cash_amount+card_amount),0) AS month_income FROM daily_income WHERE tenant_id=$1 AND date_trunc('month',income_date)=date_trunc('month',CURRENT_DATE)`),
    q(`SELECT COALESCE(SUM(amount),0) AS month_expense FROM invoices WHERE tenant_id=$1 AND date_trunc('month',due_date)=date_trunc('month',CURRENT_DATE)`),
    q(`SELECT id, name, open_balance FROM company_balances WHERE tenant_id=$1 AND open_balance>0 ORDER BY open_balance DESC LIMIT 5`),
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
