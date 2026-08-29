/**
 * dates.js — calendar-date helpers for a "YYYY-MM-DD" world.
 *
 * Everything the runway reasons about is a CALENDAR DAY, not an instant:
 * "which term am I in", "is this payment overdue", "what date does the money
 * run out". The user's answer to all three comes from the wall clock in front
 * of them, so every conversion here uses the LOCAL date.
 *
 * `new Date().toISOString().slice(0,10)` looks like the obvious way to get
 * today and is wrong for exactly the audience this app targets. It converts to
 * UTC first, so from 5pm Pacific (4pm during standard time) onward it returns
 * TOMORROW. Measured consequences before this module existed: an aid payment
 * due tomorrow was rendered as an overdue red alert every evening, the next
 * disbursement disappeared from the horizon entirely, and the projected
 * run-out date was a day late. All three flipped back at midnight UTC, which
 * is 5pm local — the classic "only broken in the evening" bug.
 */

/** Today (or any Date) as YYYY-MM-DD in the viewer's own timezone. */
export function toLocalISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Adds whole days to a YYYY-MM-DD string, staying on the calendar.
 *
 * Steps the date FIELD rather than adding 86.4e6 milliseconds: across a
 * daylight-saving boundary a "day" is 23 or 25 hours, so millisecond
 * arithmetic lands at 23:00 the previous evening (or 01:00 the next) and
 * truncates to the wrong date. Date's own month/year rollover handles the
 * rest.
 */
export function addDays(isoStr, n) {
  const [y, m, d] = String(isoStr).slice(0, 10).split("-").map(Number);
  return toLocalISO(new Date(y, m - 1, d + n));
}

/**
 * Whole days from `a` to `b`, both YYYY-MM-DD. Negative if b precedes a.
 *
 * Anchored at local noon so a DST shift moves the clock within the day
 * instead of across midnight, keeping the rounding unambiguous.
 */
export function daysBetween(a, b) {
  const parse = (s) => {
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).getTime();
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}
