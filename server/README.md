# Centsible — Backend Server

Express + PostgreSQL backend. All Plaid API calls happen here — the frontend never touches a Plaid token.

For deploying this to production, see [`DEPLOYMENT.md`](../DEPLOYMENT.md) at the repo root.

---

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local, Docker, or managed — see DEPLOYMENT.md for managed options)

---

## Local setup

### 1. Install dependencies

```bash
cd server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env` — see the inline comments in `.env.example` for what each value
means and how to generate the secrets. At minimum you need:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate with the `node -e` command in the file
- `ENCRYPTION_KEY` — generate with the `node -e` command in the file
- `DATABASE_URL` — your Postgres connection string
- `PLAID_CLIENT_ID` / `PLAID_SECRET` — from [dashboard.plaid.com](https://dashboard.plaid.com) (sandbox is fine for local dev)
- `PLAID_WEBHOOK_URL` — for local dev, use [ngrok](https://ngrok.com): `ngrok http 3001`, then paste the forwarding URL + `/plaid/webhook`

### 3. Create the database

**Option A — Docker (recommended, no local Postgres install needed):**
```bash
cd ..  # repo root
docker compose up -d db
```

**Option B — local Postgres:**
```bash
psql -U postgres -c "CREATE DATABASE flow_db;"
psql -U postgres -c "CREATE USER flow_user WITH PASSWORD 'yourpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE flow_db TO flow_user;"
```

### 4. Run migrations

```bash
npm run db:migrate
```

Creates all tables, indexes, and triggers. Safe to re-run against an
existing database — every statement is idempotent (`IF NOT EXISTS` /
`ADD COLUMN IF NOT EXISTS`), so applying it again after a schema change
only adds what's missing.

### 5. Start the server

```bash
# Development — USE THIS LOCALLY
npm run dev

# Production only
npm start
```

`npm run dev` runs the server under nodemon, which restarts it whenever you
change `index.js`, `routes/`, `lib/`, `db/`, `middleware/`, or `.env`
(see `nodemon.json`).

`npm start` runs plain `node index.js` with **no reload**. Using it locally is
a reliable way to lose an afternoon: you add a route or a schema field, the
server keeps serving the old code, and the change looks broken when it isn't.
The `.env` watch matters for the same reason — dotenv reads that file once at
startup, so pasting a Plaid secret or changing a rate limit previously did
nothing until you restarted by hand.

Two things nodemon does NOT do:

- **Editing `.env` restarts the server but does not run migrations.** After a
  schema change, run `npm run db:migrate` yourself.
- **Editing files in `scripts/` is ignored on purpose**, so tweaking a test
  doesn't bounce the API and drop in-flight requests.

The server starts on port `3001` by default. Confirm it's healthy:
```bash
curl http://localhost:3001/health
```

---

## Running with Docker Compose (API + Postgres together)

From the repo root, not inside `server/`:
```bash
cp server/.env.example server/.env   # then fill in real values
docker compose up -d
docker compose exec api npm run db:migrate
```

See `DEPLOYMENT.md` for taking this to a real production host.

---

## Project structure

```
server/
├── index.js                        # Entry point — middleware, routes, graceful shutdown
├── Dockerfile                      # Multi-stage production image
├── .dockerignore
├── .env.example                    # Environment variable template
├── package.json
├── db/
│   ├── client.js                   # PostgreSQL connection pool + query helper
│   └── migrate.js                  # Idempotent schema migration
├── lib/
│   ├── crypto.js                   # AES-256-GCM encryption for Plaid tokens
│   ├── jwt.js                      # JWT issue, verify, refresh rotation
│   ├── plaid.js                    # Plaid SDK client + category normalisation
│   └── sync.js                     # Cursor-based incremental transaction sync
├── middleware/
│   ├── auth.js                     # requireAuth / optionalAuth / requireOwns / validateUUID
│   └── verifyPlaidWebhook.js       # JWS signature verification for Plaid webhooks
└── routes/
    ├── auth.js                     # Register, login, refresh, logout, /me, /onboarding
    ├── plaid.js                    # Link token, token exchange, transactions, accounts, webhook
    ├── data.js                     # Goals, budgets, manual transaction CRUD
    └── rewards.js                  # Points, earning, redemption (server-authoritative pricing)
```

---

## Security model

| Threat | Mitigation |
|--------|-----------|
| Token theft via XSS | HttpOnly cookies — JS cannot read them |
| CSRF | JSON-only request bodies (forces a CORS preflight on every cross-origin mutation) + strict CORS origin allowlist. Note cookies are `SameSite=None` in production, which is required for a split frontend/API deployment — so SameSite is *not* what protects you here. `express.urlencoded` is intentionally disabled: form encoding is a CORS "simple request" that skips preflight, which made cross-site state changes possible. |
| Brute-force login | 10 req/15min rate limit on auth endpoints |
| DB dump exposing Plaid tokens | AES-256-GCM encryption at rest |
| User enumeration on login | Identical error + constant-time bcrypt compare |
| Stale refresh tokens | Rotation on every use. Tokens are stored as SHA-256 hashes and looked up by index, so replaying a spent token is detected and revokes the whole family. (bcrypt is deliberately *not* used here — its per-hash salt makes lookup-by-hash impossible, which previously forced a global scan and made family revocation unimplementable.) |
| Deleted-account tokens still working | `requireAuth` checks the user row still exists, not just the JWT |
| Over-fetching / IDOR | Every DB query scoped to `req.userId`; `requireOwns`/`validateUUID` on path params |
| Forged webhook events | JWS signature + body hash verification against Plaid's key API |
| Forged point values / charity prices | Server-side catalogues in `routes/rewards.js` — client sends only an action key or charity ID, never an amount |
| Manual transactions overwriting bank data | `source` column — manual writes are scoped to `source = 'manual'`, Plaid sync never touches those rows |
| Race condition on point redemption | Single atomic `UPDATE ... WHERE points >= $1`, not a read-then-write |
| Payload attacks | 10kb body size limit |
| Common HTTP vulnerabilities | Helmet headers (CSP, HSTS, X-Frame-Options, etc.) |
| Dropped requests during deploys | Graceful shutdown — `SIGTERM` drains in-flight requests before closing the DB pool |
| False-positive health checks | `/health` verifies real DB connectivity, not just that the process is alive |

---

## What's built

All seven original steps plus five follow-on improvements are complete:

1. Server setup — Helmet, CORS, rate limiting, body parsing
2. Database schema + AES-256-GCM token encryption
3. Auth endpoints — register, login, refresh, logout, `/me`
4. Plaid proxy — link token, token exchange, transactions, accounts, webhook stub
5. Plaid webhook — full JWS signature verification
6. Session middleware refinements — DB existence checks, `optionalAuth`, `requireOwns`, `validateUUID`
7. Frontend wiring — React app calls this backend for everything

Plus:
- Goals and budgets persistence
- Rewards (points + redemption) persistence with server-authoritative pricing
- Onboarding completion persisted server-side (`users.onboarded_at`)
- Manual transaction CRUD, cleanly separated from Plaid-synced data
- Loading and error states surfaced throughout the UI
- Production deployment config — Dockerfile, docker-compose, graceful shutdown, real health checks

See `DEPLOYMENT.md` at the repo root for taking this live.
