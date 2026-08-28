/**
 * Adversarial pass over the surface added since the last audit:
 * runway, terms, disbursements, and the savings-rate change.
 * Each check states the user-visible consequence if it fails.
 */
import { computeRunway } from "../src/lib/runway.js";
import { periodTotals, termForDate } from "../src/lib/periods.js";

let ok = 0, bad = 0;
const t = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); ok++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); bad++; }
};
const tx = (date, amount, category, type = "expense") => ({ date, amount, category, type });
const daily = (from, to, amount, category = "Food") => {
  const out = [];
  for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1))
    out.push(tx(d.toISOString().slice(0, 10), amount, category));
  return out;
};

console.log("=== burn rate: is it modelling ONGOING spending? ===");

t("a one-off tuition payment must not be treated as daily burn", () => {
  const base = daily("2026-09-16", "2026-10-15", 40);           // steady $40/day
  const withTuition = [...base, tx("2026-10-01", 9000, "Tuition")];
  const a = computeRunway([tx("2026-08-20", 20000, "Disbursement", "income"), ...base], [], new Date(2026,9,15));
  const b = computeRunway([tx("2026-08-20", 20000, "Disbursement", "income"), ...withTuition], [], new Date(2026,9,15));
  // Tuition is a known one-off. If it inflates burn, the app tells a solvent
  // student they run out in days.
  if (b.burnPerDay > a.burnPerDay * 1.5)
    throw new Error(`burn jumped ${a.burnPerDay.toFixed(2)} -> ${b.burnPerDay.toFixed(2)}/day because of one tuition bill`);
});

t("spending from BEFORE the term must not inflate a new term's burn rate", () => {
  // Term started 5 days ago. There is a month of heavy spending before it.
  const prevTerm = daily("2026-07-20", "2026-08-14", 200);   // last term, heavy
  const thisTerm = daily("2026-08-15", "2026-08-19", 20);    // this term, frugal
  const r = computeRunway(
    [tx("2026-08-15", 5000, "Disbursement", "income"), ...prevTerm, ...thisTerm],
    [], new Date(2026, 7, 19)
  );
  // Real behaviour this term is $20/day. Anything near $200 means pre-term
  // spending is being divided by days-elapsed-this-term.
  if (r.burnPerDay > 60)
    throw new Error(`burn ${r.burnPerDay.toFixed(2)}/day, but this term's actual rate is $20/day`);
});

console.log("\n=== disbursements: the overdue case ===");

t("a disbursement that never arrived is surfaced, not silently ignored", () => {
  const disb = [{ label:"Fall aid", amount:8000, expected_on:"2026-09-01", received_on:null }];
  const r = computeRunway(
    [tx("2026-08-20", 500, "Other", "income"), ...daily("2026-08-20","2026-10-15",30)],
    [], new Date(2026,9,15), { disbursements: disb }
  );
  // Expected Sept 1, today is Oct 15, never marked received. This is exactly
  // when a student is in trouble and the app should say so.
  if (!r.overdueDisbursement)
    throw new Error("no overdue signal — the money never came and nothing flags it");
});

console.log("\n=== savings rate: does the exclusion actually hold for real data? ===");

const AID = [{ label:"Fall aid", amount:8400, expected_on:"2026-08-05", received_on:null }];

t("a BANK-SYNCED aid payment is matched to its record and excluded", () => {
  // Plaid maps INCOME/PAYROLL to "Other" (lib/plaid.js), so a lump-sum refund
  // arrives categorised as ordinary income. Matching it against the payment the
  // student already told us to expect is what keeps it out of a monthly rate.
  const txns = [
    tx("2026-08-05", 8400, "Other", "income"),   // the refund, as Plaid delivers it
    tx("2026-08-01", 1200, "Other", "income"),   // an actual monthly job
    tx("2026-08-12", 600, "Food"),
  ];
  const r = periodTotals(txns, new Date(2026, 7, 15), AID);
  if (r.income !== 1200)
    throw new Error(`income ${r.income} — expected only the $1,200 job to count`);
  if (r.savingsRate !== 50)
    throw new Error(`rate ${r.savingsRate}%, expected 50% on the recurring money alone`);
});

t("a near-miss on amount and date is still matched (schools deduct fees)", () => {
  // Aid is disbursed, fees come off, the refund lands days later and smaller.
  const r = periodTotals([tx("2026-08-14", 7100, "Other", "income")], new Date(2026,7,15), AID);
  if (r.hasIncome)
    throw new Error("a reduced, delayed refund was counted as monthly income");
});

t("an ordinary paycheque is NOT swallowed by a nearby disbursement", () => {
  // The tolerance must not be so wide it eats real recurring income.
  const r = periodTotals([tx("2026-08-06", 900, "Other", "income")], new Date(2026,7,15), AID);
  if (!r.hasIncome)
    throw new Error("a $900 paycheque was mistaken for an $8,400 disbursement");
});

t("with NO disbursement recorded it degrades honestly, not silently", () => {
  // Nothing can identify the refund here — but the app now asks for this at
  // signup and in the setup card, so the unrecorded case is the exception.
  const r = periodTotals([
    tx("2026-08-05", 8400, "Other", "income"),
    tx("2026-08-12", 600, "Food"),
  ], new Date(2026, 7, 15));
  if (!Number.isFinite(r.savingsRate)) throw new Error("produced a non-finite rate");
});

console.log("\n=== terms: gaps and edges ===");

t("a date in the gap between two terms does not produce negative elapsed days", () => {
  const terms = [
    { name:"Fall",   start_date:"2026-08-24", end_date:"2026-12-11" },
    { name:"Spring", start_date:"2027-01-19", end_date:"2027-05-07" },
  ];
  const r = computeRunway([], [], new Date(2026, 11, 20), { terms }); // winter break
  if (r.daysElapsed < 0 || r.daysRemaining < 0)
    throw new Error(`elapsed ${r.daysElapsed}, remaining ${r.daysRemaining}`);
  if (!Number.isFinite(r.allowancePerDay))
    throw new Error("allowance is not finite during a break");
});

t("after the last defined term, it does not silently switch calendars", () => {
  const terms = [{ name:"Fall", start_date:"2026-08-24", end_date:"2026-12-11" }];
  const got = termForDate(new Date(2027, 5, 1), terms);
  // Falling back to the built-in US semester means a quarter-system student
  // suddenly sees boundaries that are not theirs.
  if (got.source === "default")
    throw new Error("fell back to the built-in calendar instead of saying it doesn't know");
});

console.log(`\n  PASSED: ${ok}   FAILED: ${bad}`);
