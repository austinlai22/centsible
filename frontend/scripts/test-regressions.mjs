/**
 * test-regressions.mjs — one case per bug found in the logic audit.
 *
 * Each test names the wrong behaviour it locks out, because a bare assertion
 * ("burn is 20") tells a future reader nothing about why 20 rather than 40 is
 * the right answer. Every one of these was reproduced before it was fixed.
 *
 * Runs under TZ=America/Los_Angeles as well as the default — several of these
 * only appear west of UTC, which is where this app's users are.
 */
import { computeRunway, topLever } from "../src/lib/runway.js";
import { termForDate, semesterForDate, semesterMonthCount, shiftSemester, catSpendMap, periodTotals } from "../src/lib/periods.js";
import { toLocalISO, addDays, daysBetween } from "../src/lib/dates.js";

let pass = 0, fail = 0;
const t = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); pass++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); fail++; }
};
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const near = (a, b, tol, what) => { if (Math.abs(a - b) > tol) throw new Error(`${what}: got ${a}, expected ~${b}`); };

const TERMS = [{ name: "Fall", start_date: "2026-08-24", end_date: "2026-12-19" }];
const tx = (date, amount, category, type = "expense") => ({ date, amount, category, type });

console.log("\n=== dates are the user's calendar, not UTC ===");

t("an evening reference time still reports TODAY, not tomorrow", () => {
  // 6:30pm local is already tomorrow in UTC anywhere west of it. Deriving
  // "today" from toISOString() moved the whole runway forward a day every
  // evening — and back again at 5pm local, which is midnight UTC.
  eq(toLocalISO(new Date(2026, 7, 28, 18, 30)), "2026-08-28", "local date at 18:30");
  eq(toLocalISO(new Date(2026, 7, 28, 23, 59)), "2026-08-28", "local date at 23:59");
  eq(toLocalISO(new Date(2026, 7, 28, 0, 1)),  "2026-08-28", "local date at 00:01");
});

t("a payment due TOMORROW is not announced as overdue", () => {
  const evening = new Date(2026, 7, 28, 18, 30);
  const disbursements = [{ label: "Fall aid", amount: 5000, expected_on: "2026-08-29", received_on: null }];
  const r = computeRunway([tx("2026-08-25", 40, "Food")], [], evening, { terms: TERMS, disbursements });
  if (r.overdueDisbursement) throw new Error("flagged tomorrow's payment as overdue");
  if (!r.nextDisbursement) throw new Error("lost the upcoming payment from the horizon entirely");
  eq(r.horizonKind, "disbursement", "horizon");
});

t("addDays steps the calendar across a DST boundary", () => {
  // US DST ends 2026-11-01. Adding 86.4e6 ms lands at 23:00 the day before.
  eq(addDays("2026-10-31", 1), "2026-11-01", "into DST change");
  eq(addDays("2026-11-01", 1), "2026-11-02", "out of DST change");
  eq(addDays("2026-02-28", 1), "2026-03-01", "month rollover");
  eq(addDays("2026-12-31", 1), "2027-01-01", "year rollover");
  eq(addDays("2026-01-01", -1), "2025-12-31", "backwards over a year");
  eq(daysBetween("2026-10-25", "2026-11-08"), 14, "span containing a DST change");
});

console.log("\n=== burn rate describes ongoing spending, nothing else ===");

t("an inclusive window is not divided by one day too few", () => {
  // $40 across two calendar days is $20/day. Dividing by daysBetween (1)
  // instead of the 2 days the window covers reported $40/day — a 2x
  // overstatement on the second day of a term.
  const r = computeRunway([tx("2026-08-24", 20, "Food"), tx("2026-08-25", 20, "Food")],
    [], new Date(2026, 7, 25, 12), { terms: TERMS });
  near(r.burnPerDay, 20, 0.01, "burn on day two");
});

t("spending during a break before term starts is still counted", () => {
  // termForDate returns the UPCOMING term between terms, so clamping the
  // window to term.start pushed it into the future, matched nothing, and
  // reported $0/day — telling someone burning $50/day they were on track.
  // $50 every day of the trailing 30-day window (Jun 16 – Jul 15 inclusive),
  // so the honest average is exactly $50/day.
  const ref = new Date(2026, 6, 15, 12);
  const txns = Array.from({ length: 30 }, (_, i) =>
    tx(addDays("2026-07-15", -i), 50, "Food"));
  const r = computeRunway(txns, [{ type: "depository", balance_current: 1200 }], ref, { terms: TERMS });
  eq(r.term.source, "user-upcoming", "term source");
  if (r.burnPerDay === 0) throw new Error("blind to spending during the break");
  near(r.burnPerDay, 50, 0.01, "burn during break");
});

console.log("\n=== advice has to be advice someone can act on ===");

t("never suggests cutting a one-off term item", () => {
  // Tuition is the largest line in almost any term, so it won every
  // "biggest lever" contest and produced "about 1 fewer tuition purchases a
  // week" — advice for a bill nobody can decline.
  const txns = [
    tx("2026-09-01", 9000, "Tuition"),
    ...Array.from({ length: 20 }, (_, i) => tx(`2026-09-${String(i + 1).padStart(2, "0")}`, 25, "Food")),
  ];
  const ref = new Date(2026, 8, 20, 12);
  const r = computeRunway(txns, [{ type: "depository", balance_current: 900 }], ref, { terms: TERMS });
  eq(r.status, "short", "status");
  const lever = topLever(txns, r, ref);
  if (!lever) throw new Error("expected a lever");
  eq(lever.category, "Food", "lever category");
});

t("does not name a category from before this term started", () => {
  const txns = [
    ...Array.from({ length: 10 }, (_, i) => tx(`2026-08-${String(i + 5).padStart(2, "0")}`, 200, "Shopping")),
    tx("2026-08-25", 30, "Food"), tx("2026-08-26", 30, "Food"), tx("2026-08-27", 30, "Food"),
  ];
  const ref = new Date(2026, 7, 27, 12);
  const r = computeRunway(txns, [{ type: "depository", balance_current: 100 }], ref, { terms: TERMS });
  const lever = topLever(txns, r, ref);
  if (lever && lever.category === "Shopping") throw new Error("named last term's spending");
});

console.log("\n=== a term ends on the day the student said it ends ===");

t("the final day of term is still inside the term", () => {
  // end_date is labelled "Term ends", so treating it as an exclusive
  // boundary declared the student's own calendar exhausted a day early:
  // the card announced "your last term has ended" while they were in it,
  // and silently switched to built-in US semester dates.
  eq(termForDate(new Date(2026, 11, 18, 12), TERMS).source, "user", "day before the end");
  eq(termForDate(new Date(2026, 11, 19, 12), TERMS).source, "user", "the final day itself");
  eq(termForDate(new Date(2026, 11, 20, 12), TERMS).source, "stale", "the day after");
});

t("spending on the last day of term is counted", () => {
  const r = computeRunway([tx("2026-12-19", 100, "Food")], [], new Date(2026, 11, 19, 12), { terms: TERMS });
  near(r.termSpend, 100, 0.01, "term spend on the closing day");
});

t("built-in and user terms agree on what 'end' means", () => {
  // Both are now the LAST DAY of the term. Fall ends Dec 14; Dec 15 is Winter.
  const fall = semesterForDate(new Date(2026, 8, 1));
  eq(fall.end, "2026-12-14", "built-in Fall end");
  eq(semesterForDate(new Date(2026, 11, 14, 12)).name, "Fall", "Dec 14");
  eq(semesterForDate(new Date(2026, 11, 15, 12)).name, "Winter", "Dec 15");
});

t("term length counts the last day", () => {
  // A term running the 1st to the 30th is 30 days, not 29.
  const terms = [{ name: "T", start_date: "2026-09-01", end_date: "2026-09-30" }];
  near(semesterMonthCount(new Date(2026, 8, 15, 12), terms), 30 / 30.44, 0.001, "months in a 30-day term");
});

t("stepping between semesters still lands one term away", () => {
  eq(shiftSemester(new Date(2026, 8, 1), 1).name, "Winter", "forward from Fall");
  eq(shiftSemester(new Date(2026, 8, 1), -1).name, "Summer", "back from Fall");
});

t("a term-category purchase on the closing day appears in the breakdown", () => {
  const spend = catSpendMap([{ date: "2026-12-19", amount: 500, category: "BooksSupplies", type: "expense" }],
    "semester", new Date(2026, 11, 19, 12), TERMS);
  near(spend.BooksSupplies || 0, 500, 0.01, "closing-day term spend");
});

console.log("\n=== paying off a credit card is not spending ===");

t("a credit card payment does not inflate income and expenses", () => {
  // Plaid sends this as a matched pair when both accounts are linked: an
  // expense on checking (paying the bill) and an equal-and-opposite income
  // on the card (the balance dropping). Both were "Other" before this fix,
  // so a $500 bill on a $2000/$300 month turned an 85% savings rate into
  // 1700/2500 = 68% — real money never moved, only accounting noise did.
  const now = new Date(2026, 8, 15, 12);
  const d = (day) => `2026-09-${String(day).padStart(2, "0")}`;
  const txns = [
    { date: d(2), amount: 2000, category: "Other", type: "income" },
    { date: d(4), amount: 300,  category: "Food",  type: "expense" },
    { date: d(5), amount: 500,  category: "CreditCardPayment", type: "expense" },
    { date: d(5), amount: 500,  category: "CreditCardPayment", type: "income" },
  ];
  const totals = periodTotals(txns, now, []);
  eq(totals.income, 2000, "income");
  eq(totals.expenses, 300, "expenses");
  eq(totals.savingsRate, 85, "savings rate");
});

t("a credit card payment never appears as budgeted spend", () => {
  const spend = catSpendMap(
    [{ date: "2026-09-05", amount: 500, category: "CreditCardPayment", type: "expense" }],
    "monthly", new Date(2026, 8, 15, 12));
  if ("CreditCardPayment" in spend) throw new Error("counted toward a category budget");
});

t("a credit card payment does not count toward burn rate", () => {
  const r = computeRunway(
    [tx("2026-08-25", 20, "Food"), tx("2026-08-25", 500, "CreditCardPayment")],
    [], new Date(2026, 7, 25, 12), { terms: TERMS });
  near(r.termSpend, 20, 0.01, "term spend excludes the card payment");
});

t("only CreditCardPayment is a transfer category among this session's additions", () => {
  // The actual Plaid-taxonomy risk — that mortgage/student-loan/car payments
  // under the same LOAN_PAYMENTS primary category don't get swept into the
  // same transfer bucket — lives in server/lib/plaid.js's normaliseCategory
  // and is covered there (server/scripts/test-loan-categories.mjs), since
  // that mapping doesn't exist on the frontend at all. This just guards the
  // CATEGORY_META registration itself: an "Other" transaction (what a
  // mortgage/student-loan/car payment still resolves to today) must NOT be
  // silently caught by whatever marks CreditCardPayment as a transfer.
  const totals = periodTotals(
    [{ date: "2026-09-05", amount: 400, category: "Other", type: "expense" }],
    new Date(2026, 8, 15, 12), []);
  eq(totals.expenses, 400, "an 'Other' expense (unmapped loan payments land here) still counts");
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
