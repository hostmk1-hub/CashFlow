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
