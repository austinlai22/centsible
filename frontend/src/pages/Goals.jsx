import { useState } from "react";
import { S } from "../styles.js";
import { fmt, pct } from "../lib/format.js";
import { Card, Field, Sheet, Spinner, ErrorBanner, SkeletonCard, SkeletonBlock } from "../components/ui.jsx";

const EMOJIS=["🎯","✈️","🏠","🎓","💍","🚗","🏖️","💻","🎸","🌿","🐾","🏦"];
const EMPTY_FORM={name:"",target:"",saved:"0",deadline:"",emoji:"🎯"};

export default function Goals({goals, loading, error, reload, addGoal, updateGoal, deleteGoal, addFunds}){
  const [showAdd,setShowAdd]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState(EMPTY_FORM);
  const [saving,setSaving]=useState(false);
  const [saveErr,setSaveErr]=useState("");
  const [deletingId,setDeletingId]=useState(null);

  if(loading && !goals?.length){
    return(
      <div className="slide-up" style={{...S.col,gap:14}}>
        <SkeletonBlock height={46} radius={12}/>
        <SkeletonCard lines={3}/>
        <SkeletonCard lines={3}/>
      </div>
    );
  }

  const setF=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const openAdd=()=>{setForm(EMPTY_FORM);setEditId(null);setSaveErr("");setShowAdd(true);};
  const openEdit=g=>{
    setForm({name:g.name,target:String(g.target),saved:String(g.saved),deadline:g.deadline?String(g.deadline).slice(0,10):"",emoji:g.emoji||"🎯"});
    setEditId(g.id);setSaveErr("");setShowAdd(true);
  };

  const saveForm=async()=>{
    const target=parseFloat(form.target);
    if(!form.name.trim())        return setSaveErr("Give your goal a name.");
    if(isNaN(target)||target<=0) return setSaveErr("Enter a target amount greater than zero.");
    const obj={
      name:form.name.trim(), target,
      saved:parseFloat(form.saved)||0,
      deadline:form.deadline||null,
      emoji:form.emoji,
    };
    setSaving(true); setSaveErr("");
    try{
      if(editId) await updateGoal(editId, obj);
      else       await addGoal(obj);
      setShowAdd(false);
    }catch(e){ setSaveErr(e.message||"Couldn't save — please try again."); }
    finally{ setSaving(false); }
  };

  const handleDelete=async(id)=>{
    if(!window.confirm("Delete this goal? This can't be undone.")) return;
    setDeletingId(id);
    try{ await deleteGoal(id); }
    catch(e){ alert(e.message||"Couldn't delete — please try again."); }
    finally{ setDeletingId(null); }
  };

  return(
    <div className="slide-up" style={{...S.col,gap:14}}>
      <ErrorBanner message={error} onRetry={reload}/>
      <button onClick={openAdd} style={S.darkBtn({minHeight:46})}>+ Create new goal</button>

      {!goals?.length&&(
        <Card style={{textAlign:"center",padding:"44px 24px"}}>
          <p style={{fontSize:38,marginBottom:10}}>🎯</p>
          <p style={{...S.display,fontSize:18,fontWeight:400,marginBottom:7}}>No goals yet</p>
          <p style={{color:"var(--muted)",fontSize:14}}>Create a savings bucket for anything — a trip, an emergency fund.</p>
        </Card>
      )}

      <div className="grid-cards">
        {(goals||[]).map(g=>{
          const saved=Number(g.saved)||0, target=Number(g.target)||0;
          const p=pct(saved,target);
          const done=p>=100;
          const days=g.deadline?Math.ceil((new Date(String(g.deadline).slice(0,10)+"T12:00:00")-new Date())/86400000):null;
          const perMonth=days>0?Math.ceil((target-saved)/Math.max(1,Math.ceil(days/30))):null;
          const isDeleting=deletingId===g.id;
          return(
            <Card key={g.id} style={{opacity:isDeleting?.5:1,transition:"opacity .2s"}}>
              <div style={{...S.between,gap:10}}>
                <div style={{...S.row,gap:11,minWidth:0}}>
                  <span style={{fontSize:26,flexShrink:0}}>{g.emoji}</span>
                  <div style={{minWidth:0}}>
                    <p style={{fontSize:16,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.name}</p>
                    {done&&<span style={S.pill("var(--success-bg)","var(--success)")}>Goal reached! 🎉</span>}
                  </div>
                </div>
                <div style={{...S.row,gap:7,flexShrink:0}}>
                  <button onClick={()=>openEdit(g)} disabled={isDeleting} style={S.quietBtn({minHeight:32})}>Edit</button>
                  <button onClick={()=>handleDelete(g.id)} disabled={isDeleting} aria-label={`Delete ${g.name}`}
                    style={S.quietBtn({background:"var(--danger-bg)",color:"var(--danger)",minHeight:32})}>
                    {isDeleting?<Spinner size={11}/>:"✕"}
                  </button>
                </div>
              </div>

              <div style={{margin:"13px 0 9px"}}>
                <div style={{...S.between,marginBottom:5,gap:8}}>
                  <span style={{...S.display,fontSize:20,fontWeight:300}}>{fmt(saved)}</span>
                  <span style={{fontSize:13,color:"var(--muted)"}}>of {fmt(target)}</span>
                </div>
                <div style={{height:8,background:"var(--line)",borderRadius:6,overflow:"hidden"}}
                     role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
                  {/* Brand colour while saving, success only once reached.
                      Amber here read as a caution — but partial progress
                      toward a goal is the normal, healthy state, not a
                      problem the user needs to act on. */}
                  <div style={{height:"100%",width:p+"%",background:done?"var(--success)":"var(--primary)",borderRadius:6,transition:"width .5s"}}/>
                </div>
                <div style={{...S.between,marginTop:4}}>
                  <span style={{fontSize:11,color:"var(--muted)"}}>{p}% saved</span>
                  {days!==null&&<span style={{fontSize:11,color:days<30?"var(--danger)":"var(--muted)"}}>{days>0?days+" days left":"Past deadline"}</span>}
                </div>
              </div>

              {perMonth>0&&!done&&(
                <p style={{fontSize:12,color:"var(--muted)",marginBottom:11,background:"var(--line)",borderRadius:8,padding:"6px 10px"}}>
                  💡 Save ~{fmt(perMonth)}/month to hit your goal on time
                </p>
              )}
              {!done&&(
                <div style={{...S.row,gap:8}}>
                  {[50,100,250].map(a=>(
                    <button key={a} onClick={()=>addFunds(g.id,a).catch(e=>alert(e.message))} disabled={isDeleting}
                      style={S.quietBtn({flex:1,textAlign:"center",padding:"9px 0",borderRadius:9,minHeight:38})}>
                      +{fmt(a)}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {showAdd&&(
        <Sheet title={editId?"Edit goal":"New goal"} onClose={()=>setShowAdd(false)} zIndex={150}>
          <div style={{...S.col,padding:"16px 22px calc(42px + env(safe-area-inset-bottom))",overflowY:"auto",flex:1,minHeight:0}}>
            <div>
              <label style={S.label}>Icon</label>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {EMOJIS.map(e=>(
                  <button key={e} type="button" onClick={()=>setForm(p=>({...p,emoji:e}))} aria-pressed={form.emoji===e}
                    style={{width:44,height:44,borderRadius:10,border:form.emoji===e?"2px solid var(--hero)":"1px solid var(--line)",background:form.emoji===e?"var(--line)":"#fff",fontSize:20,cursor:"pointer"}}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Goal name" htmlFor="g-name">
              <input id="g-name" value={form.name} onChange={setF("name")} placeholder="e.g. Japan trip" style={S.input}/>
            </Field>
            <Field label="Target ($)" htmlFor="g-target">
              <input id="g-target" value={form.target} onChange={setF("target")} placeholder="3000" type="number" inputMode="decimal" min="0" step="0.01" style={S.input}/>
            </Field>
            <Field label="Already saved ($)" htmlFor="g-saved">
              <input id="g-saved" value={form.saved} onChange={setF("saved")} placeholder="0" type="number" inputMode="decimal" min="0" step="0.01" style={S.input}/>
            </Field>
            <Field label="Target date (optional)" htmlFor="g-deadline">
              <input id="g-deadline" value={form.deadline} onChange={setF("deadline")} type="date" style={S.input}/>
            </Field>
            {saveErr&&<p role="alert" style={{fontSize:13,color:"var(--danger)"}}>{saveErr}</p>}
            <button onClick={saveForm} disabled={saving} style={S.darkBtn({marginTop:4,opacity:saving?.6:1,minHeight:46})}>
              {saving?"Saving…":editId?"Save changes":"Create goal"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
