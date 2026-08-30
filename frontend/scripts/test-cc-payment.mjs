/**
 * Real browser: a credit card bill payment must not distort Summary or
 * Budget, but should still be visible in Activity (transparency, not
 * concealment — only the AGGREGATE figures exclude it). Needs the dev
 * servers running (npm run dev in server/ and frontend/).
 */
import { chromium } from "playwright";

const API = "http://localhost:3556";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const email = `ccui${Date.now()}@t.local`;

await p.goto("http://localhost:5173/signup", { waitUntil: "networkidle" });
await p.getByPlaceholder("you@example.com").fill(email);
await p.getByPlaceholder("At least 8 characters").fill("testpassword123");
await p.locator("#confirm-password").fill("testpassword123");
await p.getByRole("button", { name: /create account/i }).click(); await p.waitForTimeout(1500);
await p.locator("input").first().fill("Austin");
await p.getByRole("button", { name: /continue|skip for now/i }).click(); await p.waitForTimeout(400);
await p.locator("#ob-start").fill("2026-08-01"); await p.waitForTimeout(300);
await p.locator("#ob-end").fill("2026-12-19"); await p.waitForTimeout(300);
await p.getByRole("button", { name: /continue|skip for now/i }).click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /set up later/i }).click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /read our privacy policy/i }).click(); await p.waitForTimeout(400);
await p.mouse.wheel(0, 9000); await p.waitForTimeout(300);
await p.getByRole("button", { name: /accept/i }).click(); await p.waitForTimeout(1800);

// Seed via API directly — CreditCardPayment is deliberately not reachable
// from the manual-entry form (matching Savings), so a real Plaid sync is
// what would actually produce this row.
await p.evaluate(async (api) => {
  const post = (body) => fetch(api + "/api/transactions", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  await post({ desc: "Paycheque", amount: 2000, category: "Other", type: "income", date: "2026-08-02" });
  await post({ desc: "Groceries", amount: 300, category: "Food", type: "expense", date: "2026-08-04" });
  await post({ desc: "Card bill", amount: 500, category: "CreditCardPayment", type: "expense", date: "2026-08-05" });
}, API);

await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(1200);

const bodyText = await p.locator("body").innerText();
console.log("  85% appears on Summary:", bodyText.includes("85%"));
console.log("  Credit Card Payment text visible ANYWHERE on Summary:", /credit card payment/i.test(bodyText));

await p.getByRole("button", { name: /budget/i }).click(); await p.waitForTimeout(700);
const budgetText = await p.locator("body").innerText();
console.log("  'Credit Card Payment' appears as a budgetable category:", /credit card payment/i.test(budgetText));

await p.getByRole("button", { name: /activity/i }).click(); await p.waitForTimeout(700);
const activityText = await p.locator("body").innerText();
console.log("  the $500 card payment IS listed in Activity (transparency, just excluded from totals):", /card bill/i.test(activityText));

const pass = bodyText.includes("85%") && !/credit card payment/i.test(bodyText) &&
             !/credit card payment/i.test(budgetText) && /card bill/i.test(activityText);
console.log(`  RESULT: ${pass ? "PASS" : "FAIL"}`);
await b.close();
process.exit(pass ? 0 : 1);
