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

// Ordered list of API keys to try: [free/primary, paid/fallback]. Empty ones
// skipped. Trimmed defensively in case an older value was stored with whitespace.
async function resolveKeys(tenantId) {
  const clean = (k) => (k ? String(k).trim() : '');
  const free = clean((await readSetting(tenantId, 'gemini_api_key')) || config.gemini.apiKey);
  const paid = clean(await readSetting(tenantId, 'gemini_api_key_paid'));
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
  const raw = rows[0]?.value || config.gemini.model;
  // Tolerate a stored "models/…" prefix or stray whitespace.
  return String(raw).trim().replace(/^models\//, '');
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

async function requestText({ apiKey, model, prompt, json = false }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  };
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Runs the request against the free key first; on failure (429 quota/rate-limit,
 * 401/403 auth, or 5xx) falls through to the paid key. Only the last error is
 * surfaced if every key fails. `requester` builds the fetch for a given key so
 * both the vision (file) and text-only paths share the fallback logic.
 */
async function callWithFallback({ tenantId, requester }) {
  const keys = await resolveKeys(tenantId);
  if (!keys.length) {
    const err = new Error('No Gemini API key configured. Add one in Settings → AI Integration.');
    err.status = 400;
    throw err;
  }
  let lastErr = null;
  for (const { key, tier } of keys) {
    try {
      const resp = await requester(key);
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

function callVision({ tenantId, model, prompt, file }) {
  return callWithFallback({ tenantId, requester: (apiKey) => requestOnce({ apiKey, model, prompt, file }) });
}

function callText({ tenantId, model, prompt, json = false }) {
  return callWithFallback({ tenantId, requester: (apiKey) => requestText({ apiKey, model, prompt, json }) });
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
    'interest_rate (number or null), start_date (YYYY-MM-DD), currency (MKD or EUR), ' +
    'lease_number (the lease/contract number as printed, or null), ' +
    'vendor_name (the leasing company / lessor name exactly as printed, or null). ' +
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

/**
 * Have Gemini write a short plain-language reconciliation report from the
 * structured result (runs for every reconciliation — spreadsheet or photo —
 * so the AI always does the comparison narrative). Returns { report } text in
 * Macedonian. Best-effort: throws if no key / Gemini fails, callers catch.
 */
export async function reconciliationReport(tenantId, { companyName, result }) {
  const model = await resolveModel(tenantId);
  // Trim the payload so the prompt stays small even for long lists.
  const compact = {
    company: companyName,
    counts: { theirList: result.uploadedCount, ourSystem: result.systemCount, matched: result.matchedCount },
    totals: result.totals,
    paid: result.paid,
    missingInSystem: (result.missingInSystem || []).slice(0, 60).map((r) => ({ n: r.invoice_number, a: r.amount, s: r.status })),
    amountOrStatusDiffs: (result.mismatches || []).slice(0, 60).map((m) => ({ n: m.invoice_number, issues: m.issues })),
    onlyInOurSystem: (result.extraInSystem || []).slice(0, 60).map((r) => ({ n: r.invoice_number, a: Number(r.amount), s: r.status })),
  };
  const prompt =
    'Ти си сметководствен асистент. Врз основа на овој JSON резултат од споредба на ' +
    'фактури меѓу листата од добавувачот и нашиот систем, напиши краток јасен извештај ' +
    'на МАКЕДОНСКИ (кирилица). Наведи: кои фактури недостасуваат кај нас, каде има разлика ' +
    'во износ или статус (плати/неплатено), дали вкупните износи се совпаѓаат (нивниот наспроти нашиот), ' +
    'и дали платеното кон компанијата се совпаѓа со нашите финансиски записи. Биди концизен, ' +
    'користи ставки со црти (-). Ако сè се совпаѓа, кажи го тоа јасно. ' +
    'Врати ЧИСТ JSON: {"report":"...","ok":true|false} каде ok=true само ако нема никакви разлики. ' +
    'Податоци: ' + JSON.stringify(compact);
  const out = await callText({ tenantId, model, prompt, json: true });
  const report = typeof out?.report === 'string' ? out.report : (out?._raw || '');
  return { report: report.trim(), ok: out?.ok === true };
}

// List the gemini generateContent-capable models a key can actually use.
async function modelsForKey(apiKey) {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${apiKey}`,
    );
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      return { ok: false, status: resp.status, message: body?.error?.message || `HTTP ${resp.status}`, models: [] };
    }
    const json = await resp.json();
    const models = (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => (m.name || '').replace(/^models\//, ''))
      .filter((n) => n.startsWith('gemini'));
    return { ok: true, models };
  } catch (e) {
    return { ok: false, status: 0, message: e.message, models: [] };
  }
}

/**
 * Diagnose the configured Gemini setup, separating a KEY problem from a MODEL
 * problem (a 404 means the model name isn't available for that key — the key
 * itself is fine). Tests each configured key (free, then paid) and, when the
 * chosen model 404s, finds a model the key CAN use and suggests it.
 */
export async function testConnection(tenantId) {
  const keys = await resolveKeys(tenantId);
  const model = await resolveModel(tenantId);
  if (!keys.length) {
    return { ok: false, message: 'No API key configured. Paste a key and click “Update key”, then test again.' };
  }

  const perKey = [];
  for (const { key, tier } of keys) {
    // (1) ListModels validates the key without needing a model — this proves the
    // stored, encrypted key decrypts and is accepted by Google.
    const list = await modelsForKey(key);
    if (!list.ok) {
      perKey.push({ tier, keyValid: false, message: list.message, status: list.status });
      continue;
    }
    // (2) Try a real generateContent with the configured model.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }] }),
    });
    if (resp.ok) {
      perKey.push({ tier, keyValid: true, canGenerate: true, model });
      continue;
    }
    // Model not available for this key → suggest one that is.
    const body = await resp.json().catch(() => ({}));
    const suggestion = list.models[0] || null;
    perKey.push({
      tier,
      keyValid: true,
      canGenerate: false,
      model,
      status: resp.status,
      message: body?.error?.message || `HTTP ${resp.status}`,
      availableModels: list.models.slice(0, 12),
      suggestedModel: suggestion,
    });
  }

  const working = perKey.find((k) => k.canGenerate);
  if (working) {
    return { ok: true, model: working.model, keyTier: working.tier, message: `Connection OK — ${working.tier} key, model ${working.model}` };
  }

  const first = perKey[0];
  if (first && first.keyValid === false) {
    return { ok: false, keyValid: false, status: first.status, message: `Key rejected by Google: ${first.message}`, perKey };
  }
  // Key(s) valid but the model is wrong (the 404 case).
  const withSuggestion = perKey.find((k) => k.suggestedModel);
  return {
    ok: false,
    keyValid: true,
    status: first?.status,
    model,
    suggestedModel: withSuggestion?.suggestedModel || null,
    availableModels: withSuggestion?.availableModels || [],
    message:
      `Your key works, but model “${model}” isn't available for it (${first?.status || 404}). ` +
      (withSuggestion?.suggestedModel ? `Try “${withSuggestion.suggestedModel}”.` : 'Pick a model from the dropdown.'),
    perKey,
  };
}
