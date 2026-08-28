# Centsible — Production Deployment Guide

This covers taking the backend from local development to a real, publicly
reachable deployment. Three paths are documented: a managed platform
(Railway or Render — recommended for an MVP), Fly.io (a bit more control,
still managed), and self-hosted Docker Compose on your own VM (most control,
most responsibility).

---

## Before you deploy, anywhere

Five things must be true no matter which platform you choose:

1. **Generate real secrets.** Never reuse the values in `.env.example`.
   ```bash
   # Run each of these separately and paste the output into your platform's
   # environment variable settings — not into a committed file.
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"  # JWT_ACCESS_SECRET
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"  # JWT_REFRESH_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
   ```

2. **Switch Plaid to production.** Sandbox credentials only work with fake
   test banks. Go to [dashboard.plaid.com](https://dashboard.plaid.com),
   request Production access (Plaid reviews this — usually fast for a
   straightforward personal finance app), and set `PLAID_ENV=production`
   with your production `client_id`/`secret`.

3. **Set `NODE_ENV=production`.** This isn't cosmetic — it changes real
   behavior: SSL is enforced on the database connection (`db/client.js`),
   error responses stop including internal messages (`index.js`'s error
   handler), and cookies get `Secure`/`SameSite=Strict` flags (`lib/jwt.js`).
   Forgetting this is the single most common way to accidentally ship an
   insecure deployment.

4. **Set `CLIENT_ORIGIN` to your real frontend URL.** Not `localhost`. CORS
   will silently reject every request from your deployed frontend otherwise.

5. **Set `PLAID_WEBHOOK_URL` to your real public API URL** plus
   `/plaid/webhook`. Plaid cannot reach a URL that isn't publicly routable.

---

## Frontend: where to host it

The frontend (`frontend/`) is a standard Vite + React app — it builds to
static files (`npm run build` → `dist/`) and can be hosted anywhere that
serves static files. Three good options, roughly in order of how little
setup each requires:

### Vercel or Netlify (simplest)

1. Push this repo to GitHub.
2. Vercel/Netlify → New Project → import the repo → set the root directory
   to `frontend/`.
3. Build command: `npm run build`. Output directory: `dist`.
4. Add an environment variable: `VITE_API_URL` = your deployed backend's
   real URL (e.g. `https://your-api.up.railway.app`). This must be set
   **before the build runs** — Vite inlines it into the JS at build time,
   so adding it after deploying does nothing until you trigger a new build.
5. Deploy. You'll get a URL like `your-app.vercel.app` — set that as
   `CLIENT_ORIGIN` in your backend's environment.

### Docker (if self-hosting both frontend and backend together)

The `frontend/Dockerfile` builds the Vite app and serves it with nginx.
`docker-compose.yml` at the repo root already wires this up as the `web`
service — see Option D below for the full self-hosted flow. If building the
frontend image standalone:
```bash
cd frontend
docker build --build-arg VITE_API_URL=https://your-api-domain.com -t centsible-frontend .
docker run -p 8080:80 centsible-frontend
```
The `--build-arg` is required — passing `VITE_API_URL` as a runtime
`-e` variable instead has no effect, because Vite already baked the old
value into the JS bundle during the image build.

### A CDN/static host directly (Cloudflare Pages, S3 + CloudFront, etc.)

Run `npm run build` locally or in CI with `VITE_API_URL` set, then upload
the contents of `dist/` to your static host of choice. Make sure the host
is configured with an SPA fallback (any unmatched path serves
`index.html`) — `frontend/nginx.conf` shows the equivalent nginx
configuration if your host needs you to specify this manually.

---

## The $0 stack (recommended for launch)

Verified against current free tiers. Three services, no card required:

| Piece | Service | Free tier | Catch |
|---|---|---|---|
| Frontend | **Vercel** (or Netlify / Cloudflare Pages) | Unlimited static hosting | none |
| API | **Render** web service | 750 instance-hours/month | spins down when idle → ~30–60s cold start |
| Database | **Neon** | 0.5 GB, permanent | exceeding the allowance suspends compute until next month; nothing is deleted |

**Use Neon, not Render's Postgres.** Render's free database is *deleted after
30 days*. Neon's free tier is permanent and suspends rather than destroys.
Supabase's free tier also works but pauses a project after a week of inactivity,
which is a poor fit for an app people check weekly.

### The trap that will bite you: third-party cookies

Centsible authenticates with HttpOnly cookies. If the app is served from
`your-app.vercel.app` and the API lives at `your-api.onrender.com`, those are
different *sites*, so the session cookies are third-party. **Safari blocks
third-party cookies by default and Chrome is phasing them out.** Login appears
to succeed and then every subsequent request arrives with no cookie at all.

Setting `SameSite=None` does not fix this — that is exactly the flag those
browsers are declining to honour.

The fix, at no cost: **proxy the API through the frontend's own origin.**
`frontend/vercel.json` already does this. Point its rewrite at your API host,
then set:

```
# Vercel (frontend) environment
VITE_API_URL=/api-proxy

# Render (backend) environment
COOKIE_SAME_SITE=lax
CLIENT_ORIGIN=https://your-app.vercel.app
```

The browser now sees same-origin requests, cookies are first-party, and CORS
preflights disappear from every mutation. (The alternative is a custom domain
with `app.` and `api.` subdomains, which also works — but costs ~$10/year.)

### Deploy order

```bash
# 1. Database — create a project at neon.tech, copy the connection string
# 2. Backend — Render → New Web Service → root directory: server
#    Set every variable from server/.env.example, then:
#      DATABASE_URL=<neon connection string>
#      NODE_ENV=production
#      COOKIE_SAME_SITE=lax
#      CLIENT_ORIGIN=https://your-app.vercel.app
#    Run the migration once from Render's shell:
npm run db:migrate

# 3. Frontend — Vercel → import repo → root directory: frontend
#    Edit frontend/vercel.json first: replace REPLACE-WITH-YOUR-API-HOST
#    Set VITE_API_URL=/api-proxy
```

Before any of that, run the readiness check from the repo root:

```bash
bash scripts/preflight.sh
```

It fails the things that ship silently broken — unfilled legal placeholders, a
hardcoded CSP origin, tracked secrets, vulnerable dependencies.

### What $0 does not buy you

**Plaid sandbox cannot connect real banks.** Sandbox credentials only work
against Plaid's fake test institutions. Real bank linking needs Production
access, which is an application plus per-item pricing. Until then the app is
fully usable with manually entered transactions — the runway, budgets, and
goals all work without a linked bank.

Render's cold starts are the other real cost: the first request after idle
takes 30–60 seconds. Acceptable for early users, not for a launch you promote.

---

## Backend: where to host it



Whichever app platform you choose, running Postgres yourself (patching,
backups, failover) is a distraction from building the product. A managed
Postgres add-on or a dedicated provider removes that:

- **Railway** — has a one-click Postgres add-on in the same project as your app
- **Render** — same; Postgres is a first-class managed resource
- **Neon** — serverless Postgres, generous free tier, works with any host
- **Supabase** — Postgres + extras, also works with any host

Whichever you pick, you'll get a `DATABASE_URL` connection string — that's
the only thing the app needs from it.

---

## Option A: Railway (simplest path)

1. Push this repo to GitHub.
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
   → select the repo, set the root directory to `server/`.
3. Add a Postgres database: New → Database → PostgreSQL. Railway
   auto-populates a `DATABASE_URL` variable you can reference.
4. In your API service's Variables tab, add every variable from
   `.env.example` with real values. For `DATABASE_URL`, reference the
   Postgres service's variable (Railway supports `${{Postgres.DATABASE_URL}}`
   reference syntax) rather than hardcoding it.
5. Railway auto-detects the `Dockerfile` in `server/` and builds from it.
6. After the first deploy, open a shell against the running service (or run
   a one-off command) to apply the schema:
   ```bash
   railway run npm run db:migrate
   ```
7. Railway gives you a public URL — set that as `PLAID_WEBHOOK_URL` (plus
   `/plaid/webhook`) and as the value your frontend's `VITE_API_URL` points to.

---

## Option B: Render

1. Push this repo to GitHub.
2. [render.com](https://render.com) → New → Web Service → connect the repo.
3. Root Directory: `server`. Render detects the `Dockerfile` automatically
   — set the Runtime to "Docker" if it doesn't.
4. New → PostgreSQL → create a database. Copy the **Internal Database URL**
   it gives you (internal, not external — lower latency, no public exposure).
5. Back in your Web Service → Environment, add every `.env.example`
   variable. Set `DATABASE_URL` to the Internal Database URL from step 4.
6. After the first deploy succeeds, use Render's Shell tab (or a one-off Job)
   to run:
   ```bash
   npm run db:migrate
   ```
7. Render gives your service a `.onrender.com` URL (or attach a custom
   domain). Use it for `PLAID_WEBHOOK_URL` and your frontend's API base URL.

Render's free tier spins services down when idle, which adds cold-start
latency. Fine for testing; upgrade to a paid instance before real users.

---

## Option C: Fly.io (more control)

Fly runs your Dockerfile directly as a Firecracker VM — closer to
self-hosting, still mostly managed.

1. Install the CLI: `curl -L https://fly.io/install.sh | sh`
2. From the `server/` directory:
   ```bash
   fly launch --no-deploy
   ```
   This generates a `fly.toml`. When prompted, decline to set up a database
   through Fly's prompt if you're using an external managed Postgres (Neon,
   Supabase) — point `DATABASE_URL` at that instead for simplicity.
3. Set secrets (Fly's equivalent of environment variables):
   ```bash
   fly secrets set NODE_ENV=production
   fly secrets set DATABASE_URL="postgresql://..."
   fly secrets set JWT_ACCESS_SECRET="..."
   fly secrets set JWT_REFRESH_SECRET="..."
   fly secrets set ENCRYPTION_KEY="..."
   fly secrets set PLAID_CLIENT_ID="..."
   fly secrets set PLAID_SECRET="..."
   fly secrets set PLAID_ENV=production
   fly secrets set PLAID_WEBHOOK_URL="https://your-app.fly.dev/plaid/webhook"
   fly secrets set CLIENT_ORIGIN="https://your-frontend-domain.com"
   ```
4. Deploy:
   ```bash
   fly deploy
   ```
5. Run the migration against the deployed instance:
   ```bash
   fly ssh console -C "npm run db:migrate"
   ```

Fly's generated `fly.toml` already knows about the `HEALTHCHECK` defined in
the Dockerfile and will use it for its own health monitoring.

---

## Option D: Self-hosted Docker Compose (most control, most responsibility)

Use this if you're running on a VPS (a DigitalOcean droplet, an EC2
instance, etc.) and want everything — frontend, API, and database — on one
machine. This is the `docker-compose.yml` at the repo root, which brings up
all three as the `web`, `api`, and `db` services.

1. SSH into your server. Install Docker and Docker Compose if not present.
2. Clone the repo onto the server.
3. `cd` into the repo root, then:
   ```bash
   cp server/.env.example server/.env
   ```
   Edit `server/.env` with real production values (see the checklist above).
   Also set `VITE_API_URL` as a shell environment variable (or in a root
   `.env` file that docker-compose reads automatically) — this needs to be
   your server's real public URL/port for the API, since the frontend
   container bakes this in at build time:
   ```bash
   export VITE_API_URL=https://your-domain.com
   ```
4. Bring everything up:
   ```bash
   docker compose up -d
   ```
5. Run the migration inside the running API container:
   ```bash
   docker compose exec api npm run db:migrate
   ```
6. Put a reverse proxy (Caddy or nginx) in front of the host — routing your
   domain to the `web` service (port 8080) and a `/api`-style path or
   subdomain to the `api` service (port 3001). TLS termination happens here
   too — Plaid requires HTTPS for webhooks, and you should never expose a
   raw Node process or even nginx directly to the internet without TLS in
   front of it. Caddy is the simplest option: it provisions and renews
   Let's Encrypt certificates automatically with a 3-line Caddyfile.
7. Point your domain's DNS at the server, set `PLAID_WEBHOOK_URL` and
   `CLIENT_ORIGIN` to your real domain, then rebuild (not just restart —
   `VITE_API_URL` changes require a fresh build of the frontend image):
   ```bash
   docker compose up -d --build
   ```

**You are responsible for:** OS security patches, Docker security updates,
Postgres backups (the named volume in `docker-compose.yml` persists data
across container restarts, but it is *not* a backup — a disk failure on
that VM loses everything unless you also configure `pg_dump` to an external
location), and uptime monitoring. This is why managed platforms (Options
A–C) are the better default for almost everyone — you're trading a small
monthly fee for not having to be your own ops team.

---

## After any deployment: verify the full chain

Once your backend is live, walk through this checklist before pointing
real users at it:

```bash
# 1. Health check returns 200 and confirms DB connectivity
curl https://your-api-domain.com/health

# 2. Registration works end to end
curl -X POST https://your-api-domain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123","name":"Test"}'

# 3. CORS is correctly scoped — this should be rejected if your frontend
#    origin doesn't match CLIENT_ORIGIN
curl -X POST https://your-api-domain.com/auth/login \
  -H "Origin: https://some-random-site.com" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}' -v
# Look for the absence of Access-Control-Allow-Origin in the response headers
```

Then in the Plaid dashboard, send a test webhook to your `PLAID_WEBHOOK_URL`
and confirm your server logs show it was verified and processed (not
rejected with a 400 from `verifyPlaidWebhook`).

Finally, delete the test account you created in step 2:
```bash
curl -X DELETE https://your-api-domain.com/auth/me --cookie "..."
```
