# Routing and hosting

The frontend serves four real URLs. JSON has no comment syntax, so the
reasoning behind `vercel.json` lives here.

| Path      | Who sees it            | Notes |
|-----------|------------------------|-------|
| `/`       | everyone               | Public landing page, signed in or not. |
| `/login`  | signed-out             | Signed-in visitors are redirected to `/app`. |
| `/signup` | signed-out             | Same. |
| `/app`    | signed-in only         | Signed-out visitors are redirected to `/login`. |

Anything else is rewritten to `/` client-side. The implementation is
`src/lib/router.js` — pushState plus a `popstate` listener, about 40 lines.
react-router was not worth ~20 kB for four URLs, particularly with the main
bundle already close to the 250 kB guard in `vite.config.js`.

## The SPA fallback

None of `/login`, `/signup` or `/app` exists as a file on disk. Without a
fallback, the first visit to one of them — a pasted link, a bookmark, a hard
refresh — is a request the host cannot satisfy, and it 404s before any
JavaScript runs. The client-side router never gets a chance.

**Vercel** (`vercel.json`):

```json
{ "source": "/((?!api-proxy/).*)", "destination": "/index.html" }
```

Two things matter here:

- **Order.** The `/api-proxy/:path*` rule is listed first and the negative
  lookahead excludes that prefix a second time. Either alone would do; both
  together mean a reordering or a copy-paste can't quietly start answering
  API calls with HTML, which presents as JSON parse errors on every request
  rather than as a routing problem.
- **The filesystem still wins.** Vercel checks static files before applying
  rewrites, so `/assets/index-*.js`, `/favicon.svg` and `/robots.txt` keep
  serving themselves. The rewrite only catches paths with nothing behind
  them.

**nginx** (`nginx.conf`) already did the equivalent, and needed no change:

```nginx
location / { try_files $uri $uri/ /index.html; }
```

## The session hint

`localStorage["centsible.session_hint"]`, written in `src/lib/router.js`.

The session cookie is httpOnly, so the only way to know whether someone is
signed in is `GET /auth/me`. The API sleeps when idle and a cold start runs
into tens of seconds, and the landing page's primary call to action cannot
wait that long to decide whether it says "Log in" or "Open Centsible". The
hint caches the last known answer so the page renders immediately, then
corrects itself when the real response arrives.

It is **not** a security boundary. It holds one boolean-ish string — no
identity, no token, nothing personal. Every route that matters is enforced
server-side against the real cookie. A forged value shows the wrong button on
a marketing page; clicking it lands on the login form.
