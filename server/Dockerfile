# ── Finance API (Node/Express modular monolith) ──
# Debian slim base so we can install the PostgreSQL 18 client (pg_dump) used by
# the in-process nightly backup cron and the Settings "Backup Now" button.
FROM node:22-bookworm-slim

WORKDIR /app

# PostgreSQL 18 client (pg_dump must match the server major version) + gzip.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg gzip \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && rm -rf /var/lib/apt/lists/*

# Install production deps only (uses the lockfile if present).
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Lightweight healthcheck hitting the API's own /api/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
