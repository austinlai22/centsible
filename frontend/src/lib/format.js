/** Currency and percentage formatters shared across every page. */

export const fmt    = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(n) || 0);
export const fmtDec = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n) || 0);

/** Percentage of a out of b, clamped to 0–100. Returns 0 when b is 0. */
export const pct = (a,b) => b===0 ? 0 : Math.min(100, Math.round((a/b)*100));

/** "2025-05-18" → "18 May 2025". Falls back to the raw string if unparseable. */
export function formatDate(iso){
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  // Constructed in UTC and read back in UTC so the displayed day can never
  // drift by one in negative-offset timezones.
  const d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  return d.toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric", timeZone:"UTC" });
}
