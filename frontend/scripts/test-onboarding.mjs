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

// APP + "/signup" deep-links past the landing page straight to the
// register form. A bare "Sign up" click now matches two buttons there
// (header and footer); the landing page has its own test.
await page.goto(APP + "/signup", { waitUntil: "networkidle" });
await page.getByPlaceholder("you@example.com").fill(email);
await page.getByPlaceholder("At least 8 characters").fill("testpassword123");
await page.locator("#confirm-password").fill("testpassword123");
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

// 2FA step — skipped here; the enrol path itself gets full coverage below
// with a second account, since a click-through skip proves nothing about
// whether "Set up two-factor" actually works.
ck("offers 2FA setup with a skip option",
   await page.getByRole("button", { name: /set up later/i }).isVisible().catch(() => false));
await page.getByRole("button", { name: /set up later/i }).click();
await page.waitForTimeout(400);

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

// ── A second account, purely to prove "Set up two-factor" itself works ──
// The skip path above proves nothing about the enrol path — this drives it
// for real: scan (read the secret instead), compute an actual TOTP code
// with the same algorithm the server verifies against, confirm, and check
// the server actually turned MFA on, not just that the UI moved forward.
const { generate: totpGenerate } = await import("../../server/lib/totp.js");

const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const email2 = `onb2fa${Date.now()}@test.local`;

await page2.goto(APP + "/signup", { waitUntil: "networkidle" });
await page2.getByPlaceholder("you@example.com").fill(email2);
await page2.getByPlaceholder("At least 8 characters").fill("testpassword123");
await page2.locator("#confirm-password").fill("testpassword123");
await page2.getByRole("button", { name: /create account/i }).click();
await page2.waitForTimeout(1500);

await page2.locator("input").first().fill("Austin");
await page2.getByRole("button", { name: /continue|skip for now/i }).click();
await page2.waitForTimeout(400);
await page2.locator("#ob-start").fill("2026-08-24");
await page2.waitForTimeout(300);
await page2.getByRole("button", { name: /continue|skip for now/i }).click();
await page2.waitForTimeout(400);

await page2.getByRole("button", { name: /set up two-factor/i }).click();
await page2.waitForTimeout(600);
ck("2FA enrol step shows a QR code", await page2.locator('img[alt*="QR code"]').isVisible().catch(() => false));

await page2.getByRole("button", { name: /can't scan/i }).click();
await page2.waitForTimeout(200);
// Base32 (RFC 4648, A-Z2-7) — the one string on this step matching that
// shape is the revealed secret, regardless of which element wraps it.
const secret = (await page2.getByText(/^[A-Z2-7]{16,}$/).first().textContent())?.trim();
ck("a setup secret is revealed as an alternative to scanning", !!secret && secret.length >= 16, `got "${secret}"`);

const code = totpGenerate(secret);
await page2.locator("#ob-mfa-token").fill(code);
await page2.getByRole("button", { name: /^turn on$/i }).click();
await page2.waitForTimeout(800);

ck("a real TOTP code is accepted and recovery codes are shown",
   await page2.getByText(/save your recovery codes/i).isVisible().catch(() => false));
const codeCount = await page2.locator("code").count();
ck("more than one recovery code is shown", codeCount > 1, `saw ${codeCount}`);

await page2.getByRole("button", { name: /saved them/i }).click();
await page2.waitForTimeout(400);
ck("advances to the privacy step after enrolling",
   await page2.getByRole("button", { name: /read our privacy policy/i }).isVisible().catch(() => false));

// Server-side truth, not just what the UI shows.
const mfaStatus = await page2.evaluate(async (api) =>
  (await fetch(api + "/auth/mfa", { credentials: "include" })).json(), API);
ck("the server actually has 2FA enabled for this account, not just the UI",
   mfaStatus?.enabled === true, JSON.stringify(mfaStatus));

await browser.close();
console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
