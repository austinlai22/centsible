/**
 * Runway model tests — the numbers behind Centsible's actual differentiator.
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
  // Tuned to land mid-band: at this rate the money outlasts the term by only
  // a few days. (Was $63/day, which sat in the band only because the burn
  // rate was overstated by the observedDays off-by-one — see the burn-rate
  // test below.)
  const txns = [
    tx("2026-08-20", 8400, "Other", "income"),
    ...daily("2026-08-20", "2026-10-15", 67),
  ];
  const r = computeRunway(txns, [], FALL_MID);
  if (r.status !== "tight") throw new Error(`status ${r.status} (slack ${r.slackDays})`);
});

t("burn rate equals the actual daily spend, with no off-by-one", () => {
  // The divisor is the number of days the window COVERS, counting both ends.
  // Dividing an inclusive N-day window by N-1 overstated every burn rate —
  // mildly over 30 days, 2x on day two of a term, which is when a student is
  // most likely to be looking.
  for (const rate of [20, 45, 67]) {
    const txns = [tx("2026-08-20", 8400, "Other", "income"),
                  ...daily("2026-08-20", "2026-10-15", rate)];
    const r = computeRunway(txns, [], FALL_MID);
    near(r.burnPerDay, rate, 0.01, `burn at $${rate}/day`);
  }
});

t("a two-day-old term does not report double the real spend", () => {
  const terms = [{ name:"Fall", start_date:"2026-08-24", end_date:"2026-12-19" }];
  const txns = [tx("2026-08-24", 20, "Food"), tx("2026-08-25", 20, "Food")];
  const r = computeRunway(txns, [], new Date(2026,7,25,12,0,0), { terms });
  near(r.burnPerDay, 20, 0.01, "burn on day 2 of term");
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

console.log("\n=== user-defined terms replace the built-in calendar ===");
const UK_TERMS = [{ name:"Michaelmas", start_date:"2026-10-05", end_date:"2026-12-11" }];
t("a quarter/UK student gets THEIR term, not the US semester", () => {
  const r = computeRunway([], [], new Date(2026,10,1), { terms: UK_TERMS });
  if (r.term.name !== "Michaelmas") throw new Error(`got ${r.term.name}`);
  if (r.term.end !== "2026-12-11") throw new Error(`end ${r.term.end}`);
});
t("falls back to the built-in calendar when none are set", () => {
  // end is the LAST DAY of the term (Dec 14), not the first day of Winter.
  const r = computeRunway([], [], new Date(2026,10,1), { terms: [] });
  if (r.term.name !== "Fall" || r.term.end !== "2026-12-14") throw new Error(JSON.stringify(r.term));
});
t("wrong term boundaries would change the allowance materially", () => {
  const txns = [tx("2026-10-06", 3000, "Other", "income"), ...daily("2026-10-06","2026-11-01",40)];
  const mine    = computeRunway(txns, [], new Date(2026,10,1), { terms: UK_TERMS });
  const default_= computeRunway(txns, [], new Date(2026,10,1), { terms: [] });
  if (mine.daysRemaining === default_.daysRemaining) throw new Error("expected different horizons");
  console.log(`          own term: ${mine.daysRemaining} days left · built-in: ${default_.daysRemaining} — ` +
              `allowance $${mine.allowancePerDay.toFixed(2)} vs $${default_.allowancePerDay.toFixed(2)}/day`);
});

console.log("\n=== the horizon is the next disbursement, not term end ===");
const DISB = [
  { label:"Spring aid", amount:7000, expected_on:"2026-11-10", received_on:null },
  { label:"Old one",    amount:5000, expected_on:"2026-08-18", received_on:"2026-08-18" },
];
t("targets an upcoming disbursement when it lands before term end", () => {
  const r = computeRunway([], [], FALL_MID, { disbursements: DISB });
  if (r.horizonKind !== "disbursement") throw new Error(`kind ${r.horizonKind}`);
  if (r.horizonDate !== "2026-11-10") throw new Error(`date ${r.horizonDate}`);
});
t("ignores disbursements already received", () => {
  const past = [{ label:"Done", amount:5000, expected_on:"2026-08-18", received_on:"2026-08-18" }];
  const r = computeRunway([], [], FALL_MID, { disbursements: past });
  if (r.horizonKind !== "term-end") throw new Error("a received disbursement became the horizon");
});
t("falls back to term end when the next one lands after it", () => {
  const late = [{ label:"Next year", amount:7000, expected_on:"2027-01-20", received_on:null }];
  const r = computeRunway([], [], FALL_MID, { disbursements: late });
  if (r.horizonKind !== "term-end") throw new Error(`kind ${r.horizonKind}`);
});
t("a nearer horizon makes the SAME money stretch less far per day", () => {
  const txns = [tx("2026-08-20", 8400, "Other", "income"), ...daily("2026-08-20","2026-10-15",50)];
  const toTerm = computeRunway(txns, [], FALL_MID, {});
  const toDisb = computeRunway(txns, [], FALL_MID, { disbursements: DISB });
  if (!(toDisb.allowancePerDay > toTerm.allowancePerDay))
    throw new Error("a closer payday should raise the daily allowance");
  console.log(`          to term end (${toTerm.daysRemaining}d): $${toTerm.allowancePerDay.toFixed(2)}/day · ` +
              `to next aid (${toDisb.daysRemaining}d): $${toDisb.allowancePerDay.toFixed(2)}/day`);
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
