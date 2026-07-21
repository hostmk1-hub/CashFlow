import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../shared/db.js';
import { runMigrations } from './migrate.js';
import { config } from '../shared/config.js';

const EUR = config.defaultEurRate; // 61.8

function monthStart(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function daysInMonth(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1, 0);
  return d.getDate();
}

async function seed() {
  await runMigrations();
  console.log('[seed] starting…');

  await withTransaction(async (c) => {
    // Idempotent: wipe tenant-scoped data for our two demo tenants, then reseed.
    const existing = await c.query(`SELECT id FROM tenants WHERE slug IN ('driverent-demo','momo-taxi-demo')`);
    if (existing.rows.length) {
      const ids = existing.rows.map((r) => r.id);
      for (const t of ['client_payment_allocations', 'payment_allocations']) {
        await c.query(`DELETE FROM ${t} WHERE 1=1`);
      }
      await c.query(`DELETE FROM client_payments WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM client_invoices WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM payments WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM invoices WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM amortization_plans WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM vehicle_income WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM recurring_templates WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM daily_income WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM settings WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM vehicles WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM workers WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM companies WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM tenant_users WHERE tenant_id = ANY($1)`, [ids]);
      await c.query(`DELETE FROM tenants WHERE id = ANY($1)`, [ids]);
      console.log('[seed] cleared previous demo data');
    }

    // ── Tenants ──
    const driveRent = (await c.query(`INSERT INTO tenants (name, slug) VALUES ('DriveRent','driverent-demo') RETURNING *`)).rows[0];
    const momo = (await c.query(`INSERT INTO tenants (name, slug) VALUES ('MOMO Taxi','momo-taxi-demo') RETURNING *`)).rows[0];

    for (const t of [driveRent, momo]) {
      await c.query(`INSERT INTO settings (tenant_id, key, value) VALUES ($1,'default_eur_rate',$2)`, [t.id, String(EUR)]);
    }

    // ── Users ──
    const ownerHash = await bcrypt.hash('password123', 10);
    const staffHash = await bcrypt.hash('password123', 10);
    let owner = (await c.query(`SELECT * FROM users WHERE email='owner@driverent.mk'`)).rows[0];
    if (!owner) owner = (await c.query(`INSERT INTO users (email, password_hash, name) VALUES ('owner@driverent.mk',$1,'Owner User') RETURNING *`, [ownerHash])).rows[0];
    let staff = (await c.query(`SELECT * FROM users WHERE email='staff@driverent.mk'`)).rows[0];
    if (!staff) staff = (await c.query(`INSERT INTO users (email, password_hash, name) VALUES ('staff@driverent.mk',$1,'Staff User') RETURNING *`, [staffHash])).rows[0];

    await c.query(`INSERT INTO tenant_users (tenant_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`, [driveRent.id, owner.id]);
    await c.query(`INSERT INTO tenant_users (tenant_id, user_id, role) VALUES ($1,$2,'staff') ON CONFLICT DO NOTHING`, [driveRent.id, staff.id]);
    await c.query(`INSERT INTO tenant_users (tenant_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`, [momo.id, owner.id]);

    const T = driveRent.id;

    // ── Companies ──
    const euroLease = (await c.query(`INSERT INTO companies (tenant_id, name, type, category, phone) VALUES ($1,'EuroLease North Macedonia','vendor','leasing','+389 2 111 222') RETURNING *`, [T])).rows[0];
    const autoService = (await c.query(`INSERT INTO companies (tenant_id, name, type, category, phone) VALUES ($1,'AutoService Skopje','vendor','service','+389 2 333 444') RETURNING *`, [T])).rows[0];
    await c.query(`INSERT INTO companies (tenant_id, name, type, category) VALUES ($1,'MakPetrol','vendor','other')`, [T]);
    const vipClient = (await c.query(`INSERT INTO companies (tenant_id, name, type, phone) VALUES ($1,'VIP Transfers MK','client','+389 70 555 666') RETURNING *`, [T])).rows[0];

    // ── Vehicles ──
    const ford = (await c.query(`INSERT INTO vehicles (tenant_id, plate, make, model, year) VALUES ($1,'SK-8842-AB','Ford','Tourneo Custom LWB',2022) RETURNING *`, [T])).rows[0];
    const vw = (await c.query(`INSERT INTO vehicles (tenant_id, plate, make, model, year) VALUES ($1,'SK-1123-CD','VW','Transporter T6',2021) RETURNING *`, [T])).rows[0];
    const hyundai = (await c.query(`INSERT INTO vehicles (tenant_id, plate, make, model, year) VALUES ($1,'SK-5599-EF','Hyundai','Staria',2023) RETURNING *`, [T])).rows[0];

    // ── Workers ──
    await c.query(`INSERT INTO workers (tenant_id, name, position, net_salary, payday_day) VALUES ($1,'Трајко Трајковски','Driver',35000,5)`, [T]);
    await c.query(`INSERT INTO workers (tenant_id, name, position, net_salary, payday_day) VALUES ($1,'Горан Стојановски','Mechanic',40000,5)`, [T]);

    // ── Amortization plan for the Ford (500 EUR/month with EuroLease) ──
    const monthlyMkd = Math.round(500 * EUR * 100) / 100;
    const plan = (await c.query(
      `INSERT INTO amortization_plans (tenant_id, vehicle_id, company_id, total_amount, down_payment, monthly_amount, months_total, interest_rate, start_date, currency, exchange_rate)
       VALUES ($1,$2,$3,$4,$5,$6,48,6.5,$7,'EUR',$8) RETURNING *`,
      [T, ford.id, euroLease.id, Math.round(24000 * EUR * 100) / 100, Math.round(3000 * EUR * 100) / 100, monthlyMkd, monthStart(-2), EUR],
    )).rows[0];

    // ── Vendor invoices (mix of MKD & EUR, including lease installments) ──
    for (let m = -2; m <= 2; m++) {
      const status = m < 0 ? 'open' : 'open';
      await c.query(
        `INSERT INTO invoices (tenant_id, company_id, vehicle_id, amort_plan_id, description, amount, due_date, source, currency, original_amount, exchange_rate, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'amortization','EUR',500,$8,$9)`,
        [T, euroLease.id, ford.id, plan.id, `Lease installment (${monthStart(m)})`, monthlyMkd, monthStart(m), EUR, status],
      );
    }
    await c.query(`INSERT INTO invoices (tenant_id, company_id, vehicle_id, description, amount, due_date, source, currency) VALUES ($1,$2,$3,'Tire replacement (4x)',18000,$4,'manual','MKD')`, [T, autoService.id, vw.id, monthStart(0)]);
    await c.query(`INSERT INTO invoices (tenant_id, company_id, vehicle_id, description, amount, due_date, source, currency) VALUES ($1,$2,$3,'Brake service',12000,$4,'manual','MKD')`, [T, autoService.id, hyundai.id, monthStart(-1)]);

    // ── Client invoices for VIP Transfers MK (receivables) ──
    const year = new Date().getFullYear();
    let seq = 1;
    for (const [desc, amt, off] of [['Corporate transfers — March', 120000, -1], ['Airport shuttle package', 85000, 0], ['Monthly retainer', 60000, 0]]) {
      await c.query(
        `INSERT INTO client_invoices (tenant_id, company_id, invoice_number, description, amount, currency, issue_date, due_date, status)
         VALUES ($1,$2,$3,$4,$5,'MKD',$6,$7,'sent')`,
        [T, vipClient.id, `INV-${year}-${String(seq++).padStart(4, '0')}`, desc, amt, monthStart(off), monthStart(off + 1)],
      );
    }

    // ── Vehicle income (last + current month) ──
    const vdata = [
      [ford.id, 155000, 22], [vw.id, 98000, 18], [hyundai.id, 172000, 26],
    ];
    for (const off of [-1, 0]) {
      const dim = daysInMonth(off);
      for (const [vid, base, days] of vdata) {
        const d = Math.min(days + (off === 0 ? 1 : 0), dim);
        await c.query(
          `INSERT INTO vehicle_income (tenant_id, vehicle_id, month, amount, days_rented, currency) VALUES ($1,$2,$3,$4,$5,'MKD')
           ON CONFLICT (tenant_id, vehicle_id, month) DO NOTHING`,
          [T, vid, monthStart(off), base, d],
        );
      }
    }

    // ── Daily income (last 20 days) ──
    for (let i = 0; i < 20; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      await c.query(
        `INSERT INTO daily_income (tenant_id, income_date, cash_amount, card_amount) VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id, income_date) DO NOTHING`,
        [T, iso, 8000 + ((i * 733) % 6000), 5000 + ((i * 517) % 4000)],
      );
    }

    // ── Recurring templates ──
    await c.query(`INSERT INTO recurring_templates (tenant_id, company_id, description, amount, day_of_month) VALUES ($1,$2,'Office rent',25000,1)`, [T, autoService.id]);

    console.log('[seed] DriveRent seeded ✓');
  });

  console.log('[seed] done.');
  console.log('    Login:  owner@driverent.mk / password123  (owner, 2 tenants)');
  console.log('            staff@driverent.mk / password123  (staff)');
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exit(1);
  });
