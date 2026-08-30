/**
 * Exercises the PRODUCTION bundle, not the dev server.
 *
 * `vite build` exiting 0 only proves it compiled. This proves the built
 * artefact actually runs: that the real CSP doesn't block the API, that lazy
 * chunks resolve, that no console error fires, and that a full sign-up →
 * onboarding → data-loading round trip works against a live backend.
 *
 * Prereq: npx vite preview on :4173 and the API on :3001.
 */
import { chromium } from "playwright";

const APP = "http://localhost:4173";
let pass = 0, fail = 0;
const ck = (l, ok, d = "") => {
  if (ok) { console.log(`  PASS  ${l}`); pass++; }
  else { console.log(`  FAIL  ${l}${d ? `\n          ${d}` : ""}`); fail++; }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// A CSP refusal surfaces here and nowhere else — it is not a failed fetch.
const cspViolations = [];
const consoleErrors = [];
const failedRequests = [];
page.on("console", m => {
  const t = m.text();
  if (m.type() === "error") {
    consoleErrors.push(t);
    if (/Content Security Policy|Refused to/i.test(t)) cspViolations.push(t);
  }
});
page.on("requestfailed", r => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
const unauthorized = [];
page.on("response", r => { if (r.status() === 401) unauthorized.push(`${r.request().method()} ${new URL(r.url()).pathname}`); });
page.on("pageerror", e => consoleErrors.push("pageerror: " + e.message));

await page.goto(APP, { waitUntil: "networkidle" });
ck("production bundle boots", await page.getByText(/make your money last the term/i).isVisible().catch(() => false));
ck("no CSP violations on load", cspViolations.length === 0, cspViolations[0]);

// Full round trip through the built bundle.
const email = `prod${Date.now()}@test.local`;
// Scoped to the header: the landing page renders a second "Sign up" in
// the footer. This is deliberately the one test that still clicks
// through the real landing nav rather than deep-linking to /signup —
// it is the full round trip through the built bundle.
await page.getByRole("banner").getByRole("button", { name: /sign up/i }).click();
await page.waitForTimeout(300);
await page.getByPlaceholder("you@example.com").fill(email);
await page.getByPlaceholder("At least 8 characters").fill("testpassword123");
// The register form refuses to submit unless the confirmation matches, so
// without this the sign-up never happened and every assertion after it timed
// out chasing an onboarding screen that was never reached. Every other suite
// in this folder already filled it; this one alone did not.
await page.locator("#confirm-password").fill("testpassword123");
await page.getByRole("button", { name: /create account/i }).click();
await page.waitForTimeout(1600);
ck("sign-up works against the real API from the built bundle",
   await page.getByText(/what should we call you/i).isVisible().catch(() => false));
ck("still no CSP violations after an authenticated request", cspViolations.length === 0, cspViolations[0]);

await page.locator("input").first().fill("Austin");
await page.getByRole("button", { name: /continue|skip/i }).click();
await page.waitForTimeout(400);
// #ob-end fills itself from the start date, so only the start is entered.
await page.locator("#ob-start").fill("2026-08-24");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /continue|skip/i }).click();
await page.waitForTimeout(500);

// The two-factor offer, which this walk predated. Its buttons are "Set up
// two-factor" and "Set up later" — neither matches the /continue|skip/ used
// for every other step, so the run stalled here for the full 30s timeout and
// reported it as "reaches the app" failing, three steps further on than the
// actual problem.
const later = page.getByRole("button", { name: /set up later/i });
if (await later.isVisible({ timeout: 3000 }).catch(() => false)) {
  await later.click();
  await page.waitForTimeout(500);
}

const rp = page.getByRole("button", { name: /read our privacy policy/i });
if (await rp.isVisible({ timeout: 3000 }).catch(() => false)) {
  await rp.click(); await page.waitForTimeout(400);
  await page.mouse.wheel(0, 9000); await page.waitForTimeout(300);
  await page.getByRole("button", { name: /accept/i }).click();
  await page.waitForTimeout(2000);
}
ck("reaches the app", await page.getByText(/spending breakdown/i).isVisible().catch(() => false));

// Lazy chunks are the classic thing that works in dev and 404s in production.
for (const [tab, marker] of [["Budget", /over budget|budget/i], ["Activity", null], ["Goals", /create new goal/i], ["About", /privacy policy/i]]) {
  // Nav buttons carry an icon alongside the label, so the accessible name is
  // not an exact match for the label alone.
  await page.getByRole("button", { name: new RegExp(tab, "i") }).first().click();
  await page.waitForTimeout(700);
  const visible = marker
    ? await page.getByText(marker).first().isVisible().catch(() => false)
    : await page.getByPlaceholder(/search/i).isVisible().catch(() => false);
  ck(`lazy chunk for "${tab}" loads`, visible);
}

ck("no failed network requests", failedRequests.length === 0, failedRequests[0]);
// The only acceptable 401 is the pre-login session probe: the app asks
// /auth/me on boot precisely to find out whether anyone is signed in.
const unexpected401 = unauthorized.filter(u => !u.endsWith("/auth/me") && !u.endsWith("/auth/refresh"));
ck("the only 401s are the expected pre-login session probe", unexpected401.length === 0, unexpected401.join(", "));

const realErrors = consoleErrors.filter(e => !/401 \(Unauthorized\)/.test(e));
ck("no uncaught console errors", realErrors.length === 0, realErrors[0]);

await page.screenshot({ path: "/tmp/prod-build.png" });
await browser.close();
console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
