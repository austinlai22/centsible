import { useState } from "react";
import { S } from "../styles.js";
import { CATEGORY_META, categoryLabel } from "../constants.js";
import { fmt, fmtDec, pct } from "../lib/format.js";
import {
  catSpendMap, semesterForDate, semesterMonthCount,
  shiftSemester, shiftMonth, monthKey, MONTH_NAMES,
} from "../lib/periods.js";
import { Card, SpendBar, ErrorBanner, SkeletonCard, SkeletonList } from "../components/ui.jsx";

export default function Budget({
  transactions, budgets, setBudgets,
  budgetsLoading, budgetsError, reloadBudgets,
  txnLoading, txnError, reloadTxns,
  period, setPeriod, refDate, setRefDate, goToToday,
}){
  const [editing,setEditing]=useState(null);
  const [editErr,setEditErr]=useState("");

  if((budgetsLoading&&!Object.keys(budgets||{}).length) || (txnLoading&&!transactions?.length)){
    return(
      <div className="slide-up" style={{...S.col,gap:16}}>
        <SkeletonCard lines={2} style={{background:"var(--hero)"}}/>
        <SkeletonList rows={5}/>
      </div>
    );
  }

  const semInfo    = semesterForDate(refDate);
  const spend      = catSpendMap(transactions, period, refDate);
  const monthCount = semesterMonthCount(refDate); // ~4.01 Fall, ~1.02 Winter
  const isCurrentPeriod = period==="semester"
    ? semInfo.start===semesterForDate(new Date()).start
    : monthKey(refDate)===monthKey(new Date());

  // Savings is a transfer between the user's own accounts, not a spending
  // category — it has no budget and never appears here.
  const spendable   = Object.entries(CATEGORY_META).filter(([,m])=>!m.transfer);
  const monthlyCats = spendable.filter(([,m])=>m.period==="monthly");
  const semesterCats= spendable.filter(([,m])=>m.period==="semester");

  /**
   * Budget number to display/compare against in the active view:
   *   semester category            → its stored value always
   *   monthly category, Month view → its stored value
   *   monthly category, Sem. view  → DERIVED: stored × months in the semester
   */
  const displayBudget=(cat)=>{
    const meta=CATEGORY_META[cat];
    const stored=Number(budgets?.[cat])||0;
    if(meta.period==="semester") return stored;
    return period==="semester" ? stored*monthCount : stored;
  };
  // A monthly category is only directly editable in Month view — its
  // Semester-view number is derived, so editing it there is ambiguous.
  const isEditable=(cat)=>CATEGORY_META[cat].period==="semester" || period==="monthly";

  const sumB = (cats)=>cats.reduce((s,[k])=>s+displayBudget(k),0);
  const sumS = (cats)=>cats.reduce((s,[k])=>s+(spend[k]||0),0);

  /**
   * Month and semester budgets are NEVER added together in Month view.
   *
   * A $9,000 tuition bill is a once-a-term cost; adding it to $600 of monthly
   * food produced a headline "$9,600 this month" that described no real
   * period. In Month view the hero covers monthly categories only and
   * semester categories get their own clearly-labelled section with its own
   * subtotal. In Semester view every figure is already semester-scoped, so a
   * single combined total is meaningful there.
   */
  const heroCats = period==="semester" ? spendable : monthlyCats;
  const totalB   = sumB(heroCats);
  const totalS   = sumS(heroCats);

  const saveEdit=async()=>{
    if(!editing) return;
    const n=parseFloat(editing.value);
    if(isNaN(n)||n<0) return;
    setEditErr("");
    try{
      await setBudgets(p=>({...p,[editing.category]:n}));
      setEditing(null);
    }catch(e){ setEditErr(e.message||"Couldn't save — please try again."); }
  };

  const overBudget=spendable.filter(([c])=>displayBudget(c)>0&&(spend[c]||0)>displayBudget(c));
  const nearBudget=spendable.filter(([c])=>displayBudget(c)>0&&(spend[c]||0)<=displayBudget(c)&&pct(spend[c]||0,displayBudget(c))>=80);

  const label = period==="semester"
    ? `${semInfo.name} ${new Date(semInfo.start+"T12:00:00").getFullYear()}`
    : `${MONTH_NAMES[refDate.getMonth()]} ${refDate.getFullYear()}`;
  const goPrev=()=>setRefDate(period==="semester" ? new Date(shiftSemester(refDate,-1).start+"T12:00:00") : shiftMonth(refDate,-1));
  const goNext=()=>setRefDate(period==="semester" ? new Date(shiftSemester(refDate, 1).start+"T12:00:00") : shiftMonth(refDate, 1));

  return(
    <div className="slide-up" style={{...S.col,gap:16}}>
      <ErrorBanner message={budgetsError||txnError} onRetry={budgetsError?reloadBudgets:reloadTxns}/>

      {/* Period toggle — inline JSX rather than a nested component, which
          React would remount on every parent render. */}
      <div style={{...S.row,gap:0,background:"var(--line)",borderRadius:12,padding:3}} role="tablist">
        {[["monthly","Month"],["semester","Semester"]].map(([val,text])=>(
          <button key={val} role="tab" aria-selected={period===val} onClick={()=>setPeriod(val)}
            style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .15s",minHeight:40,
              background:period===val?"var(--hero)":"transparent",color:period===val?"#fff":"var(--muted)"}}>
            {text}
          </button>
        ))}
      </div>

      {/* Period navigation — steps by calendar month or by whole semester,
          following the active toggle. */}
      <div style={{...S.row,justifyContent:"space-between",gap:10}}>
        <button onClick={goPrev} aria-label="Previous period" style={S.quietBtn({padding:"9px 14px",fontSize:15,lineHeight:1,minHeight:40})}>‹</button>
        <div style={{...S.col,gap:2,alignItems:"center",flex:1}}>
          <span style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>{label}</span>
          {!isCurrentPeriod&&<button onClick={goToToday} style={{fontSize:11,color:"var(--info)",background:"none",border:"none",cursor:"pointer",padding:0}}>Jump to today</button>}
        </div>
        <button onClick={goNext} aria-label="Next period" style={S.quietBtn({padding:"9px 14px",fontSize:15,lineHeight:1,minHeight:40})}>›</button>
      </div>

      <Card style={{background:"var(--hero)",color:"var(--hero-ink)"}}>
        <p style={{fontSize:11,color:"var(--hero-muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>
          {period==="semester" ? `${semInfo.name} semester · everything` : `${label} · monthly costs`}
        </p>
        <p style={{...S.display,fontSize:34,fontWeight:300}}>{fmt(totalB)}</p>
        <div style={{...S.row,gap:20,marginTop:12,flexWrap:"wrap"}}>
          <div><p style={{fontSize:11,color:"var(--hero-muted)"}}>Spent</p><p style={{fontSize:17,color:"var(--hero-ink)"}}>{fmt(totalS)}</p></div>
          {/* --danger-on-hero, not --danger: the light-surface red is only
              3.0:1 against the dark panel, which fails AA for text. */}
          <div><p style={{fontSize:11,color:"var(--hero-muted)"}}>Remaining</p><p style={{fontSize:17,color:totalB-totalS>=0?"var(--success-on-hero)":"var(--danger-on-hero)"}}>{fmt(totalB-totalS)}</p></div>
        </div>
        {period==="semester"&&<p style={{fontSize:11,color:"var(--hero-muted)",marginTop:10}}>{semInfo.start} → {semInfo.end}</p>}
      </Card>

      {overBudget.length>0&&(
        <div style={{background:"var(--danger-bg)",border:"1px solid var(--danger-line)",borderRadius:14,padding:"14px 16px",...S.row,alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
          <div>
            <p style={{fontSize:14,fontWeight:600,color:"var(--danger)",marginBottom:3}}>Over budget in {overBudget.length} {overBudget.length===1?"category":"categories"}</p>
            <p style={{fontSize:13,color:"var(--danger)",opacity:.85}}>{overBudget.map(([c])=>CATEGORY_META[c]?.icon+" "+categoryLabel(c)).join(" · ")}</p>
          </div>
        </div>
      )}
      {nearBudget.length>0&&(
        <div style={{background:"var(--warning-bg)",border:"1px solid var(--warning-line)",borderRadius:14,padding:"14px 16px",...S.row,alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:20,flexShrink:0}}>⚡</span>
          <div>
            <p style={{fontSize:14,fontWeight:600,color:"var(--warning)",marginBottom:3}}>Approaching limit in {nearBudget.length} {nearBudget.length===1?"category":"categories"}</p>
            <p style={{fontSize:13,color:"var(--warning)",opacity:.85}}>{nearBudget.map(([c])=>CATEGORY_META[c]?.icon+" "+categoryLabel(c)).join(" · ")}</p>
          </div>
        </div>
      )}

      {/* Only in Semester view: there the hero is the combined figure, so a
          monthly subtotal adds information. In Month view the hero already IS
          this number. */}
      {period==="semester" && (
        <Section
          title={`Monthly costs · across ${semInfo.name}`}
          subtitle={`${monthlyCats.length} recurring categories × ~${monthCount.toFixed(1)} months`}
          budget={sumB(monthlyCats)} spent={sumS(monthlyCats)}/>
      )}
      <div className="grid-cards">
        {monthlyCats.map(([cat,meta])=>{
          const budget=displayBudget(cat);
          const spent=spend[cat]||0;
          const p=budget>0?pct(spent,budget):0;
          const over=budget>0&&spent>budget;
          const near=budget>0&&p>=80&&!over;
          const isEd=editing?.category===cat;
          const editable=isEditable(cat);
          return(
            <Card key={cat} style={{borderLeft:over?"3px solid var(--danger)":near?"3px solid var(--warning)":"3px solid transparent",paddingLeft:over||near?21:24}}>
              <div style={{...S.between,gap:10}}>
                <div style={{...S.row,gap:10,minWidth:0}}>
                  <div style={S.iconBox(meta.colorLight)}>{meta.icon}</div>
                  <div style={{minWidth:0}}>
                    <span style={{fontSize:15,fontWeight:500}}>{categoryLabel(cat)}</span>
                    {!editable&&<span style={{fontSize:10,color:"var(--muted)",marginLeft:6}}>· derived from monthly</span>}
                    {over&&<p style={{fontSize:11,color:"var(--danger)",fontWeight:600,marginTop:1}}>Over by {fmtDec(spent-budget)}</p>}
                    {near&&<p style={{fontSize:11,color:"var(--warning)",fontWeight:600,marginTop:1}}>{100-p}% of budget left</p>}
                  </div>
                </div>
                {isEd?(
                  <div style={{...S.row,gap:8,flexShrink:0}}>
                    <input value={editing.value} inputMode="decimal" autoFocus
                      onChange={e=>setEditing({...editing,value:e.target.value.replace(/[^0-9.]/g,"")})}
                      onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditing(null);}}
                      style={{width:88,border:"1px solid var(--subtle)",borderRadius:8,padding:"6px 10px",fontSize:16,outline:"none",textAlign:"right"}}/>
                    <button onClick={saveEdit} className="btn btn-primary" style={S.btn("var(--primary)","#fff",{borderRadius:8,padding:"6px 12px",fontSize:13})}>Save</button>
                  </div>
                ):(
                  <div style={{...S.row,gap:10,flexShrink:0}}>
                    <span style={{fontSize:15,fontWeight:500,color:over?"var(--danger)":"var(--ink)"}}>
                      {budget?fmt(budget):<span style={{color:"var(--subtle)"}}>Not set</span>}
                    </span>
                    {editable
                      ? <button onClick={()=>setEditing({category:cat,value:budgets?.[cat]?String(budgets[cat]):""})} style={S.quietBtn({minHeight:32})}>Edit</button>
                      : <span style={{fontSize:11,color:"var(--subtle)",padding:"4px 8px"}}>Set in Month view</span>}
                  </div>
                )}
              </div>
              {budget>0&&<SpendBar spent={spent} budget={budget} color={meta.color}/>}
              {isEd&&editErr&&<p style={{fontSize:12,color:"var(--danger)",marginTop:8}}>{editErr}</p>}
            </Card>
          );
        })}
      </div>

      {/* Semester categories — one-off termly bills. Kept in their own section
          with their own subtotal in BOTH views, because a tuition instalment
          is not a monthly cost and adding it to one produces a number that
          describes no real period. */}
      <Section
        title={`One-off costs · ${semInfo.name} semester`}
        subtitle={`${semInfo.start} → ${semInfo.end}`}
        budget={sumB(semesterCats)} spent={sumS(semesterCats)}/>
      <div className="grid-cards">
        {semesterCats.map(([cat,meta])=>{
          const budget=displayBudget(cat);
          const spent=spend[cat]||0;
          const p=budget>0?pct(spent,budget):0;
          const over=budget>0&&spent>budget;
          const near=budget>0&&p>=80&&!over;
          const isEd=editing?.category===cat;
          return(
            <Card key={cat} style={{borderLeft:over?"3px solid var(--danger)":near?"3px solid var(--warning)":"3px solid transparent",paddingLeft:over||near?21:24}}>
              <div style={{...S.between,gap:10}}>
                <div style={{...S.row,gap:10,minWidth:0}}>
                  <div style={S.iconBox(meta.colorLight)}>{meta.icon}</div>
                  <div style={{minWidth:0}}>
                    <span style={{fontSize:15,fontWeight:500}}>{categoryLabel(cat)}</span>
                    {over&&<p style={{fontSize:11,color:"var(--danger)",fontWeight:600,marginTop:1}}>Over by {fmtDec(spent-budget)}</p>}
                    {near&&<p style={{fontSize:11,color:"var(--warning)",fontWeight:600,marginTop:1}}>{100-p}% of budget left</p>}
                  </div>
                </div>
                {isEd?(
                  <div style={{...S.row,gap:8,flexShrink:0}}>
                    <input value={editing.value} inputMode="decimal" autoFocus
                      onChange={e=>setEditing({...editing,value:e.target.value.replace(/[^0-9.]/g,"")})}
                      onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditing(null);}}
                      style={{width:88,border:"1px solid var(--subtle)",borderRadius:8,padding:"6px 10px",fontSize:16,outline:"none",textAlign:"right"}}/>
                    <button onClick={saveEdit} className="btn btn-primary" style={S.btn("var(--primary)","#fff",{borderRadius:8,padding:"6px 12px",fontSize:13})}>Save</button>
                  </div>
                ):(
                  <div style={{...S.row,gap:10,flexShrink:0}}>
                    <span style={{fontSize:15,fontWeight:500,color:over?"var(--danger)":"var(--ink)"}}>
                      {budget?fmt(budget):<span style={{color:"var(--subtle)"}}>Not set</span>}
                    </span>
                    <button onClick={()=>setEditing({category:cat,value:budgets?.[cat]?String(budgets[cat]):""})} style={S.quietBtn({minHeight:32})}>Edit</button>
                  </div>
                )}
              </div>
              {budget>0&&<SpendBar spent={spent} budget={budget} color={meta.color}/>}
              {isEd&&editErr&&<p style={{fontSize:12,color:"var(--danger)",marginTop:8}}>{editErr}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Section header carrying its OWN subtotal, so no two periods are ever summed. */
function Section({title,subtitle,budget,spent}){
  const remaining = budget - spent;
  return(
    <div style={{...S.between,gap:12,flexWrap:"wrap",marginTop:6}}>
      <div style={{minWidth:0}}>
        <p style={{fontSize:14,fontWeight:700,color:"var(--ink)"}}>{title}</p>
        <p style={{fontSize:11,color:"var(--muted)",marginTop:1}}>{subtitle}</p>
      </div>
      <div style={{textAlign:"right",flexShrink:0}}>
        <p className="tnum" style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>
          {fmt(spent)} <span style={{color:"var(--muted)",fontWeight:400}}>of {fmt(budget)}</span>
        </p>
        <p className="tnum" style={{fontSize:11,color:remaining>=0?"var(--muted)":"var(--danger)",marginTop:1}}>
          {budget===0 ? "No budget set" : remaining>=0 ? `${fmt(remaining)} left` : `${fmt(-remaining)} over`}
        </p>
      </div>
    </div>
  );
}
