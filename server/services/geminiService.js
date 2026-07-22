import { config } from '../shared/config.js';
import { query } from '../shared/db.js';
import { decrypt } from '../shared/crypto.js';

/**
 * Single place that talks to Gemini for both AI features (invoice/receipt
 * scanner and amortization scan import). One place to swap models/keys later.
 *
 * Key resolution: a tenant's encrypted key in the settings table takes
 * priority, falling back to GEMINI_API_KEY from env.
 */
async function resolveKey(tenantId) {
  const { rows } = await query(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'gemini_api_key'`,
    [tenantId],
  );
  if (rows[0]?.value) {
    const dec = decrypt(rows[0].value);
    if (dec) return dec;
  }
  return config.gemini.apiKey;
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

/**
 * Calls the Gemini generateContent REST endpoint with an image + JSON prompt.
 * Returns parsed JSON (responseMimeType application/json guarantees clean JSON).
 */
async function callVision({ apiKey, model, prompt, file }) {
  if (!apiKey) {
    const err = new Error('No Gemini API key configured. Add one in Settings → AI Integration.');
    err.status = 400;
    throw err;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: file.mimetype || 'image/jpeg',
              data: file.buffer.toString('base64'),
            },
          },
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
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Gemini request failed: ${resp.status} ${text}`);
    err.status = 502;
    throw err;
  }
  const json = await resp.json();
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

export async function scanInvoiceDocument(tenantId, file) {
  const [apiKey, model] = await Promise.all([resolveKey(tenantId), resolveModel(tenantId)]);
  const prompt =
    'You are an invoice/receipt data extractor. Return ONLY JSON with keys: ' +
    'invoice_number, description, amount (number), currency (MKD or EUR), date (YYYY-MM-DD), ' +
    'vendor_name, detected_plate (any North Macedonia license plate like "SK 1234 AB" or null). ' +
    CYRILLIC_NOTE;
  return callVision({ apiKey, model, prompt, file });
}

export async function scanAmortizationDocument(tenantId, file) {
  const [apiKey, model] = await Promise.all([resolveKey(tenantId), resolveModel(tenantId)]);
  const prompt =
    'You are a leasing-schedule data extractor. Return ONLY JSON with keys: ' +
    'total_amount (number), down_payment (number), monthly_amount (number), months_total (integer), ' +
    'interest_rate (number or null), start_date (YYYY-MM-DD), currency (MKD or EUR). ' +
    CYRILLIC_NOTE;
  return callVision({ apiKey, model, prompt, file });
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
