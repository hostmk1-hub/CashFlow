import { withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import { brojVoBukvi } from '../../shared/brojVoBukvi.js';
import { generateClientInvoicePdfBuffer } from '../../services/pdfService.js';
import * as repo from './repository.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Compute per-line VAT/total and net/vat/grand totals in the invoice currency. */
function computeTotals(items, vatEnabled) {
  let net = 0;
  let vat = 0;
  const rows = items.map((it, i) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unit_price) || 0;
    const base = round2(qty * price);
    const rate = vatEnabled ? Number(it.vat_rate) || 0 : 0;
    const vatAmt = round2((base * rate) / 100);
    net = round2(net + base);
    vat = round2(vat + vatAmt);
    return {
      position: i + 1,
      description: it.description,
      quantity: qty,
      unit_price: price,
      vat_rate: rate,
      vat_amount: vatAmt,
      total: round2(base + vatAmt),
    };
  });
  return { rows, net, vat, grand: round2(net + vat) };
}

/** Normalize the incoming payload into { header, items } ready for persistence. */
function buildInvoice(input, existing = null) {
  const currency = input.currency ?? existing?.currency ?? 'MKD';
  const vatEnabled = input.vat_enabled ?? existing?.vat_enabled ?? false;
  const defaultRate = input.vat_rate ?? existing?.vat_rate ?? 18;

  // Line items (rich) or a single legacy {description, amount} line.
  let rawItems = input.items;
  if (!rawItems || rawItems.length === 0) {
    if (input.description && input.amount != null) {
      rawItems = [{ description: input.description, quantity: 1, unit_price: input.amount, vat_rate: vatEnabled ? defaultRate : 0 }];
    } else {
      throw new ApiError(400, 'Add at least one line item.');
    }
  }
  const { rows, net, vat, grand } = computeTotals(rawItems, vatEnabled);
  if (grand <= 0) throw new ApiError(400, 'Invoice total must be greater than zero.');

  const money = toMkd({ amount: grand, currency, exchangeRate: input.exchange_rate ?? existing?.exchange_rate });
  const words = input.amount_in_words?.trim() || brojVoBukvi(grand);
  const issue_date = input.issue_date ?? existing?.issue_date;
  const due_date = input.due_date || issue_date;

  return {
    header: {
      company_id: input.company_id ?? existing?.company_id,
      vehicle_id: input.vehicle_id ?? existing?.vehicle_id ?? null,
      description: String(rows[0].description).slice(0, 300),
      amount: money.amount,                 // MKD-equivalent for the ledger
      currency,
      original_amount: grand,               // grand total in the invoice currency (shown on PDF)
      exchange_rate: money.exchangeRate,
      issue_date,
      due_date,
      vat_enabled: vatEnabled,
      vat_rate: defaultRate,
      net_amount: net,                      // invoice-currency net / VAT for the PDF
      vat_amount: vat,
      amount_in_words: words,
      notes: input.notes ?? existing?.notes ?? null,
    },
    items: rows,
  };
}

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const ci = await repo.getById(tenantId, id);
  if (!ci) throw new ApiError(404, 'Invoice not found');
  ci.items = await repo.itemsFor(tenantId, id);
  return ci;
}

export async function create(tenantId, input) {
  const { header, items } = buildInvoice(input);
  const status = input.status || (input.send ? 'sent' : 'draft');
  const paid = status === 'paid';

  return withTransaction(async (client) => {
    let number = input.invoice_number?.trim();
    if (number) {
      if (await repo.numberExists(tenantId, number)) throw new ApiError(409, `Invoice number ${number} already exists.`);
    } else {
      number = await repo.nextInvoiceNumber(client, tenantId);
    }
    const inv = await repo.insertHeader(client, tenantId, {
      ...header,
      invoice_number: number,
      status,
      paid_amount: paid ? header.amount : 0,
      paid_at: paid ? today() : null,
    });
    for (const it of items) await repo.insertItem(client, tenantId, inv.id, it);
    inv.items = items;
    return inv;
  });
}

export async function update(tenantId, id, input) {
  const existing = await getById(tenantId, id);
  const hasAlloc = await repo.hasAllocations(tenantId, id);
  const { header, items } = buildInvoice(input, existing);

  if (hasAlloc && header.amount < Number(existing.paid_amount) - 0.01) {
    throw new ApiError(400, `Amount can't be less than the ${existing.paid_amount} already received on this invoice.`);
  }

  return withTransaction(async (client) => {
    const number = input.invoice_number?.trim() || existing.invoice_number;
    if (number !== existing.invoice_number && (await repo.numberExists(tenantId, number, id))) {
      throw new ApiError(409, `Invoice number ${number} already exists.`);
    }
    // Recompute status from what's actually received (unless caller forces one).
    const paid = hasAlloc ? Number(existing.paid_amount) : existing.status === 'paid' ? header.amount : 0;
    let status = input.status ?? existing.status;
    if (!input.status) {
      if (paid >= header.amount - 0.01 && paid > 0) status = 'paid';
      else if (paid > 0.01) status = 'partial';
      else if (status === 'paid' || status === 'partial') status = 'sent';
    }
    const inv = await repo.updateHeader(client, tenantId, id, {
      ...header,
      invoice_number: number,
      status,
      paid_amount: !hasAlloc && status === 'paid' ? header.amount : undefined,
      paid_at: status === 'paid' ? existing.paid_at || today() : status === 'partial' ? existing.paid_at : null,
    });
    await repo.deleteItems(client, tenantId, id);
    for (const it of items) await repo.insertItem(client, tenantId, id, it);
    inv.items = items;
    return inv;
  });
}

/**
 * Mark an invoice paid / unpaid / cancelled from the manager. This is the
 * lightweight flag flow (no allocation) — invoices that have real recorded
 * client payments must be managed through Payments instead.
 */
export async function setStatus(tenantId, id, status) {
  const ci = await getById(tenantId, id);
  if (await repo.hasAllocations(tenantId, id)) {
    throw new ApiError(409, 'This invoice has payments recorded against it — change it from the Payments screen.');
  }
  const paid = status === 'paid';
  return withTransaction(async (client) =>
    repo.setStatus(client, tenantId, id, status, paid ? today() : null, paid ? Number(ci.amount) : 0),
  );
}

export async function duplicate(tenantId, id) {
  const src = await getById(tenantId, id);
  return withTransaction(async (client) => {
    const number = await repo.nextInvoiceNumber(client, tenantId);
    const inv = await repo.insertHeader(client, tenantId, {
      company_id: src.company_id,
      vehicle_id: src.vehicle_id,
      invoice_number: number,
      description: src.description,
      amount: src.amount,
      currency: src.currency,
      original_amount: src.original_amount,
      exchange_rate: src.exchange_rate,
      issue_date: today(),
      due_date: today(),
      status: 'draft',
      vat_enabled: src.vat_enabled,
      vat_rate: src.vat_rate,
      net_amount: src.net_amount,
      vat_amount: src.vat_amount,
      amount_in_words: src.amount_in_words,
      notes: src.notes,
      paid_amount: 0,
      paid_at: null,
    });
    for (const it of src.items) {
      await repo.insertItem(client, tenantId, inv.id, {
        position: it.position, description: it.description, quantity: it.quantity,
        unit_price: it.unit_price, vat_rate: it.vat_rate, vat_amount: it.vat_amount, total: it.total,
      });
    }
    return inv;
  });
}

export async function remove(tenantId, id) {
  const ci = await getById(tenantId, id);
  if (Number(ci.paid_amount) > 0.01 || (await repo.hasAllocations(tenantId, id))) {
    throw new ApiError(409, 'This invoice has payments recorded against it. Delete those payments first, or cancel the invoice.');
  }
  return withTransaction(async (client) => {
    await repo.remove(client, tenantId, id);
    return { ok: true, id: Number(id) };
  });
}

export async function send(tenantId, id) {
  const ci = await getById(tenantId, id);
  if (ci.status === 'cancelled') throw new ApiError(400, 'Cannot send a cancelled invoice');
  if (ci.status === 'draft') {
    await withTransaction(async (client) => repo.setStatus(client, tenantId, id, 'sent', null, null));
    ci.status = 'sent';
  }
  return ci;
}

/** Render the invoice PDF as a Buffer for streaming download. */
export async function pdf(tenantId, id) {
  const ci = await getById(tenantId, id);
  return { buffer: await generateClientInvoicePdfBuffer(tenantId, ci), filename: `Faktura-${ci.invoice_number}.pdf` };
}
