/**
 * db/client.js — PostgreSQL connection pool
 *
 * Uses a single shared pool across the whole server process.
 * Pool settings are tuned for a small-to-medium MVP:
 *   - max 10 connections (raise when you have > ~1k concurrent users)
 *   - 30s idle timeout
 *   - 2s connection timeout (fail fast rather than hang)
 *
 * SSL is enforced in production. Most managed Postgres providers
 * (Supabase, Railway, Render, Neon) require it and provide the cert.
 */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:              10,
  idleTimeoutMillis:   30_000,
  connectionTimeoutMillis: 2_000,
  // Enforce SSL in production; skip for local dev unless you've set up a cert.
  //
  // rejectUnauthorized defaults to strict (validates the server cert), but is
  // overridable because several managed providers terminate TLS with a cert
  // Node won't validate out of the box — Supabase's connection pooler, Heroku
  // Postgres, and some Render/Fly setups all present self-signed or
  // intermediate-only chains. Strict verification there fails at startup with
  // "self signed certificate in certificate chain", which reads like the
  // database is down rather than a cert-chain issue.
  //
  // Prefer supplying the provider's CA via PGSSLROOTCERT over disabling this.
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
    : false,
});

// Surfaces connection errors (e.g. dropped connections) without crashing.
//
// This ONLY covers clients sitting IDLE in the pool. A client currently
// checked out via pool.connect() — every multi-statement transaction in this
// app (budgets, rewards, sync) — is a separate EventEmitter, and Node throws
// an unhandled exception for any 'error' event with no listener, crashing the
// whole process. Confirmed directly: emitting 'error' on a checked-out client
// with no listener took down the process with this exact message; the same
// emit with a listener attached did not.
//
// This is exactly what happened in production: Neon closed a connection out
// from under a checked-out client mid-transaction ("Connection terminated
// unexpectedly"), Node had nothing listening on that client, and the crash
// took every in-flight request with it — not just the one whose transaction
// actually failed. Render's restart is what a browser sees as a 502.
pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

/**
 * pool.connect(), plus the listener above's job but for the checked-out
 * client itself. Use this instead of pool.connect() directly anywhere a
 * multi-statement transaction is needed — which is everywhere pool.connect()
 * was being called before this existed.
 */
export async function connectClient() {
  const client = await pool.connect();
  client.on("error", (err) => {
    console.error("[db] Unexpected error on a checked-out client:", err.message);
  });
  return client;
}

/**
 * Thin query helper — use this everywhere instead of pool.query()
 * to get consistent error context in logs.
 */
export async function query(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error("[db] Query error:", err.message, "| SQL:", sql.slice(0, 80));
    throw err;
  }
}

/** Called on startup to verify the database is reachable. */
export async function testConnection() {
  const client = await connectClient();
  try {
    const { rows } = await client.query("SELECT NOW() AS now");
    console.log("[db] Connected to PostgreSQL:", rows[0].now);
  } finally {
    client.release();
  }
}
