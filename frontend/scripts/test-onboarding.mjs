/**
 * Drives the real onboarding flow in a browser.
 *
 * It is now the required path for every new account, so a break here means
 * nobody can sign up. Asserts both that it completes AND that what the student
 * entered actually persisted — the runway is computed from these answers, so a
 * silently dropped term date produces a confidently wrong headline.
 */
import { chromium } from "playwright";

const APP = "http://localhost:5173";
const API = "http://localhost:3001";
let pass = 0, fail = 0;
const ck = (label, ok, detail = "") => {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); fail++; }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const email = `onb${Date.now()}@test.local`;

await page.goto(APP, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /sign up/i }).click();
await page.waitForTimeout(200);
await page.getByPlaceholder("you@example.com").fill(email);
await page.getByPlaceholder("At least 8 characters").fill("testpassword123");
await page.getByRole("button", { name: /create account/i }).click();
await page.waitForTimeout(1500);

ck("lands on onboarding after sign-up",
   await page.getByText(/what should we call you/i).isVisible().catch(() => false));

const cont = () => page.getByRole("button", { name: /continue|skip for now/i });

// 1. name
await page.locator("input").first().fill("Austin");
await cont().click(); await page.waitForTimeout(400);

// 2. term dates — the only other thing signup blocks on
ck("asks for term dates", await page.getByText(/when does your current term run/i).isVisible().catch(() => false));
await page.locator("#ob-start").fill("2026-08-24");
await page.waitForTimeout(300);
const proposedEnd = await page.locator("#ob-end").inputValue();
ck("proposes an end date so neither field starts blank", !!proposedEnd, `end was "${proposedEnd}"`);
await cont().click(); await page.waitForTimeout(500);

// Signup should now be over — everything else moved to the Summary.
const stillAsking = await page.getByText(/where are you in your studies|when does your aid arrive|how would you describe your spending/i)
  .isVisible().catch(() => false);
ck("signup does NOT block on student type, aid, or spending style", !stillAsking);

// privacy gate
const rp = page.getByRole("button", { name: /read our privacy policy/i });
if (await rp.isVisible({ timeout: 3000 }).catch(() => false)) {
  await rp.click(); await page.waitForTimeout(400);
  await page.mouse.wheel(0, 9000); await page.waitForTimeout(300);
  await page.getByRole("button", { name: /accept/i }).click();
  await page.waitForTimeout(1800);
}
ck("reaches the app", await page.getByText(/spending breakdown/i).isVisible().catch(() => false));

// ── the deferred questions now live on the Summary ──
ck("Summary offers to finish setup",
   await page.getByText(/sharpen your runway/i).isVisible().catch(() => false));
await page.getByRole("button", { name: /finish setup/i }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /first-year undergraduate/i }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: /^semesters/i }).click();
await page.waitForTimeout(300);

const scDate = await page.locator("#sc-when").inputValue();
const gap = scDate ? Math.round((new Date(scDate) - new Date("2026-08-24")) / 86400000) : null;
ck("prefills a first-year aid date ~37 days out (30-day hold + refund lag)",
   gap !== null && gap >= 30 && gap <= 45, `proposed ${scDate} (${gap} days after term start)`);
ck("explains why that date is later than expected",
   await page.getByText(/30 days into the term/i).isVisible().catch(() => false));

await page.locator("#sc-amt").fill("8400");
await page.getByRole("button", { name: /^save$/i }).click();
await page.waitForTimeout(1500);
ck("the prompt disappears once the profile is complete",
   !(await page.getByText(/sharpen your runway/i).isVisible().catch(() => false)));

// What actually persisted — the runway is computed from these.
const state = await page.evaluate(async (api) => {
  const get = async (p) => (await fetch(api + p, { credentials: "include" })).json();
  return {
    me:    await get("/auth/me"),
    terms: await get("/api/terms"),
    disb:  await get("/api/disbursements"),
  };
}, API);

ck("student type persisted", state.me.user?.student_type === "first_year", JSON.stringify(state.me.user?.student_type));
ck("term system persisted",  state.me.user?.term_system === "semester",   JSON.stringify(state.me.user?.term_system));
ck("aid answer persisted",   state.me.user?.receives_aid === true,        JSON.stringify(state.me.user?.receives_aid));
ck("term saved",             state.terms.terms?.length === 1,             JSON.stringify(state.terms.terms));
ck("term start is what was entered", state.terms.terms?.[0]?.start_date === "2026-08-24", JSON.stringify(state.terms.terms?.[0]));
ck("disbursement saved with the entered amount",
   state.disb.disbursements?.[0]?.amount === 8400, JSON.stringify(state.disb.disbursements));

await page.screenshot({ path: "/tmp/onboarded-summary.png" });
await browser.close();
console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
