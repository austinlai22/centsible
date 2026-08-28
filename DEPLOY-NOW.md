# Deploy Centsible — the $0 path

Repo: <https://github.com/austinlai22/centsible> (private)

Three services, in this order, because each one needs a value from the last.
Budget ~20 minutes. No card required at any step.

Your generated secrets are in **`DEPLOY-SECRETS.local.txt`** (gitignored).
Delete that file once they're pasted into Render.

---

## 1 · Database — Neon

1. <https://neon.tech> → sign in with GitHub → **New Project**
2. Name it `centsible`, pick the region nearest you
3. Copy the **connection string** (starts `postgresql://`)

Neon rather than Render's Postgres: **Render's free database is deleted after
30 days.** Neon's free tier is permanent and suspends compute on overage
instead of destroying data.

---

## 2 · API — Render

1. <https://render.com> → sign in with GitHub → **New → Web Service**
2. Connect `austinlai22/centsible`
3. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm run start:prod`
   - **Instance Type:** Free

`start:prod` runs the migration before booting. The migration is idempotent —
safe on every deploy — which matters because Render's free tier has no
reliable shell to run it from by hand.

4. **Environment** — add these:

```
NODE_ENV=production
DATABASE_URL=<the Neon connection string from step 1>
ENCRYPTION_KEY=<from DEPLOY-SECRETS.local.txt>
JWT_ACCESS_SECRET=<from DEPLOY-SECRETS.local.txt>
JWT_REFRESH_SECRET=<from DEPLOY-SECRETS.local.txt>
PLAID_CLIENT_ID=<your Plaid client_id>
PLAID_SECRET=<your Plaid sandbox secret>
PLAID_ENV=sandbox
COOKIE_SAME_SITE=lax
CLIENT_ORIGIN=https://PLACEHOLDER
TRUST_PROXY_HOPS=1
```

`CLIENT_ORIGIN` gets its real value in step 4 — Vercel hasn't given you a URL
yet. Everything else is final.

5. Deploy. Copy the service URL (like `https://centsible-api.onrender.com`).
6. Check it: `curl https://your-api.onrender.com/health` → `{"status":"ok","db":"connected"}`

---

## 3 · Frontend — Vercel

1. Edit **`frontend/vercel.json`**, replacing `REPLACE-WITH-YOUR-API-HOST`
   with your Render host (no scheme, no trailing slash):

```json
{ "source": "/api-proxy/:path*", "destination": "https://centsible-api.onrender.com/:path*" }
```

2. Commit and push:

```bash
git add frontend/vercel.json && git commit -m "Point the API proxy at Render" && git push
```

3. <https://vercel.com> → sign in with GitHub → **Add New → Project** → import
   `centsible`
4. Settings:
   - **Root Directory:** `frontend`
   - Framework preset: Vite (auto-detected)
5. **Environment Variables:** `VITE_API_URL` = `/api-proxy`
6. Deploy.

`/api-proxy` rather than the Render URL directly is what keeps you out of
third-party-cookie territory. Vercel rewrites the request server-side, so the
browser sees same-origin, cookies stay first-party, and **Safari doesn't drop
your session**. It also removes a CORS preflight from every write.

`VITE_API_URL` is inlined at build time — changing it later requires a new
build, not just a redeploy of the same one.

---

## 4 · Close the loop

Back in **Render → Environment**, set `CLIENT_ORIGIN` to your real Vercel URL:

```
CLIENT_ORIGIN=https://centsible.vercel.app
```

It must match **exactly** — scheme, host, no trailing slash. A mismatch is
refused as a CORS preflight, which browsers hide from JavaScript; the app can
only say "couldn't reach the server". Render redeploys automatically.

Add more origins with commas as you get preview URLs:
`https://centsible.vercel.app,https://centsible-git-main-you.vercel.app`

---

## 5 · Verify

1. Open the Vercel URL, sign up, complete onboarding
2. Add a transaction, check Budget and the runway card
3. Sign out and back in

Then delete `DEPLOY-SECRETS.local.txt`.

---

## What to expect

**Cold starts.** Render's free tier sleeps after ~15 minutes idle. The first
request then takes 30–60 seconds and the app looks frozen. Fine for you and a
few testers; not something to promote until you're on a paid instance.

**Sandbox Plaid.** "Link a bank" only reaches Plaid's fake institutions
(`user_good` / `pass_good`). Manual entry, runway, budgets and goals all work
normally.

**Editing from anywhere.** `git push` redeploys both services. Nothing needs to
run on your laptop.

---

## Still outstanding

- **Privacy policy placeholders** — `[Company Legal Name]`, `[State]`,
  `[Address]`, and the provider table. Fine while it's you and a few testers;
  not fine once strangers sign up.
- **No terms of service.**
- **No error reporting** — the error boundary logs to a console nobody reads.
  Sentry's free tier plugs into the existing `componentDidCatch` hook.

`bash scripts/preflight.sh` re-checks all of this.
