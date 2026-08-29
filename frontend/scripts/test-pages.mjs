/** Every page renders with real data after the term-boundary changes. */
import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const email = `pages${Date.now()}@t.local`;
const bad = [];
p.on("response", r => { if (r.status() >= 400 && /localhost:3001/.test(r.url()) && !/\/auth\/me|\/auth\/refresh/.test(r.url())) bad.push(`${r.status()} ${r.url().replace("http://localhost:3001","")}`); });
p.on("pageerror", e => bad.push("PAGEERROR " + e.message));

await p.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await p.getByRole("button", { name: /sign up/i }).click(); await p.waitForTimeout(200);
await p.getByPlaceholder("you@example.com").fill(email);
await p.getByPlaceholder("At least 8 characters").fill("testpassword123");
await p.locator("#confirm-password").fill("testpassword123");
await p.getByRole("button", { name: /create account/i }).click(); await p.waitForTimeout(1500);
await p.locator("input").first().fill("Austin");
await p.getByRole("button", { name: /continue|skip for now/i }).click(); await p.waitForTimeout(400);
// A term whose LAST DAY is today — the exact case that used to report "your
// last term has ended" and silently switch to built-in semester dates.
const today = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const start = new Date(today); start.setDate(start.getDate() - 60);
await p.locator("#ob-start").fill(iso(start)); await p.waitForTimeout(300);
await p.locator("#ob-end").fill(iso(today)); await p.waitForTimeout(300);
await p.getByRole("button", { name: /continue|skip for now/i }).click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /set up later/i }).click(); await p.waitForTimeout(400);
await p.getByRole("button", { name: /read our privacy policy/i }).click(); await p.waitForTimeout(400);
await p.mouse.wheel(0, 9000); await p.waitForTimeout(300);
await p.getByRole("button", { name: /accept/i }).click(); await p.waitForTimeout(1800);

const staleWarning = await p.getByText(/your last term has ended/i).isVisible().catch(() => false);
console.log(`  on the FINAL day of term, "last term has ended" shown: ${staleWarning}  (expect false)`);

for (const [tab, marker] of [["summary", /spending breakdown/i], ["budget", /budget/i],
                             ["activity", /add/i], ["goals", /goal/i], ["about", /privacy policy/i]]) {
  await p.getByRole("button", { name: new RegExp(tab, "i") }).first().click();
  await p.waitForTimeout(700);
  const ok = await p.getByText(marker).first().isVisible().catch(() => false);
  console.log(`  ${tab.padEnd(9)} renders: ${ok}`);
}

console.log(`  unexpected API errors / page errors: ${bad.length ? JSON.stringify(bad) : "none"}`);
const pass = !staleWarning && bad.length === 0;
console.log(`  RESULT: ${pass ? "PASS" : "FAIL"}`);
await b.close();
process.exit(pass ? 0 : 1);
