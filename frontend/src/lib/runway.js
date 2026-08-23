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

import { semesterForDate } from "./periods.js";
import { isTransfer } from "./periods.js";

const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / DAY);

/**
 * How much a student can spend per day for the rest of the term, what they're
 * actually spending, and when the money runs out if nothing changes.
 *
 * @param {object[]} transactions  normalised rows ({date, amount, category, type})
 * @param {object[]} accounts      linked bank accounts, if any
 * @param {Date}     refDate       "today"
 * @param {number}   burnWindowDays trailing window for the burn rate
 */
export function computeRunway(transactions = [], accounts = [], refDate = new Date(), burnWindowDays = 30) {
  const term  = semesterForDate(refDate);
  const today = iso(refDate);

  const daysTotal     = daysBetween(term.start, term.end);
  const daysElapsed   = Math.max(0, Math.min(daysTotal, daysBetween(term.start, today)));
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  // Transactions inside this term, transfers excluded — moving money between
  // your own accounts is neither income nor spending.
  const inTerm = (transactions || []).filter(t => {
    const d = String(t.date || "").slice(0, 10);
    return d >= term.start && d < term.end && !isTransfer(t.category);
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

  // Burn rate from a trailing window rather than the whole term: spending
  // early in term (deposits, textbooks) is not representative of the rest.
  const windowStart = iso(new Date(refDate.getTime() - burnWindowDays * DAY));
  const windowSpend = (transactions || [])
    .filter(t => {
      const d = String(t.date || "").slice(0, 10);
      return d >= windowStart && d <= today && t.type !== "income" && !isTransfer(t.category);
    })
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const observedDays = Math.max(1, Math.min(burnWindowDays, daysElapsed || burnWindowDays));
  const burnPerDay   = windowSpend / observedDays;

  // What they COULD spend per day and still reach the end of term.
  const allowancePerDay = daysRemaining > 0 ? available / daysRemaining : 0;

  // How long the money lasts at the current rate.
  const daysOfRunway = burnPerDay > 0 ? Math.floor(available / burnPerDay) : Infinity;
  const runsOutOn    = Number.isFinite(daysOfRunway) && daysOfRunway < daysRemaining
    ? iso(new Date(refDate.getTime() + daysOfRunway * DAY))
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
    term, daysTotal, daysElapsed, daysRemaining,
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

  const today = iso(refDate);
  const windowStart = iso(new Date(refDate.getTime() - burnWindowDays * DAY));
  const recent = (transactions || []).filter(t => {
    const d = String(t.date || "").slice(0, 10);
    return d >= windowStart && d <= today && t.type !== "income" && !isTransfer(t.category);
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
  const purchasesPerWeek = (stats.count / burnWindowDays) * 7;
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
