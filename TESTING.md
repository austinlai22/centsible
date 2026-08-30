# Running the tests

Most suites need nothing. Twelve of them need a database and a running API,
and the setup for those is not guessable — three of them were failing on
misconfiguration rather than on real defects, and had been for a while,
because nothing recorded what they expected.

## No setup needed

Pure logic and mocked-network suites. These run anywhere:

```bash
cd frontend && npm run smoke              # every page renders
                npm run test:runway       # runway arithmetic
                npm run test:audit        # term boundaries
                npm run test:regressions  # transfer categories
                npm run test:landing      # landing page + all four routes
                npm run test:bank-refresh # link/unlink refreshes transactions

cd server   && npm run test:totp          # TOTP generation and drift
                npm run test:categories   # loan category mapping
                npm run test:full-resync   # cursor selection on resync
                npm run test:db-retry     # query() retry decisions
```

`test:landing` and `test:bank-refresh` mock the network, but they match on the
request **path**, so they work whether `VITE_API_URL` is `/api-proxy` or a real
`http://localhost:3001`. Don't reintroduce a base-URL glob — under the wrong
base it matches nothing, every request reaches the real backend, and the suite
fails on a redirect with no hint the mocks were never installed.

## The rest: database + API required

### 1. Database

```bash
docker compose up -d db          # postgres:16-alpine, port 5432
cd server && npm run db:migrate
```

Data lives in the named volume `flo-app-full_flow_postgres_data` and survives
`docker compose down`. Only `down -v` destroys it.

If the container fails to start with *"RWLayer of container … is unexpectedly
nil"*, Docker's container state is corrupt (usually after a force-quit).
`docker rm -f flo-app-full-db-1` and start it again — the volume is separate,
so no data is lost.

### 2. API, with the rate limits raised

```bash
cd server && AUTH_RATE_LIMIT_MAX=100000 RATE_LIMIT_MAX=100000 npm run dev
```

**Both variables are load-bearing.** Auth is limited to 10 attempts per 15
minutes per IP, and every suite registers a fresh account — so running two of
them back to back trips it, and every subsequent test fails with
`{"error":"Authentication required"}`. That reads as broken auth, not as a
throttle, and the suites that *expect* a refusal will still pass, for the wrong
reason. Raise them for test runs only; the default is the brute-force defence
for password login and must stay tight in production.

### 3. Frontend

```bash
cd frontend && VITE_API_URL=http://localhost:3001 npx vite --port 5173
```

Then:

```bash
cd server   && npm run test:identities   # auth identity linking
                npm run test:api          # auth, IDOR, refresh rotation
                npm run test:mfa          # 2FA enrolment and recovery
                npm run test:calendar     # terms and disbursements
                bash scripts/test-logic.sh   # server-side invariants

cd frontend && npm run test:onboarding   # the full signup flow
                npm run test:pages        # every page against real data
                npm run test:disbursement # logging aid through the real form
                npm run test:cc-payment   # card payments excluded from totals
```

### 4. Production bundle

`test:prod` needs a **built** bundle on `vite preview`, not the dev server:

```bash
cd frontend && VITE_API_URL=http://localhost:3001 npx vite build
                npx vite preview --port 4173
                npm run test:prod
```

This is the only suite that exercises the real Content-Security-Policy and the
lazy chunks. `vite build` exiting 0 only proves it compiled.

## Notes

- Run the browser suites one at a time. Several Chromium instances competing
  for the same API produced one non-reproducible failure in `test:landing`
  during a back-to-back sweep; it passed three consecutive runs on its own.
- `scripts/test-logic.sh` has no npm script; invoke it with `bash` directly.
- Every suite creates throwaway accounts (`*@test.local`) and never cleans up.
  That is deliberate — a failed run leaves its data behind to inspect. Reset
  with `docker compose down -v && npm run db:migrate` when it gets noisy.
