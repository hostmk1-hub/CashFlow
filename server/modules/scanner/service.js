import { query } from '../../shared/db.js';
import { getEurRate } from '../../shared/currency.js';
import { scanInvoiceDocument, scanAmortizationDocument } from '../../services/geminiService.js';
import { saveScan } from '../../services/fileStorage.js';
import { ApiError } from '../../shared/http.js';
import * as invoiceService from '../invoices/service.js';

const PLATE_REGEX = /\b([A-Z]{2})[\s-]?(\d{3,4})[\s-]?([A-Z]{1,2})\b/g;

/** Find a known plate inside free text (matches the doc's plate-matching logic). */
export function findPlateMatch(text, knownPlates) {
  if (!text) return null;
  const candidates = [...String(text).toUpperCase().matchAll(PLATE_REGEX)].map(
    (m) => `${m[1]}${m[2]}${m[3]}`,
  );
  return (
    knownPlates.find((p) => candidates.includes(p.replace(/[\s-]/g, '').toUpperCase())) || null
  );
}

/** Simple case-insensitive substring similarity that works on Cyrillic (UTF-16). */
function fuzzyCompanyMatch(name, companies) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  let best = null;
  for (const c of companies) {
    const cn = c.name.toLowerCase().trim();
    if (cn === n) return c;
    if (cn.includes(n) || n.includes(cn)) best = best || c;
  }
  return best;
}

export async function scanInvoice(tenantId, file) {
  if (!file) throw new ApiError(400, 'No file uploaded');
  const extracted = await scanInvoiceDocument(tenantId, file);

  // Persist the original scan (local + R2) so it can be downloaded later.
  let saved = { scan_url: null };
  try { saved = await saveScan(tenantId, file); } catch (e) { console.error('[scan] save failed:', e.message); }

  const vehicles = (await query(`SELECT id, plate FROM vehicles WHERE tenant_id = $1 AND active = true`, [tenantId])).rows;
  const companies = (await query(`SELECT id, name FROM companies WHERE tenant_id = $1 AND active = true`, [tenantId])).rows;

  const searchText = `${extracted.detected_plate || ''} ${extracted.description || ''} ${extracted.vendor_name || ''}`;
  const matchedPlate = extracted.detected_plate
    ? findPlateMatch(extracted.detected_plate, vehicles.map((v) => v.plate)) ||
      findPlateMatch(searchText, vehicles.map((v) => v.plate))
    : findPlateMatch(searchText, vehicles.map((v) => v.plate));
  const matchedVehicle = matchedPlate ? vehicles.find((v) => v.plate.replace(/[\s-]/g, '').toUpperCase() === matchedPlate.replace(/[\s-]/g, '').toUpperCase()) : null;
  const matchedCompany = fuzzyCompanyMatch(extracted.vendor_name, companies);

  const rate = await getEurRate(tenantId);
  return {
    invoice_number: extracted.invoice_number ?? null,
    description: extracted.description ?? null,
    amount: extracted.amount ?? null,
    currency: (extracted.currency || 'MKD').toUpperCase() === 'EUR' ? 'EUR' : 'MKD',
    exchange_rate: rate,
    date: extracted.date ?? null,
    vendor_name: extracted.vendor_name ?? null,
    detected_plate: extracted.detected_plate ?? matchedPlate ?? null,
    matched_vehicle_id: matchedVehicle?.id ?? null,
    matched_company_id: matchedCompany?.id ?? null,
    scan_url: saved.scan_url,
    _raw: extracted._raw,
  };
}

export async function confirmInvoice(tenantId, draft, fileUrl) {
  return invoiceService.create(tenantId, {
    company_id: draft.matched_company_id,
    vehicle_id: draft.matched_vehicle_id,
    invoice_number: draft.invoice_number,
    description: draft.description || 'Scanned invoice',
    amount: draft.amount,
    due_date: draft.date || new Date().toISOString().slice(0, 10),
    currency: draft.currency,
    exchange_rate: draft.exchange_rate,
    installments: draft.installments,   // pay a scanned invoice over N months
    category: draft.category || null,
    source: 'scanned',
    scanned: true,
    scan_url: draft.scan_url || fileUrl || null,
  });
}

export async function scanAmortization(tenantId, file) {
  if (!file) throw new ApiError(400, 'No file uploaded');
  const extracted = await scanAmortizationDocument(tenantId, file);
  const rate = await getEurRate(tenantId);
  return {
    total_amount: extracted.total_amount ?? null,
    down_payment: extracted.down_payment ?? 0,
    monthly_amount: extracted.monthly_amount ?? null,
    months_total: extracted.months_total ?? null,
    interest_rate: extracted.interest_rate ?? null,
    start_date: extracted.start_date ?? null,
    currency: (extracted.currency || 'MKD').toUpperCase() === 'EUR' ? 'EUR' : 'MKD',
    exchange_rate: rate,
    _raw: extracted._raw,
  };
}
