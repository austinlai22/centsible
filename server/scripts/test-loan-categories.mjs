/**
 * Only a credit card BILL PAYMENT is a transfer. Plaid puts several
 * genuinely different things under one primary category (LOAN_PAYMENTS) —
 * mortgage, car, student loan, personal loan, BNPL, cash advances, credit
 * card — and only the credit card one represents settling a debt for
 * spending already tracked (or untrackable) elsewhere. The other five are
 * real, recurring debt-service spending a budget needs to see; sweeping them
 * into the same transfer bucket would hide a $9,000/yr student loan payment
 * from the runway entirely. Distinguishing them requires the DETAILED value,
 * not the primary — confirmed against Plaid's own published taxonomy
 * (plaid.com/documents/pfc-taxonomy-all.csv).
 */
import "dotenv/config";
import { normaliseCategory } from "../lib/plaid.js";
import { TRANSFER_CATEGORIES } from "../lib/categories.js";

let pass = 0, fail = 0;
const t = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); pass++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); fail++; }
};
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };

t("a credit card payment is categorised as a transfer", () => {
  const cat = normaliseCategory("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
  eq(cat, "CreditCardPayment", "category");
  if (!TRANSFER_CATEGORIES.includes(cat)) throw new Error("not registered as a transfer category");
});

for (const [detailed, label] of [
  ["LOAN_PAYMENTS_MORTGAGE_PAYMENT", "a mortgage payment"],
  ["LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT", "a student loan payment"],
  ["LOAN_PAYMENTS_CAR_PAYMENT", "a car payment"],
  ["LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT", "a personal loan payment"],
  ["LOAN_PAYMENTS_BNPL", "a buy-now-pay-later payment"],
  ["LOAN_PAYMENTS_CASH_ADVANCES", "a cash advance payment"],
]) {
  t(`${label} is NOT treated as a transfer`, () => {
    const cat = normaliseCategory("LOAN_PAYMENTS", detailed);
    if (TRANSFER_CATEGORIES.includes(cat)) {
      throw new Error(`${detailed} resolved to "${cat}", which IS a transfer category`);
    }
  });
}

t("a missing detailed field falls back to the primary-level map, not a crash", () => {
  eq(normaliseCategory("LOAN_PAYMENTS", undefined), "Other", "no-detailed fallback");
  eq(normaliseCategory("LOAN_PAYMENTS", null), "Other", "null-detailed fallback");
});

t("unrelated categories are untouched by the detailed-level override", () => {
  eq(normaliseCategory("FOOD_AND_DRINK", "FAST_FOOD"), "Food", "food still maps normally");
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
