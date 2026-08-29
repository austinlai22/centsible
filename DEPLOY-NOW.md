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
3. Render detects `server/Dockerfile` and switches to Docker runtime — there's
   no separate Build/Start Command field in this mode, so:
   - **Root Directory:** `server`
   - **Dockerfile Path / Build Context:** auto-filled to `server/Dockerfile`
     and `server/` once Root Directory is set — leave as-is
   - **Build Command:** leave blank (the Dockerfile's own `RUN npm install`
     layer is the build)
   - **Docker Command** (under Advanced): `sh scripts/start-prod.sh`
   - **Instance Type:** Free

`scripts/start-prod.sh` runs the migration, then `exec`s into the server —
the migration is idempotent, safe on every deploy. It's a script file rather
than an inline `a && exec b` string because Render's Docker Command field
passes a multi-word string to `sh` without a `-c` flag, so `sh` tries to run
it as one literal program name and fails with exit 127. A single filename
has nothing left for that to mis-parse.

(Pre-Deploy Command would be the more idiomatic place for the migration step,
but it's gated to paid instances — this gets the same effect on Free.)

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

## 6 · Error reporting — Sentry (optional, free)

Wired into the code already (server's `instrument.js`, frontend's
`ErrorBoundary`) — this just turns it on. Free tier: 5,000 events/month,
unlimited projects, one dashboard user.

1. <https://sentry.io> → sign up → create an org
2. Create **two** projects — one Node, one React (e.g.
   `centsible-api` and `centsible-web`). Separate projects so a frontend
   error storm doesn't eat the backend's share of the shared 5k/month quota,
   or the reverse.
3. Each project's **Settings → Client Keys (DSN)** has a URL like
   `https://xxxx@xxxx.ingest.sentry.io/xxxx`
4. Render → Environment → add `SENTRY_DSN` = the Node project's DSN
5. Vercel → Environment Variables → add `VITE_SENTRY_DSN` = the React
   project's DSN, then trigger a redeploy (it's inlined at build time, so
   setting it alone doesn't reach an already-built bundle)

Skip this entirely and nothing changes — both are no-ops with no DSN set.

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

- **No working contact email in the legal docs.** Both `centsible-privacy-policy.md`
  and `centsible-terms-of-service.md` currently have `[Contact email — to be
  added]` as a deliberate placeholder — the personal email that was there
  named the operator, same reason the name itself was removed elsewhere.
  CalOPPA doesn't require a physical address, but it does require *some*
  reachable contact — this is the one legal-doc gap currently blocking
  `preflight.sh`. Cheapest fix: a free email address that isn't your name
  (see the conversation this came from for the exact reasoning).
- **Sandbox-only Plaid.** Production access is Plaid's own review process,
  not a config change — apply whenever you're ready for real banks.
- **No domain/trademark check done** for "Centsible" — worth a quick search
  (`.com`/`.app` availability, USPTO) before treating the name as permanent.
  You're also on a free `usecentsible.vercel.app` subdomain for now.
- **Personal liability.** Not incorporated yet — see the note at the end of
  `centsible-terms-of-service.md` for when that stops being fine to defer.
- **No self-service data export** — the Privacy Policy is honest about this:
  it's a manual, by-email process today, not an in-app button.

`bash scripts/preflight.sh` re-checks the deploy-readiness parts of this
(secrets, CSP, dependency vulnerabilities) — it doesn't know about the legal
or business items above.
