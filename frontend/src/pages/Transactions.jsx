import { useState } from "react";
import { S } from "../styles.js";
import { CATEGORY_META, categoryLabel } from "../constants.js";
import { fmtDec, formatDate } from "../lib/format.js";
import { Card, Badge, Field, Sheet, Spinner, ErrorBanner } from "../components/ui.jsx";

const EMPTY_FORM={date:"",desc:"",amount:"",category:"Food",type:"expense",frequency:"monthly"};

export default function Transactions({transactions,loading,error,reload,addTxn,updateTxn,deleteTxn}){
  const [filterCat,setFilterCat]=useState("All");
  const [search,setSearch]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState(EMPTY_FORM);
  const [saving,setSaving]=useState(false);
  const [saveErr,setSaveErr]=useState("");

  const setF=k=>e=>setForm(p=>({...p,[k]:e.target.value}));

  // Categories valid for the selected frequency. Category and frequency must
  // stay in sync — setFrequency resets category to the first valid option so a
  // stale pair (frequency=one-time, category=Food) can never be submitted.
  const catsForFrequency=(freq)=>
    Object.entries(CATEGORY_META).filter(([k,meta])=>k!=="Savings"&&meta.period===(freq==="monthly"?"monthly":"semester"));

  const setFrequency=(freq)=>setForm(p=>{
    const opts=catsForFrequency(freq);
    const stillValid=opts.some(([k])=>k===p.category);
    return {...p, frequency:freq, category: stillValid ? p.category : (opts[0]?.[0]||p.category)};
  });

  const filtered=(transactions||[])
    .filter(t=>filterCat==="All"||t.category===filterCat)
    .filter(t=>(t.desc||"").toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)));

  const openAdd=()=>{
    setForm({...EMPTY_FORM,date:new Date().toISOString().split("T")[0]});
    setEditId(null); setSaveErr(""); setShowAdd(true);
  };

  const openEdit=t=>{
    // Frequency is derived from the category's period tag rather than stored —
    // editing a Tuition row always opens with "One-time" selected.
    const freq=CATEGORY_META[t.category]?.period==="semester" ? "one-time" : "monthly";
    setForm({date:String(t.date).slice(0,10),desc:t.desc,amount:String(t.amount),category:t.category,type:t.type,frequency:freq});
    setEditId(t.id); setSaveErr(""); setShowAdd(true);
  };

  const saveForm=async()=>{
    const amt=parseFloat(form.amount);
    // Previously this returned silently on invalid input, so tapping "Add
    // transaction" with an empty description did nothing with no explanation.
    if(!form.desc.trim())        return setSaveErr("Give this transaction a description.");
    if(!form.date)               return setSaveErr("Pick a date.");
    if(isNaN(amt)||amt<=0)       return setSaveErr("Enter an amount greater than zero.");
    setSaving(true); setSaveErr("");
    try{
      const payload={desc:form.desc.trim(),amount:amt,category:form.category,type:form.type,date:form.date};
      if(editId) await updateTxn({...payload,id:editId});
      else       await addTxn(payload);
      setShowAdd(false);
    }catch(e){ setSaveErr(e.message||"Failed to save"); }
    finally{ setSaving(false); }
  };

  const handleDelete=async(id)=>{
    if(!window.confirm("Delete this transaction?")) return;
    try{ await deleteTxn(id); }catch(e){ alert(e.message); }
  };

  return(
    <div className="slide-up" style={{...S.col,gap:14}}>
      <ErrorBanner message={error} onRetry={reload}/>

      <div style={{...S.row,gap:10}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" type="search" aria-label="Search transactions"
          style={{flex:1,minWidth:0,background:"#fff",border:"1px solid var(--sand)",borderRadius:12,padding:"11px 16px",fontSize:16,outline:"none"}}/>
        <button onClick={reload} title="Refresh" aria-label="Refresh transactions" style={S.sandBtn({padding:"11px 13px",fontSize:16,minHeight:44})}>
          {loading?<Spinner size={14}/>:"↻"}
        </button>
        <button onClick={openAdd} style={S.btn("#1A1714","#fff",{borderRadius:12,padding:"11px 18px",minHeight:44,whiteSpace:"nowrap"})}>+ Add</button>
      </div>

      <div className="scroll-x" style={{display:"flex",gap:7,paddingBottom:2}}>
        {["All",...Object.keys(CATEGORY_META)].map(c=>(
          <button key={c} onClick={()=>setFilterCat(c)} aria-pressed={filterCat===c}
            style={{background:filterCat===c?"#1A1714":"#fff",color:filterCat===c?"#fff":"var(--muted)",border:filterCat===c?"none":"1px solid var(--sand)",borderRadius:20,padding:"6px 12px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>
            {c==="All"?"All":CATEGORY_META[c]?.icon+" "+categoryLabel(c)}
          </button>
        ))}
      </div>

      <Card style={{padding:0}}>
        {loading&&!filtered.length&&<div style={{padding:32,textAlign:"center"}}><Spinner/></div>}
        {!loading&&filtered.length===0&&<p style={{padding:32,textAlign:"center",color:"var(--muted)"}}>No transactions found.</p>}
        {filtered.map((t,i)=>{
          const m=CATEGORY_META[t.category]||CATEGORY_META.Other;
          // Plaid-synced rows are read-only — edits to bank data should come
          // from Plaid, not a manual override that silently diverges.
          const isManual = t.source === "manual";
          return(
            <div key={t.id} style={{...S.row,padding:"12px 18px",borderBottom:i<filtered.length-1?"1px solid var(--sand)":"none"}}>
              <div style={S.iconBox(m.colorLight)}>{m.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.desc}</p>
                <div style={{...S.row,gap:6,marginTop:2,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:"var(--muted)"}}>{formatDate(t.date)}</span>
                  <Badge label={categoryLabel(t.category)} color={m.color} colorLight={m.colorLight}/>
                  {isManual && <Badge label="Manual" color="var(--muted)" colorLight="var(--sand)"/>}
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <p style={{fontSize:14,fontWeight:600,whiteSpace:"nowrap",color:t.type==="income"?"var(--sage)":"var(--ink)"}}>
                  {t.type==="income"?"+":"−"}{fmtDec(t.amount)}
                </p>
                {isManual ? (
                  <div style={{...S.row,gap:8,marginTop:2,justifyContent:"flex-end"}}>
                    <button onClick={()=>openEdit(t)} style={{fontSize:11,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",padding:"2px 0"}}>Edit</button>
                    <button onClick={()=>handleDelete(t.id)} style={{fontSize:11,color:"var(--rose)",background:"none",border:"none",cursor:"pointer",padding:"2px 0"}}>Delete</button>
                  </div>
                ) : (
                  <p style={{fontSize:10,color:"var(--stone)",marginTop:4}}>via bank sync</p>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {showAdd&&(
        <Sheet title={editId?"Edit transaction":"Add transaction"} onClose={()=>setShowAdd(false)} zIndex={150}>
          <div style={{...S.col,padding:"20px 22px calc(36px + env(safe-area-inset-bottom))",overflowY:"auto",flex:1,minHeight:0}}>
            <Field label="Description" htmlFor="t-desc">
              <input id="t-desc" value={form.desc} onChange={setF("desc")} style={S.input}/>
            </Field>
            <Field label="Amount ($)" htmlFor="t-amount">
              <input id="t-amount" value={form.amount} onChange={setF("amount")} style={S.input} type="number" inputMode="decimal" min="0" step="0.01"/>
            </Field>
            <Field label="Date" htmlFor="t-date">
              <input id="t-date" value={form.date} onChange={setF("date")} style={S.input} type="date"/>
            </Field>
            <Field label="Frequency">
              <div style={{...S.row,gap:9}}>
                {[["monthly","Monthly"],["one-time","One-time"]].map(([val,text])=>(
                  <button key={val} type="button" onClick={()=>setFrequency(val)} aria-pressed={form.frequency===val}
                    style={{flex:1,padding:"11px",borderRadius:10,minHeight:44,border:form.frequency===val?"2px solid #1A1714":"1px solid var(--sand)",background:form.frequency===val?"#1A1714":"#fff",color:form.frequency===val?"#fff":"var(--muted)",cursor:"pointer",fontSize:14,fontWeight:500}}>
                    {text}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Category" htmlFor="t-cat">
              <select id="t-cat" value={form.category} onChange={setF("category")} style={{...S.input,background:"#fff"}}>
                {catsForFrequency(form.frequency).map(([c,meta])=><option key={c} value={c}>{meta.icon} {categoryLabel(c)}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <div style={{...S.row,gap:9}}>
                {["expense","income"].map(t=>(
                  <button key={t} type="button" onClick={()=>setForm(p=>({...p,type:t}))} aria-pressed={form.type===t}
                    style={{flex:1,padding:"11px",borderRadius:10,minHeight:44,border:form.type===t?"2px solid #1A1714":"1px solid var(--sand)",background:form.type===t?"#1A1714":"#fff",color:form.type===t?"#fff":"var(--muted)",cursor:"pointer",fontSize:14,fontWeight:500,textTransform:"capitalize"}}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            {saveErr&&<p role="alert" style={{fontSize:13,color:"var(--rose)"}}>{saveErr}</p>}
            <button onClick={saveForm} disabled={saving} style={S.darkBtn({marginTop:4,opacity:saving?.6:1,minHeight:46})}>
              {saving?"Saving…":editId?"Save changes":"Add transaction"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
