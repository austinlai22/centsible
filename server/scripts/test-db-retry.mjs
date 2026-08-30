/**
 * query()'s retry behaviour, which decides whether a sleeping database costs
 * the user a 500 or nothing at all.
 *
 * Neon's free tier scales its compute to zero when idle. Waking it produces
 * two different-looking failures that must NOT be handled the same way:
 *
 *   "…due to connection timeout"  the pool never handed out a client, so the
 *                                 statement provably never ran. Safe to retry
 *                                 whatever it was.
 *   "…terminated unexpectedly"    the socket closed mid-flight. The query may
 *                                 already have committed with only the reply
 *                                 lost, so retrying a write here is how you
 *                                 get a duplicate row.
 *
 * Mocks pool.query directly rather than reaching a real Postgres — what is
 * under test is query()'s OWN decision about when to try again, not the
 * driver. Same approach as test-full-resync.mjs: pool is a mutable Pool
 * INSTANCE, so its method can be replaced even though the module's exports
 * cannot.
 */
import "dotenv/config";

const dbModule = await import("../db/client.js");
const { query, pool } = dbModule;

let pass = 0, fail = 0;
const t = async (label, fn) => {
  try { await fn(); console.log(`  PASS  ${label}`); pass++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); fail++; }
};
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
};

/** Fails the first `failTimes` calls with `err`, then succeeds. */
function mock(err, failTimes = 1) {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push(sql);
    if (calls.length <= failTimes) throw new Error(err);
    return { rows: [{ ok: true }], attempt: calls.length };
  };
  return calls;
}

const ACQUIRE = "Connection terminated due to connection timeout";
const DROPPED = "Connection terminated unexpectedly";

const SELECT = "SELECT id, email, name FROM users WHERE id = $1";
const INSERT = "INSERT INTO transactions (user_id, amount) VALUES ($1, $2)";
const UPDATE = "UPDATE users SET name = $1 WHERE id = $2";
// The exact statement from middleware/auth.js — the one the Sentry report
// came from, and the reason any of this exists.
const AUTH   = "SELECT id, email, name FROM users WHERE id = $1";

console.log("\n=== the happy path is untouched ===");
await t("a query that works is not retried", async () => {
  const calls = mock(ACQUIRE, 0);
  await query(SELECT, ["x"]);
  eq(calls.length, 1, "calls");
});

console.log("\n=== acquisition timeout: nothing ran, so anything may be retried ===");
await t("a read is retried and succeeds", async () => {
  const calls = mock(ACQUIRE);
  const res = await query(SELECT, ["x"]);
  eq(calls.length, 2, "calls");
  eq(res.rows[0].ok, true, "result");
});
await t("the auth lookup from the Sentry report survives a sleeping database", async () => {
  const calls = mock(ACQUIRE);
  const res = await query(AUTH, ["u1"]);
  eq(calls.length, 2, "calls");
  eq(res.rows[0].ok, true, "result");
});
await t("a WRITE is retried too — the pool never handed out a client", async () => {
  const calls = mock(ACQUIRE);
  await query(INSERT, ["u1", 10]);
  eq(calls.length, 2, "calls");
});

console.log("\n=== dropped connection: ambiguous, so only reads ===");
await t("a read is retried", async () => {
  const calls = mock(DROPPED);
  await query(SELECT, ["x"]);
  eq(calls.length, 2, "calls");
});
await t("an INSERT is NOT retried — it may already have committed", async () => {
  const calls = mock(DROPPED);
  let threw = false;
  try { await query(INSERT, ["u1", 10]); } catch { threw = true; }
  eq(calls.length, 1, "calls");
  eq(threw, true, "propagated to the caller");
});
await t("an UPDATE is NOT retried either", async () => {
  const calls = mock(DROPPED);
  try { await query(UPDATE, ["a", "b"]); } catch { /* expected */ }
  eq(calls.length, 1, "calls");
});
await t("a SELECT that writes via CTE is treated as a write", async () => {
  const calls = mock(DROPPED);
  try { await query("SELECT * FROM x WHERE id IN (DELETE FROM y RETURNING id)", []); } catch { /* expected */ }
  eq(calls.length, 1, "calls");
});

console.log("\n=== everything else fails as before ===");
await t("a genuine SQL error is not retried", async () => {
  const calls = mock('syntax error at or near "SLECT"');
  let threw = false;
  try { await query(SELECT, ["x"]); } catch { threw = true; }
  eq(calls.length, 1, "calls");
  eq(threw, true, "propagated to the caller");
});
await t("a constraint violation is not retried", async () => {
  const calls = mock('duplicate key value violates unique constraint "users_email_key"');
  try { await query(INSERT, ["u1", 10]); } catch { /* expected */ }
  eq(calls.length, 1, "calls");
});
await t("it retries ONCE, never in a loop", async () => {
  const calls = mock(ACQUIRE, 99);   // never recovers
  let threw = false;
  try { await query(SELECT, ["x"]); } catch { threw = true; }
  eq(calls.length, 2, "calls");
  eq(threw, true, "gives up and propagates");
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
