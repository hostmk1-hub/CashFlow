# Finance · Rentonic (`finance.rentonic.app`)

A multi-tenant SaaS for fleet-finance tracking — expenses, invoices, payments and
receivables for a car-rental / leasing business. Internal money tracking (no VAT),
multi-currency (MKD base + EUR), full Macedonian **Cyrillic** support, and AI
document import via Gemini.

> Scope: **money only** — expenses, invoices, payments, receivables, per-vehicle
> P&L, lease amortization. Fleet operations (insurance, registration, fuel, fines,
> maintenance) live in RENTALsyst and are intentionally out of scope here.

---

## 🚀 One-command setup (Docker + Caddy auto-HTTPS)

Everything — PostgreSQL, the API, the built React app, and a Caddy reverse proxy
that provisions and renews TLS certificates automatically — comes up with a single
command.

```bash
# Local testing (Caddy issues a local self-signed cert):
./setup.sh --seed

# Production on your server (real Let's Encrypt certificate, zero extra config):
DOMAIN=finance.rentonic.app ACME_EMAIL=you@rentonic.app ./setup.sh
```

`setup.sh` will:

1. check Docker is installed,
2. create `.env` with **freshly generated** `JWT_SECRET`, `ENCRYPTION_KEY` and DB password,
3. `docker compose up -d --build` (Postgres + API + Caddy),
4. wait for the API health check,
5. optionally load demo data (`--seed`).

Then open **https://your-domain** (or **https://localhost** locally).

Prefer to do it by hand? `cp .env.example .env`, edit it, then
`docker compose up -d --build`.

Demo login after `--seed`: **owner@driverent.mk / password123** (owner of two
companies) · **staff@driverent.mk / password123**.

### How auto-SSL works
Caddy (`caddy/Caddyfile`) terminates TLS for `$DOMAIN`, reverse-proxies `/api/*`
to the `api` container, and serves the React SPA for everything else (with a
`try_files … /index.html` fallback for client-side routing). Point an A record at
the server, set `DOMAIN`, and Caddy handles ACME issuance + renewal on its own.
On `localhost` it falls back to a local self-signed cert so you can test HTTPS
without a public domain.

---

## Stack

| Layer     | Tech |
|-----------|------|
| Database  | PostgreSQL 16 (UTF-8, Cyrillic-safe), tenant-scoped schema + views |
| Backend   | Node.js / Express — **modular monolith**, plain JS + Zod validation |
| Frontend  | React 19 + Vite + Recharts, Inter font (full Cyrillic coverage) |
| AI        | Gemini Vision (`gemini-2.5-flash`) — invoice + amortization scan import |
| Edge      | Caddy 2 — automatic HTTPS, SPA hosting, `/api` reverse proxy |

---

## Project layout

```
.
├── docker-compose.yml        # postgres + api + caddy
├── Dockerfile.caddy          # builds the SPA and bakes it into the Caddy image
├── caddy/Caddyfile           # auto-HTTPS + reverse proxy + SPA fallback
├── setup.sh                  # one-command install
├── server/                   # Express modular monolith
│   ├── server.js
│   ├── db/schema.sql         # authoritative, idempotent schema + views
│   ├── shared/               # db pool, config, crypto, currency, middleware
│   ├── schemas/              # Zod validation schemas (plain JS)
│   ├── services/geminiService.js
│   ├── modules/<name>/       # routes · controller · service · repository
│   └── scripts/{migrate,seed}.js
└── client/                   # React 19 + Vite SPA
    └── src/{pages,components,context,lib}
```

Each backend module follows the same shape — `routes.js` (definitions only),
`controller.js` (parse request / shape response), `service.js` (business logic,
DB transactions), `repository.js` (SQL). Every financial operation runs inside a
DB transaction; the FIFO allocation engines lock rows `FOR UPDATE`.

---

## Feature highlights

- **Multi-tenant SaaS** — one user, many companies; `owner/admin/manager/staff`
  roles; company switcher; email invites; every query scoped by `tenant_id`.
- **FIFO payables engine** — pay a company/worker, oldest invoices close first,
  live preview before confirming, atomic + row-locked, full allocation audit trail.
- **FIFO receivables engine** — the mirror image for client invoices.
- **Multi-currency** — amounts stored MKD-equivalent; original EUR amount + rate
  preserved; EUR badge everywhere; default rate `61.8` (editable per tenant).
- **Vehicle analytics** — Utilization %, RevPAV, lease-debt coverage ratio,
  underperformance alerts, monthly P&L (via the `vehicle_pnl` view).
- **AI scanners** — invoice/receipt (with NM plate matching + vendor fuzzy match)
  and lease amortization import; Gemini returns strict JSON, review before save.
- **Recurring engine** — a daily cron auto-generates monthly lease/salary invoices.
- **Dashboard, reminders, calendar, global search, reports** with CSV export
  (BOM-prefixed so Cyrillic survives in Excel).

---

## Local development (without Docker)

```bash
# 1. a Postgres instance, then:
cd server && npm install
export DATABASE_URL=postgres://finance:finance@localhost:5432/finance JWT_SECRET=dev
npm run migrate && npm run seed && npm run dev      # API on :4000

# 2. in another terminal:
cd client && npm install && npm run dev             # Vite on :5173, proxies /api
```

## Common commands

```bash
docker compose logs -f            # tail everything
docker compose exec api npm run seed   # (re)load demo data
docker compose down               # stop (Postgres data persists in the pgdata volume)
docker compose down -v            # stop and wipe the database
```

## Environment variables

See `.env.example`. Key ones: `DOMAIN`, `ACME_EMAIL`, `POSTGRES_*`, `JWT_SECRET`,
`ENCRYPTION_KEY` (encrypts secrets stored in the `settings` table), `GEMINI_API_KEY`
/ `GEMINI_MODEL` (a per-tenant key set in Settings overrides the env default),
`DEFAULT_EUR_RATE`.
