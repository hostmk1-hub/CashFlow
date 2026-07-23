import * as repo from './repository.js';

/**
 * Best-effort audit write from a request context. Never throws — an audit
 * failure must not break the underlying action.
 */
export async function logFromReq(req, { action, entityType, entityId, summary, details }) {
  try {
    await repo.insert({ tenantId: req.tenantId, userId: req.userId, action, entityType, entityId, summary, details });
  } catch (e) {
    console.warn('[audit] failed to log', action, e.message);
  }
}

export const list = (tenantId, filters) => repo.list(tenantId, filters);
