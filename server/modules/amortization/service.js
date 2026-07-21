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
  const money = toMkd({
    amount: input.monthly_amount,
    currency: input.currency,
    exchangeRate: input.exchange_rate,
  });
  const total = toMkd({ amount: input.total_amount, currency: input.currency, exchangeRate: money.exchangeRate });

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO amortization_plans
        (tenant_id, vehicle_id, company_id, total_amount, down_payment, monthly_amount,
         months_total, interest_rate, start_date, scan_url, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [tenantId, input.vehicle_id, input.company_id, total.amount,
       toMkd({ amount: input.down_payment || 0, currency: input.currency, exchangeRate: money.exchangeRate }).amount,
       money.amount, input.months_total, input.interest_rate ?? null, input.start_date,
       input.scan_url || null, money.currency, money.exchangeRate],
    );
    const plan = rows[0];

    const invoices = [];
    if (input.generate_invoices) {
      for (let m = 0; m < input.months_total; m++) {
        const inv = await invoiceRepo.create(
          tenantId,
          {
            company_id: input.company_id,
            vehicle_id: input.vehicle_id,
            amort_plan_id: plan.id,
            description: `Lease installment ${m + 1}/${input.months_total}`,
            amount: money.amount,
            due_date: addMonths(input.start_date, m),
            source: 'amortization',
            currency: money.currency,
            original_amount: money.originalAmount,
            exchange_rate: money.exchangeRate,
          },
          client,
        );
        invoices.push(inv);
      }
    }
    return { plan, invoicesGenerated: invoices.length };
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
