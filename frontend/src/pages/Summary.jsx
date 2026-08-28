import { S } from "../styles.js";
import { CATEGORY_META, categoryLabel } from "../constants.js";
import { fmt, fmtDec, formatDate } from "../lib/format.js";
import { catSpendMap, getLevelInfo, periodTotals, MONTH_NAMES } from "../lib/periods.js";
import { Card, ErrorBanner, SyncBanner, SkeletonCard, SkeletonList } from "../components/ui.jsx";
import { RunwayCard } from "../components/RunwayCard.jsx";
import { SetupCard } from "../components/SetupCard.jsx";

export default function Summary({profile,user,setUser,transactions,goals,points,accounts,terms,disbursements,reloadDisbursements,loading,error,reload}){
  // Skeleton only on the very first load, before any data (including the demo
  // fallback) exists — once anything is present, prefer showing it even while
  // a background reload is in flight.
  if(loading && !transactions?.length){
    return(
      <div className="slide-up" style={{...S.col,gap:18}}>
        <SkeletonCard lines={4} style={{background:"var(--hero)"}}/>
        <SkeletonCard lines={3}/>
        <div className="grid-stats"><SkeletonCard lines={2}/><SkeletonCard lines={2}/></div>
        <SkeletonCard lines={4}/>
        <SkeletonList rows={4}/>
      </div>
    );
  }

  const now = new Date();
  // Scoped to the current calendar month. The previous version summed EVERY
  // transaction ever loaded (including demo rows from other months) while the
  // hero read "May 2025" — so the headline numbers never matched the label.
  // disbursements are passed so a BANK-SYNCED aid payment is recognised too.
  // Plaid categorises income as "Other", so without this a lump-sum refund
  // reads as ordinary monthly income and inflates the rate to ~94%.
  const { income, expenses, saved, savingsRate: sr, hasIncome } = periodTotals(transactions, now, disbursements);
  const periodLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  // Summary is a general overview, not a period-specific budget view, so it
  // combines this month's monthly-category spend with this semester's
  // semester-category spend — Food (this month) and Tuition (this semester)
  // can both appear in the same breakdown.
  // ONE call, not a merge of two. catSpendMap already windows each category by
  // its own period tag — monthly categories by this month, semester categories
  // by this semester. Spreading a second "semester" map over it overwrote the
  // monthly figures with semester-to-date totals, so the breakdown silently
  // disagreed with the "Spent this month" tile beside it.
  const spend   = catSpendMap(transactions,"monthly",now,terms);
  const topCats = Object.entries(spend).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const recent  = [...(transactions||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);
  const {cur:lvl}= getLevelInfo(points);

  const nothingYet = !hasIncome && expenses === 0;
  const headline = nothingYet ? "Nothing recorded yet this month — add a transaction or link a bank to get started."
    : !hasIncome ? "No income recorded yet this month, so there's no savings rate to show."
    : sr>20 ? "You're crushing it this month."
    : sr>0   ? "Staying on track — keep it up."
    : sr===0 ? "You're breaking even this month."
    : "Spending is exceeding income.";

  return(
    <div className="slide-up" style={{...S.col,gap:18}}>
      <ErrorBanner message={error} onRetry={reload}/>
      <SyncBanner accounts={accounts}/>

      <div style={{background:"var(--hero)",borderRadius:20,padding:"26px 26px 22px",color:"var(--hero-ink)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-24,top:-24,width:130,height:130,background:"rgba(184,136,42,.14)",borderRadius:"50%"}}/>
        <div style={{...S.between,marginBottom:5,gap:10,flexWrap:"wrap",position:"relative"}}>
          <p style={{fontSize:12,color:"var(--hero-muted)",textTransform:"uppercase",letterSpacing:1}}>{periodLabel}</p>
          <span style={{fontSize:12,background:"rgba(255,255,255,.1)",borderRadius:20,padding:"3px 10px",color:"var(--hero-ink)"}}>{lvl.icon} {lvl.name} · {points} pts</span>
        </div>
        <h2 style={{...S.display,fontSize:28,fontWeight:400,marginBottom:4,position:"relative"}}>
          Hey{profile.name?`, ${profile.name}`:""} 👋
        </h2>
        <p style={{color:"var(--hero-muted)",fontSize:14,position:"relative"}}>{headline}</p>
        <div style={{marginTop:18,...S.row,gap:18,flexWrap:"wrap",position:"relative"}}>
          {[["Income",income,"var(--success-on-hero)"],["Spent",expenses,"var(--hero-ink)"],["Saved",saved,saved>=0?"var(--success-on-hero)":"var(--danger-on-hero)"]].map(([l,v,c])=>(
            <div key={l}>
              <p style={{fontSize:11,color:"var(--hero-muted)",marginBottom:2}}>{l}</p>
              <p style={{...S.display,fontSize:20,fontWeight:300,color:c}}>{fmt(v)}</p>
            </div>
          ))}
        </div>
      </div>

      <SetupCard user={user} setUser={setUser} termStart={terms?.[0]?.start_date}
        reloadDisbursements={reloadDisbursements}/>

      <RunwayCard transactions={transactions} accounts={accounts} refDate={now}
        terms={terms} disbursements={disbursements}/>

      <div className="grid-stats">
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Savings rate</p>
          <p style={{...S.display,fontSize:32,fontWeight:300,color:!hasIncome?"var(--subtle)":sr>=20?"var(--success)":sr>=0?"var(--warning)":"var(--danger)"}}>
            {hasIncome ? `${sr}%` : "—"}
          </p>
          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>
            {hasIncome ? "Target: 20%" : "Needs income to calculate"}
          </p>
        </Card>
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Goals</p>
          <p style={{...S.display,fontSize:32,fontWeight:300}}>{goals?.length ?? 0}</p>
          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{!goals?.length?"None set yet":"active buckets"}</p>
        </Card>
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Spent this month</p>
          <p style={{...S.display,fontSize:32,fontWeight:300,color:"var(--ink)"}}>{fmt(expenses)}</p>
          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>across {Object.keys(spend).length} categories</p>
        </Card>
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Net</p>
          <p style={{...S.display,fontSize:32,fontWeight:300,color:saved>=0?"var(--success)":"var(--danger)"}}>{fmt(saved)}</p>
          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>income − spending</p>
        </Card>
      </div>

      <div className="grid-split">
        <Card>
          <p style={{fontSize:15,fontWeight:600,marginBottom:16}}>Spending breakdown</p>
          {topCats.length===0 && <p style={{fontSize:14,color:"var(--muted)"}}>No spending recorded yet this period.</p>}
          {topCats.map(([cat,amt])=>{
            const m=CATEGORY_META[cat]||CATEGORY_META.Other;
            const w=Math.round((amt/(expenses||amt||1))*100);
            return(
              <div key={cat} style={{marginBottom:13}}>
                <div style={{...S.between,marginBottom:4,gap:8}}>
                  <span style={{fontSize:14}}>{m.icon} {categoryLabel(cat)}</span>
                  <span style={{fontSize:14,fontWeight:500,whiteSpace:"nowrap"}}>{fmtDec(amt)} <span style={{color:"var(--muted)",fontWeight:400}}>({w}%)</span></span>
                </div>
                <div style={{height:5,background:"var(--line)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:Math.min(100,w)+"%",background:m.color,borderRadius:3,transition:"width .5s"}}/>
                </div>
              </div>
            );
          })}
        </Card>

        <Card style={{padding:0}}>
          <p style={{fontSize:15,fontWeight:600,padding:"18px 20px 12px"}}>Recent activity</p>
          {recent.length===0 && <p style={{fontSize:14,color:"var(--muted)",padding:"0 20px 20px"}}>Nothing logged yet.</p>}
          {recent.map(t=>{
            const m=CATEGORY_META[t.category]||CATEGORY_META.Other;
            return(
              <div key={t.id} style={{...S.row,padding:"10px 20px",borderTop:"1px solid var(--line)"}}>
                <div style={S.iconBox(m.colorLight)}>{m.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</p>
                  <p style={{fontSize:11,color:"var(--muted)"}}>{formatDate(t.date)}</p>
                </div>
                <span style={{fontSize:14,fontWeight:600,whiteSpace:"nowrap",color:t.type==="income"?"var(--success)":"var(--ink)"}}>
                  {t.type==="income"?"+":"−"}{fmtDec(t.amount)}
                </span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
