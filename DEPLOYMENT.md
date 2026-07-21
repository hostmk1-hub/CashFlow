# Finance · Rentonic — Deployment & Operations Guide

Everything you need to **install, update, back up, and recover** the app. The
whole stack runs in Docker: **PostgreSQL 18**, the **API** (Node/Express), and
**Caddy** (automatic HTTPS). The host only needs Docker — Node, Caddy, Postgres,
the recurring-invoice cron, and the nightly backup all run inside containers.

Three one-line commands cover normal operations:

| Command | What it does |
|---------|--------------|
| `./setup` | Fresh install — installs Docker if missing, writes `.env`, builds & starts everything |
| `./update` | Pull latest code from GitHub, back up first, rebuild, migrate, restart |
| `./restore` | Restore the database from a backup (local or R2) for disaster recovery |

> `./setup.sh`, `./update.sh`, `./restore.sh` are the same scripts if you prefer the extension.

---

## 1. New install

On a fresh server (Ubuntu/Debian/CentOS with internet):

```bash
git clone https://github.com/hostmk1-hub/cashflow.git finance
cd finance
DOMAIN=finance.rentonic.app ACME_EMAIL=you@rentonic.app ./setup --seed
```

That single command will:

1. **Install Docker** if it isn't present (official `get.docker.com` script) and start the daemon.
2. Create `.env` with freshly generated `JWT_SECRET`, `ENCRYPTION_KEY`, and DB password. (If you omit `DOMAIN`/`ACME_EMAIL` it prompts for them.)
3. `docker compose up -d --build` — Postgres 18 + API + Caddy.
4. Wait for the API health check.
5. `--seed` (optional) loads demo data.

Point a DNS **A record** for your domain at the server's IP first. Caddy then
provisions a Let's Encrypt certificate automatically on first load (~30s). For
local testing use `DOMAIN=localhost` (Caddy issues a local self-signed cert) and
open <https://localhost>.

**Demo login after `--seed`:** `owner@driverent.mk` / `password123`.

### What you configure in `.env`
Only these normally need your attention (everything else has safe defaults):

| Variable | Purpose |
|----------|---------|
| `DOMAIN` | Public domain Caddy serves + gets a cert for (`localhost` for local) |
| `ACME_EMAIL` | Email for Let's Encrypt notifications |
| `GEMINI_API_KEY` | Optional — enables the AI invoice/amortization scanners (can also be set per-company in Settings) |
| `R2_*` | Optional — off-site backups to Cloudflare R2 (see §4) |

Secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, `POSTGRES_PASSWORD`) are generated for you — don't hand-edit unless rotating.

---

## 2. Updating (new version from GitHub)

```bash
cd finance
./update
```

`./update` is safe by design:

1. Takes a **database backup first** (so you can roll back).
2. `git pull` the latest code for the current branch.
3. Refreshes base images (`docker compose pull`) and **rebuilds** the API + Caddy images.
4. Recreates the stack; **migrations run automatically** on API startup (the schema is idempotent).
5. Prunes dangling images to reclaim disk.

Zero manual migration steps — schema changes apply themselves. Data is untouched
(it lives in the `pgdata` volume).

---

## 3. Backups

- **Automatic:** a nightly cron **inside the API container** runs at **03:00** — `pg_dump --clean --if-exists | gzip` — and (if R2 is configured) uploads the dump off-site.
- **On demand:** Settings → *Backup Now*, or from the shell:
  ```bash
  docker compose exec api npm run backup
  ```
- **Where they live:** the `api_backups` named Docker volume (persists across redeploys). The 14 most recent local dumps are kept; R2 keeps everything you upload.
- The dumps use `--clean --if-exists`, so a restore drops and recreates cleanly over an existing database.

Check status any time:
```bash
docker compose exec api npm run restore -- list     # local + R2 backups
```

---

## 4. Off-site backups to Cloudflare R2 (disaster recovery)

R2 is S3-compatible and free-tier friendly. With it configured, every nightly
dump is copied off the server, so a total host loss is recoverable in minutes.

**Setup (once):**
1. In the Cloudflare dashboard → **R2** → create a bucket (e.g. `finance-backups`).
2. Create an **R2 API token** with *Object Read & Write* for that bucket.
3. Put the values in `.env`:
   ```
   R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxx
   R2_ACCESS_KEY_ID=xxxxxxxx
   R2_SECRET_ACCESS_KEY=xxxxxxxx
   R2_BUCKET=finance-backups
   R2_PREFIX=finance-backups/
   ```
   (`R2_ENDPOINT` is derived from the account id automatically.)
4. Apply it: `docker compose up -d` (recreates the API with the new env).

Settings → Backups shows **Off-site (R2): ✅ enabled** once it's working. The next
nightly run — or `docker compose exec api npm run backup` — uploads to R2.

---

## 5. Restore / disaster recovery

**Total rebuild on a new server:**
```bash
git clone https://github.com/hostmk1-hub/cashflow.git finance && cd finance
# put your .env in place (same JWT_SECRET/ENCRYPTION_KEY as before, plus R2_* creds)
./setup                     # brings the stack up (empty DB)
./restore latest            # pulls newest dump from R2 and restores it
```

**Everyday restore:**
```bash
./restore list              # see what's available (local + R2)
./restore latest            # restore the newest backup
./restore finance-2026-07-21T03-00-00-000Z.sql.gz   # a specific dump
```

`./restore` runs inside the API container (which has `psql 18` + the R2
credentials), asks for confirmation (it **replaces** the current database), then
`gunzip -c <dump> | psql`. Because dumps are `--clean --if-exists`, the restore
recreates the schema and data cleanly.

> Keep your `ENCRYPTION_KEY` safe and identical across rebuilds — it decrypts
> per-tenant secrets (e.g. Gemini keys) stored in the `settings` table. Losing it
> means those stored secrets can't be decrypted (re-enter them in Settings).

---

## 6. Common operations

```bash
docker compose ps                 # what's running + health
docker compose logs -f            # tail all services
docker compose logs -f api        # just the API
docker compose restart api        # restart one service
docker compose down               # stop (data persists in volumes)
docker compose down -v            # stop AND wipe all data (destructive!)
docker compose exec api npm run seed     # (re)load demo data
docker compose exec postgres psql -U finance finance   # a psql shell
```

**Volumes (your data):**
- `pgdata` — the PostgreSQL database
- `api_backups` — local backup dumps
- `api_uploads` — generated invoice PDFs
- `caddy_data` / `caddy_config` — TLS certificates + Caddy state

---

## 7. Rotating secrets & keys

- **Gemini API key:** Settings → AI Integration (stored encrypted per tenant), or the global `GEMINI_API_KEY` in `.env` + `docker compose up -d`.
- **JWT secret:** change `JWT_SECRET` in `.env` + `docker compose up -d` — this logs everyone out (existing tokens become invalid).
- **DB password:** changing `POSTGRES_PASSWORD` only affects a *fresh* database; for an existing one, change it inside Postgres and in `.env` together.

---

## 8. PostgreSQL 18 notes

- The database runs on **PostgreSQL 18** and uses a PG18 feature — **VIRTUAL generated columns** (`invoices.remaining`, `client_invoices.remaining` are computed live from `amount - paid_amount`).
- The API image ships the matching **PostgreSQL 18 client** (`pg_dump`/`psql`) so backups/restores are version-correct.
- **Major-version upgrades of an existing volume:** Postgres won't start on a data directory from an older major version. If you ever have an old `pgdata` from PG ≤ 17, restore from a dump into a fresh PG18 volume rather than pointing PG18 at the old directory.

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Cert not issued | DNS A record must point at the server and ports **80/443** must be open. `docker compose logs caddy`. |
| API unhealthy | `docker compose logs api` — usually a DB connection or bad `.env`. |
| "no space left on device" | `docker image prune -f`; old backups auto-prune to 14; check the `api_backups` volume. |
| Backup fails | Ensure the API image built with the PG18 client; check `docker compose exec api pg_dump --version`. |
| R2 upload fails | Verify `R2_*` values and that the token has Object Read & Write; the local dump is still kept. |
| Login loops after update | `JWT_SECRET` changed — expected; log in again. |
