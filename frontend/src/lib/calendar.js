/**
 * calendar.js — term systems, student types, and sensible defaults.
 *
 * Disbursement timing is governed by federal rules, so the app can propose a
 * realistic date instead of asking a first-year student to guess one:
 *
 *   - Aid may post no earlier than 10 days BEFORE classes start.
 *   - First-time, first-year borrowers cannot receive Direct Loan funds until
 *     30 days INTO the term. Pell and returning-student loans have no such
 *     delay — which is why student type changes the answer materially.
 *   - Once aid creates a credit balance, the school must refund it to the
 *     student within 14 days. The refund, not the disbursement, is when money
 *     actually reaches the student, so that lag belongs in the estimate.
 *   - Semester schools disburse twice a year, quarter schools three times —
 *     in both cases roughly once per term.
 *
 * These are DEFAULTS, always editable. Schools vary within the federal
 * windows, which is exactly why the eventual answer is pulling real dates from
 * the student's own school portal rather than estimating at all.
 */

const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoStr, n) => iso(new Date(new Date(isoStr + "T12:00:00").getTime() + n * DAY));

export const TERM_SYSTEMS = [
  { id:"semester",  label:"Semesters",  hint:"Two main terms a year (Fall, Spring)", weeks:16 },
  { id:"quarter",   label:"Quarters",   hint:"Three or four terms a year",           weeks:11 },
  { id:"trimester", label:"Trimesters", hint:"Three terms a year",                   weeks:14 },
  { id:"other",     label:"Something else", hint:"I'll enter my own dates",          weeks:15 },
];

export const STUDENT_TYPES = [
  { id:"first_year", label:"First-year undergraduate", hint:"First time taking out federal loans" },
  { id:"undergrad",  label:"Continuing undergraduate", hint:"Sophomore, junior, or senior" },
  { id:"grad",       label:"Graduate student",         hint:"Master's or professional" },
  { id:"phd",        label:"PhD / doctoral",           hint:"Often stipend-funded" },
];

/** Weeks in a typical term for a given system, used only to prefill an end date. */
export function defaultTermLengthWeeks(system) {
  return TERM_SYSTEMS.find(s => s.id === system)?.weeks ?? 15;
}

/**
 * A plausible end date for a term that starts on `startIso`, so the user
 * adjusts a sensible guess rather than filling in a blank field.
 */
export function suggestTermEnd(startIso, system) {
  if (!startIso) return "";
  return addDays(startIso, defaultTermLengthWeeks(system) * 7);
}

/**
 * When money is likely to actually reach this student, given when their term
 * starts and what kind of borrower they are.
 *
 * First-time first-year borrowers are the case worth getting right: their
 * Direct Loan funds are held for 30 days into the term by federal rule, so a
 * default of "around term start" would tell them they have money weeks before
 * they do — the exact error that causes an overdraft.
 */
export function suggestDisbursementDate(termStartIso, studentType) {
  if (!termStartIso) return "";
  // Refund lag: schools must pay a credit balance within 14 days; assume the
  // middle of that window rather than the optimistic edge.
  const REFUND_LAG = 7;
  if (studentType === "first_year") {
    // 30-day hold on first-time first-year Direct Loans, then the refund lag.
    return addDays(termStartIso, 30 + REFUND_LAG);
  }
  // Everyone else: aid can post up to 10 days early, refund follows.
  return addDays(termStartIso, REFUND_LAG);
}

/** Plain-English explanation of the suggested date, shown next to the field. */
export function explainDisbursementDate(studentType) {
  return studentType === "first_year"
    ? "First-time first-year borrowers can't receive Direct Loan funds until 30 days into the term, and refunds follow within 14 days — so this is usually later than you'd expect."
    : "Aid can post up to 10 days before classes start, and your school must refund any credit balance within 14 days.";
}

/** How many disbursements a year this system typically produces. */
export function disbursementsPerYear(system) {
  return system === "quarter" ? 3 : system === "trimester" ? 3 : 2;
}
