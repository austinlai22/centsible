/**
 * Runway model tests — the numbers behind flo·w's actual differentiator.
 * If these are wrong the app gives a student false confidence about whether
 * their money reaches the end of term, which is worse than saying nothing.
 */
import { computeRunway, topLever } from "../src/lib/runway.js";

let pass = 0, fail = 0;
const t = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); pass++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); fail++; }
};
const near = (a, b, tol, m="") => { if (Math.abs(a-b) > tol) throw new Error(`${m} got ${a}, want ~${b}`); };
const tx = (date, amount, category, type="expense") => ({ date, amount, category, type });

// Fall 2026 runs 2026-08-15 → 2026-12-15 (122 days).
const FALL_MID = new Date(2026, 9, 15); // Oct 15 — 61 days in, 61 to go

/** Daily spending across a date range, for building realistic histories. */
const daily = (from, to, amount, category="Food") => {
  const out = [];
  for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate()+1)) {
    out.push(tx(d.toISOString().slice(0,10), amount, category));
  }
  return out;
};

console.log("=== term windowing ===");
t("locates the term and splits elapsed vs remaining", () => {
  const r = computeRunway([], [], FALL_MID);
  if (r.term.start !== "2026-08-15") throw new Error(`start ${r.term.start}`);
  near(r.daysTotal, 122, 1, "daysTotal");
  near(r.daysElapsed + r.daysRemaining, r.daysTotal, 1, "elapsed+remaining");
});

console.log("\n=== the student the app was previously silent about ===");
t("one August disbursement, steady spend — reports days of runway", () => {
  const txns = [
    tx("2026-08-20", 8400, "Other", "income"),
    ...daily("2026-08-20", "2026-10-15", 50),   // $50/day
  ];
  const r = computeRunway(txns, [], FALL_MID);
  near(r.burnPerDay, 50, 3, "burnPerDay");
  if (!Number.isFinite(r.daysOfRunway)) throw new Error("no runway computed");
  console.log(`          available $${Math.round(r.available)}, burn $${r.burnPerDay.toFixed(0)}/day, ` +
              `${r.daysOfRunway} days of runway vs ${r.daysRemaining} left -> ${r.status}`);
});

t("spending too fast is flagged SHORT with a run-out date", () => {
  const txns = [
    tx("2026-08-20", 8400, "Other", "income"),
    ...daily("2026-08-20", "2026-10-15", 120),  // burning way too fast
  ];
  const r = computeRunway(txns, [], FALL_MID);
  if (r.status !== "short") throw new Error(`status ${r.status}`);
  if (!r.runsOutOn) throw new Error("expected a run-out date");
  if (r.slackDays >= 0) throw new Error(`slack ${r.slackDays} should be negative`);
  console.log(`          runs out ${r.runsOutOn}, ${Math.abs(r.slackDays)} days before term ends`);
});

t("comfortable when the money clearly outlasts the term", () => {
  const txns = [
    tx("2026-08-20", 8400, "Other", "income"),
    ...daily("2026-08-20", "2026-10-15", 10),
  ];
  const r = computeRunway(txns, [], FALL_MID);
  if (r.status !== "comfortable") throw new Error(`status ${r.status}`);
});

t("tight sits between the two", () => {
  // Tuned so the money lands a few days past term end.
  const txns = [
    tx("2026-08-20", 8400, "Other", "income"),
    ...daily("2026-08-20", "2026-10-15", 63),
  ];
  const r = computeRunway(txns, [], FALL_MID);
  if (!["tight","short"].includes(r.status)) throw new Error(`status ${r.status} (slack ${r.slackDays})`);
});

console.log("\n=== where 'what's left' comes from ===");
t("real account balance is preferred over inferred flow", () => {
  const accounts = [{ type:"depository", balance_current: 3000 }];
  const txns = [tx("2026-08-20", 8400, "Other", "income"), ...daily("2026-08-20","2026-10-15",50)];
  const r = computeRunway(txns, accounts, FALL_MID);
  if (r.source !== "balance") throw new Error(`source ${r.source}`);
  near(r.available, 3000, 0.01, "available");
});
t("falls back to term income minus spend with no linked bank", () => {
  const txns = [tx("2026-08-20", 1000, "Other", "income"), tx("2026-09-01", 400, "Food")];
  const r = computeRunway(txns, [], FALL_MID);
  if (r.source !== "flow") throw new Error(`source ${r.source}`);
  near(r.available, 600, 0.01, "available");
});
t("credit-card accounts are not counted as spendable cash", () => {
  const accounts = [{ type:"credit", balance_current: 5000 }];
  const r = computeRunway([tx("2026-08-20",1000,"Other","income")], accounts, FALL_MID);
  if (r.source !== "flow") throw new Error("a credit balance is debt, not money to spend");
});
t("transfers are excluded from both sides", () => {
  const a = computeRunway([tx("2026-08-20",1000,"Other","income")], [], FALL_MID);
  const b = computeRunway([tx("2026-08-20",1000,"Other","income"), tx("2026-09-01",500,"Savings")], [], FALL_MID);
  near(a.available, b.available, 0.01, "moving money to savings changed available cash");
});

console.log("\n=== honesty about thin data ===");
t("a brand-new account does not project", () => {
  const r = computeRunway([], [], FALL_MID);
  if (r.hasEnoughData) throw new Error("claimed enough data with no transactions");
});
t("zero spending yields no run-out date rather than a divide-by-zero", () => {
  const r = computeRunway([tx("2026-08-20", 500, "Other", "income")], [], FALL_MID);
  if (r.runsOutOn !== null) throw new Error(`invented a run-out date: ${r.runsOutOn}`);
  if (Number.isNaN(r.burnPerDay)) throw new Error("NaN burn rate");
});
t("no money left reports empty", () => {
  const r = computeRunway([tx("2026-09-01", 300, "Food")], [], FALL_MID);
  if (r.status !== "empty") throw new Error(`status ${r.status}`);
});
t("survives being called on the last day of term", () => {
  const r = computeRunway([tx("2026-12-01", 100, "Food")], [], new Date(2026,11,14));
  if (r.daysRemaining < 0) throw new Error("negative days remaining");
  if (!Number.isFinite(r.allowancePerDay)) throw new Error("non-finite allowance");
});

console.log("\n=== the actionable lever ===");
t("names the driving category and a concrete weekly change", () => {
  const txns = [
    tx("2026-08-20", 8400, "Other", "income"),
    ...daily("2026-08-20", "2026-10-15", 120, "Food"),
  ];
  const r = computeRunway(txns, [], FALL_MID);
  const lever = topLever(txns, r, FALL_MID);
  if (!lever) throw new Error("no lever produced for a shortfall");
  if (lever.category !== "Food") throw new Error(`category ${lever.category}`);
  if (!(lever.dropPerWeek > 0)) throw new Error("suggested dropping nothing");
  console.log(`          "${lever.category}: ${lever.dropPerWeek} fewer per week ` +
              `(~$${lever.perPurchase.toFixed(2)} each) closes a $${lever.gapPerDay.toFixed(2)}/day gap"`);
});
t("no lever when the student is on track", () => {
  const txns = [tx("2026-08-20", 8400, "Other", "income"), ...daily("2026-08-20","2026-10-15",10)];
  const r = computeRunway(txns, [], FALL_MID);
  if (topLever(txns, r, FALL_MID)) throw new Error("nagged a student who is fine");
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
