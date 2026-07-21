# ── Finance API (Node/Express modular monolith) ──
FROM node:22-alpine

WORKDIR /app

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
