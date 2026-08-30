/**
 * Captures every main screen for visual review.
 *   node scripts/shots.mjs <outDir> [email] [password]
 *
 * Reuses an existing account when credentials are passed, so before/after runs
 * show the SAME data and any visual diff is genuinely the design changing
 * rather than different seed data.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const out = process.argv[2] || "/tmp/shots";
const email = process.argv[3];
const password = process.argv[4] || "testpassword123";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function capture(label, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });

  // The root URL is the landing page now, and it is a screen worth reviewing
  // like any other — captured fullPage, since a marketing layout is the one
  // thing here that a viewport-height crop tells you nothing about.
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/${label}-landing.png`, fullPage: true });

  // /login and /signup deep-link past the landing page to the auth form.
  await page.goto(`http://localhost:5173/${email ? "login" : "signup"}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/${label}-auth.png` });

  if (email) {
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder(/••••|At least 8/).fill(password);
    await page.getByRole("button", { name: /log in/i }).first().click();
  } else {
    await page.getByPlaceholder("you@example.com").fill(`shot${Date.now()}@t.local`);
    await page.getByPlaceholder("At least 8 characters").fill(password);
    await page.locator("#confirm-password").fill(password);
    await page.getByRole("button", { name: /create account/i }).click();
  }
  await page.waitForTimeout(1800);

  // Clear onboarding if it appears.
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole("button", { name: /read our privacy policy/i }).isVisible().catch(()=>false)) break;
    const input = page.locator("input").first();
    if (await input.isVisible().catch(()=>false)) await input.fill(i===1?"4500":"Austin");
    else {
      const labels = await page.locator("button").allTextContents();
      const idx = labels.findIndex(t => t && !/continue|back/i.test(t));
      if (idx >= 0) await page.locator("button").nth(idx).click();
    }
    await page.waitForTimeout(120);
    const cont = page.getByRole("button", { name: /^continue/i });
    if (!(await cont.isVisible().catch(()=>false))) break;
    await cont.click().catch(()=>{});
    await page.waitForTimeout(250);
  }
  const rp = page.getByRole("button", { name: /read our privacy policy/i });
  if (await rp.isVisible({ timeout: 2000 }).catch(()=>false)) {
    await rp.click(); await page.waitForTimeout(400);
    await page.mouse.wheel(0, 9000); await page.waitForTimeout(300);
    await page.getByRole("button", { name: /accept/i }).click();
    await page.waitForTimeout(1200);
  }

  for (const tab of ["summary", "budget", "activity", "goals", "about"]) {
    const btn = page.getByRole("button", { name: new RegExp(tab, "i") }).first();
    if (await btn.isVisible().catch(()=>false)) {
      await btn.click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${label}-${tab}.png` });
    }
  }

  // A sheet, to capture dialog styling
  try {
    await page.getByRole("button", { name: /goals/i }).first().click({ timeout: 5000 });
    await page.waitForTimeout(400);
    const newGoal = page.getByRole("button", { name: /create new goal/i });
    if (await newGoal.isVisible().catch(()=>false)) {
      await newGoal.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${out}/${label}-sheet.png` });
    }
  } catch { console.log(`  (${label}: sheet capture skipped)`); }
  await page.close();
}

for (const [label, w, h] of [["desktop",1440,900], ["mobile",390,844]]) {
  try { await capture(label, w, h); console.log(`captured ${label}`); }
  catch (e) { console.log(`${label} FAILED: ${e.message.split("\n")[0]}`); }
}
await browser.close();
console.log("screenshots ->", out);
