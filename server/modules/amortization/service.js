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
  const down = toMkd({ amount: input.down_payment || 0, currency: input.currency, exchangeRate: money.exchangeRate });
  const purchase = input.purchase_price
    ? toMkd({ amount: input.purchase_price, currency: input.currency, exchangeRate: money.exchangeRate })
    : null;

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO amortization_plans
        (tenant_id, vehicle_id, company_id, total_amount, down_payment, monthly_amount,
         months_total, interest_rate, start_date, scan_url, currency, exchange_rate, purchase_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [tenantId, input.vehicle_id, input.company_id, total.amount, down.amount,
       money.amount, input.months_total, input.interest_rate ?? null, input.start_date,
       input.scan_url || null, money.currency, money.exchangeRate, purchase ? purchase.amount : null],
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
            category: 'leasing',
            currency: money.currency,
            original_amount: money.originalAmount,
            exchange_rate: money.exchangeRate,
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
          due_date: input.start_date,
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
          [tenantId, input.company_id, down.amount, input.start_date, down.currency, down.originalAmount, down.exchangeRate],
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
 * Confirm a scanned draft → same as create. Draft comes from the Gemini scan.
 */
export function confirm(tenantId, input) {
  if (!input.vehicle_id || !input.company_id)
    throw new ApiError(400, 'vehicle_id and company_id are required to confirm a plan');
  return create(tenantId, input);
}
