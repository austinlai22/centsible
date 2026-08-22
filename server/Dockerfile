# ─── flo·w backend — production Dockerfile ────────────────────────────────────
#
# Multi-stage build:
#   1. "deps"  installs only production dependencies into a clean layer
#   2. final stage copies just node_modules + source — no build tools,
#      no dev dependencies, no package manager cache in the final image
#
# Runs as a non-root user — if the app is ever compromised via a dependency
# vulnerability or injection, the attacker doesn't get root inside the
# container, which limits what they can do (e.g. can't install packages,
# can't write outside the app directory in most configurations).

# ─── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# --omit=dev: skip nodemon and other dev-only tools — they have no place
# in a production image and only add attack surface + image size.
RUN npm install --omit=dev --no-audit --no-fund

# ─── Stage 2: final runtime image ─────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# dumb-init properly forwards signals (SIGTERM, SIGINT) to the Node process.
# Without it, Node sometimes doesn't receive the signal correctly when it's
# PID 1 inside a container, and the graceful shutdown handler in index.js
# never fires — the container just gets force-killed instead.
RUN apk add --no-cache dumb-init

# Create a dedicated non-root user. Alpine's node images already include a
# "node" user (UID 1000) for exactly this purpose.
USER node

COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

ENV NODE_ENV=production
EXPOSE 3001

# Docker-native health check — independent of any orchestrator's own check.
# Hits the real /health endpoint (which verifies DB connectivity, not just
# "is the process alive") every 30s; 3 consecutive failures mark the
# container unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
