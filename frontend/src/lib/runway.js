/**
 * runway.js — "will this money last until the next disbursement?"
 *
 * This is the question a term-funded student actually has, and it is the one
 * thing a monthly-salary budgeting app structurally cannot answer.
 *
 * The mainstream model assumes money arrives every month, so it measures a
 * monthly savings rate. A student on one aid disbursement sees that metric
 * celebrate the month the money landed and then go blank for the next four —
 * it is answering "what fraction did you save this month" when the real
 * question is "how many days of money do I have left".
 *
 * Everything here is arithmetic. No model, no API call: days remaining is date
 * maths, burn rate is a trailing average, the run-out date is a division. An
 * LLM could phrase this more warmly but cannot make it more true.
 */

import { termForDate, isTransfer, isTermItem } from "./periods.js";
import { toLocalISO, addDays, daysBetween } from "./dates.js";

/**
 * How much a student can spend per day for the rest of the term, what they're
 * actually spending, and when the money runs out if nothing changes.
 *
 * @param {object[]} transactions  normalised rows ({date, amount, category, type})
 * @param {object[]} accounts      linked bank accounts, if any
 * @param {Date}     refDate       "today"
 * @param {number}   burnWindowDays trailing window for the burn rate
 */
export function computeRunway(transactions = [], accounts = [], refDate = new Date(), opts = {}) {
  const { burnWindowDays = 30, terms = null, disbursements = [] } = opts;

  const term  = termForDate(refDate, terms);
  // The student's own calendar date. termForDate already works in local time;
  // deriving "today" any other way makes the two disagree for half of every
  // day. See lib/dates.js.
  const today = toLocalISO(refDate);

  /**
   * What the money actually has to reach.
   *
   * Term end is the fallback, but it is rarely the real deadline. A student is
   * not trying to survive until the semester is over — they are trying to
   * survive until the next aid payment lands, which is usually sooner and is
   * the date they actually feel. Targeting term end when a disbursement is due
   * six weeks earlier overstates how long the money must stretch, and quietly
   * makes an unaffordable daily allowance look affordable.
   */
  const nextDisbursement = (disbursements || [])
    .filter(d => !d.received_on && d.expected_on > today)
    .sort((a, b) => a.expected_on.localeCompare(b.expected_on))[0] || null;

  /**
   * A payment that was due and never marked received. This is the moment a
   * student is most exposed — they are spending against money that has not
   * arrived — and it was previously invisible: the horizon filter skips past
   * dates, so an overdue payment simply vanished from the calculation.
   */
  const overdueDisbursement = (disbursements || [])
    .filter(d => !d.received_on && d.expected_on <= today)
    .sort((a, b) => b.expected_on.localeCompare(a.expected_on))[0] || null;

  const horizonDate = nextDisbursement && nextDisbursement.expected_on < term.end
    ? nextDisbursement.expected_on
    : term.end;
  const horizonKind = horizonDate === term.end ? "term-end" : "disbursement";

  const daysTotal     = daysBetween(term.start, horizonDate);
  const daysElapsed   = Math.max(0, Math.min(daysTotal, daysBetween(term.start, today)));
  const daysRemaining = Math.max(0, daysBetween(today, horizonDate));

  // Transactions inside this term, transfers excluded — moving money between
  // your own accounts is neither income nor spending.
  // term.end is the last day IN the term (see periods.js), so it's inclusive —
  // otherwise everything spent on the final day of term vanishes from the
  // totals.
  const inTerm = (transactions || []).filter(t => {
    const d = String(t.date || "").slice(0, 10);
    return d >= term.start && d <= term.end && !isTransfer(t.category);
  });

  const termIncome = inTerm.filter(t => t.type === "income")
                           .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const termSpend  = inTerm.filter(t => t.type !== "income")
                           .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  /**
   * Two ways to know what's left, in order of trustworthiness:
   *
   *   balance  — the real cash in linked depository accounts. Correct even if
   *              money arrived before the term started, which is common: aid
   *              often lands days before term officially opens.
   *   flow     — term income minus term spend. The only option for someone
   *              tracking manually, but it misses anything already in the
   *              account on day one, so it under-reports.
   */
  const depository = (accounts || []).filter(a => a.type === "depository" && a.balance_current != null);
  const balance    = depository.reduce((s, a) => s + Number(a.balance_current), 0);
  const source     = depository.length ? "balance" : "flow";
  const available  = source === "balance" ? balance : termIncome - termSpend;

  /**
   * Burn rate — the ONGOING daily spend, which is a narrower thing than "money
   * that left the account". Two exclusions matter, and both were wrong before:
   *
   *   Term items. A tuition bill or a housing deposit is a known one-off. Left
   *   in, a single $9,000 payment took a steady $40/day student to $340/day and
   *   the app told a solvent person they had days left.
   *
   *   Anything before this term started. The window is a trailing 30 days, but
   *   the divisor is days elapsed IN TERM. Five days into a new term that
   *   divided a month of last term's spending by five — a measured 66x
   *   overstatement. Clamping the window to the term start keeps numerator and
   *   denominator describing the same period.
   */
  // burnWindowDays - 1, because the filter below is inclusive at BOTH ends:
  // subtracting the full 30 spans 31 calendar days and quietly divides 31
  // days of spending by 30.
  const rawWindowStart = addDays(today, -(burnWindowDays - 1));
  // Clamp to the term start only once the term is actually under way. For a
  // term that hasn't begun (a student on summer break, where termForDate
  // returns the upcoming one) the clamp would push the window into the future,
  // match nothing, and report a burn rate of $0/day — the app told someone
  // spending $50/day through the break that they were "on track" with nothing
  // logged. Outside a running term the honest window is simply the trailing
  // one.
  const termUnderWay   = term.start <= today;
  const windowStart    = termUnderWay && term.start > rawWindowStart ? term.start : rawWindowStart;
  const windowSpend = (transactions || [])
    .filter(t => {
      const d = String(t.date || "").slice(0, 10);
      return d >= windowStart && d <= today
          && t.type !== "income" && !isTransfer(t.category) && !isTermItem(t.category);
    })
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Days the window actually covers, counting both endpoints.
  const observedDays = Math.max(1, Math.min(daysBetween(windowStart, today) + 1, burnWindowDays));
  const burnPerDay   = windowSpend / observedDays;

  // What they COULD spend per day and still reach the end of term.
  const allowancePerDay = daysRemaining > 0 ? available / daysRemaining : 0;

  // How long the money lasts at the current rate.
  const daysOfRunway = burnPerDay > 0 ? Math.floor(available / burnPerDay) : Infinity;
  const runsOutOn    = Number.isFinite(daysOfRunway) && daysOfRunway < daysRemaining
    ? addDays(today, daysOfRunway)
    : null;

  // Positive = days of slack past the end of term; negative = days short.
  const slackDays = Number.isFinite(daysOfRunway) ? daysOfRunway - daysRemaining : Infinity;

  let status = "unknown";
  if (available <= 0)                      status = "empty";
  else if (!Number.isFinite(daysOfRunway)) status = "comfortable";   // nothing spent yet
  else if (slackDays < 0)                  status = "short";
  else if (slackDays < 14)                 status = "tight";
  else                                     status = "comfortable";

  // Not enough signal to project honestly — say so rather than guess.
  const hasEnoughData = inTerm.length > 0 && daysElapsed >= 3;

  return {
    term, horizonDate, horizonKind, nextDisbursement, overdueDisbursement,
    daysTotal, daysElapsed, daysRemaining,
    termIncome, termSpend,
    available, source,
    burnPerDay, allowancePerDay,
    daysOfRunway, runsOutOn, slackDays,
    status, hasEnoughData,
    // How much daily spending must change to exactly reach term end.
    dailyAdjustment: allowancePerDay - burnPerDay,
  };
}

/**
 * The single biggest lever for closing a shortfall.
 *
 * Deliberately rule-based: it names the category driving the gap and computes
 * the exact saving from a specific, checkable change. "Spend less on food" is
 * advice anyone can give; "three fewer takeaways a week closes the gap by
 * Dec 15" is only computable because we know the term end.
 */
export function topLever(transactions = [], runway, refDate = new Date(), burnWindowDays = 30) {
  if (!runway || runway.status !== "short") return null;

  const today = toLocalISO(refDate);
  // Must match computeRunway's burn window exactly. The gap this closes is
  // measured against burnPerDay, so drawing the lever from a DIFFERENT set of
  // transactions produces advice that doesn't add up: an unclamped window
  // named a category the student stopped spending on when last term ended,
  // and including one-off term items produced "about 1 fewer tuition
  // purchases a week" — advice for a bill nobody can decline.
  const rawWindowStart = addDays(today, -(burnWindowDays - 1));
  const termUnderWay   = runway.term.start <= today;
  const windowStart    = termUnderWay && runway.term.start > rawWindowStart
    ? runway.term.start
    : rawWindowStart;

  const recent = (transactions || []).filter(t => {
    const d = String(t.date || "").slice(0, 10);
    return d >= windowStart && d <= today
        && t.type !== "income" && !isTransfer(t.category) && !isTermItem(t.category);
  });
  if (!recent.length) return null;

  const byCat = {};
  for (const t of recent) {
    const c = t.category || "Other";
    byCat[c] = byCat[c] || { total: 0, count: 0 };
    byCat[c].total += Number(t.amount) || 0;
    byCat[c].count += 1;
  }
  const [category, stats] = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total)[0];

  // Daily overspend that has to disappear for the money to reach term end.
  const gapPerDay   = -runway.dailyAdjustment;
  const perPurchase = stats.total / stats.count;
  // Divided by the days the window ACTUALLY covers, not the nominal 30: four
  // days into a term, eight purchases is a rate of fourteen a week, and
  // calling it two understates the habit the advice is asking them to change.
  const observedDays = Math.max(1, Math.min(daysBetween(windowStart, today) + 1, burnWindowDays));
  const purchasesPerWeek = (stats.count / observedDays) * 7;
  // How many of this category's purchases per week to drop to close the gap.
  const dropPerWeek = perPurchase > 0 ? Math.ceil((gapPerDay * 7) / perPurchase) : 0;

  return {
    category,
    perPurchase,
    purchasesPerWeek,
    dropPerWeek: Math.min(dropPerWeek, Math.ceil(purchasesPerWeek)),
    gapPerDay,
    // Total saved over the remaining term if they make the change.
    savedByTermEnd: gapPerDay * runway.daysRemaining,
  };
}
