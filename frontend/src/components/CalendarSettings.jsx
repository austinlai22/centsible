import { useState } from "react";
import { termsApi, disbursementsApi } from "../api.js";
import { S } from "../styles.js";
import { Card, Field, Spinner } from "./ui.jsx";
import { fmt } from "../lib/format.js";

/**
 * Academic calendar settings — the student's own term dates and expected aid
 * payments.
 *
 * These are the two inputs the runway depends on. The app ships a US semester
 * calendar as a fallback, but that is one system among many; a quarter-system
 * student given semester boundaries gets a confidently wrong answer to the one
 * question this app exists to answer.
 */

const prettyDate = (isoStr) => {
  if (!isoStr) return "";
  const d = new Date(isoStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
};
const today = () => new Date().toISOString().slice(0, 10);

// ─── Terms ────────────────────────────────────────────────────────────────────

export function TermsSettings({ terms = [], reload }) {
  const [form, setForm]   = useState(null);   // null | {id?, name, start_date, end_date}
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");

  const blank = { name:"", start_date:"", end_date:"" };

  const save = async () => {
    setBusy(true); setError("");
    try {
      const body = { name: form.name.trim(), start_date: form.start_date, end_date: form.end_date };
      if (form.id) await termsApi.update(form.id, body);
      else         await termsApi.create(body);
      setForm(null);
      await reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this term? Your runway will fall back to the standard calendar.")) return;
    setBusy(true); setError("");
    try { await termsApi.delete(id); await reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card style={{marginTop:12}}>
      <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Your terms</p>
      <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>
        {terms.length
          ? "Your runway and semester budgets use these dates."
          : "Using the standard US semester calendar (Aug 15, Dec 15, Jan 15, May 15). Add your real term dates if your school differs — quarters, trimesters, or anything else."}
      </p>

      {terms.map(t => (
        <div key={t.id} style={{...S.between,gap:12,padding:"12px 0",borderBottom:"1px solid var(--line)"}}>
          <div style={{minWidth:0}}>
            <p style={{fontSize:14,fontWeight:600}}>{t.name}</p>
            <p className="tnum" style={{fontSize:12,color:"var(--muted)",marginTop:1}}>
              {prettyDate(t.start_date)} → {prettyDate(t.end_date)}
            </p>
          </div>
          <div style={{...S.row,gap:8,flexShrink:0}}>
            <button onClick={()=>{setForm({...t}); setError("");}} style={S.quietBtn({minHeight:32})}>Edit</button>
            <button onClick={()=>remove(t.id)} disabled={busy}
              style={S.quietBtn({background:"var(--danger-bg)",color:"var(--danger)",minHeight:32})}>Delete</button>
          </div>
        </div>
      ))}

      {form ? (
        <div style={{...S.col,gap:12,marginTop:14}}>
          <Field label="Term name" htmlFor="t-name">
            <input id="t-name" value={form.name} autoFocus placeholder="Fall 2026"
              onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={S.input}/>
          </Field>
          <div style={{...S.row,gap:10,alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>
              <Field label="Starts" htmlFor="t-start">
                <input id="t-start" type="date" value={form.start_date}
                  onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} style={S.input}/>
              </Field>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <Field label="Ends" htmlFor="t-end">
                <input id="t-end" type="date" value={form.end_date}
                  onChange={e=>setForm(f=>({...f,end_date:e.target.value}))} style={S.input}/>
              </Field>
            </div>
          </div>
          {error && <p role="alert" style={{fontSize:13,color:"var(--danger)"}}>{error}</p>}
          <div style={{...S.row,gap:10}}>
            <button onClick={()=>{setForm(null);setError("");}}
              style={S.quietBtn({flex:1,padding:"12px",borderRadius:10,fontSize:14,minHeight:46})}>Cancel</button>
            <button onClick={save} disabled={busy || !form.name.trim() || !form.start_date || !form.end_date}
              className="btn btn-primary"
              style={S.darkBtn({flex:1,minHeight:46,opacity:busy?.6:1})}>
              {busy ? "Saving…" : form.id ? "Save term" : "Add term"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && <p role="alert" style={{fontSize:13,color:"var(--danger)",marginTop:10}}>{error}</p>}
          <button onClick={()=>{setForm(blank);setError("");}} className="btn btn-primary"
            style={S.darkBtn({marginTop:14,minHeight:46})}>+ Add a term</button>
        </>
      )}
    </Card>
  );
}

// ─── Disbursements ────────────────────────────────────────────────────────────

export function DisbursementsSettings({ disbursements = [], reload }) {
  const [form, setForm]   = useState(null);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");

  const blank = { label:"", amount:"", expected_on:"", received_on:"" };

  const save = async () => {
    setBusy(true); setError("");
    try {
      const body = {
        label: form.label.trim(),
        amount: parseFloat(form.amount),
        expected_on: form.expected_on,
        received_on: form.received_on || null,
      };
      if (form.id) await disbursementsApi.update(form.id, body);
      else         await disbursementsApi.create(body);
      setForm(null);
      await reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const markReceived = async (d) => {
    setBusy(true); setError("");
    try { await disbursementsApi.update(d.id, { received_on: today() }); await reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this disbursement?")) return;
    setBusy(true); setError("");
    try { await disbursementsApi.delete(id); await reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const upcoming = disbursements.filter(d => !d.received_on);

  return (
    <Card style={{marginTop:12}}>
      <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>Expected payments</p>
      <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>
        Financial aid, loans, or any lump sum you're waiting on. Your runway counts down to
        the next one rather than to the end of term — that's the date your money actually
        has to reach.
      </p>

      {disbursements.map(d => {
        const overdue = !d.received_on && d.expected_on < today();
        return (
          <div key={d.id} style={{...S.between,gap:12,padding:"12px 0",borderBottom:"1px solid var(--line)"}}>
            <div style={{minWidth:0}}>
              <p style={{fontSize:14,fontWeight:600}}>
                {d.label}{" "}
                <span className="tnum" style={{color:"var(--muted)",fontWeight:400}}>{fmt(d.amount)}</span>
              </p>
              <p className="tnum" style={{fontSize:12,marginTop:1,
                color: d.received_on ? "var(--success)" : overdue ? "var(--danger)" : "var(--muted)"}}>
                {d.received_on
                  ? `Received ${prettyDate(d.received_on)}`
                  : overdue
                    ? `Was due ${prettyDate(d.expected_on)} — not marked received`
                    : `Expected ${prettyDate(d.expected_on)}`}
              </p>
            </div>
            <div style={{...S.row,gap:8,flexShrink:0}}>
              {!d.received_on && (
                <button onClick={()=>markReceived(d)} disabled={busy} style={S.quietBtn({minHeight:32})}>
                  Mark received
                </button>
              )}
              <button onClick={()=>{setForm({...d, amount:String(d.amount), received_on:d.received_on||""}); setError("");}}
                style={S.quietBtn({minHeight:32})}>Edit</button>
              <button onClick={()=>remove(d.id)} disabled={busy}
                style={S.quietBtn({background:"var(--danger-bg)",color:"var(--danger)",minHeight:32})}>Delete</button>
            </div>
          </div>
        );
      })}

      {!disbursements.length && (
        <p style={{fontSize:13,color:"var(--subtle)",padding:"8px 0"}}>
          None yet — your runway counts down to the end of term instead.
        </p>
      )}

      {form ? (
        <div style={{...S.col,gap:12,marginTop:14}}>
          <Field label="What is it?" htmlFor="d-label">
            <input id="d-label" value={form.label} autoFocus placeholder="Spring financial aid"
              onChange={e=>setForm(f=>({...f,label:e.target.value}))} style={S.input}/>
          </Field>
          <div style={{...S.row,gap:10,alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>
              <Field label="Amount ($)" htmlFor="d-amount">
                <input id="d-amount" type="number" inputMode="decimal" value={form.amount} placeholder="8400"
                  onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={S.input}/>
              </Field>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <Field label="Expected on" htmlFor="d-exp">
                <input id="d-exp" type="date" value={form.expected_on}
                  onChange={e=>setForm(f=>({...f,expected_on:e.target.value}))} style={S.input}/>
              </Field>
            </div>
          </div>
          {error && <p role="alert" style={{fontSize:13,color:"var(--danger)"}}>{error}</p>}
          <div style={{...S.row,gap:10}}>
            <button onClick={()=>{setForm(null);setError("");}}
              style={S.quietBtn({flex:1,padding:"12px",borderRadius:10,fontSize:14,minHeight:46})}>Cancel</button>
            <button onClick={save} className="btn btn-primary"
              disabled={busy || !form.label.trim() || !form.amount || !form.expected_on}
              style={S.darkBtn({flex:1,minHeight:46,opacity:busy?.6:1})}>
              {busy ? "Saving…" : form.id ? "Save" : "Add payment"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && <p role="alert" style={{fontSize:13,color:"var(--danger)",marginTop:10}}>{error}</p>}
          <button onClick={()=>{setForm(blank);setError("");}} className="btn btn-primary"
            style={S.darkBtn({marginTop:14,minHeight:46})}>+ Add an expected payment</button>
        </>
      )}
    </Card>
  );
}
