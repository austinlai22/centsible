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
  // Enforce SSL in production; skip for local dev unless you've set up a cert
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }   // strict — validates the server cert
    : false,
});

// Surfaces connection errors (e.g. dropped connections) without crashing
pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

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
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT NOW() AS now");
    console.log("[db] Connected to PostgreSQL:", rows[0].now);
  } finally {
    client.release();
  }
}
