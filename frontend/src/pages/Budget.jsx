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
        <SkeletonCard lines={2} style={{background:"#1A1714"}}/>
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

  // ALL categories always show, in both views — the toggle changes the time
  // window and (for monthly categories) whether the displayed budget is the
  // raw monthly figure or the derived semester total. It never hides one.
  const allCats=Object.entries(CATEGORY_META).filter(([k])=>k!=="Savings");

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

  const totalB=allCats.reduce((s,[k])=>s+displayBudget(k),0);
  const totalS=allCats.reduce((s,[k])=>s+(spend[k]||0),0);

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

  const overBudget=allCats.filter(([c])=>displayBudget(c)>0&&(spend[c]||0)>displayBudget(c));
  const nearBudget=allCats.filter(([c])=>displayBudget(c)>0&&(spend[c]||0)<=displayBudget(c)&&pct(spend[c]||0,displayBudget(c))>=80);

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
      <div style={{...S.row,gap:0,background:"var(--sand)",borderRadius:12,padding:3}} role="tablist">
        {[["monthly","Month"],["semester","Semester"]].map(([val,text])=>(
          <button key={val} role="tab" aria-selected={period===val} onClick={()=>setPeriod(val)}
            style={{flex:1,padding:"9px 0",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,transition:"all .15s",minHeight:40,
              background:period===val?"#1A1714":"transparent",color:period===val?"#fff":"var(--muted)"}}>
            {text}
          </button>
        ))}
      </div>

      {/* Period navigation — steps by calendar month or by whole semester,
          following the active toggle. */}
      <div style={{...S.row,justifyContent:"space-between",gap:10}}>
        <button onClick={goPrev} aria-label="Previous period" style={S.sandBtn({padding:"9px 14px",fontSize:15,lineHeight:1,minHeight:40})}>‹</button>
        <div style={{...S.col,gap:2,alignItems:"center",flex:1}}>
          <span style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>{label}</span>
          {!isCurrentPeriod&&<button onClick={goToToday} style={{fontSize:11,color:"var(--sky)",background:"none",border:"none",cursor:"pointer",padding:0}}>Jump to today</button>}
        </div>
        <button onClick={goNext} aria-label="Next period" style={S.sandBtn({padding:"9px 14px",fontSize:15,lineHeight:1,minHeight:40})}>›</button>
      </div>

      <Card style={{background:"#1A1714",color:"#F5F0E8"}}>
        <p style={{fontSize:11,color:"#C8BAA8",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>
          {period==="semester" ? `${semInfo.name} semester budget` : `${label} budget`}
        </p>
        <p style={{...S.serif,fontSize:34,fontWeight:300}}>{fmt(totalB)}</p>
        <div style={{...S.row,gap:20,marginTop:12,flexWrap:"wrap"}}>
          <div><p style={{fontSize:11,color:"#C8BAA8"}}>Spent</p><p style={{fontSize:17,color:"#B8882A"}}>{fmt(totalS)}</p></div>
          <div><p style={{fontSize:11,color:"#C8BAA8"}}>Remaining</p><p style={{fontSize:17,color:totalB-totalS>=0?"#8BC28A":"#C0413A"}}>{fmt(totalB-totalS)}</p></div>
        </div>
        {period==="semester"&&<p style={{fontSize:11,color:"#C8BAA8",marginTop:10}}>{semInfo.start} → {semInfo.end}</p>}
      </Card>

      {overBudget.length>0&&(
        <div style={{background:"var(--rose-light)",border:"1px solid #e8b4b2",borderRadius:14,padding:"14px 16px",...S.row,alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
          <div>
            <p style={{fontSize:14,fontWeight:600,color:"var(--rose)",marginBottom:3}}>Over budget in {overBudget.length} {overBudget.length===1?"category":"categories"}</p>
            <p style={{fontSize:13,color:"var(--rose)",opacity:.85}}>{overBudget.map(([c])=>CATEGORY_META[c]?.icon+" "+categoryLabel(c)).join(" · ")}</p>
          </div>
        </div>
      )}
      {nearBudget.length>0&&(
        <div style={{background:"var(--gold-light)",border:"1px solid #e8d0a0",borderRadius:14,padding:"14px 16px",...S.row,alignItems:"flex-start",gap:12}}>
          <span style={{fontSize:20,flexShrink:0}}>⚡</span>
          <div>
            <p style={{fontSize:14,fontWeight:600,color:"var(--gold)",marginBottom:3}}>Approaching limit in {nearBudget.length} {nearBudget.length===1?"category":"categories"}</p>
            <p style={{fontSize:13,color:"var(--gold)",opacity:.85}}>{nearBudget.map(([c])=>CATEGORY_META[c]?.icon+" "+categoryLabel(c)).join(" · ")}</p>
          </div>
        </div>
      )}

      <div className="grid-cards">
        {allCats.map(([cat,meta])=>{
          const budget=displayBudget(cat);
          const spent=spend[cat]||0;
          const p=budget>0?pct(spent,budget):0;
          const over=budget>0&&spent>budget;
          const near=budget>0&&p>=80&&!over;
          const isEd=editing?.category===cat;
          const editable=isEditable(cat);
          return(
            <Card key={cat} style={{borderLeft:over?"3px solid var(--rose)":near?"3px solid var(--gold)":"3px solid transparent",paddingLeft:over||near?21:24}}>
              <div style={{...S.between,gap:10}}>
                <div style={{...S.row,gap:10,minWidth:0}}>
                  <div style={S.iconBox(meta.colorLight)}>{meta.icon}</div>
                  <div style={{minWidth:0}}>
                    <span style={{fontSize:15,fontWeight:500}}>{categoryLabel(cat)}</span>
                    {!editable&&<span style={{fontSize:10,color:"var(--muted)",marginLeft:6}}>· derived from monthly</span>}
                    {over&&<p style={{fontSize:11,color:"var(--rose)",fontWeight:600,marginTop:1}}>Over by {fmtDec(spent-budget)}</p>}
                    {near&&<p style={{fontSize:11,color:"var(--gold)",fontWeight:600,marginTop:1}}>{100-p}% of budget left</p>}
                  </div>
                </div>
                {isEd?(
                  <div style={{...S.row,gap:8,flexShrink:0}}>
                    <input value={editing.value} inputMode="decimal" autoFocus
                      onChange={e=>setEditing({...editing,value:e.target.value.replace(/[^0-9.]/g,"")})}
                      onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditing(null);}}
                      style={{width:88,border:"1px solid var(--stone)",borderRadius:8,padding:"6px 10px",fontSize:16,outline:"none",textAlign:"right"}}/>
                    <button onClick={saveEdit} style={S.btn("#1A1714","#fff",{borderRadius:8,padding:"6px 12px",fontSize:13})}>Save</button>
                  </div>
                ):(
                  <div style={{...S.row,gap:10,flexShrink:0}}>
                    <span style={{fontSize:15,fontWeight:500,color:over?"var(--rose)":"var(--ink)"}}>
                      {budget?fmt(budget):<span style={{color:"var(--stone)"}}>Not set</span>}
                    </span>
                    {editable
                      ? <button onClick={()=>setEditing({category:cat,value:budgets?.[cat]?String(budgets[cat]):""})} style={S.sandBtn({minHeight:32})}>Edit</button>
                      : <span style={{fontSize:11,color:"var(--stone)",padding:"4px 8px"}}>Set in Month view</span>}
                  </div>
                )}
              </div>
              {budget>0&&<SpendBar spent={spent} budget={budget} color={meta.color}/>}
              {isEd&&editErr&&<p style={{fontSize:12,color:"var(--rose)",marginTop:8}}>{editErr}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
