import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { ApiError } from '../http.js';

/** Sign a base token that only identifies the user (no active tenant yet). */
export function signUserToken(userId) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '30d' });
}

/** Sign a token that also carries the active tenant + role (after switch). */
export function signTenantToken(userId, tenantId, role) {
  return jwt.sign({ userId, tenantId, role }, config.jwtSecret, { expiresIn: '7d' });
}

/** Verifies the JWT and attaches req.userId (+ tenantId/role if present). */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Missing authorization token'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = payload.userId;
    req.tokenTenantId = payload.tenantId || null;
    req.tokenRole = payload.role || null;
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}

/**
 * Resolves the active tenant (from the token or the X-Tenant-Id header) and
 * verifies the user actually belongs to it, then injects req.tenantId + req.role.
 * Every tenant-scoped query relies on req.tenantId.
 */
export async function requireTenantAccess(req, _res, next) {
  try {
    const headerTenant = req.headers['x-tenant-id'];
    const tenantId = Number(headerTenant || req.tokenTenantId);
    if (!tenantId) return next(new ApiError(400, 'No active tenant selected'));

    const { rows } = await query(
      `SELECT role FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, req.userId],
    );
    if (!rows[0]) return next(new ApiError(403, 'You do not have access to this company'));

    req.tenantId = tenantId;
    req.role = rows[0].role;
    next();
  } catch (err) {
    next(err);
  }
}

const ROLE_RANK = { staff: 1, manager: 2, admin: 3, owner: 4 };

/** Restrict a route to one or more roles (e.g. requireRole('owner','admin')). */
export function requireRole(...allowed) {
  return (req, _res, next) => {
    if (!req.role) return next(new ApiError(403, 'No role on request'));
    if (allowed.includes(req.role)) return next();
    next(new ApiError(403, `Requires role: ${allowed.join(' or ')}`));
  };
}

/** Convenience: allow the given role OR anything more privileged. */
export function requireMinRole(minRole) {
  return (req, _res, next) => {
    if ((ROLE_RANK[req.role] || 0) >= (ROLE_RANK[minRole] || 99)) return next();
    next(new ApiError(403, `Requires at least ${minRole} role`));
  };
}
