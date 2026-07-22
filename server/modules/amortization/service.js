import { withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import * as invoiceRepo from '../invoices/repository.js';

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Create an amortization plan and (optionally) generate one open invoice per
 * monthly installment, linked to the vehicle + leasing company. Runs in one tx.
 */
export async function create(tenantId, input) {
  const currency = input.currency;
  // Schedule fields may be absent (lease saved with just its identity); compute
  // MKD figures only for the ones provided.
  const monthly = input.monthly_amount != null ? toMkd({ amount: input.monthly_amount, currency, exchangeRate: input.exchange_rate }) : null;
  const xr = monthly?.exchangeRate ?? input.exchange_rate ?? 1;
  const total = input.total_amount != null ? toMkd({ amount: input.total_amount, currency, exchangeRate: xr }) : null;
  const down = input.down_payment > 0 ? toMkd({ amount: input.down_payment, currency, exchangeRate: xr }) : { amount: 0, currency, originalAmount: null, exchangeRate: xr };
  const purchase = input.purchase_price != null ? toMkd({ amount: input.purchase_price, currency, exchangeRate: xr }) : null;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO amortization_plans
        (tenant_id, vehicle_id, company_id, total_amount, down_payment, monthly_amount,
         months_total, interest_rate, start_date, scan_url, currency, exchange_rate, purchase_price, lease_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [tenantId, input.vehicle_id, input.company_id, total ? total.amount : null, down.amount,
       monthly ? monthly.amount : null, input.months_total ?? null, input.interest_rate ?? null, input.start_date ?? null,
       input.scan_url || null, currency, xr, purchase ? purchase.amount : null,
       input.lease_number || null],
    );
    const plan = rows[0];

    const invoices = [];
    // Only generate installments when the full schedule is present.
    if (input.generate_invoices && monthly && input.months_total && input.start_date) {
      for (let m = 0; m < input.months_total; m++) {
        const inv = await invoiceRepo.create(
          tenantId,
          {
            company_id: input.company_id,
            vehicle_id: input.vehicle_id,
            amort_plan_id: plan.id,
            description: `Lease installment ${m + 1}/${input.months_total}`,
            amount: monthly.amount,
            due_date: addMonths(input.start_date, m),
            source: 'amortization',
            category: 'leasing',
            currency: monthly.currency,
            original_amount: monthly.originalAmount,
            exchange_rate: monthly.exchangeRate,
          },
          client,
        );
        invoices.push(inv);
      }
    }

    // Record the down payment / first payment. When it's a prepayment (default:
    // paid before taking the car), create a matching invoice AND settle it with a
    // payment so it shows in the vehicle's expenses and the leasing company's
    // ledger as already paid. amort_plan_id is left NULL so the amortization
    // progress view (which adds plan.down_payment separately) doesn't double-count.
    let downPaymentInvoice = null;
    if (down.amount > 0) {
      const prepaid = input.down_payment_paid !== false;
      const inv = await invoiceRepo.create(
        tenantId,
        {
          company_id: input.company_id,
          vehicle_id: input.vehicle_id,
          amort_plan_id: null,
          description: 'Down payment (first payment)',
          amount: down.amount,
          due_date: input.start_date || new Date().toISOString().slice(0, 10),
          source: 'amortization',
          category: 'leasing',
          currency: down.currency,
          original_amount: down.originalAmount,
          exchange_rate: down.exchangeRate,
        },
        client,
      );
      if (prepaid) {
        const pay = await client.query(
          `INSERT INTO payments (tenant_id, company_id, amount, method, paid_at, currency, original_amount, exchange_rate, note)
           VALUES ($1,$2,$3,'bank',$4,$5,$6,$7,'Down payment (prepaid before taking the car)') RETURNING id`,
          [tenantId, input.company_id, down.amount, input.start_date || new Date().toISOString().slice(0, 10), down.currency, down.originalAmount, down.exchangeRate],
        );
        await client.query(`INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1,$2,$3)`, [pay.rows[0].id, inv.id, down.amount]);
        await client.query(`UPDATE invoices SET paid_amount = amount, status = 'paid' WHERE id = $1`, [inv.id]);
      }
      downPaymentInvoice = { id: inv.id, amount: down.amount, paid: prepaid };
    }

    return { plan, invoicesGenerated: invoices.length, downPaymentInvoice };
  });
}

/**
 * Edit a lease plan's details — leasing company, contract number, car price,
 * amounts, term. Keeps the generated installment invoices in sync: they move to
 * the new leasing company, and the monthly amount is updated on installments
 * that are still fully unpaid (paid ones are left untouched). Changing the term
 * length does not add/remove installments.
 */
export async function update(tenantId, planId, input) {
  const currency = input.currency;
  const monthly = input.monthly_amount != null ? toMkd({ amount: input.monthly_amount, currency, exchangeRate: input.exchange_rate }) : null;
  const xr = monthly?.exchangeRate ?? input.exchange_rate ?? 1;
  const total = input.total_amount != null ? toMkd({ amount: input.total_amount, currency, exchangeRate: xr }) : null;
  const purchase = input.purchase_price != null ? toMkd({ amount: input.purchase_price, currency, exchangeRate: xr }) : null;
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM amortization_plans WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, planId],
    );
    if (!rows[0]) throw new ApiError(404, 'Lease plan not found');
    const updated = await client.query(
      `UPDATE amortization_plans SET
         company_id = $3, total_amount = $4, monthly_amount = $5, months_total = $6,
         interest_rate = $7, start_date = $8, currency = $9, exchange_rate = $10,
         purchase_price = $11, lease_number = $12
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, planId, input.company_id, total ? total.amount : null, monthly ? monthly.amount : null,
       input.months_total ?? null, input.interest_rate ?? null, input.start_date ?? null, currency, xr,
       purchase ? purchase.amount : null, input.lease_number || null],
    );
    // Move the generated installment invoices to the (possibly new) leasing company.
    await client.query(
      `UPDATE invoices SET company_id = $3 WHERE tenant_id = $1 AND amort_plan_id = $2`,
      [tenantId, planId, input.company_id],
    );
    // Update the monthly amount only on unpaid installments — and only when a
    // monthly amount is actually set (never null out an invoice's amount).
    if (monthly) {
      await client.query(
        `UPDATE invoices SET amount = $3, original_amount = $4, currency = $5, exchange_rate = $6
         WHERE tenant_id = $1 AND amort_plan_id = $2 AND paid_amount = 0`,
        [tenantId, planId, monthly.amount, monthly.originalAmount ?? null, monthly.currency, monthly.exchangeRate],
      );
    }
    return updated.rows[0];
  });
}

/**
 * Delete a lease/amortization plan and its generated installment invoices —
 * but only if none of those installments have been paid. Paid installments must
 * have their payments removed first, so nothing is silently orphaned.
 */
export async function remove(tenantId, planId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id FROM amortization_plans WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, planId],
    );
    if (!rows[0]) throw new ApiError(404, 'Lease plan not found');
    const paid = await client.query(
      `SELECT 1 FROM invoices i
       WHERE i.tenant_id = $1 AND i.amort_plan_id = $2
         AND (i.paid_amount > 0.001 OR EXISTS (SELECT 1 FROM payment_allocations pa WHERE pa.invoice_id = i.id))
       LIMIT 1`,
      [tenantId, planId],
    );
    if (paid.rows.length) {
      throw new ApiError(409, 'Some lease installments have payments recorded. Delete those payments first, then delete the lease plan.');
    }
    await client.query(`DELETE FROM invoices WHERE tenant_id = $1 AND amort_plan_id = $2`, [tenantId, planId]);
    await client.query(`DELETE FROM amortization_plans WHERE tenant_id = $1 AND id = $2`, [tenantId, planId]);
    return { ok: true, id: Number(planId) };
  });
}

/**
 * Confirm a scanned draft → same as create. Draft comes from the Gemini scan.
 */
export function confirm(tenantId, input) {
  if (!input.vehicle_id || !input.company_id)
    throw new ApiError(400, 'vehicle_id and company_id are required to confirm a plan');
  return create(tenantId, input);
}
