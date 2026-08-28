import { S } from "../styles.js";
import { Card } from "./ui.jsx";
import { fmt, fmtDec } from "../lib/format.js";
import { computeRunway, topLever } from "../lib/runway.js";
import { categoryLabel, CATEGORY_META } from "../constants.js";

/**
 * Runway — how many days of money are left, against how many days of term.
 *
 * This is the headline a term-funded student actually needs. A monthly savings
 * rate answers "what fraction did you save this month", which for someone
 * living on one disbursement is blank for four months out of five. Days of
 * runway is the number they feel.
 */

const TONE = {
  comfortable: { color:"var(--success)", bg:"var(--success-bg)", line:"var(--success-line)", label:"On track" },
  tight:       { color:"var(--warning)", bg:"var(--warning-bg)", line:"var(--warning-line)", label:"Cutting it fine" },
  short:       { color:"var(--danger)",  bg:"var(--danger-bg)",  line:"var(--danger-line)",  label:"Running short" },
  empty:       { color:"var(--danger)",  bg:"var(--danger-bg)",  line:"var(--danger-line)",  label:"Nothing left" },
  unknown:     { color:"var(--muted)",   bg:"var(--bg)",         line:"var(--line)",         label:"Not enough data yet" },
};

const prettyDate = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
};

export function RunwayCard({ transactions, accounts, refDate = new Date(), terms = null, disbursements = [] }) {
  const r = computeRunway(transactions, accounts, refDate, { terms, disbursements });
  const tone = TONE[r.status] || TONE.unknown;
  // What the money has to reach: the next aid payment if one is due before the
  // term ends, otherwise the end of term itself.
  const horizonLabel = r.horizonKind === "disbursement"
    ? `${prettyDate(r.horizonDate)} (${r.nextDisbursement.label})`
    : prettyDate(r.horizonDate);

  // An expected payment that never arrived outranks everything else on this
  // card: the student is spending against money that is not there.
  const overdue = r.overdueDisbursement;

  // Say nothing rather than project from noise. A confident-looking number
  // built on two transactions is worse than an honest prompt.
  if (!r.hasEnoughData) {
    return (
      <Card>
        <div style={{...S.between, gap:12, flexWrap:"wrap"}}>
          <div style={{minWidth:0}}>
            <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".08em",fontWeight:600}}>
              Runway · {r.term.name}
            </p>
            <p style={{...S.display,fontSize:24,fontWeight:700,marginTop:6}}>
              {r.daysRemaining} days to {horizonLabel}
            </p>
            <p style={{fontSize:13,color:"var(--muted)",marginTop:6,lineHeight:1.55,maxWidth:460}}>
              Log a few days of spending — or link a bank — and this will show how long
              your money lasts, and the date it runs out if nothing changes.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const lever = topLever(transactions, r, refDate);
  // Fraction of the remaining term the money actually covers.
  const covered = r.daysRemaining > 0 && Number.isFinite(r.daysOfRunway)
    ? Math.max(0, Math.min(100, Math.round((r.daysOfRunway / r.daysRemaining) * 100)))
    : 100;

  return (
    <Card style={{borderLeft:`3px solid ${overdue ? "var(--danger)" : tone.color}`, paddingLeft:21}}>
      {overdue && (
        <div style={{background:"var(--danger-bg)",border:"1px solid var(--danger-line)",
                     borderRadius:"var(--r-md)",padding:"12px 14px",marginBottom:14}}>
          <p style={{fontSize:13,color:"var(--danger)",lineHeight:1.6}}>
            <strong>{overdue.label}</strong> was expected {prettyDate(overdue.expected_on)} and
            hasn't been marked as received. If it hasn't arrived, the figures below are
            counting on money you don't have yet.
          </p>
        </div>
      )}

      {r.term.source === "stale" && (
        <div style={{background:"var(--warning-bg)",border:"1px solid var(--warning-line)",
                     borderRadius:"var(--r-md)",padding:"12px 14px",marginBottom:14}}>
          <p style={{fontSize:13,color:"var(--warning)",lineHeight:1.6}}>
            Your last term has ended. These figures use standard semester dates —
            add your next term in Settings → Study calendar to make them yours.
          </p>
        </div>
      )}
      <div style={{...S.between, gap:12, flexWrap:"wrap", marginBottom:14}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".08em",fontWeight:600}}>
            Runway · {r.term.name}
          </p>
          {/* Once the money outlasts the term, the raw runway figure stops
              being informative — "361 days of money" against a 114-day term is
              noise. What matters then is that the term is covered, and by how
              much. Below the line, the shortfall itself is the headline. */}
          {r.status !== "empty" && Number.isFinite(r.daysOfRunway) && r.daysOfRunway < r.daysRemaining ? (
            <>
              <p className="tnum" style={{...S.display,fontSize:34,fontWeight:700,marginTop:4,color:tone.color}}>
                {r.daysOfRunway} days
              </p>
              <p style={{fontSize:13,color:"var(--muted)",marginTop:2}}>
                of money, but <strong style={{color:"var(--ink)"}}>{r.daysRemaining} days</strong> left to {horizonLabel}
              </p>
            </>
          ) : r.status === "empty" ? (
            <>
              <p className="tnum" style={{...S.display,fontSize:34,fontWeight:700,marginTop:4,color:tone.color}}>{fmt(0)}</p>
              <p style={{fontSize:13,color:"var(--muted)",marginTop:2}}>
                left, with <strong style={{color:"var(--ink)"}}>{r.daysRemaining} days</strong> to {horizonLabel}
              </p>
            </>
          ) : (
            <>
              <p className="tnum" style={{...S.display,fontSize:34,fontWeight:700,marginTop:4,color:tone.color}}>
                {r.daysRemaining} days
              </p>
              <p style={{fontSize:13,color:"var(--muted)",marginTop:2}}>
                to {horizonLabel} — <strong style={{color:"var(--ink)"}}>covered</strong> at your current rate
              </p>
            </>
          )}
        </div>
        <span style={{...S.pill(tone.bg, tone.color), fontSize:12, padding:"6px 12px", flexShrink:0}}>
          {tone.label}
        </span>
      </div>

      {/* How far the money reaches into the remaining term. */}
      <div style={{height:8,background:"var(--line)",borderRadius:"var(--r-full)",overflow:"hidden"}}
           role="progressbar" aria-valuenow={covered} aria-valuemin={0} aria-valuemax={100}
           aria-label="Share of the remaining term your money covers">
        <div style={{height:"100%",width:covered+"%",background:tone.color,borderRadius:"var(--r-full)",transition:"width .5s ease"}}/>
      </div>

      <div style={{...S.between, gap:12, marginTop:10, flexWrap:"wrap"}}>
        <span className="tnum" style={{fontSize:12,color:"var(--muted)"}}>
          Spending <strong style={{color:"var(--ink)"}}>{fmtDec(r.burnPerDay)}</strong>/day
        </span>
        <span className="tnum" style={{fontSize:12,color:"var(--muted)"}}>
          {r.daysRemaining > 0
            ? <>Sustainable: <strong style={{color:"var(--ink)"}}>{fmtDec(r.allowancePerDay)}</strong>/day</>
            : "Term has ended"}
        </span>
      </div>

      {/* The specific, checkable consequence — the part a monthly budgeting app
          cannot produce, because it has no concept of a term end. */}
      {r.runsOutOn && (
        <div style={{background:tone.bg,border:`1px solid ${tone.line}`,borderRadius:"var(--r-md)",padding:"12px 14px",marginTop:14}}>
          <p style={{fontSize:13,color:tone.color,lineHeight:1.6}}>
            At this rate your money runs out <strong>{prettyDate(r.runsOutOn)}</strong> —{" "}
            {Math.abs(r.slackDays)} days before{" "}
            {r.horizonKind === "disbursement" ? "your next payment arrives" : "the term ends"}.
            {lever && (
              <> Spending {fmtDec(Math.abs(r.dailyAdjustment))}/day less closes the gap
                {lever.dropPerWeek > 0 && (
                  <> — about <strong>{lever.dropPerWeek} fewer {categoryLabel(lever.category).toLowerCase()} purchase
                  {lever.dropPerWeek === 1 ? "" : "s"} a week</strong> {CATEGORY_META[lever.category]?.icon || ""}</>
                )}.
              </>
            )}
          </p>
        </div>
      )}

      {r.status === "comfortable" && Number.isFinite(r.slackDays) && r.slackDays > 0 && (
        <p style={{fontSize:12,color:"var(--muted)",marginTop:12,lineHeight:1.6}}>
          At this rate you reach {horizonLabel} with about <strong style={{color:"var(--ink)"}}>
          {fmt(r.available - r.burnPerDay * r.daysRemaining)}</strong> to spare.
        </p>
      )}

      {r.source === "flow" && (
        <p style={{fontSize:11,color:"var(--subtle)",marginTop:10,lineHeight:1.5}}>
          Based on income and spending logged this term. Link a bank for your real balance.
        </p>
      )}
    </Card>
  );
}
