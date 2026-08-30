/**
 * The landing page and the routes around it.
 *
 * Nothing here checks copy or styling; it checks the things that make the
 * site a dead end when they break, and that a signed-out visitor could never
 * report — they have no account to report it from:
 *
 *   - "/" serves the landing page, for signed-out AND signed-in visitors
 *   - "Log in" and "Sign up" reach the right form, at a real, linkable URL
 *   - Back returns to the landing page instead of leaving the site
 *   - /login and /signup survive being typed, pasted or refreshed
 *   - a signed-in visitor gets one button INTO the app, not a login form
 *   - /app bounces a signed-out visitor to /login
 *   - the FAQ and the legal modals open
 *
 * Requires the dev server on :5173. Deliberately needs no backend: the
 * signed-in cases are driven by the localStorage session hint, which is what
 * the landing page renders its call to action from before authApi.me()
 * resolves. That is not a shortcut around testing the real thing — it IS the
 * real thing on a cold start, which is the case that matters most.
 */
import { chromium } from "playwright";

const APP = "http://localhost:5173";
let pass = 0, fail = 0;
const ck = (label, ok, extra = "") => {
  if (ok) { console.log(`  PASS  ${label}`); pass++; }
  else { console.log(`  FAIL  ${label}${extra ? "\n          " + extra : ""}`); fail++; }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));

const seen = (rx) => page.getByText(rx).first().isVisible().catch(() => false);
const onLanding = () => seen(/make your money last the term/i);
// The register form is the one with a confirm-password field; login has none.
const onRegister = () => page.locator("#confirm-password").isVisible().catch(() => false);
const onLogin = async () => (await page.getByPlaceholder("you@example.com").isVisible().catch(() => false))
                            && !(await onRegister());
const at = () => new URL(page.url()).pathname;

console.log("\n=== the root URL ===");
await page.goto(APP + "/", { waitUntil: "networkidle" });
ck("serves the landing page, not the login form", await onLanding());
ck("and no login form is on it", !(await page.getByPlaceholder("you@example.com").isVisible().catch(() => false)));
ck("pricing says it is free", await seen(/^\$0$/));

console.log("\n=== the two entry points ===");
await page.getByRole("banner").getByRole("button", { name: /^log in$/i }).click();
await page.waitForTimeout(300);
ck('"Log in" lands on the login form', await onLogin());
ck("and the address bar says /login", at() === "/login", at());

await page.goBack(); await page.waitForTimeout(300);
ck("Back returns to the landing page rather than leaving the site", await onLanding());

await page.getByRole("banner").getByRole("button", { name: /^sign up$/i }).click();
await page.waitForTimeout(300);
ck('"Sign up" lands on the REGISTER form, not login', await onRegister());
ck("and the address bar says /signup", at() === "/signup", at());

// The toggle at the bottom of the form is a navigation between two real
// pages now, so it has to move the URL — and must not cost what was typed.
await page.getByPlaceholder("you@example.com").fill("keepme@example.com");
await page.getByRole("button", { name: /^log in$/i }).click();
await page.waitForTimeout(300);
ck("the form's own toggle navigates to /login", at() === "/login", at());
ck("and keeps the email already typed",
   (await page.getByPlaceholder("you@example.com").inputValue()) === "keepme@example.com");

await page.getByRole("button", { name: /back to home/i }).click();
await page.waitForTimeout(300);
ck('"Back to home" on the auth screen returns to the landing page', await onLanding());

console.log("\n=== real URLs, typed or refreshed ===");
await page.goto(APP + "/login", { waitUntil: "networkidle" });
ck("/login is directly linkable", await onLogin());
await page.goto(APP + "/signup", { waitUntil: "networkidle" });
ck("/signup is directly linkable", await onRegister());
await page.reload({ waitUntil: "networkidle" });
ck("/signup survives a hard refresh", await onRegister());
// The landing page's own #anchors share the URL; they must not be mistaken
// for routes and swap the whole page out for a login form.
await page.goto(APP + "/#pricing", { waitUntil: "networkidle" });
ck("an in-page #anchor stays on the landing page", await onLanding());
await page.goto(APP + "/nonsense-path", { waitUntil: "networkidle" });
await page.waitForTimeout(300);
ck("an unknown path falls back to the landing page", await onLanding());
ck("and canonicalises the URL to /", at() === "/", at());

console.log("\n=== signed out, asking for the app ===");
await page.goto(APP + "/app", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
ck("/app redirects a signed-out visitor to /login", at() === "/login", at());

console.log("\n=== signed in ===");
/**
 * There is no backend in this suite, so the session is faked at the only
 * place the client learns about one: GET /auth/me. Everything downstream —
 * which button the landing page renders, where it points, which routes
 * redirect — is the app's real logic running against a real response shape.
 *
 * `delayMs` exists because the interesting case is the SLOW one: the API
 * sleeps when idle, and the landing page is supposed to render its call to
 * action from the cached hint rather than wait. Locally the request resolves
 * in single-digit milliseconds, so without an artificial delay that window
 * closes before it can be observed and the test would silently prove nothing.
 */
const USER = { id: "u1", email: "signed.in@test.local", name: "Austin", onboarded_at: "2026-01-01T00:00:00Z" };
const mockSession = (p, { delayMs = 0 } = {}) =>
  p.route("**/auth/me", async (r) => {
    if (delayMs) await new Promise(res => setTimeout(res, delayMs));
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: USER }) });
  });

await mockSession(page);
await page.goto(APP + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(300);
ck("a signed-in visitor still gets the landing page, not a redirect", await onLanding());
const openBtn = page.getByRole("banner").getByRole("button", { name: /open centsible/i });
ck("with one button into the app instead of Log in / Sign up", await openBtn.isVisible().catch(() => false));
ck("and no Sign up button in the header",
   !(await page.getByRole("banner").getByRole("button", { name: /^sign up$/i }).isVisible().catch(() => false)));
ck("the in-page CTAs stop asking them to create an account",
   !(await page.getByRole("button", { name: /create a free account/i }).first().isVisible().catch(() => false)));
await openBtn.click();
await page.waitForTimeout(500);
ck("clicking it goes to /app, already signed in", at() === "/app", at());

// A signed-in visitor who types /login has nothing to do there.
await page.goto(APP + "/login", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
ck("/login redirects a signed-in visitor to /app", at() === "/app", at());

console.log("\n=== the session hint (cold-start behaviour) ===");
const slow = await browser.newPage({ viewport: { width: 1280, height: 900 } });
slow.on("pageerror", e => errors.push("slow: " + e.message));
await mockSession(slow, { delayMs: 4000 });
await slow.goto(APP + "/", { waitUntil: "domcontentloaded" });
await slow.evaluate(() => localStorage.setItem("centsible.session_hint", "1"));
await slow.reload({ waitUntil: "domcontentloaded" });
await slow.waitForTimeout(700);   // well inside the 4s the session takes
ck("the landing page paints before the session resolves",
   await slow.getByText(/make your money last the term/i).first().isVisible().catch(() => false));
ck("and shows the signed-in button immediately, not a spinner",
   await slow.getByRole("banner").getByRole("button", { name: /open centsible/i }).isVisible().catch(() => false));
await slow.close();

// The mirror image: a hint left behind by an expired session must not strand
// anyone in an app they aren't authenticated for.
const stale = await browser.newPage({ viewport: { width: 1280, height: 900 } });
stale.on("pageerror", e => errors.push("stale: " + e.message));
await stale.route("**/auth/me", r => r.fulfill({ status: 401, contentType: "application/json", body: '{"error":"unauthorized"}' }));
await stale.goto(APP + "/", { waitUntil: "domcontentloaded" });
await stale.evaluate(() => localStorage.setItem("centsible.session_hint", "1"));
await stale.goto(APP + "/app", { waitUntil: "domcontentloaded" });
await stale.waitForTimeout(1500);
ck("a stale hint self-corrects to /login once the server disagrees",
   new URL(stale.url()).pathname === "/login", new URL(stale.url()).pathname);
await stale.close();

await page.unroute("**/auth/me");

console.log("\n=== disclosure widgets ===");
await page.goto(APP + "/", { waitUntil: "networkidle" });
const faq = page.locator("details.lp-faq").first();
await faq.locator("summary").click(); await page.waitForTimeout(200);
ck("an FAQ item opens", await faq.evaluate(el => el.open));

await page.getByRole("contentinfo").getByRole("button", { name: /terms of service/i }).click();
await page.waitForTimeout(400);
ck("the Terms modal opens from the footer", await page.getByRole("dialog", { name: /terms of service/i }).isVisible().catch(() => false));
await page.getByRole("button", { name: /^close$/i }).click(); await page.waitForTimeout(300);

await page.getByRole("contentinfo").getByRole("button", { name: /privacy policy/i }).click();
await page.waitForTimeout(400);
ck("the Privacy modal opens from the footer", await page.getByRole("dialog", { name: /privacy policy/i }).isVisible().catch(() => false));

console.log("\n=== mobile ===");
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
m.on("pageerror", e => errors.push("mobile: " + e.message));
await m.goto(APP + "/", { waitUntil: "networkidle" });
ck("renders on a phone", await m.getByText(/make your money last the term/i).first().isVisible().catch(() => false));
// A marketing page that scrolls sideways on a phone is the classic failure
// of a desktop-first landing page, and it is invisible on a 1280px viewport.
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ck("does not scroll horizontally on a phone", overflow <= 0, `overflows by ${overflow}px`);
ck("both auth buttons are reachable without the desktop nav",
   (await m.getByRole("banner").getByRole("button", { name: /^log in$/i }).isVisible().catch(() => false)) &&
   (await m.getByRole("banner").getByRole("button", { name: /^sign up$/i }).isVisible().catch(() => false)));

ck("no page errors anywhere", errors.length === 0, errors[0]);

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
