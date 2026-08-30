/**
 * Logging an aid disbursement end-to-end through the real form.
 *
 * This is the app's central action — the whole runway model is built on
 * knowing when aid arrives — and it was answered with a 400 for anyone who
 * did it: the server's category list omitted "Disbursement" while the form
 * offered it as the DEFAULT category for one-time entries. Needs the dev
 * servers running (npm run dev in server/ and frontend/).
 */
import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const email = `disb${Date.now()}@t.local`;
const errors = [];
p.on("response", r => { if (r.status() >= 400 && /localhost:3001/.test(r.url())) errors.push(`${r.status()} ${r.url().replace("http://localhost:3001","")}`); });

await p.goto("http://localhost:5173/signup", { waitUntil: "networkidle" });
await p.getByPlaceholder("you@example.com").fill(email);
await p.getByPlaceholder("At least 8 characters").fill("testpassword123");
await p.locator("#confirm-password").fill("testpassword123");
await p.getByRole("button", { name: /create account/i }).click(); await p.waitForTimeout(1500);
await p.locator("input").first().fill("Austin");
await p.getByRole("button", { name: /continue|skip for now/i }).click(); await p.waitForTimeout(400);
await p.locator("#ob-start").fill("2026-08-24"); await p.waitForTimeout(300);
await p.getByRole("button", { name: /continue|skip for now/i }).click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /set up later/i }).click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /read our privacy policy/i }).click(); await p.waitForTimeout(400);
await p.mouse.wheel(0, 9000); await p.waitForTimeout(300);
await p.getByRole("button", { name: /accept/i }).click(); await p.waitForTimeout(1800);

// Activity -> add a one-time transaction. Disbursement is the DEFAULT category
// for one-time entries, so this is the path a student hits without choosing it.
await p.getByRole("button", { name: /activity/i }).click(); await p.waitForTimeout(600);
await p.getByRole("button", { name: /add|new transaction|\+/i }).first().click(); await p.waitForTimeout(500);

const oneTime = p.getByRole("button", { name: /one-time/i });
if (await oneTime.isVisible().catch(() => false)) { await oneTime.click(); await p.waitForTimeout(300); }

const selected = await p.locator("#t-cat").inputValue().catch(() => "(no select)");
console.log(`  default category for a one-time entry: ${selected}`);

errors.length = 0;
// No .catch() here: a selector that silently misses would make this test
// report a pass for a form it never actually filled in.
await p.locator("#t-date").fill("2026-08-25");
await p.locator("#t-desc").fill("Fall aid refund");
await p.locator("#t-amount").fill("8400");
await p.getByRole("button", { name: /^income$/i }).click();
await p.waitForTimeout(200);
await p.getByRole("button", { name: /add transaction/i }).last().click();
await p.waitForTimeout(1800);

const formError = await p.locator("[role=alert]").first().textContent().catch(() => null);
if (formError) console.log(`  form error: ${JSON.stringify(formError.trim())}`);
console.log(`  API errors during save: ${errors.length ? JSON.stringify(errors) : "none"}`);
const listed = await p.getByText(/fall aid refund/i).isVisible().catch(() => false);
console.log(`  the disbursement appears in Activity: ${listed}`);
console.log(`  RESULT: ${listed && errors.length === 0 ? "PASS" : "FAIL"}`);

await b.close();
process.exit(listed && errors.length === 0 ? 0 : 1);
