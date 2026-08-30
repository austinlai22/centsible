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

  /**
   * 10s, raised from 2s.
   *
   * Neon's free tier scales the compute to zero after a few minutes idle, so
   * the first request after a quiet spell has to WAKE the database before it
   * can connect at all. That routinely takes longer than two seconds, and the
   * pool was giving up and throwing "Connection terminated due to connection
   * timeout" — which requireAuth turns into a 500 on EVERY authenticated
   * request, not a slow one, until something else happens to warm it.
   *
   * "Fail fast rather than hang" is the right instinct against an always-on
   * database and the wrong one against a serverless database, where the slow
   * path is normal operation rather than a symptom of anything.
   */
  connectionTimeoutMillis: 10_000,

  // Keeps the TCP socket warm so an idle connection is less likely to be
  // dropped silently somewhere in between and then handed out dead — the
  // "Connection terminated unexpectedly" half of the same problem.
  keepAlive: true,
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
 * The two connection-level failures a serverless database produces, which are
 * not the same thing and must not be treated the same way.
 *
 * An ACQUISITION TIMEOUT is thrown by the pool before a client is ever handed
 * out, so the statement provably never reached Postgres.
 *
 * A DROPPED CONNECTION is ambiguous: the socket closed, but the query may
 * have already committed with only the response lost. Retrying that blindly
 * is how duplicate rows get written.
 */
const isAcquireTimeout    = (err) => /connection terminated due to connection timeout/i.test(err?.message || "");
const isDroppedConnection = (err) => /connection terminated unexpectedly/i.test(err?.message || "");

/**
 * Whether repeating a statement can change anything. Deliberately strict: a
 * bare SELECT with no write keyword anywhere in it. Anything this can't prove
 * is read-only is treated as a write, because the cost of being wrong in that
 * direction is a duplicated row and the cost of being wrong in the other is
 * one error the user was going to see anyway.
 */
const isReadOnly = (sql) => /^\s*select\b/i.test(sql) && !/\b(insert|update|delete|merge)\b/i.test(sql);

/**
 * Thin query helper — use this everywhere instead of pool.query() to get
 * consistent error context in logs, and one retry for the specific failures
 * that mean "the database was asleep" rather than "the database said no".
 *
 * Without this, waking Neon costs a 500 on whichever request happened to
 * arrive first. Raising connectionTimeoutMillis above covers the common case;
 * this covers the rest — chiefly a pooled connection that the server closed
 * while it was idle, which pg only discovers at the moment it is used.
 */
export async function query(sql, params) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      const worthRetrying =
        attempt === 0 &&
        (isAcquireTimeout(err) || (isDroppedConnection(err) && isReadOnly(sql)));

      if (!worthRetrying) {
        console.error("[db] Query error:", err.message, "| SQL:", sql.slice(0, 80));
        throw err;
      }

      console.warn("[db] Connection error, retrying once:", err.message, "| SQL:", sql.slice(0, 80));
      // A beat for the compute to finish waking, rather than immediately
      // spending the retry against a database that is still starting.
      await new Promise((r) => setTimeout(r, 250));
    }
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
