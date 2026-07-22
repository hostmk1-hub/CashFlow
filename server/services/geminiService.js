import { config } from '../shared/config.js';
import { query } from '../shared/db.js';
import { decrypt } from '../shared/crypto.js';

/**
 * Single place that talks to Gemini for both AI features (invoice/receipt
 * scanner and amortization scan import). One place to swap models/keys later.
 *
 * Two keys, tried in order: the FREE-tier key first, then the PAID key as a
 * fallback — so you burn the free quota first and only spend on the paid tier
 * when the free one fails (rate limit / quota / 5xx).
 */
async function readSetting(tenantId, key) {
  const { rows } = await query(`SELECT value FROM settings WHERE tenant_id = $1 AND key = $2`, [tenantId, key]);
  if (rows[0]?.value) {
    const dec = decrypt(rows[0].value);
    if (dec) return dec;
  }
  return null;
}

// Ordered list of API keys to try: [free/primary, paid/fallback]. Empty ones skipped.
async function resolveKeys(tenantId) {
  const free = (await readSetting(tenantId, 'gemini_api_key')) || config.gemini.apiKey;
  const paid = await readSetting(tenantId, 'gemini_api_key_paid');
  const keys = [];
  if (free) keys.push({ key: free, tier: 'free' });
  if (paid && paid !== free) keys.push({ key: paid, tier: 'paid' });
  return keys;
}

// Back-compat single-key resolver (used by listModels/testConnection).
async function resolveKey(tenantId) {
  const keys = await resolveKeys(tenantId);
  return keys[0]?.key || '';
}

async function resolveModel(tenantId) {
  const { rows } = await query(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'gemini_model'`,
    [tenantId],
  );
  return rows[0]?.value || config.gemini.model;
}

const CYRILLIC_NOTE =
  'Document text may be in Macedonian Cyrillic, Latin, or Turkish script. ' +
  'Extract text exactly as printed, preserving the original script — do not transliterate. ' +
  'Detect currency from symbols or text such as €, EUR, ден, MKD, денари.';

async function requestOnce({ apiKey, model, prompt, file }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: file.mimetype || 'image/jpeg', data: file.buffer.toString('base64') } },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp;
}

/**
 * Runs the request against the free key first; on failure (429 quota/rate-limit,
 * 401/403 auth, or 5xx) falls through to the paid key. Only the last error is
 * surfaced if every key fails.
 */
async function callVision({ tenantId, model, prompt, file }) {
  const keys = await resolveKeys(tenantId);
  if (!keys.length) {
    const err = new Error('No Gemini API key configured. Add one in Settings → AI Integration.');
    err.status = 400;
    throw err;
  }
  let lastErr = null;
  for (const { key, tier } of keys) {
    try {
      const resp = await requestOnce({ apiKey: key, model, prompt, file });
      if (resp.ok) {
        const json = await resp.json();
        const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        try { return JSON.parse(raw); } catch { return { _raw: raw }; }
      }
      const text = await resp.text();
      lastErr = new Error(`Gemini (${tier} key) failed: ${resp.status} ${text.slice(0, 300)}`);
      lastErr.status = 502;
      console.warn(`[gemini] ${tier} key returned ${resp.status}${keys.length > 1 && tier === 'free' ? ' — trying paid key' : ''}`);
      // fall through to the next key
    } catch (e) {
      lastErr = e;
      console.warn(`[gemini] ${tier} key error: ${e.message}`);
    }
  }
  throw lastErr;
}

export async function scanInvoiceDocument(tenantId, file) {
  const model = await resolveModel(tenantId);
  const prompt =
    'You are an invoice/receipt data extractor. Return ONLY JSON with keys: ' +
    'invoice_number, description, amount (number), currency (MKD or EUR), date (YYYY-MM-DD), ' +
    'vendor_name, detected_plate (any North Macedonia license plate like "SK 1234 AB" or null). ' +
    CYRILLIC_NOTE;
  return callVision({ tenantId, model, prompt, file });
}

/**
 * Extract a whole LIST of invoices from a supplier statement supplied as a
 * photo (jpg/png/…) or PDF. Used by company reconciliation when the supplier
 * sends their list as an image/PDF instead of a spreadsheet. Returns an array
 * of { invoice_number, amount, status } for the reconcile engine.
 */
export async function scanInvoiceListDocument(tenantId, file) {
  const model = await resolveModel(tenantId);
  const prompt =
    'You are extracting a supplier invoice statement (a list of invoices, possibly ' +
    'many rows across one or more pages). Return ONLY JSON in the exact shape ' +
    '{"invoices":[{"invoice_number":"...","amount":<number>,"status":"paid"|"unpaid"|null}]}. ' +
    'Include EVERY invoice row you can read. invoice_number is the invoice/document ' +
    'number as printed. amount is the invoice total as a plain number (no currency ' +
    'symbol, use a dot for decimals). status: "paid" if the row is marked paid/settled ' +
    '(платено/плат./yes/да), "unpaid" if marked open/due, otherwise null. ' +
    'Do not invent rows and do not include summary/total lines as invoices. ' +
    CYRILLIC_NOTE;
  const out = await callVision({ tenantId, model, prompt, file });
  const list = Array.isArray(out) ? out : (out.invoices || out.rows || []);
  return list
    .filter((r) => r && (r.invoice_number != null) && String(r.invoice_number).trim() !== '')
    .map((r) => ({
      invoice_number: String(r.invoice_number).trim(),
      amount: r.amount == null || r.amount === '' ? null : Number(r.amount),
      status: r.status != null ? String(r.status).trim() : null,
    }));
}

export async function scanAmortizationDocument(tenantId, file) {
  const model = await resolveModel(tenantId);
  const prompt =
    'You are a leasing-schedule data extractor. Return ONLY JSON with keys: ' +
    'total_amount (number), down_payment (number), monthly_amount (number), months_total (integer), ' +
    'interest_rate (number or null), start_date (YYYY-MM-DD), currency (MKD or EUR). ' +
    CYRILLIC_NOTE;
  return callVision({ tenantId, model, prompt, file });
}

/**
 * List the models the configured API key can actually use for scanning/autofill
 * (those supporting generateContent — Gemini Vision-capable). Powers the model
 * dropdown in Settings.
 */
export async function listModels(tenantId) {
  const apiKey = await resolveKey(tenantId);
  if (!apiKey) return { ok: false, reason: 'no-key', models: [] };
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${apiKey}`,
    );
    if (!resp.ok) return { ok: false, status: resp.status, models: [] };
    const json = await resp.json();
    const models = (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({
        name: (m.name || '').replace(/^models\//, ''),
        displayName: m.displayName || '',
      }))
      .filter((m) => m.name.startsWith('gemini'))
      .sort((a, b) => b.name.localeCompare(a.name)); // newest-ish first
    return { ok: true, models };
  } catch (err) {
    return { ok: false, reason: err.message, models: [] };
  }
}

export async function testConnection(tenantId) {
  const apiKey = await resolveKey(tenantId);
  const model = await resolveModel(tenantId);
  if (!apiKey) return { ok: false, message: 'No API key configured' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }] }),
  });
  return { ok: resp.ok, model, status: resp.status };
}
