import { query, pool } from "../db/client.js";
import {
  PROVIDERS, addIdentity, listProviders, findUserByIdentity, removeIdentity,
} from "../lib/identities.js";

let pass = 0, fail = 0;
const t = async (label, fn) => {
  try { await fn(); console.log(`  PASS  ${label}`); pass++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message.split("\n")[0]}`); fail++; }
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const mk = async (email, withPassword = true) => (await query(
  "INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING *",
  [email, withPassword ? "$2b$12$x" : null]
)).rows[0];

console.log("=== Google-only account (no password at all) ===");
const g = await mk(`g${Date.now()}@t.test`, false);
await t("can create a user with NULL password_hash", async () => {
  if (g.password_hash !== null) throw new Error("expected null");
});
await t("link google identity", async () => {
  await addIdentity(g.id, PROVIDERS.GOOGLE, "google-sub-12345", "g@gmail.com");
  eq(await listProviders(g.id), ["google"], "providers");
});
await t("found by (provider, sub)", async () => {
  const u = await findUserByIdentity(PROVIDERS.GOOGLE, "google-sub-12345");
  if (u?.id !== g.id) throw new Error("wrong user");
});
await t("NOT found by a different sub with the same email", async () => {
  const u = await findUserByIdentity(PROVIDERS.GOOGLE, "attacker-sub-99999");
  if (u) throw new Error("matched on something other than sub — takeover risk");
});
await t("re-linking same provider is idempotent (no duplicate row)", async () => {
  await addIdentity(g.id, PROVIDERS.GOOGLE, "google-sub-12345", "g@gmail.com");
  eq(await listProviders(g.id), ["google"], "providers after relink");
});
await t("removing the ONLY identity is refused", async () => {
  try { await removeIdentity(g.id, PROVIDERS.GOOGLE); }
  catch (e) { if (e.status === 409) return; throw e; }
  throw new Error("allowed removal of last sign-in method — user would be locked out");
});

console.log("\n=== account with both methods ===");
const b = await mk(`b${Date.now()}@t.test`, true);
await addIdentity(b.id, PROVIDERS.PASSWORD, b.id, b.email);
await t("link google alongside password", async () => {
  await addIdentity(b.id, PROVIDERS.GOOGLE, "google-sub-abcde", "b@gmail.com");
  eq((await listProviders(b.id)).sort(), ["google", "password"], "providers");
});
await t("can unlink google (password remains)", async () => {
  await removeIdentity(b.id, PROVIDERS.GOOGLE);
  eq(await listProviders(b.id), ["password"], "providers after unlink");
});
await t("now cannot unlink the remaining password", async () => {
  try { await removeIdentity(b.id, PROVIDERS.PASSWORD); }
  catch (e) { if (e.status === 409) return; throw e; }
  throw new Error("locked the user out");
});

console.log("\n=== cross-account safety ===");
await t("one google sub cannot be linked to two accounts", async () => {
  const other = await mk(`o${Date.now()}@t.test`, true);
  try {
    await addIdentity(other.id, PROVIDERS.GOOGLE, "google-sub-12345", "g@gmail.com");
  } catch (e) {
    if (/unique|duplicate/i.test(e.message)) return;
    throw e;
  }
  throw new Error("same Google account attached to two flo·w accounts");
});
await t("deleting a user cascades their identities away", async () => {
  const d = await mk(`d${Date.now()}@t.test`, true);
  await addIdentity(d.id, PROVIDERS.PASSWORD, d.id, d.email);
  await query("DELETE FROM users WHERE id = $1", [d.id]);
  const { rows } = await query("SELECT 1 FROM auth_identities WHERE user_id = $1", [d.id]);
  if (rows.length) throw new Error("orphaned identity rows left behind");
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
await pool.end();
process.exit(fail ? 1 : 0);
