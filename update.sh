#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Finance.rentonic.app — one-command update
#
#   ./update            # pull latest code from GitHub, rebuild, migrate, restart
#
# Safe by default: takes a database backup BEFORE updating, pulls the latest
# code, refreshes base images (Postgres/Caddy), rebuilds the API + Caddy images,
# and recreates the stack. Migrations run automatically on API startup.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

info() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

if docker compose version >/dev/null 2>&1; then DC="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose";
else fail "Docker Compose not found. Run ./setup first."; fi

[[ -f .env ]] || fail ".env not found — run ./setup first."

# 1. Safety backup (best-effort) before we touch anything.
if [[ -n "$($DC ps -q api 2>/dev/null || true)" ]]; then
  info "Taking a safety backup before updating…"
  $DC exec -T api npm run backup || warn "Pre-update backup failed — continuing"
fi

# 2. Pull the latest code from GitHub.
info "Pulling latest code…"
branch=$(git rev-parse --abbrev-ref HEAD)
git fetch origin "$branch"
git pull --ff-only origin "$branch" || fail "git pull failed (local changes?). Resolve and re-run."

# 3. Refresh base images + rebuild app images.
info "Refreshing images and rebuilding…"
$DC pull 2>/dev/null || true
$DC up -d --build

# 4. Wait for health.
info "Waiting for the API to become healthy…"
for i in $(seq 1 60); do
  cid=$($DC ps -q api 2>/dev/null || true)
  status=$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)
  [[ "$status" == "healthy" ]] && { ok "API is healthy"; break; }
  [[ $i == 60 ]] && warn "API not healthy yet — check: $DC logs api"
  sleep 2
done

# 5. Prune dangling images to reclaim disk.
docker image prune -f >/dev/null 2>&1 || true

ok "Update complete. Current version: $(git rev-parse --short HEAD)"
echo "   Logs: $DC logs -f"
