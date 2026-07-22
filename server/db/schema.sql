-- Finance.rentonic.app — Full PostgreSQL Schema (multi-tenant, MKD+EUR, Cyrillic-safe)
-- UTF-8 encoding required at database creation time for Cyrillic support.
-- This file is idempotent: enum types are guarded, tables use IF NOT EXISTS,
-- views use CREATE OR REPLACE, so `npm run migrate` is safe to re-run.

-- ===== Enum types (guarded) =====
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('owner','admin','manager','staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE company_type AS ENUM ('vendor','client','both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('open','partial','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_source AS ENUM ('manual','recurring','amortization','salary','scanned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pay_method AS ENUM ('cash','card','bank');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Tenancy & Auth =====

CREATE TABLE IF NOT EXISTS tenants (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          VARCHAR(200),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       user_role NOT NULL DEFAULT 'staff',
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(200) NOT NULL,
  role        user_role NOT NULL DEFAULT 'staff',
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Core entities =====

CREATE TABLE IF NOT EXISTS companies (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  name        VARCHAR(200) NOT NULL,
  type        company_type NOT NULL DEFAULT 'vendor',
  category    VARCHAR(20),          -- fixed list: leasing | service | tires | other
  phone       VARCHAR(50),
  note        TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            SERIAL PRIMARY KEY,
  tenant_id     INT NOT NULL REFERENCES tenants(id),
  plate         VARCHAR(20) NOT NULL,
  make          VARCHAR(100) NOT NULL,
  model         VARCHAR(100) NOT NULL,
  year          INT NOT NULL,
  rentalsyst_id VARCHAR(100),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plate)          -- scoped per tenant
);

CREATE TABLE IF NOT EXISTS workers (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  name        VARCHAR(200) NOT NULL,
  position    VARCHAR(100),
  net_salary  NUMERIC(12,2) NOT NULL,
  payday_day  INT NOT NULL DEFAULT 5 CHECK (payday_day BETWEEN 1 AND 28),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS amortization_plans (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  vehicle_id      INT NOT NULL REFERENCES vehicles(id),
  company_id      INT NOT NULL REFERENCES companies(id),
  total_amount    NUMERIC(14,2) NOT NULL,
  down_payment    NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_amount  NUMERIC(12,2) NOT NULL,
  months_total    INT NOT NULL,
  interest_rate   NUMERIC(5,2),
  start_date      DATE NOT NULL,
  scan_url        TEXT,
  currency        VARCHAR(3) NOT NULL DEFAULT 'MKD',
  exchange_rate   NUMERIC(10,4) DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Payables (what we owe vendors) =====

CREATE TABLE IF NOT EXISTS invoices (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  company_id      INT REFERENCES companies(id),
  worker_id       INT REFERENCES workers(id),
  vehicle_id      INT REFERENCES vehicles(id),
  amort_plan_id   INT REFERENCES amortization_plans(id),
  invoice_number  VARCHAR(100),
  description     VARCHAR(300) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date        DATE NOT NULL,
  status          invoice_status NOT NULL DEFAULT 'open',
  source          invoice_source NOT NULL DEFAULT 'manual',
  scan_url        TEXT,
  scanned         BOOLEAN NOT NULL DEFAULT false,
  currency        VARCHAR(3) NOT NULL DEFAULT 'MKD',
  original_amount NUMERIC(12,2),
  exchange_rate   NUMERIC(10,4) DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (company_id IS NOT NULL OR worker_id IS NOT NULL),
  CHECK (paid_amount <= amount)
);
CREATE INDEX IF NOT EXISTS idx_invoices_company_open ON invoices (tenant_id, company_id, due_date) WHERE status != 'paid';
CREATE INDEX IF NOT EXISTS idx_invoices_vehicle ON invoices (tenant_id, vehicle_id);

CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  company_id      INT REFERENCES companies(id),
  worker_id       INT REFERENCES workers(id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method          pay_method NOT NULL,
  paid_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  currency        VARCHAR(3) NOT NULL DEFAULT 'MKD',
  original_amount NUMERIC(12,2),
  exchange_rate   NUMERIC(10,4) DEFAULT 1,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (company_id IS NOT NULL OR worker_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id          SERIAL PRIMARY KEY,
  payment_id  INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id  INT NOT NULL REFERENCES invoices(id),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_alloc_invoice ON payment_allocations (invoice_id);

-- ===== Receivables (what clients owe us) =====

CREATE TABLE IF NOT EXISTS client_invoices (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  company_id      INT NOT NULL REFERENCES companies(id),
  vehicle_id      INT REFERENCES vehicles(id),
  invoice_number  VARCHAR(50) NOT NULL,
  description     VARCHAR(300) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(3) NOT NULL DEFAULT 'MKD',
  original_amount NUMERIC(12,2),
  exchange_rate   NUMERIC(10,4) DEFAULT 1,
  issue_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft|sent|paid|partial|overdue|cancelled
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS client_payments (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id),
  company_id      INT NOT NULL REFERENCES companies(id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method          pay_method NOT NULL,
  paid_at         DATE NOT NULL DEFAULT CURRENT_DATE,
  currency        VARCHAR(3) NOT NULL DEFAULT 'MKD',
  original_amount NUMERIC(12,2),
  exchange_rate   NUMERIC(10,4) DEFAULT 1,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_payment_allocations (
  id                 SERIAL PRIMARY KEY,
  client_payment_id  INT NOT NULL REFERENCES client_payments(id) ON DELETE CASCADE,
  client_invoice_id  INT NOT NULL REFERENCES client_invoices(id),
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);

-- ===== Recurring, income, settings =====

CREATE TABLE IF NOT EXISTS recurring_templates (
  id             SERIAL PRIMARY KEY,
  tenant_id      INT NOT NULL REFERENCES tenants(id),
  company_id     INT REFERENCES companies(id),
  worker_id      INT REFERENCES workers(id),
  vehicle_id     INT REFERENCES vehicles(id),
  description    VARCHAR(300) NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  day_of_month   INT NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
  active         BOOLEAN NOT NULL DEFAULT true,
  last_generated DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (company_id IS NOT NULL OR worker_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS daily_income (
  id           SERIAL PRIMARY KEY,
  tenant_id    INT NOT NULL REFERENCES tenants(id),
  income_date  DATE NOT NULL,
  cash_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  card_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  source       VARCHAR(20) NOT NULL DEFAULT 'manual',  -- manual | api
  note         TEXT,
  currency     VARCHAR(3) NOT NULL DEFAULT 'MKD',
  UNIQUE (tenant_id, income_date)
);

CREATE TABLE IF NOT EXISTS vehicle_income (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  vehicle_id  INT NOT NULL REFERENCES vehicles(id),
  month       DATE NOT NULL,            -- first day of month
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  days_rented INT NOT NULL DEFAULT 0 CHECK (days_rented BETWEEN 0 AND 31),
  source      VARCHAR(20) NOT NULL DEFAULT 'manual',  -- manual | api
  currency    VARCHAR(3) NOT NULL DEFAULT 'MKD',
  UNIQUE (tenant_id, vehicle_id, month)
);

CREATE TABLE IF NOT EXISTS settings (
  id        SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  key       VARCHAR(100) NOT NULL,
  value     TEXT NOT NULL,
  UNIQUE (tenant_id, key)
);

-- ===== System notifications (platform-level admin alerts, e.g. backup health) =====
CREATE TABLE IF NOT EXISTS system_notifications (
  id         SERIAL PRIMARY KEY,
  level      VARCHAR(20) NOT NULL DEFAULT 'info',  -- info | warning | critical
  title      VARCHAR(200) NOT NULL,
  message    TEXT,
  context    JSONB,
  resolved   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sysnotif_open ON system_notifications (resolved, created_at DESC);

-- ===== PostgreSQL 18: VIRTUAL generated columns =====
-- `remaining` is computed live from amount - paid_amount (no storage, always
-- current). VIRTUAL generated columns are new in PostgreSQL 18. Guarded with
-- IF NOT EXISTS so the migration stays idempotent.
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS remaining NUMERIC(12,2) GENERATED ALWAYS AS (amount - paid_amount) VIRTUAL;
ALTER TABLE client_invoices ADD COLUMN IF NOT EXISTS remaining NUMERIC(12,2) GENERATED ALWAYS AS (amount - paid_amount) VIRTUAL;

-- Installment plan on a single invoice: one supplier invoice for the full amount,
-- paid off over installment_count monthly payments of installment_amount each.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS installment_count  INT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS installment_amount NUMERIC(12,2);

-- Per-expense category (leasing | insurance | repairs | service | tires | other).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS category VARCHAR(30);

-- Car's real cash/purchase price (MKD-equivalent) so the leasing markup can be
-- shown: lease total_amount - purchase_price = what the leasing company charges.
ALTER TABLE amortization_plans ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(14,2);

-- ===== Derived views =====

CREATE OR REPLACE VIEW company_balances AS
SELECT c.id, c.tenant_id, c.name, c.type,
       COALESCE(SUM(i.amount), 0)                 AS total_invoiced,
       COALESCE(SUM(i.paid_amount), 0)             AS total_paid,
       COALESCE(SUM(i.amount - i.paid_amount), 0)  AS open_balance
FROM companies c
LEFT JOIN invoices i ON i.company_id = c.id
GROUP BY c.id, c.tenant_id, c.name, c.type;

CREATE OR REPLACE VIEW client_balances AS
SELECT c.id, c.tenant_id, c.name,
       COALESCE(SUM(ci.amount), 0)                  AS total_billed,
       COALESCE(SUM(ci.paid_amount), 0)              AS total_received,
       COALESCE(SUM(ci.amount - ci.paid_amount), 0)  AS outstanding_balance
FROM companies c
LEFT JOIN client_invoices ci ON ci.company_id = c.id AND ci.status != 'draft'
WHERE c.type IN ('client','both')
GROUP BY c.id, c.tenant_id, c.name;

CREATE OR REPLACE VIEW vehicle_amortization_progress AS
SELECT v.id, v.tenant_id, v.plate, p.id AS plan_id,
       p.total_amount,
       p.down_payment + COALESCE(SUM(i.paid_amount), 0)                          AS paid_so_far,
       p.total_amount - p.down_payment - COALESCE(SUM(i.paid_amount), 0)         AS remaining,
       COUNT(*) FILTER (WHERE i.status != 'paid')                                AS installments_left,
       ROUND(COUNT(*) FILTER (WHERE i.status != 'paid') / 12.0, 1)              AS years_left
FROM vehicles v
JOIN amortization_plans p ON p.vehicle_id = v.id
LEFT JOIN invoices i ON i.amort_plan_id = p.id
GROUP BY v.id, v.tenant_id, v.plate, p.id;

CREATE OR REPLACE VIEW vehicle_pnl AS
SELECT
  v.id AS vehicle_id,
  v.tenant_id,
  v.plate,
  v.make,
  v.model,
  vi.month,
  COALESCE(vi.amount, 0) AS total_income,
  COALESCE(vi.days_rented, 0) AS days_rented,
  EXTRACT(DAY FROM (DATE_TRUNC('month', vi.month) + INTERVAL '1 month' - INTERVAL '1 day'))::INT AS total_days_in_month,
  ROUND(
    (COALESCE(vi.days_rented, 0)::NUMERIC / NULLIF(EXTRACT(DAY FROM (DATE_TRUNC('month', vi.month) + INTERVAL '1 month' - INTERVAL '1 day')), 0)) * 100,
    1
  ) AS utilization_pct,
  ROUND(
    COALESCE(vi.amount, 0) / NULLIF(EXTRACT(DAY FROM (DATE_TRUNC('month', vi.month) + INTERVAL '1 month' - INTERVAL '1 day')), 0),
    2
  ) AS rev_pav,
  COALESCE(exp.total_expenses, 0) AS total_expenses,
  (COALESCE(vi.amount, 0) - COALESCE(exp.total_expenses, 0)) AS net_pnl
FROM vehicles v
LEFT JOIN vehicle_income vi ON vi.vehicle_id = v.id
LEFT JOIN (
  SELECT vehicle_id, tenant_id, DATE_TRUNC('month', due_date) AS month, SUM(amount) AS total_expenses
  FROM invoices
  WHERE vehicle_id IS NOT NULL
  GROUP BY vehicle_id, tenant_id, DATE_TRUNC('month', due_date)
) exp ON exp.vehicle_id = v.id AND exp.tenant_id = v.tenant_id AND exp.month = vi.month;
