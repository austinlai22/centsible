/**
 * periods.js — month/semester windowing and per-category spend aggregation.
 *
 * Semester boundaries mirror server/routes/data.js's semesterForDate():
 *   Fall   Aug 15 – Dec 14
 *   Winter Dec 15 – Jan 14
 *   Spring Jan 15 – May 14
 *   Summer May 15 – Aug 14
 */

import { CATEGORY_META, LEVELS } from "../constants.js";
import { pct } from "./format.js";

/** Current level, the next one up, and progress toward it. */
export function getLevelInfo(pts){
  const points = Number(pts) || 0;
  const cur  = LEVELS.slice().reverse().find(l=>points>=l.min) || LEVELS[0];
  const next = LEVELS.find(l=>l.level===cur.level+1) || null;
  const prog = next ? pct(points-cur.min, next.min-cur.min) : 100;
  return {cur,next,prog};
}

/** Given a Date, returns { name, start, end } for the semester containing it. */
export function semesterForDate(date=new Date()){
  const y=date.getFullYear();
  const d=(yy,mm,dd)=>new Date(yy,mm-1,dd);
  const iso=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const bounds=[
    {name:"Fall",   start:d(y-1,8,15),  end:d(y-1,12,15)},
    {name:"Winter", start:d(y-1,12,15), end:d(y,1,15)},
    {name:"Winter", start:d(y,12,15),   end:d(y+1,1,15)},
    {name:"Spring", start:d(y,1,15),    end:d(y,5,15)},
    {name:"Summer", start:d(y,5,15),    end:d(y,8,15)},
    {name:"Fall",   start:d(y,8,15),    end:d(y,12,15)},
  ];
  const chosen=bounds.find(b=>date>=b.start&&date<b.end)||bounds[bounds.length-1];
  return {name:chosen.name,start:iso(chosen.start),end:iso(chosen.end)};
}

/**
 * Steps to the immediately adjacent semester (+1 next, -1 previous).
 * Steps one day past the current semester's own boundary rather than a fixed
 * day count — Winter is ~1 month while Fall/Spring are ~4, so any fixed jump
 * would overshoot or undershoot depending on direction.
 */
export function shiftSemester(refDate, direction){
  const cur = semesterForDate(refDate);
  const boundary = direction>0 ? new Date(cur.end+"T12:00:00") : new Date(cur.start+"T12:00:00");
  const landing = new Date(boundary.getTime() + direction*86400000);
  return semesterForDate(landing);
}

/** Formats a Date as "YYYY-MM-01" — the server's month key. */
export function monthKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-01`;
}

/** Steps a date by whole calendar months, landing on the 1st. */
export function shiftMonth(refDate, direction){
  return new Date(refDate.getFullYear(), refDate.getMonth()+direction, 1);
}

/**
 * Real length of a semester in "months", used to derive a semester budget
 * total from a monthly figure (e.g. $400/mo → ~$1,600 for a 4-month Fall,
 * but only ~$400 for the ~1-month Winter term).
 *
 * Computed from the actual day-span / 30.44 rather than a hardcoded constant,
 * so it stays correct if semesterForDate's boundaries ever change.
 * Verified: Fall≈4.01, Winter≈1.02, Spring≈3.94, Summer≈3.02.
 */
export function semesterMonthCount(refDate=new Date()){
  const sem=semesterForDate(refDate);
  const start=new Date(sem.start+"T00:00:00");
  const end=new Date(sem.end+"T00:00:00");
  return ((end-start)/86400000)/30.44;
}

/**
 * Sums expense transactions by category across EVERY category — this never
 * filters categories out. Each category is windowed by its own period tag:
 *   - "monthly"  categories use the month window, unless activeView is
 *                "semester", in which case they're summed semester-to-date.
 *   - "semester" categories always use the semester window; there's no
 *                meaningful monthly window for a lump-sum tuition payment.
 *
 * Date comparison is lexicographic on YYYY-MM-DD strings, which is only valid
 * because both transaction sources now return that exact format (see the
 * TO_CHAR in routes/plaid.js — bank rows previously arrived as timezone-
 * shifted ISO timestamps, which could bucket a transaction into the wrong
 * month at a boundary).
 */
export function catSpendMap(transactions, activeView="monthly", refDate=new Date()){
  const sem=semesterForDate(refDate);
  const y=refDate.getFullYear(), mo=refDate.getMonth();
  const monthStart=`${y}-${String(mo+1).padStart(2,"0")}-01`;
  const nextM=new Date(y,mo+1,1);
  const monthEnd=`${nextM.getFullYear()}-${String(nextM.getMonth()+1).padStart(2,"0")}-01`;

  const m={};
  (transactions||[])
    .filter(t=>t.type==="expense")
    .forEach(t=>{
      const catPeriod=CATEGORY_META[t.category]?.period||"monthly";
      const useSemesterWindow = catPeriod==="semester" || activeView==="semester";
      const start = useSemesterWindow ? sem.start : monthStart;
      const end   = useSemesterWindow ? sem.end   : monthEnd;
      const date  = String(t.date||"").slice(0,10);
      if(date>=start && date<end){
        m[t.category]=(m[t.category]||0)+Number(t.amount);
      }
    });
  return m;
}

/**
 * Income/expense/savings totals for a single window, so the Summary hero can
 * label a period and actually mean it. The previous version summed EVERY
 * transaction ever loaded while displaying a hardcoded "May 2025" header.
 */
export function periodTotals(transactions, refDate=new Date()){
  const y=refDate.getFullYear(), mo=refDate.getMonth();
  const start=`${y}-${String(mo+1).padStart(2,"0")}-01`;
  const nextM=new Date(y,mo+1,1);
  const end=`${nextM.getFullYear()}-${String(nextM.getMonth()+1).padStart(2,"0")}-01`;

  let income=0, expenses=0;
  for(const t of transactions||[]){
    const date=String(t.date||"").slice(0,10);
    if(date<start || date>=end) continue;
    if(t.type==="income") income+=Number(t.amount)||0;
    else                  expenses+=Number(t.amount)||0;
  }
  const saved=income-expenses;
  return { income, expenses, saved, savingsRate: income>0 ? Math.round((saved/income)*100) : 0 };
}

export const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
