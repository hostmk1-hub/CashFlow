import bcrypt from 'bcryptjs';
import { withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import { config } from '../../shared/config.js';
import * as repo from './repository.js';

function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'company'
  ) + '-' + Math.random().toString(36).slice(2, 6);
}

export async function signup({ email, password, name, companyName }) {
  const existing = await repo.findUserByEmail(email);
  if (existing) throw new ApiError(409, 'An account with this email already exists');
  const passwordHash = await bcrypt.hash(password, 10);

  return withTransaction(async (client) => {
    const user = await repo.createUser(client, { email, passwordHash, name });
    const tenant = await repo.createTenant(client, { name: companyName, slug: slugify(companyName) });
    await repo.addTenantUser(client, { tenantId: tenant.id, userId: user.id, role: 'owner' });
    // seed a sensible default EUR rate for the new tenant
    await client.query(
      `INSERT INTO settings (tenant_id, key, value) VALUES ($1,'default_eur_rate',$2)
       ON CONFLICT (tenant_id, key) DO NOTHING`,
      [tenant.id, String(config.defaultEurRate)],
    );
    return { user: { id: user.id, email: user.email, name: user.name }, tenant };
  });
}

export async function login({ email, password }) {
  const user = await repo.findUserByEmail(email);
  if (!user || !user.active) throw new ApiError(401, 'Invalid email or password');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new ApiError(401, 'Invalid email or password');
  return { id: user.id, email: user.email, name: user.name };
}

export function getUserTenants(userId) {
  return repo.listUserTenants(userId);
}

export async function switchTenant(userId, tenantId) {
  const membership = await repo.getMembership(tenantId, userId);
  if (!membership) throw new ApiError(403, 'You do not belong to this company');
  return { tenantId, role: membership.role };
}
