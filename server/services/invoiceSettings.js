import { query } from '../shared/db.js';

// The company profile that feeds every generated invoice (header, banks, VAT
// default, signature labels, footer). Stored as a single JSON blob in the
// settings table under `invoice_settings`; the logo lives under `invoice_logo`
// as a data URL so it survives on ephemeral disk / R2-only storage.

export const DEFAULT_INVOICE_SETTINGS = {
  name: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  taxNumber: '',
  vatEnabled: false,
  vatRate: 18,
  bankAccounts: [], // [{ bankName, accountNo }]
  signatureLabels: { received: 'Примил', invoicedBy: 'Фактурирал', director: 'Директор' },
  footerNote1: 'РЕКЛАМАЦИИ ВО РОК ОД ТРИ ДЕНА',
  footerNote2: 'Во случај на спор надлежен е Судот во Скопје',
};

export async function getInvoiceSettings(tenantId) {
  const { rows } = await query(
    `SELECT key, value FROM settings WHERE tenant_id = $1 AND key IN ('invoice_settings','invoice_logo')`,
    [tenantId],
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let parsed = {};
  try { parsed = map.invoice_settings ? JSON.parse(map.invoice_settings) : {}; } catch { parsed = {}; }
  const tenant = (await query(`SELECT name FROM tenants WHERE id = $1`, [tenantId])).rows[0];
  const merged = {
    ...DEFAULT_INVOICE_SETTINGS,
    name: DEFAULT_INVOICE_SETTINGS.name || tenant?.name || 'Company',
    ...parsed,
    signatureLabels: { ...DEFAULT_INVOICE_SETTINGS.signatureLabels, ...(parsed.signatureLabels || {}) },
    bankAccounts: Array.isArray(parsed.bankAccounts) ? parsed.bankAccounts : [],
  };
  return { ...merged, logoUrl: map.invoice_logo || null };
}

export async function saveInvoiceSettings(tenantId, data) {
  // Never persist the logo inside the JSON blob — it has its own key.
  const { logoUrl, ...clean } = data || {};
  await query(
    `INSERT INTO settings (tenant_id, key, value) VALUES ($1,'invoice_settings',$2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [tenantId, JSON.stringify(clean)],
  );
  return getInvoiceSettings(tenantId);
}

export async function saveInvoiceLogo(tenantId, dataUrl) {
  await query(
    `INSERT INTO settings (tenant_id, key, value) VALUES ($1,'invoice_logo',$2)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [tenantId, dataUrl],
  );
  return getInvoiceSettings(tenantId);
}
