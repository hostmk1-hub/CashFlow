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

// Macedonian Cyrillic → Latin, so a company saved as "MINT" matches an invoice
// that prints the vendor in Cyrillic ("МИНТ"). Longer digraphs would collide if
// applied after single letters, but these are all single Cyrillic code points.
const CYR2LAT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ѓ: 'gj', е: 'e', ж: 'zh', з: 'z', ѕ: 'dz',
  и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', ќ: 'kj', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', џ: 'dj', ш: 'sh',
};
function translit(s) {
  return String(s || '').toLowerCase().replace(/[Ѐ-ӿ]/g, (ch) => CYR2LAT[ch] ?? ch);
}
// Lowercased, transliterated, punctuation stripped to single spaces.
function normalizeName(s) {
  return translit(s).replace(/[^a-z0-9]+/g, ' ').trim();
}
// Legal-form / boilerplate words that shouldn't drive a company match.
const STOP = new Set([
  'ad', 'doo', 'dooel', 'ins', 'osiguritelno', 'brokersko', 'drustvo', 'akcionersko',
  'skopje', 'trgovsko', 'kompanija', 'import', 'export', 'company', 'llc', 'ltd', 'dic',
  'na', 'the', 'i', 'so', 'za', 'ce',
]);
function meaningfulTokens(s) {
  return normalizeName(s).split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * Match a detected vendor name to a known company. Transliterates Cyrillic to
 * Latin, then scores by: exact match, one compact name contained in the other,
 * or shared meaningful tokens (ignoring legal-form words like АД/ДОО/Скопје).
 * Returns the best company above a confidence floor, else null.
 */
function fuzzyCompanyMatch(name, companies) {
  if (!name) return null;
  const dNorm = normalizeName(name);
  const dCompact = dNorm.replace(/\s+/g, '');
  const dTokens = new Set(meaningfulTokens(name));
  let best = null;
  let bestScore = 0;
  for (const c of companies) {
    const cNorm = normalizeName(c.name);
    if (!cNorm) continue;
    const cCompact = cNorm.replace(/\s+/g, '');
    let score = 0;
    if (cNorm === dNorm) score = 100;
    else {
      if (cCompact.length >= 3 && dCompact.includes(cCompact)) score = 80;      // "mint" ⊂ detected
      else if (dCompact.length >= 3 && cCompact.includes(dCompact)) score = 70; // detected ⊂ company
      const shared = meaningfulTokens(c.name).filter((t) => dTokens.has(t));
      if (shared.length) {
        const tokenScore = 40 + shared.length * 10 + Math.max(...shared.map((t) => t.length));
        score = Math.max(score, tokenScore);
      }
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 40 ? best : null;
}

export async function scanInvoice(tenantId, file) {
  if (!file) throw new ApiError(400, 'No file uploaded');
  const { data: extracted, tier: aiTier, model: aiModel } = await scanInvoiceDocument(tenantId, file);

  // Persist the original scan (local + R2) so it can be downloaded later.
  let saved = { scan_url: null };
  try { saved = await saveScan(tenantId, file); } catch (e) { console.error('[scan] save failed:', e.message); }

  // Each vehicle with its latest lease/contract number, so a car with no plates
  // yet can still be matched by its lease number printed on the invoice.
  const vehicles = (await query(
    `SELECT v.id, v.plate,
            (SELECT lease_number FROM amortization_plans ap
             WHERE ap.vehicle_id = v.id AND ap.lease_number IS NOT NULL ORDER BY ap.id DESC LIMIT 1) AS lease_number
     FROM vehicles v WHERE v.tenant_id = $1 AND v.active = true`,
    [tenantId],
  )).rows;
  const companies = (await query(`SELECT id, name FROM companies WHERE tenant_id = $1 AND active = true`, [tenantId])).rows;

  const searchText = `${extracted.detected_plate || ''} ${extracted.description || ''} ${extracted.vendor_name || ''} ${extracted.invoice_number || ''} ${extracted.lease_number || ''}`;
  const matchedPlate = extracted.detected_plate
    ? findPlateMatch(extracted.detected_plate, vehicles.map((v) => v.plate)) ||
      findPlateMatch(searchText, vehicles.map((v) => v.plate))
    : findPlateMatch(searchText, vehicles.map((v) => v.plate));
  let matchedVehicle = matchedPlate ? vehicles.find((v) => v.plate.replace(/[\s-]/g, '').toUpperCase() === matchedPlate.replace(/[\s-]/g, '').toUpperCase()) : null;
  // Fall back to a lease-number match (plateless cars identified by lease/contract number).
  let matchedBy = matchedVehicle ? 'plate' : null;
  if (!matchedVehicle) {
    matchedVehicle = matchVehicleByLease(extracted.lease_number, searchText, vehicles);
    if (matchedVehicle) matchedBy = 'lease_number';
  }
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
    detected_lease_number: extracted.lease_number ?? null,
    matched_vehicle_id: matchedVehicle?.id ?? null,
    matched_vehicle_by: matchedBy,   // 'plate' | 'lease_number' | null
    matched_company_id: matchedCompany?.id ?? null,
    scan_url: saved.scan_url,
    ai_tier: aiTier,
    ai_model: aiModel,
    _raw: extracted._raw,
  };
}

// Match a vehicle by its lease/contract number: the extracted lease number (or
// the document text) contains the vehicle's stored lease number. Normalized so
// spaces/dashes/case don't matter; requires a reasonably specific (>=4 char) key.
function matchVehicleByLease(extractedLease, searchText, vehicles) {
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hay = norm(`${extractedLease || ''} ${searchText || ''}`);
  let best = null;
  for (const v of vehicles) {
    const key = norm(v.lease_number);
    if (key.length >= 4 && hay.includes(key)) {
      if (!best || key.length > norm(best.lease_number).length) best = v; // prefer the most specific match
    }
  }
  return best;
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
  const { data: extracted, tier: aiTier, model: aiModel } = await scanAmortizationDocument(tenantId, file);
  const rate = await getEurRate(tenantId);
  // Match the leasing company from the document so the plan is set up from the
  // upload alone (Cyrillic↔Latin aware).
  const companies = (await query(`SELECT id, name FROM companies WHERE tenant_id = $1 AND active = true`, [tenantId])).rows;
  const matchedCompany = fuzzyCompanyMatch(extracted.vendor_name, companies);
  return {
    total_amount: extracted.total_amount ?? null,
    down_payment: extracted.down_payment ?? 0,
    monthly_amount: extracted.monthly_amount ?? null,
    months_total: extracted.months_total ?? null,
    interest_rate: extracted.interest_rate ?? null,
    start_date: extracted.start_date ?? null,
    currency: (extracted.currency || 'MKD').toUpperCase() === 'EUR' ? 'EUR' : 'MKD',
    exchange_rate: rate,
    lease_number: extracted.lease_number ?? null,
    vendor_name: extracted.vendor_name ?? null,
    matched_company_id: matchedCompany?.id ?? null,
    ai_tier: aiTier,
    ai_model: aiModel,
    _raw: extracted._raw,
  };
}
