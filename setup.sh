#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Finance.rentonic.app — one-command setup
#
#   ./setup.sh                        # build + run everything (localhost)
#   DOMAIN=finance.rentonic.app ACME_EMAIL=you@x.com ./setup.sh
#   ./setup.sh --seed                 # also load demo data after startup
#
# Brings up Postgres + API + Caddy (automatic HTTPS). Migrations run on API
# startup; secrets are generated on first run and stored in .env.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"
SEED=false
[[ "${1:-}" == "--seed" ]] && SEED=true

info()  { printf '\033[1;34m›\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

# ── 1. Prerequisites ──
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker first: https://docs.docker.com/get-docker/"
if docker compose version >/dev/null 2>&1; then DC="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose";
else fail "Docker Compose is not available."; fi
ok "Docker detected ($DC)"

# ── 2. Environment file (.env) with generated secrets ──
gen() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

if [[ ! -f .env ]]; then
  info "Creating .env from template with freshly generated secrets…"
  cp .env.example .env
  JWT=$(gen 32); ENC=$(gen 32); PGPW=$(gen 16)
  # portable in-place sed (GNU + BSD)
  sedi() { if sed --version >/dev/null 2>&1; then sed -i "$1" .env; else sed -i '' "$1" .env; fi; }
  sedi "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|"
  sedi "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENC}|"
  sedi "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PGPW}|"
  [[ -n "${DOMAIN:-}" ]]     && sedi "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|"
  [[ -n "${ACME_EMAIL:-}" ]] && sedi "s|^ACME_EMAIL=.*|ACME_EMAIL=${ACME_EMAIL}|"
  ok ".env created (secrets generated)"
else
  ok ".env already exists — leaving it untouched"
  # allow one-shot overrides on re-run
  [[ -n "${DOMAIN:-}" ]] && grep -q '^DOMAIN=' .env && info "Using existing DOMAIN in .env (override by editing .env)"
fi

DOMAIN_IN_ENV=$(grep '^DOMAIN=' .env | cut -d= -f2)
info "Deploying for domain: ${DOMAIN_IN_ENV:-localhost}"

# ── 3. Build & start ──
info "Building and starting containers (this can take a few minutes on first run)…"
$DC up -d --build

# ── 4. Wait for the API to become healthy ──
info "Waiting for the API to become healthy…"
for i in $(seq 1 60); do
  cid=$($DC ps -q api)
  status=$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)
  if [[ "$status" == "healthy" ]]; then ok "API is healthy"; break; fi
  [[ $i == 60 ]] && { warn "API did not report healthy in time — check: $DC logs api"; }
  sleep 2
done

# ── 5. Optional demo seed ──
if $SEED; then
  info "Seeding demo data…"
  $DC exec -T api npm run seed || warn "Seeding failed (see logs above)"
  ok "Demo data loaded — login: owner@driverent.mk / password123"
fi

echo
ok "Finance.rentonic.app is up!"
if [[ "${DOMAIN_IN_ENV:-localhost}" == "localhost" ]]; then
  echo "   Open:  https://localhost   (accept the local self-signed cert)"
else
  echo "   Open:  https://${DOMAIN_IN_ENV}   (Caddy is provisioning a Let's Encrypt cert — first load may take ~30s)"
fi
echo "   Logs:  $DC logs -f"
echo "   Stop:  $DC down       (data persists in the pgdata volume)"
