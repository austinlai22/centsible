/**
 * Linking or unlinking a bank must refresh the TRANSACTIONS too, not just
 * the account list.
 *
 * The bug this exists to prevent: DELETE /plaid/items cascades through
 * plaid_item_id, so the server deletes that bank's transactions along with
 * its accounts — but About only called reloadAccounts(). The bank vanished
 * from Settings while its spending stayed on Activity, stayed in Budget, and
 * kept feeding the runway, until the user happened to reload the page. The
 * link direction had the same hole: POST /plaid/exchange syncs transactions
 * before it responds, so they exist server-side the moment the modal closes.
 *
 * Both are invisible to every other test here, because both are about a
 * request that is NOT made. So this asserts on the network: after the
 * mutation, did a fresh GET /plaid/transactions go out?
 *
 * Needs the dev server on :5173 and no backend — every endpoint is mocked,
 * which is what makes "was it refetched" observable in the first place.
 */
import { chromium } from "playwright";

const APP = "http://localhost:5173";
let pass = 0, fail = 0;
const ck = (label, ok, extra = "") => {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${extra ? "\n          " + extra : ""}`); fail++; }
};

const USER = { id: "u1", email: "a@b.c", name: "Austin", onboarded_at: "2026-01-01T00:00:00Z" };
const ACCOUNT = {
  id: "acc-1", plaid_item_id: "11111111-1111-4111-8111-111111111111",
  name: "Everyday Checking", institution_name: "Test Bank",
  type: "depository", subtype: "checking", balance_current: 1240, item_status: "healthy",
};
// One Plaid transaction, tied to the account above. Positive = expense.
const TXNS = [{ id: "t1", date: "2026-08-01", desc: "Test Bank coffee", amount: 6.5,
                category: "Food", source: "plaid" }];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));

// Counts GETs per endpoint so "was it refetched" is a number, not a guess.
const hits = { transactions: 0, accounts: 0 };
let removed = false;

await page.route("**/api-proxy/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url()).pathname.replace("/api-proxy", "");
  const json = (body, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  if (url === "/auth/me")            return json({ user: USER });
  if (url === "/plaid/transactions") { hits.transactions++; return json({ transactions: removed ? [] : TXNS }); }
  if (url === "/plaid/accounts")     { hits.accounts++;     return json({ accounts: removed ? [] : [ACCOUNT] }); }
  if (url.startsWith("/plaid/items/") && req.method() === "DELETE") { removed = true; return json({ ok: true }); }
  // Everything else the app fetches on load — empty is a valid answer.
  if (url === "/goals")              return json({ goals: [] });
  if (url === "/budgets")            return json({ budgets: {} });
  if (url === "/rewards")            return json({ points: 0, history: [] });
  if (url === "/terms")              return json({ terms: [] });
  if (url === "/disbursements")      return json({ disbursements: [] });
  return json({});
});

console.log("\n=== setup ===");
await page.goto(APP + "/app", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
ck("the app loads signed in, with a linked bank", hits.accounts > 0 && hits.transactions > 0,
   `accounts=${hits.accounts} transactions=${hits.transactions}`);

await page.getByRole("button", { name: /activity/i }).first().click();
await page.waitForTimeout(600);
ck("and the bank's transaction is on Activity",
   await page.getByText(/Test Bank coffee/i).first().isVisible().catch(() => false));

console.log("\n=== removing the bank ===");
await page.getByRole("button", { name: /about/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /connected banks|linked accounts/i }).first().click();
await page.waitForTimeout(600);

const before = { ...hits };
page.once("dialog", d => d.accept());            // the "Remove Everyday Checking?" confirm
await page.getByRole("button", { name: /^remove$/i }).first().click();
await page.waitForTimeout(1400);

ck("the account list is refetched", hits.accounts > before.accounts,
   `${before.accounts} → ${hits.accounts}`);
// The whole point of the fix.
ck("the TRANSACTIONS are refetched too", hits.transactions > before.transactions,
   `${before.transactions} → ${hits.transactions} (this is the regression)`);

console.log("\n=== what the user sees, without touching reload ===");
const sheetClose = page.getByRole("button", { name: /^close$/i }).first();
if (await sheetClose.isVisible().catch(() => false)) { await sheetClose.click(); await page.waitForTimeout(300); }

await page.getByRole("button", { name: /activity/i }).first().click();
await page.waitForTimeout(800);
ck("the removed bank's spending is gone from Activity",
   !(await page.getByText(/Test Bank coffee/i).first().isVisible().catch(() => false)));

await page.getByRole("button", { name: /summary/i }).first().click();
await page.waitForTimeout(800);
ck("and gone from Summary",
   !(await page.getByText(/Test Bank coffee/i).first().isVisible().catch(() => false)));

ck("no page errors", errors.length === 0, errors[0]);

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
