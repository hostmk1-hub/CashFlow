#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Finance.rentonic.app — one-command setup
#
#   ./setup.sh                        # build + run everything
#   DOMAIN=finance.rentonic.app ACME_EMAIL=you@x.com ./setup.sh
#   ./setup.sh --seed                 # also load demo data after startup
#
# Brings up Postgres 18 + API + Caddy (automatic HTTPS). Everything runs in
# containers — Node, Caddy, PostgreSQL, and the nightly pg_dump backup cron are
# all inside the stack, so the host only needs Docker (this script installs it
# if it's missing). Migrations run on API startup; secrets are generated on
# first run and stored in .env. Normally you only supply DOMAIN + ACME_EMAIL.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")"
SEED=false
[[ "${1:-}" == "--seed" ]] && SEED=true

info()  { printf '\033[1;34m›\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m!\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then command -v sudo >/dev/null 2>&1 && SUDO="sudo"; fi

# ── 1. Docker (install if missing) ──
install_docker() {
  info "Docker not found — installing via the official convenience script…"
  if ! command -v curl >/dev/null 2>&1; then
    fail "curl is required to auto-install Docker. Install Docker manually: https://docs.docker.com/get-docker/"
  fi
  curl -fsSL https://get.docker.com | $SUDO sh || fail "Docker installation failed. Install it manually and re-run."
  # Start the daemon (systemd hosts); harmless if already running.
  $SUDO systemctl enable --now docker 2>/dev/null || $SUDO service docker start 2>/dev/null || true
  ok "Docker installed"
}

command -v docker >/dev/null 2>&1 || install_docker

# Make sure the daemon is reachable.
if ! docker info >/dev/null 2>&1; then
  $SUDO systemctl start docker 2>/dev/null || $SUDO service docker start 2>/dev/null || true
  sleep 2
fi
docker info >/dev/null 2>&1 || fail "Docker is installed but the daemon isn't reachable. Start it and re-run."

if docker compose version >/dev/null 2>&1; then DC="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose";
else fail "Docker Compose plugin is missing. Reinstall Docker or install the compose plugin."; fi
ok "Docker ready ($DC)"

# ── 2. Environment file (.env) with generated secrets ──
gen() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
sedi() { if sed --version >/dev/null 2>&1; then sed -i "$1" .env; else sed -i '' "$1" .env; fi; }

if [[ ! -f .env ]]; then
  info "Creating .env from template with freshly generated secrets…"
  cp .env.example .env
  sedi "s|^JWT_SECRET=.*|JWT_SECRET=$(gen 32)|"
  sedi "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(gen 32)|"
  sedi "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen 16)|"

  # Domain + ACME email: env vars win; otherwise prompt (interactive); else default.
  DOMAIN_VAL="${DOMAIN:-}"
  EMAIL_VAL="${ACME_EMAIL:-}"
  if [[ -z "$DOMAIN_VAL" && -t 0 ]]; then
    read -rp "Domain to serve (blank = localhost for local testing): " DOMAIN_VAL || true
  fi
  if [[ -n "$DOMAIN_VAL" && "$DOMAIN_VAL" != "localhost" && -z "$EMAIL_VAL" && -t 0 ]]; then
    read -rp "Email for Let's Encrypt (ACME) notifications: " EMAIL_VAL || true
  fi
  [[ -n "$DOMAIN_VAL" ]] && sedi "s|^DOMAIN=.*|DOMAIN=${DOMAIN_VAL}|"
  [[ -n "$EMAIL_VAL"  ]] && sedi "s|^ACME_EMAIL=.*|ACME_EMAIL=${EMAIL_VAL}|"
  ok ".env created (secrets generated) — review it any time to change settings"
else
  ok ".env already exists — leaving it untouched"
fi

DOMAIN_IN_ENV=$(grep '^DOMAIN=' .env | cut -d= -f2)
info "Deploying for domain: ${DOMAIN_IN_ENV:-localhost}"

# ── 3. Build & start ──
info "Building and starting containers (first run pulls images + builds, can take a few minutes)…"
$DC up -d --build

# ── 4. Wait for the API to become healthy ──
info "Waiting for the API to become healthy…"
for i in $(seq 1 60); do
  cid=$($DC ps -q api 2>/dev/null || true)
  status=$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)
  [[ "$status" == "healthy" ]] && { ok "API is healthy"; break; }
  [[ $i == 60 ]] && warn "API did not report healthy in time — check: $DC logs api"
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
echo "   In-container automatically: PostgreSQL 18, Redis (cache), the API"
echo "   (migrations on boot), Caddy (auto-HTTPS), the recurring-invoice cron, and"
echo "   the nightly pg_dump backup (verified into a throwaway DB, R2 upload if set)."
if [[ "${DOMAIN_IN_ENV:-localhost}" == "localhost" ]]; then
  echo "   Open:  https://localhost   (accept the local self-signed cert)"
else
  echo "   Open:  https://${DOMAIN_IN_ENV}   (Caddy provisions a Let's Encrypt cert — first load may take ~30s)"
fi
echo "   Logs:  $DC logs -f        Stop: $DC down        (data persists in named volumes)"
