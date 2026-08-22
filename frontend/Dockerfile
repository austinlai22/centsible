# ─── flo·w frontend — production Dockerfile ───────────────────────────────────
#
# Stage 1 builds the static assets with Vite.
# Stage 2 serves them with nginx — a Node process has no business serving
# static files in production; nginx is faster, smaller, and purpose-built
# for exactly this.
#
# IMPORTANT: VITE_API_URL must be passed as a build arg, not a runtime env
# var — Vite inlines it into the JS bundle at build time. Setting it only
# at container runtime (e.g. via docker run -e) has no effect.

# ─── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ─── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
