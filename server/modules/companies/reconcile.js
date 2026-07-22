import ExcelJS from 'exceljs';
import * as repo from './repository.js';

// Header keywords (English + Macedonian latin/cyrillic) used to locate columns.
const COL = {
  invoice: ['invoice', 'number', 'no', 'inv', 'broj', 'број', 'faktura', 'фактура', 'ref', 'документ', 'document'],
  amount: ['amount', 'total', 'sum', 'iznos', 'износ', 'value', 'вредност', 'debt', 'долг'],
  status: ['status', 'paid', 'plateno', 'платено', 'состојба'],
};

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
const cleanNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
function matchCol(headers, keys) {
  return headers.findIndex((h) => {
    const hl = String(h || '').toLowerCase();
    return keys.some((k) => hl.includes(k));
  });
}

function rowsToRecords(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h ?? ''));
  let ci = matchCol(headers, COL.invoice);
  let ai = matchCol(headers, COL.amount);
  let si = matchCol(headers, COL.status);
  let body = rows.slice(1);
  // No recognizable header row → assume col0=invoice, col1=amount, treat all rows as data.
  if (ci === -1) { ci = 0; ai = 1; si = -1; body = rows; }
  return body
    .filter((r) => r && r[ci] != null && String(r[ci]).trim() !== '')
    .map((r) => ({
      invoice_number: String(r[ci]).trim(),
      amount: ai >= 0 ? cleanNum(r[ai]) : null,
      status: si >= 0 ? String(r[si] ?? '').trim() : null,
    }));
}

function parseCsv(text) {
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((line) => line.split(delim).map((c) => c.replace(/^"|"$/g, '').trim()));
  return rowsToRecords(rows);
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v && v.text) ? v.text : v)));
  return rowsToRecords(rows);
}

/** Parse an uploaded CSV or XLSX file into [{invoice_number, amount, status}]. */
export async function parseInvoiceList(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx') || (file.mimetype || '').includes('sheet')) return parseXlsx(file.buffer);
  return parseCsv(file.buffer.toString('utf8'));
}

/**
 * Compare a supplier's invoice list against what's in our system for that
 * company, matching by invoice number: which match, which have amount/status
 * differences, which they list that we're missing, and which we have that
 * aren't on their list.
 */
export async function reconcile(tenantId, companyId, uploaded) {
  const sys = await repo.reconcileInvoices(tenantId, companyId);
  const sysMap = new Map();
  for (const inv of sys) if (inv.invoice_number) sysMap.set(norm(inv.invoice_number), inv);
  const uploadedKeys = new Set(uploaded.map((r) => norm(r.invoice_number)));

  const matched = [];
  const mismatches = [];
  const missingInSystem = [];
  for (const row of uploaded) {
    const key = norm(row.invoice_number);
    if (!key) continue;
    const inv = sysMap.get(key);
    if (!inv) { missingInSystem.push(row); continue; }
    const issues = [];
    if (row.amount != null && Math.abs(Number(row.amount) - Number(inv.amount)) > 0.5) {
      issues.push({ field: 'amount', theirs: row.amount, ours: Number(inv.amount) });
    }
    if (row.status) {
      const theirPaid = /paid|плат|yes|да|settled/i.test(row.status);
      const ourPaid = inv.status === 'paid';
      if (theirPaid !== ourPaid) issues.push({ field: 'status', theirs: row.status, ours: inv.status });
    }
    if (issues.length) mismatches.push({ invoice_number: inv.invoice_number, id: inv.id, issues });
    else matched.push({ invoice_number: inv.invoice_number, id: inv.id, amount: Number(inv.amount), status: inv.status });
  }
  const extraInSystem = sys.filter((inv) => inv.invoice_number && !uploadedKeys.has(norm(inv.invoice_number)));

  return {
    uploadedCount: uploaded.length,
    systemCount: sys.length,
    matchedCount: matched.length,
    matched,
    mismatches,
    missingInSystem,   // on their list, not in our system → possibly not recorded
    extraInSystem,     // in our system, not on their list
  };
}
