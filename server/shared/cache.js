import { createClient } from 'redis';
import { config } from './config.js';

// Redis-backed read cache with per-tenant invalidation. Everything degrades
// gracefully: if Redis is unset or unreachable, every function is a safe no-op
// and the app serves live data — Redis is an accelerator, never a dependency.

let client = null;
let ready = false;

export function initCache() {
  if (!config.redisUrl) {
    console.log('[cache] REDIS_URL not set — cache disabled (serving live data)');
    return;
  }
  client = createClient({ url: config.redisUrl });
  client.on('error', () => { ready = false; }); // avoid log spam; reconnects handle it
  client.on('ready', () => { ready = true; console.log('[cache] Redis connected'); });
  client.on('end', () => { ready = false; });
  client.connect().catch((e) => console.error('[cache] initial connect failed:', e.message));
}

export function cacheReady() {
  return ready;
}

const genKey = (tenantId) => `t:${tenantId}:cachegen`;

// Current cache generation for a tenant. A bump (INCR) makes every previously
// cached key for that tenant unreachable — cheap, atomic invalidation with no
// KEYS/SCAN. Orphaned old-generation keys expire on their own TTL.
async function generation(tenantId) {
  if (!ready) return 0;
  try {
    const v = await client.get(genKey(tenantId));
    return Number(v || 0);
  } catch {
    return 0;
  }
}

export async function cacheGet(tenantId, suffix) {
  if (!ready) return null;
  try {
    const g = await generation(tenantId);
    const raw = await client.get(`t:${tenantId}:g:${g}:${suffix}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(tenantId, suffix, value, ttl = config.cacheTtl) {
  if (!ready) return;
  try {
    const g = await generation(tenantId);
    await client.set(`t:${tenantId}:g:${g}:${suffix}`, JSON.stringify(value), { EX: ttl });
  } catch {
    /* ignore cache write failures */
  }
}

// Invalidate everything cached for a tenant (called after any write).
export async function invalidateTenant(tenantId) {
  if (!ready || !tenantId) return;
  try {
    await client.incr(genKey(tenantId));
  } catch {
    /* ignore */
  }
}
