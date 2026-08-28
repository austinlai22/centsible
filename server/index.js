/**
 * Centsible — Express server entry point
 *
 * Security layers applied here (in order):
 *  1. Helmet       — sets secure HTTP headers (XSS, clickjacking, MIME sniffing, etc.)
 *  2. CORS         — only accepts requests from the configured frontend origin
 *  3. Rate limiter — caps requests per IP to prevent brute-force and scraping
 *  4. JSON parser  — with size limit to prevent payload-based DoS
 *  5. Cookie parser — for reading HttpOnly JWT cookies
 *
 * All Plaid API calls happen here on the server.
 * The frontend never receives or stores Plaid access tokens.
 */

// Must be the very first import — see instrument.js for why.
import "./instrument.js";

import "dotenv/config";
import * as Sentry from "@sentry/node";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";

import { testConnection, query, pool } from "./db/client.js";
import authRouter    from "./routes/auth.js";
import plaidRouter   from "./routes/plaid.js";
import dataRouter    from "./routes/data.js";
import rewardsRouter from "./routes/rewards.js";
import mfaRouter     from "./routes/mfa.js";
import calendarRouter from "./routes/calendar.js";

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── 0. Trust proxy ──────────────────────────────────────────────────────────
// Railway, Render, Fly, and any nginx/Caddy reverse proxy terminate TLS and
// forward the real client IP in X-Forwarded-For. Without this, req.ip is the
// PROXY's IP for every request — so all users share a single rate-limit
// bucket and the 10-per-15min auth limiter locks out the entire app after ten
// login attempts total. express-rate-limit v7 also refuses to start when it
// sees X-Forwarded-For with trust proxy unset.
//
// `1` = trust exactly one proxy hop, which is what all the platforms above
// put in front of you. Do NOT use `true` (trust everything) — that lets a
// client spoof X-Forwarded-For and evade rate limiting entirely.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

// ─── 1. Helmet — secure HTTP headers ─────────────────────────────────────────
// Sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
// Strict-Transport-Security, and more — all of which are meaningful for a
// JSON API (they apply to any response this server sends, including error
// pages and the rare case of a browser navigating here directly).
//
// CSP is intentionally left at Helmet's default (default-src 'self') rather
// than customised here: directives like script-src or frame-src only matter
// for HTML pages a browser renders, and this server never renders one — it
// returns JSON. The Plaid Link SDK and Google Fonts loaded by the frontend
// need their own CSP allowances, which belong in the FRONTEND's nginx
// config or HTML meta tag (see frontend/index.html and frontend/nginx.conf),
// not here.
app.use(helmet());

// ─── 2. CORS — restrict to known frontend origin ──────────────────────────────
// Credentials: true is required for HttpOnly cookies to be sent cross-origin.
// CLIENT_ORIGIN accepts a comma-separated list so a preview build, a staging
// deploy, and production can coexist without redeploying the API. An origin
// that is not on the list fails as a CORS preflight rejection, which the
// browser deliberately hides from JavaScript — the app sees only a generic
// network failure, so a one-character mismatch here presents as "something
// went wrong" with nothing in the logs. Worth getting exactly right.
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",").map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // No Origin header: same-origin, curl, or a server-to-server call.
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.warn(`[cors] refused origin ${origin} — allowed: ${ALLOWED_ORIGINS.join(", ")}`);
    return cb(null, false);
  },
  credentials: true,
  methods:     ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ─── 3. Rate limiting ─────────────────────────────────────────────────────────
// Global limiter: 100 requests / 15 minutes per IP.
// Auth endpoints get a stricter limiter defined in routes/auth.js.
//
// /plaid/webhook is exempted via `skip` below: webhook calls all originate
// from Plaid's own infrastructure (shared IPs across every Centsible customer's
// webhook traffic, not just yours), so a busy sync period for other users
// could exhaust this bucket and cause Plaid to drop legitimate events for
// you. The webhook endpoint doesn't need this protection anyway — it's
// already gated by JWS signature verification (verifyPlaidWebhook), which is
// a stronger guarantee than "fewer than 100 requests" could ever provide.
//
// 600/15min (~40/min) rather than 100: a single page load fans out to
// /auth/me, /plaid/transactions, /plaid/accounts, /api/goals, /api/budgets,
// and /api/rewards + /api/rewards/history — seven requests before the user
// touches anything. At 100 a normal session hit the wall in ~14 page loads.
const globalLimiter = rateLimit({
  windowMs:  15 * 60 * 1000, // 15 minutes
  max:       Number(process.env.RATE_LIMIT_MAX ?? 600),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests — please try again later." },
  skip: (req) => req.path === "/plaid/webhook",
});
app.use(globalLimiter);
// --- 4. Body parsers ---------------------------------------------------------------
// Plaid webhook signature verification requires the exact raw request body bytes.
// We capture rawBody for /plaid/webhook only; everything else gets normal JSON parsing.
app.use((req, res, next) => {
  if (req.path === "/plaid/webhook") {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      req.rawBody = data;
      try { req.body = JSON.parse(data); } catch (_) { req.body = {}; }
      // body-parser only skips a request when req._body is truthy. Setting
      // req.body alone is not enough: express.json() below would still try to
      // re-read the stream, and because setEncoding("utf8") was called above,
      // raw-body throws "stream encoding should not be set" → every Plaid
      // webhook 500s before verifyPlaidWebhook ever runs.
      req._body = true;
      next();
    });
  } else {
    next();
  }
});
app.use(express.json({ limit: "10kb" }));

// NOTE: express.urlencoded is deliberately NOT enabled.
//
// This API only ever consumes JSON, and accepting form encoding opened a real
// CSRF hole. In production these cookies are SameSite=None (required when the
// frontend and API live on different domains), so the browser attaches them to
// cross-site requests. A urlencoded POST is a CORS "simple request", meaning
// the browser fires it WITHOUT a preflight — so an auto-submitting form on an
// attacker's page reached this API with the victim's session attached. CORS
// then blocked the attacker from reading the response, but the state change
// had already happened. Verified end to end: a form on evil.com could spend a
// logged-in user's reward points via POST /api/rewards/redeem, because
// charity_id is parsed with z.coerce.number() and accepts the string "5".
//
// With JSON as the only accepted encoding, any cross-origin mutation requires
// Content-Type: application/json, which is never a simple request — it always
// preflights, and the preflight is what CORS rejects.

// ─── 5. Cookie parser ────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── 6. Enforce JSON on state-changing requests ──────────────────────────────
// Defence in depth behind the parser choice above: even if a form parser is
// reintroduced later, a mutating request without a JSON content type is
// refused outright rather than silently becoming CSRF-able again.
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req, res, next) => {
  if (!MUTATING.has(req.method)) return next();
  // Plaid signs its own webhooks (JWS) and controls their content type.
  if (req.path === "/plaid/webhook") return next();
  // DELETE and other mutations legitimately carry no body.
  const len = req.headers["content-length"];
  if (!len || len === "0") return next();
  const ct = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json") {
    return res.status(415).json({ error: "Content-Type must be application/json" });
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// Mounted BEFORE /auth so /auth/mfa/* resolves here rather than falling
// through to authRouter's 404.
app.use("/auth/mfa", mfaRouter);
app.use("/auth",  authRouter);
app.use("/plaid", plaidRouter);
app.use("/api",   calendarRouter);   // terms + disbursements
app.use("/api",   dataRouter);
app.use("/api/rewards", rewardsRouter);

// ─── Health check ─────────────────────────────────────────────────────────────
// Unauthenticated — safe to expose, and required by most container
// orchestrators (Docker, Kubernetes, Railway, Render, Fly.io) to know when
// the container is actually ready to receive traffic vs. just "the process
// started." A health check that only confirms Express is running (not the
// DB) gives false confidence — the most common real-world failure mode is
// "server is up, database is unreachable."
app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    return res.json({ status: "ok", db: "connected", ts: new Date().toISOString() });
  } catch (err) {
    // 503, not 200 — tells the orchestrator this instance is not ready to
    // serve traffic, so it can hold off routing requests here or restart it.
    return res.status(503).json({ status: "error", db: "unreachable", ts: new Date().toISOString() });
  }
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ─── Sentry error capture ─────────────────────────────────────────────────────
// Must sit after every route (so it sees errors from all of them) and before
// the final error handler below (it re-throws via next(err), so our own
// handler still runs afterward and still owns the actual response). A no-op
// when SENTRY_DSN is unset — see instrument.js.
Sentry.setupExpressErrorHandler(app);

// ─── Global error handler ────────────────────────────────────────────────────
// Never leaks stack traces or internal details to the client.
app.use((err, _req, res, _next) => {
  // Log internally (swap for a real logger like Pino in production)
  console.error("[error]", err.message, process.env.NODE_ENV === "development" ? err.stack : "");
  const status = err.status || err.statusCode || 500;
  // Only expose message in development; always return generic error in production
  const message = process.env.NODE_ENV === "production" ? "Something went wrong" : err.message;
  res.status(status).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
let server;

async function start() {
  await testConnection(); // Verify DB is reachable before accepting traffic
  server = app.listen(PORT, () => {
    console.log(`[centsible-server] Running on port ${PORT} (${process.env.NODE_ENV})`);
  });
}

start().catch(err => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Container orchestrators send SIGTERM before killing a container (e.g. during
// a rolling deploy or autoscaling event). Without handling it, in-flight
// requests get dropped mid-response and the DB pool is torn down uncleanly.
//
// The sequence here:
//   1. Stop accepting new connections (server.close)
//   2. Let in-flight requests finish (server.close's callback fires once
//      all existing connections complete)
//   3. Close the DB pool cleanly
//   4. Exit
//
// A 10s hard-exit timer guards against a connection that never closes
// (e.g. a hung request) blocking shutdown indefinitely — container platforms
// typically force-kill after ~10-30s anyway, so this just makes the exit
// intentional rather than forced.
async function shutdown(signal) {
  console.log(`[centsible-server] Received ${signal}, shutting down gracefully…`);

  const forceExitTimer = setTimeout(() => {
    console.error("[centsible-server] Shutdown timed out — forcing exit");
    process.exit(1);
  }, 10_000);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(err => err ? reject(err) : resolve());
      });
      console.log("[centsible-server] HTTP server closed — no longer accepting requests");
    }
    await pool.end();
    console.log("[centsible-server] Database pool closed");
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    console.error("[centsible-server] Error during shutdown:", err.message);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
