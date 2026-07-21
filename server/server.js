import express from 'express';
import cors from 'cors';
import cron from 'node-cron';

import { config } from './shared/config.js';
import { pool } from './shared/db.js';
import { runMigrations } from './scripts/migrate.js';
import { errorHandler } from './shared/http.js';
import { requireAuth, requireTenantAccess } from './shared/middleware/auth.js';
import { generateDueInvoices } from './modules/recurring/service.js';
import { runBackup } from './services/backupService.js';
import { initCache, cacheGet, cacheSet, invalidateTenant } from './shared/cache.js';

// Module routers
import authRoutes from './modules/auth/routes.js';
import tenantRoutes from './modules/tenants/routes.js';
import companyRoutes from './modules/companies/routes.js';
import vehicleRoutes from './modules/vehicles/routes.js';
import workerRoutes from './modules/workers/routes.js';
import invoiceRoutes from './modules/invoices/routes.js';
import scannerRoutes from './modules/scanner/routes.js';
import paymentRoutes from './modules/payments/routes.js';
import clientInvoiceRoutes from './modules/client-invoices/routes.js';
import clientPaymentRoutes from './modules/client-payments/routes.js';
import recurringRoutes from './modules/recurring/routes.js';
import dailyIncomeRoutes from './modules/daily-income/routes.js';
import amortizationRoutes from './modules/amortization/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import notificationRoutes from './modules/notifications/routes.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve generated files (invoice PDFs, scan uploads).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Public ────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

app.use('/api', authRoutes); // /api/signup, /api/login, /api/me/tenants, /api/tenants/:id/switch
app.use('/api/tenants', tenantRoutes); // invites + team (mixes public accept routes)

// ── Tenant-scoped (auth + active tenant required) ─────────────
const scoped = express.Router();
scoped.use(requireAuth, requireTenantAccess);

// Per-tenant read cache. GET responses are cached per tenant+URL; any successful
// write (POST/PUT/DELETE) bumps the tenant's cache generation so the next read
// is fresh — never a stale cached copy after an edit/delete. Binary responses
// (xlsx) aren't cached because they never call res.json.
scoped.use((req, res, next) => {
  if (req.method === 'GET') {
    const suffix = `${req.path}?${new URLSearchParams(req.query).toString()}`;
    cacheGet(req.tenantId, suffix)
      .then((hit) => {
        if (hit !== null) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(hit);
        }
        const originalJson = res.json.bind(res);
        res.json = (body) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            cacheSet(req.tenantId, suffix, body).catch(() => {});
          }
          res.setHeader('X-Cache', 'MISS');
          return originalJson(body);
        };
        next();
      })
      .catch(() => next());
    return;
  }
  // Mutations invalidate this tenant's cache once they succeed.
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) invalidateTenant(req.tenantId).catch(() => {});
  });
  next();
});
scoped.use('/companies', companyRoutes);
scoped.use('/vehicles', vehicleRoutes);
scoped.use('/workers', workerRoutes);
scoped.use('/invoices', scannerRoutes); // /api/invoices/scan[/confirm]
scoped.use('/invoices', invoiceRoutes);
scoped.use('/payments', paymentRoutes);
scoped.use('/client-invoices', clientInvoiceRoutes);
scoped.use('/client-payments', clientPaymentRoutes);
scoped.use('/recurring', recurringRoutes);
scoped.use('/daily-income', dailyIncomeRoutes);
scoped.use('/amortization', amortizationRoutes);
scoped.use('/settings', settingsRoutes);
scoped.use('/notifications', notificationRoutes);
scoped.use('/', reportsRoutes); // dashboard, reminders, calendar, search, reports/*
app.use('/api', scoped);

app.use(errorHandler);

async function start() {
  await runMigrations();
  initCache();

  // Recurring engine: daily at 00:05 generate this month's due invoices.
  cron.schedule('5 0 * * *', () => {
    generateDueInvoices().catch((err) => console.error('[cron] recurring failed', err));
  });

  // Nightly database backup (pg_dump → gzip) at 03:00.
  cron.schedule('0 3 * * *', () => {
    runBackup().catch((err) => console.error('[cron] backup failed', err));
  });

  app.listen(config.port, () => {
    console.log(`[server] Finance API listening on :${config.port} (${config.nodeEnv})`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
