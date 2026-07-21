#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Finance.rentonic.app — restore the database from a backup
#
#   ./restore list            # list available backups (local + R2)
#   ./restore latest          # restore the newest backup (R2 if configured)
#   ./restore <filename>      # restore a specific dump
#
# Runs inside the api container (which has pg_dump/psql 18 + R2 credentials).
# Restoring REPLACES the current database — you'll be asked to confirm.
# ─────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

info() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

if docker compose version >/dev/null 2>&1; then DC="docker compose";
elif command -v docker-compose >/dev/null 2>&1; then DC="docker-compose";
else fail "Docker Compose not found. Run ./setup first."; fi

ACTION="${1:-list}"

# Make sure postgres + api are running (needed even during disaster recovery).
if [[ -z "$($DC ps -q postgres 2>/dev/null || true)" || -z "$($DC ps -q api 2>/dev/null || true)" ]]; then
  info "Starting postgres + api…"
  $DC up -d postgres api
  for i in $(seq 1 30); do
    cid=$($DC ps -q api 2>/dev/null || true)
    [[ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo x)" == "healthy" ]] && break
    sleep 2
  done
fi

if [[ "$ACTION" == "list" ]]; then
  $DC exec -T api npm run restore -- list
  exit 0
fi

printf '\033[1;33m! This will REPLACE the current database with "%s". Continue? [y/N] \033[0m' "$ACTION"
read -r reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

$DC exec -T api npm run restore -- "$ACTION"
