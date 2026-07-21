import { signupSchema, loginSchema } from '../../schemas/auth.js';
import { signUserToken, signTenantToken } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const signup = asyncHandler(async (req, res) => {
  const body = signupSchema.parse(req.body);
  const { user, tenant } = await service.signup(body);
  const token = signTenantToken(user.id, tenant.id, 'owner');
  res.status(201).json({ token, user, activeTenant: { ...tenant, role: 'owner' } });
});

export const login = asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await service.login(body);
  const tenants = await service.getUserTenants(user.id);
  // If exactly one tenant, hand back a ready-to-use tenant token.
  let token;
  let activeTenant = null;
  if (tenants.length === 1) {
    token = signTenantToken(user.id, tenants[0].id, tenants[0].role);
    activeTenant = tenants[0];
  } else {
    token = signUserToken(user.id);
  }
  res.json({ token, user, tenants, activeTenant });
});

export const myTenants = asyncHandler(async (req, res) => {
  const tenants = await service.getUserTenants(req.userId);
  res.json(tenants);
});

export const switchTenant = asyncHandler(async (req, res) => {
  const tenantId = Number(req.params.id);
  const { role } = await service.switchTenant(req.userId, tenantId);
  const token = signTenantToken(req.userId, tenantId, role);
  res.json({ token, tenantId, role });
});
