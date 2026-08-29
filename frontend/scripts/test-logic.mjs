/**
 * Logic audit for the financial core.
 *
 * These assert what the app SHOULD mean, not what it currently computes — a
 * failure here is a reasoning gap, not necessarily a crash.
 */
import {
  semesterForDate, shiftSemester, shiftMonth, monthKey,
  semesterMonthCount, catSpendMap, periodTotals, getLevelInfo,
} from "../src/lib/periods.js";
import { CATEGORY_META } from "../src/constants.js";

let pass = 0, fail = 0;
const t = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); pass++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); fail++; }
};
const eq = (a, b, m="") => { if (JSON.stringify(a)!==JSON.stringify(b)) throw new Error(`${m} got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const tx = (date, amount, category, type="expense") => ({ date, amount, category, type });

console.log("=== semester boundaries ===");
t("Aug 14 is Summer, Aug 15 is Fall (no gap, no overlap)", () => {
  eq(semesterForDate(new Date(2026,7,14)).name, "Summer");
  eq(semesterForDate(new Date(2026,7,15)).name, "Fall");
});
t("Dec 14 Fall -> Dec 15 Winter", () => {
  eq(semesterForDate(new Date(2026,11,14)).name, "Fall");
  eq(semesterForDate(new Date(2026,11,15)).name, "Winter");
});
t("early January belongs to the PREVIOUS December's Winter", () => {
  const s = semesterForDate(new Date(2026,0,5));
  eq(s.name, "Winter"); eq(s.start, "2025-12-15");
});
t("every day of a year lands in exactly one semester", () => {
  for (let d = new Date(2026,0,1); d.getFullYear() === 2026; d.setDate(d.getDate()+1)) {
    const s = semesterForDate(new Date(d));
    if (!s || !s.name) throw new Error(`no semester for ${d.toDateString()}`);
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    // Inclusive at both ends: `end` is the semester's last day.
    if (!(iso >= s.start && iso <= s.end)) throw new Error(`${iso} outside its own semester ${s.start}..${s.end}`);
  }
});
t("shiftSemester steps exactly one semester each way", () => {
  const fall = new Date(2026,8,1);
  eq(shiftSemester(fall, 1).name, "Winter");
  eq(shiftSemester(fall, -1).name, "Summer");
});
t("semesterMonthCount is proportional to real length", () => {
  const fall   = semesterMonthCount(new Date(2026,8,1));
  const winter = semesterMonthCount(new Date(2026,11,20));
  if (!(fall > 3.8 && fall < 4.2))   throw new Error(`Fall ${fall}`);
  if (!(winter > 0.9 && winter < 1.2)) throw new Error(`Winter ${winter}`);
});

console.log("\n=== a calendar month can span two semesters ===");
t("Aug 1 and Aug 22 are in DIFFERENT semesters (same month label)", () => {
  const a = semesterForDate(new Date(2026,7,1)).name;   // Summer
  const b = semesterForDate(new Date(2026,7,22)).name;  // Fall
  if (a === b) throw new Error("expected them to differ — test premise wrong");
  console.log(`          (Aug 1 -> ${a}, Aug 22 -> ${b}: same "August 2026" header, different semester data)`);
});

console.log("\n=== periodTotals ===");
t("only the reference month counts", () => {
  const txns = [tx("2026-08-10", 100, "Food"), tx("2026-07-10", 999, "Food")];
  eq(periodTotals(txns, new Date(2026,7,15)).expenses, 100);
});
t("savings rate = (income - expenses) / income", () => {
  const txns = [tx("2026-08-01", 1000, "Other", "income"), tx("2026-08-02", 750, "Food")];
  eq(periodTotals(txns, new Date(2026,7,15)).savingsRate, 25);
});
t("zero income with expenses reports 0%, not a negative rate", () => {
  const r = periodTotals([tx("2026-08-02", 500, "Food")], new Date(2026,7,15));
  eq(r.savingsRate, 0);
  console.log(`          (spent $500 on $0 income and the app reports a 0% savings rate)`);
});

console.log("\n=== transfers are neither income nor spending ===");
t("moving money to savings does NOT lower the savings rate", () => {
  const base   = [tx("2026-08-01", 1000, "Other", "income")];
  const noSave = periodTotals(base, new Date(2026,7,15)).savingsRate;
  const saved  = periodTotals([...base, tx("2026-08-02", 300, "Savings")], new Date(2026,7,15)).savingsRate;
  if (saved !== noSave) throw new Error(`saving changed the rate: ${noSave}% -> ${saved}%`);
});
t("a transfer IN is not counted as income", () => {
  const r = periodTotals([tx("2026-08-01", 500, "Savings", "income")], new Date(2026,7,15));
  eq(r.income, 0, "income"); eq(r.hasIncome, false, "hasIncome");
});
t("transfers never appear in the spending breakdown", () => {
  const m = catSpendMap([tx("2026-08-02", 300, "Savings")], "monthly", new Date(2026,7,15));
  eq(m.Savings, undefined, "Savings in breakdown");
});
t("no recorded income is distinguishable from a real 0% rate", () => {
  const none = periodTotals([tx("2026-08-02", 500, "Food")], new Date(2026,7,15));
  eq(none.hasIncome, false);
  const real = periodTotals([tx("2026-08-01",1000,"Other","income"), tx("2026-08-02",1000,"Food")], new Date(2026,7,15));
  eq(real.hasIncome, true); eq(real.savingsRate, 0);
});

console.log("\n=== Summary breakdown agrees with the month tile ===");
t("a monthly category shows THIS MONTH, not semester-to-date", () => {
  const now = new Date(2026,8,15); // mid-Fall
  const txns = [
    tx("2026-09-10", 100, "Food"),   // this month
    tx("2026-08-20", 400, "Food"),   // earlier in the SAME semester
  ];
  eq(catSpendMap(txns, "monthly", now).Food, 100, "Food");
  eq(periodTotals(txns, now).expenses, 100, "month tile");
});
t("a semester category still uses the semester window", () => {
  const now = new Date(2026,8,15);
  const txns = [tx("2026-08-20", 9000, "Tuition")]; // same semester, earlier month
  eq(catSpendMap(txns, "monthly", now).Tuition, 9000);
});

console.log("\n=== Budget totals: month and semester are never summed ===");
t("a month total covers monthly categories only", () => {
  const budgets = { Food: 600, Tuition: 9000 };
  const monthCount = semesterMonthCount(new Date(2026,8,15));
  const displayBudget = (cat, period) => {
    const meta = CATEGORY_META[cat];
    const stored = Number(budgets[cat]) || 0;
    if (meta.period === "semester") return stored;
    return period === "semester" ? stored * monthCount : stored;
  };
  // Mirrors Budget.jsx: the hero sums monthly categories in Month view.
  const monthly  = ["Food"].reduce((s,c)=>s+displayBudget(c,"monthly"), 0);
  const semester = ["Tuition"].reduce((s,c)=>s+displayBudget(c,"monthly"), 0);
  eq(monthly, 600, "month total");
  eq(semester, 9000, "semester subtotal");
  if (monthly + semester === monthly) throw new Error("sanity");
});
t("Savings is excluded from budgeting entirely (it is a transfer)", () => {
  if (!CATEGORY_META.Savings.transfer) throw new Error("Savings should be flagged as a transfer");
});

console.log("\n=== levels ===");
t("level thresholds and progress are monotonic", () => {
  let last = -1;
  for (const p of [0, 199, 200, 499, 500, 999, 1000, 1999, 2000, 5000]) {
    const { cur, prog } = getLevelInfo(p);
    if (cur.level < last) throw new Error(`level went backwards at ${p}`);
    last = cur.level;
    if (prog < 0 || prog > 100) throw new Error(`progress ${prog} out of range at ${p}`);
  }
});
t("max level reports 100% and no next", () => {
  const { next, prog } = getLevelInfo(99999);
  eq(next, null); eq(prog, 100);
});
t("non-numeric points do not crash the level badge", () => {
  for (const bad of [null, undefined, NaN, "abc"]) getLevelInfo(bad);
});

console.log("\n=== date-format robustness ===");
t("a timezone-shifted ISO timestamp still buckets to the right month", () => {
  const txns = [{ date: "2026-08-31T23:00:00.000Z", amount: 50, category: "Food", type: "expense" }];
  eq(catSpendMap(txns, "monthly", new Date(2026,7,15)).Food, 50);
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
