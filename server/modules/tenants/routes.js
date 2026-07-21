import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { inviteSchema, acceptInviteSchema } from '../../schemas/auth.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import { requireAuth, requireTenantAccess, requireRole } from '../../shared/middleware/auth.js';
import { query, withTransaction } from '../../shared/db.js';

const router = Router();

// ── Team listing / management (tenant-scoped) ────────────────
router.get(
  '/:id/users',
  requireAuth,
  requireTenantAccess,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, tu.role
       FROM tenant_users tu JOIN users u ON u.id = tu.user_id
       WHERE tu.tenant_id = $1 ORDER BY tu.role, u.name`,
      [req.tenantId],
    );
    res.json(rows);
  }),
);

router.delete(
  '/:id/users/:userId',
  requireAuth,
  requireTenantAccess,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const target = await query(`SELECT role FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`, [
      req.tenantId, Number(req.params.userId),
    ]);
    if (!target.rows[0]) throw new ApiError(404, 'Member not found');
    if (target.rows[0].role === 'owner' && req.role !== 'owner')
      throw new ApiError(403, 'Only an owner can remove an owner');
    await query(`DELETE FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`, [
      req.tenantId, Number(req.params.userId),
    ]);
    res.json({ ok: true });
  }),
);

const roleUpdateSchema = z.object({ role: z.enum(['owner', 'admin', 'manager', 'staff']) });
router.put(
  '/:id/users/:userId',
  requireAuth,
  requireTenantAccess,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { role } = roleUpdateSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE tenant_users SET role = $3 WHERE tenant_id = $1 AND user_id = $2 RETURNING *`,
      [req.tenantId, Number(req.params.userId), role],
    );
    if (!rows[0]) throw new ApiError(404, 'Member not found');
    res.json(rows[0]);
  }),
);

// ── Invites ──────────────────────────────────────────────────
router.post(
  '/:id/invites',
  requireAuth,
  requireTenantAccess,
  requireRole('owner', 'admin'),
  asyncHandler(async (req, res) => {
    const { email, role } = inviteSchema.parse(req.body);
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await query(
      `INSERT INTO invites (tenant_id, email, role, token, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.tenantId, email, role, token, expires],
    );
    // No email service wired up yet — return the accept link to copy/paste.
    res.status(201).json({ token, acceptUrl: `/accept-invite?token=${token}`, email, role });
  }),
);

router.get(
  '/invites/:token',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT i.email, i.role, i.accepted, i.expires_at, t.name AS tenant_name
       FROM invites i JOIN tenants t ON t.id = i.tenant_id WHERE i.token = $1`,
      [req.params.token],
    );
    if (!rows[0]) throw new ApiError(404, 'Invite not found');
    if (rows[0].accepted) throw new ApiError(400, 'Invite already accepted');
    if (new Date(rows[0].expires_at) < new Date()) throw new ApiError(400, 'Invite expired');
    res.json(rows[0]);
  }),
);

router.post(
  '/invites/:token/accept',
  asyncHandler(async (req, res) => {
    const body = acceptInviteSchema.parse(req.body);
    const { rows } = await query(`SELECT * FROM invites WHERE token = $1`, [req.params.token]);
    const invite = rows[0];
    if (!invite) throw new ApiError(404, 'Invite not found');
    if (invite.accepted) throw new ApiError(400, 'Invite already accepted');
    if (new Date(invite.expires_at) < new Date()) throw new ApiError(400, 'Invite expired');

    await withTransaction(async (client) => {
      let user = (await client.query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [invite.email])).rows[0];
      if (!user) {
        if (!body.password) throw new ApiError(400, 'Password required for a new account');
        const hash = await bcrypt.hash(body.password, 10);
        user = (
          await client.query(
            `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING *`,
            [invite.email, hash, body.name || null],
          )
        ).rows[0];
      }
      await client.query(
        `INSERT INTO tenant_users (tenant_id, user_id, role) VALUES ($1,$2,$3)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [invite.tenant_id, user.id, invite.role],
      );
      await client.query(`UPDATE invites SET accepted = true WHERE id = $1`, [invite.id]);
    });
    res.json({ ok: true });
  }),
);

export default router;
