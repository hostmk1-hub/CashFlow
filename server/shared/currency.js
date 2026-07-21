import { config } from './config.js';
import { query } from './db.js';

/**
 * Resolve the EUR→MKD exchange rate for a tenant. Priority:
 *   1. settings.default_eur_rate for this tenant
 *   2. DEFAULT_EUR_RATE from env (fallback 61.8)
 */
export async function getEurRate(tenantId) {
  const { rows } = await query(
    `SELECT value FROM settings WHERE tenant_id = $1 AND key = 'default_eur_rate'`,
    [tenantId],
  );
  if (rows[0]?.value) {
    const n = Number(rows[0].value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return config.defaultEurRate;
}

/**
 * Given a UI amount + currency, return the persisted shape:
 * the base MKD-equivalent `amount`, plus original currency/amount/rate.
 * All ledger math downstream uses `amount` (MKD) only.
 */
export function toMkd({ amount, currency, exchangeRate }) {
  const cur = (currency || 'MKD').toUpperCase();
  if (cur === 'MKD') {
    return { amount: round2(amount), currency: 'MKD', originalAmount: null, exchangeRate: 1 };
  }
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : config.defaultEurRate;
  return {
    amount: round2(Number(amount) * rate),
    currency: cur,
    originalAmount: round2(amount),
    exchangeRate: rate,
  };
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
