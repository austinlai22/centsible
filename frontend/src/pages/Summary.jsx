import { S } from "../styles.js";
import { CATEGORY_META, categoryLabel } from "../constants.js";
import { fmt, fmtDec, formatDate } from "../lib/format.js";
import { catSpendMap, getLevelInfo, periodTotals, MONTH_NAMES } from "../lib/periods.js";
import { Card, ErrorBanner, SyncBanner, SkeletonCard, SkeletonList } from "../components/ui.jsx";

export default function Summary({profile,transactions,goals,points,accounts,loading,error,reload}){
  // Skeleton only on the very first load, before any data (including the demo
  // fallback) exists — once anything is present, prefer showing it even while
  // a background reload is in flight.
  if(loading && !transactions?.length){
    return(
      <div className="slide-up" style={{...S.col,gap:18}}>
        <SkeletonCard lines={4} style={{background:"#1A1714"}}/>
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
  const { income, expenses, saved, savingsRate: sr } = periodTotals(transactions, now);
  const periodLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  // Summary is a general overview, not a period-specific budget view, so it
  // combines this month's monthly-category spend with this semester's
  // semester-category spend — Food (this month) and Tuition (this semester)
  // can both appear in the same breakdown.
  const spend   = {...catSpendMap(transactions,"monthly",now), ...catSpendMap(transactions,"semester",now)};
  const topCats = Object.entries(spend).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const recent  = [...(transactions||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);
  const {cur:lvl}= getLevelInfo(points);

  const headline = sr>20 ? "You're crushing it this month."
    : sr>0   ? "Staying on track — keep it up."
    : sr===0 ? "You're breaking even this month."
    : "Spending is exceeding income.";

  return(
    <div className="slide-up" style={{...S.col,gap:18}}>
      <ErrorBanner message={error} onRetry={reload}/>
      <SyncBanner accounts={accounts}/>

      <div style={{background:"#1A1714",borderRadius:20,padding:"26px 26px 22px",color:"#F5F0E8",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-24,top:-24,width:130,height:130,background:"rgba(184,136,42,.14)",borderRadius:"50%"}}/>
        <div style={{...S.between,marginBottom:5,gap:10,flexWrap:"wrap",position:"relative"}}>
          <p style={{fontSize:12,color:"#C8BAA8",textTransform:"uppercase",letterSpacing:1}}>{periodLabel}</p>
          <span style={{fontSize:12,background:"rgba(255,255,255,.1)",borderRadius:20,padding:"3px 10px",color:"#F5F0E8"}}>{lvl.icon} {lvl.name} · {points} pts</span>
        </div>
        <h2 style={{...S.serif,fontSize:28,fontWeight:400,marginBottom:4,position:"relative"}}>
          Hey{profile.name?`, ${profile.name}`:""} 👋
        </h2>
        <p style={{color:"#C8BAA8",fontSize:14,position:"relative"}}>{headline}</p>
        <div style={{marginTop:18,...S.row,gap:18,flexWrap:"wrap",position:"relative"}}>
          {[["Income",income,"#8BC28A"],["Spent",expenses,"#B8882A"],["Saved",saved,saved>=0?"#8BC28A":"#C0413A"]].map(([l,v,c])=>(
            <div key={l}>
              <p style={{fontSize:11,color:"#C8BAA8",marginBottom:2}}>{l}</p>
              <p style={{...S.serif,fontSize:20,fontWeight:300,color:c}}>{fmt(v)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-stats">
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Savings rate</p>
          <p style={{...S.serif,fontSize:32,fontWeight:300,color:sr>=20?"var(--sage)":sr>=0?"var(--gold)":"var(--rose)"}}>{sr}%</p>
          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>Target: 20%</p>
        </Card>
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Goals</p>
          <p style={{...S.serif,fontSize:32,fontWeight:300}}>{goals?.length ?? 0}</p>
          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{!goals?.length?"None set yet":"active buckets"}</p>
        </Card>
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Spent this month</p>
          <p style={{...S.serif,fontSize:32,fontWeight:300,color:"var(--gold)"}}>{fmt(expenses)}</p>
          <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>across {Object.keys(spend).length} categories</p>
        </Card>
        <Card>
          <p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Net</p>
          <p style={{...S.serif,fontSize:32,fontWeight:300,color:saved>=0?"var(--sage)":"var(--rose)"}}>{fmt(saved)}</p>
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
                <div style={{height:5,background:"var(--sand)",borderRadius:3,overflow:"hidden"}}>
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
              <div key={t.id} style={{...S.row,padding:"10px 20px",borderTop:"1px solid var(--sand)"}}>
                <div style={S.iconBox(m.colorLight)}>{m.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontSize:14,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</p>
                  <p style={{fontSize:11,color:"var(--muted)"}}>{formatDate(t.date)}</p>
                </div>
                <span style={{fontSize:14,fontWeight:600,whiteSpace:"nowrap",color:t.type==="income"?"var(--sage)":"var(--ink)"}}>
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
