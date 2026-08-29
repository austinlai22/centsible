/**
 * fullResync must ignore whatever cursor is already stored — that's the
 * entire point (Plaid's incremental sync never re-sends an unchanged
 * transaction, so a stale category can only be fixed by pulling from
 * scratch). Mocks plaidClient.transactionsSync directly rather than hitting
 * real Plaid, since what's under test is syncItem's OWN cursor-selection
 * logic, not Plaid's API.
 */
import "dotenv/config";

const calls = [];
const mockClient = {
  transactionsSync: async ({ cursor }) => {
    calls.push(cursor);
    return { data: { added: [], modified: [], removed: [], has_more: false, next_cursor: "new-cursor-from-plaid" } };
  },
};

// Swap the real Plaid client for the mock before syncItem is imported, since
// lib/sync.js imports plaidClient at module load time.
const plaidModule = await import("../lib/plaid.js");
plaidModule.plaidClient.transactionsSync = mockClient.transactionsSync;

const cryptoModule = await import("../lib/crypto.js");
const dbModule = await import("../db/client.js");
const encrypted = cryptoModule.encrypt("fake-access-token-for-this-test");
// Stub out the DB write at the end of syncItem — this test only cares what
// cursor syncItem PASSES to Plaid, not persistence. connectClient() itself is
// a top-level export (read-only in ESM, can't be monkey-patched), but it
// just wraps pool.connect() — pool is a mutable Pool INSTANCE, so its method
// can be overridden the same way plaidClient.transactionsSync was above.
dbModule.pool.connect = async () => ({
  on: () => {},
  query: async () => ({}),
  release: () => {},
});

const { syncItem } = await import("../lib/sync.js");

let pass = 0, fail = 0;
const t = (label, fn) => { try { fn(); console.log(`  PASS  ${label}`); pass++; } catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); fail++; } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };

await syncItem({ id: "x", user_id: "u", access_token_enc: encrypted, cursor: "old-stored-cursor" });
t("a normal sync uses the item's stored cursor", () => eq(calls.at(-1), "old-stored-cursor", "cursor passed to Plaid"));

calls.length = 0;
await syncItem({ id: "x", user_id: "u", access_token_enc: encrypted, cursor: "old-stored-cursor" }, { fullResync: true });
t("fullResync ignores the stored cursor entirely", () => eq(calls.at(-1), undefined, "cursor passed to Plaid"));

calls.length = 0;
await syncItem({ id: "x", user_id: "u", access_token_enc: encrypted, cursor: null });
t("a normal sync with no stored cursor also starts from scratch (unchanged behaviour)",
  () => eq(calls.at(-1), undefined, "cursor passed to Plaid"));

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
