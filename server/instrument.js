/**
 * instrument.js — Sentry initialization, imported before anything else.
 *
 * Must run before index.js's other imports so Sentry's auto-instrumentation
 * (Express, pg, http) can patch those modules before they're required
 * elsewhere. This is why index.js's very first line is `import "./instrument.js"`
 * rather than initializing Sentry inline further down the file.
 *
 * Entirely optional: with no SENTRY_DSN set, Sentry.init() below is never
 * called and this file is a no-op. Local dev without a Sentry account
 * configured behaves exactly as it did before this file existed — no errors,
 * no network calls, no noise.
 */
import "dotenv/config";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    // Errors only, no performance tracing — tracing shares the same free-tier
    // event quota (5k/month total) and a handful of testers don't generate
    // enough traffic for trace sampling to be worth spending that budget on.
    tracesSampleRate: 0,
  });
}
