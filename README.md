# Centsible

Budgeting built around a school term instead of a calendar month.

**[usecentsible.vercel.app](https://usecentsible.vercel.app)** · React + Express + PostgreSQL

> Hosted on free tiers that sleep when idle, so the first load after a quiet
> spell takes a moment to wake the API and database.

---

## The problem

Most budgeting apps assume money arrives every month, so they measure a monthly
savings rate. For a student living on financial aid, that metric celebrates the
month the disbursement landed and then goes blank for the next four. It is
answering *"what fraction did you save this month?"* when the real question is
*"how many days of money do I have left?"*

Centsible measures the second one. It calls it **runway**: money available
divided by what you're actually spending per day, measured against the days
until your next aid payment — or the end of term, whichever comes first.

That produces the thing a term-funded student can act on:

> **38 days** of money, but **52 days** left to Dec 12.
> At this rate your money runs out **Nov 28**, 14 days before the term ends.
> Spending $8.55/day less closes the gap — about 3 fewer food purchases a week.

A date, a daily number, and one specific change.

## What it does

- **Runway** — days of money against days of term, plus the date it runs out
- **Aid disbursements** — schedule expected payments; runway targets the next
  one rather than an abstract month end, and flags any that are overdue
- **Your own term dates** — semesters, quarters, trimesters, anything
- **Budgets that separate monthly from termly** — rent recurs; tuition, books
  and a housing deposit happen once a term, and averaging them across twelve
  months produces a number that means nothing
- **Bank sync via Plaid**, or manual entry — both paths work
- **Goals, points and charity donations**

## Engineering notes

The parts that were more interesting than they look.

**Runway is arithmetic, not a model.** Date maths, a trailing average, and a
division — no ML, no API call, nothing a user can't check by hand. More
importantly it *refuses to answer* when there isn't enough history: a
confident-looking projection built on four transactions is worse than an empty
state, so the card says so instead of guessing.
→ [`frontend/src/lib/runway.js`](frontend/src/lib/runway.js)

**Transfers are not spending.** Moving money into savings, or paying a credit
card bill, is not an expense — the purchases were already counted. Treated
naively, a linked savings account makes one transfer appear twice (out of
checking, into savings), which inflates both income and expenses and makes
*saving money* lower your reported savings rate. Transfer categories are
excluded from every aggregate but still visible in the transaction list.
→ [`frontend/src/constants.js`](frontend/src/constants.js)

**Auth.** Access/refresh token pairs in httpOnly cookies, refresh rotation with
reuse detection (replaying a spent token revokes the whole family), optional
TOTP 2FA with recovery codes, and per-endpoint rate limiting with a stricter
bucket on login.
→ [`server/routes/auth.js`](server/routes/auth.js), [`server/lib/mfa.js`](server/lib/mfa.js)

**Cold starts are a UX problem, not just a latency one.** The session cookie is
httpOnly, so the only way to know whether someone is signed in is to ask the
server — and on free-tier hosting that can take a while. The landing page
renders its call to action from a cached hint and corrects itself when the real
answer lands; `/app` shows the app's own chrome with skeletons rather than a
logo on a blank screen, which is indistinguishable from a crash.
→ [`frontend/src/lib/router.js`](frontend/src/lib/router.js)

**The CSP names the API host, substituted at build time** from the same variable
the app fetches with, so the two can't drift. Hardcoding it is how a build ships
with the browser silently blocking every request — and because the backend's
CORS is fine, it surfaces as an unexplained network error rather than a policy
one.
→ [`frontend/vite.config.js`](frontend/vite.config.js)

**Design tokens avoid a collision most finance UIs walk into.** Red, green and
amber are load-bearing status colours here — over budget, goal reached,
approaching limit — so the brand can't live in any of them. Teal inherits
blue's trust associations and green's money associations while colliding with
neither. Every foreground/background pair is checked against WCAG 2.1.
→ [`frontend/src/styles.js`](frontend/src/styles.js)

## Stack

| | |
|---|---|
| **Frontend** | React 18, Vite. No UI framework, no state library, no router — a ~40-line pushState router covers the four URLs |
| **Backend** | Express, PostgreSQL (`pg`), Zod validation, Helmet, JWT via `jose` |
| **Banking** | Plaid (sandbox) with incremental cursor sync and webhook handling |
| **Hosting** | Vercel (web) · Render (API) · Neon (Postgres) |
| **Monitoring** | Sentry, optional — unset means no-op |

## Tests

Twenty suites. Most need nothing; twelve need a database and a running API —
see [TESTING.md](TESTING.md) for setup.

```bash
cd frontend && npm run smoke            # every page renders, incl. degenerate props
                npm run test:runway     # the arithmetic, including refusal cases
                npm run test:landing    # landing page and all four routes
cd server   && npm run test:db-retry    # which DB failures are safe to retry
                npm run test:api        # auth, IDOR, refresh rotation
```

They test behaviour rather than implementation, and several exist because of a
specific bug: logging an aid payment once returned a 400 for everyone because
the form's default category wasn't in the server's list, and unlinking a bank
left its transactions on screen because only the account list was refetched.

## Running it locally

```bash
git clone https://github.com/austinlai22/centsible.git && cd centsible
cp server/.env.example server/.env        # fill in the generated secrets
cp frontend/.env.example frontend/.env

docker compose up -d db
cd server   && npm install && npm run db:migrate && npm run dev
cd frontend && npm install && npm run dev
```

The app runs at `localhost:5173`. Plaid is optional — transactions can be
entered by hand, and everything works without a bank connection.

## Status

An early-stage project built by one person, not a funded product. It runs on
free infrastructure, the Plaid integration is in sandbox, and the privacy policy
and terms are real documents rather than placeholders — but they still need a
contact address filled in.

It is a budgeting tool: not a bank, not a lender, not a financial advisor. Every
figure is arithmetic on numbers you and your bank supply, and neither is
verified.
