import { useState } from "react";
import { api, disbursementsApi } from "../api.js";
import { S } from "../styles.js";
import { Card, Field } from "./ui.jsx";
import { TERM_SYSTEMS, STUDENT_TYPES, suggestDisbursementDate, explainDisbursementDate } from "../lib/calendar.js";

/**
 * Finishes the study profile after onboarding rather than during it.
 *
 * These three answers sharpen the runway — student type and term system decide
 * when aid realistically lands, and the disbursement decides what the money has
 * to reach. But none of them is needed to open the app, and putting them in the
 * signup flow made a first session eight screens long. Here they sit on the
 * Summary, in context, next to the number they improve.
 *
 * Everything below is skippable and repeatable from Settings; the card
 * disappears for good once the profile is complete.
 */

const DISMISS_KEY = "centsible.setup.dismissed";

export function isProfileComplete(user) {
  if (!user) return true;
  // receives_aid is a tri-state: null means never asked, false is a real
  // answer. Treating false as "incomplete" would nag self-funded students
  // forever.
  return Boolean(user.student_type) && Boolean(user.term_system) && user.receives_aid !== null
      && user.receives_aid !== undefined;
}

export function SetupCard({ user, setUser, termStart, reloadDisbursements }) {
  const [open, setOpen]       = useState(false);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [hidden, setHidden]   = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  const [studentType, setStudentType] = useState(user?.student_type || "");
  const [termSystem, setTermSystem]   = useState(user?.term_system || "");
  const [aid, setAid]                 = useState({ none:false, amount:"", expected_on:"" });

  if (isProfileComplete(user) || hidden) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setHidden(true);
  };

  // The suggested date depends on student type, so it can only be proposed
  // once that's chosen.
  const suggested = studentType && termStart ? suggestDisbursementDate(termStart, studentType) : "";
  const aidDate   = aid.expected_on || suggested;

  const save = async () => {
    setBusy(true); setError("");
    try {
      const res = await api.put("/auth/me", {
        studentType,
        termSystem,
        receivesAid: !aid.none,
      });
      setUser(u => ({ ...u, ...res.user }));

      if (!aid.none && Number(aid.amount) > 0 && aidDate) {
        await disbursementsApi.create({
          label: "Financial aid",
          amount: Number(aid.amount),
          expected_on: aidDate,
        });
        await reloadDisbursements?.();
      }
    } catch (e) { setError(e.message || "Couldn't save — please try again."); }
    finally { setBusy(false); }
  };

  const canSave = studentType && termSystem && (aid.none || (Number(aid.amount) > 0 && aidDate));

  if (!open) {
    return (
      <Card style={{borderLeft:"3px solid var(--primary)", paddingLeft:21}}>
        <div style={{...S.between, gap:12, flexWrap:"wrap"}}>
          <div style={{minWidth:0}}>
            <p style={{fontSize:15,fontWeight:600}}>Sharpen your runway</p>
            <p style={{fontSize:13,color:"var(--muted)",marginTop:4,lineHeight:1.55,maxWidth:520}}>
              Three quick questions about your course and financial aid. Your runway will
              then count down to the day your money actually arrives, instead of the end of term.
            </p>
          </div>
          <div style={{...S.row,gap:8,flexShrink:0}}>
            <button onClick={dismiss} style={S.quietBtn({minHeight:40,padding:"10px 14px"})}>Not now</button>
            <button onClick={()=>setOpen(true)} className="btn btn-primary"
              style={S.btn("var(--primary)","#fff",{minHeight:40,padding:"10px 16px",fontSize:14})}>
              Finish setup
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{borderLeft:"3px solid var(--primary)", paddingLeft:21}}>
      <p style={{fontSize:15,fontWeight:600,marginBottom:16}}>Sharpen your runway</p>

      <div style={{...S.col,gap:18}}>
        <div>
          <p style={{...S.label,marginBottom:8}}>Where are you in your studies?</p>
          <div style={{...S.col,gap:8}}>
            {STUDENT_TYPES.map(o=>(
              <button key={o.id} onClick={()=>setStudentType(o.id)}
                style={{textAlign:"left",padding:"11px 14px",borderRadius:"var(--r-md)",cursor:"pointer",minHeight:44,
                  border:studentType===o.id?"1px solid var(--primary)":"1px solid var(--line)",
                  background:studentType===o.id?"var(--primary-bg)":"var(--surface)",
                  color:studentType===o.id?"var(--primary)":"var(--ink)",fontSize:14,
                  fontWeight:studentType===o.id?600:400}}>
                {o.label}
                <span style={{display:"block",fontSize:12,color:"var(--muted)",fontWeight:400,marginTop:2}}>{o.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p style={{...S.label,marginBottom:8}}>How does your school divide the year?</p>
          <div style={{...S.row,gap:8,flexWrap:"wrap"}}>
            {TERM_SYSTEMS.map(o=>(
              <button key={o.id} onClick={()=>setTermSystem(o.id)}
                style={{padding:"9px 14px",borderRadius:"var(--r-full)",cursor:"pointer",minHeight:40,
                  border:termSystem===o.id?"1px solid var(--primary)":"1px solid var(--line)",
                  background:termSystem===o.id?"var(--primary-bg)":"var(--surface)",
                  color:termSystem===o.id?"var(--primary)":"var(--ink)",fontSize:14,
                  fontWeight:termSystem===o.id?600:400}}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p style={{...S.label,marginBottom:8}}>Financial aid</p>
          <button onClick={()=>setAid(a=>({...a,none:!a.none}))}
            style={{width:"100%",textAlign:"left",padding:"11px 14px",borderRadius:"var(--r-md)",cursor:"pointer",minHeight:44,
              border:aid.none?"1px solid var(--primary)":"1px solid var(--line)",
              background:aid.none?"var(--primary-bg)":"var(--surface)",
              color:aid.none?"var(--primary)":"var(--ink)",fontSize:14,fontWeight:aid.none?600:400}}>
            I don't receive financial aid
            <span style={{display:"block",fontSize:12,color:"var(--muted)",fontWeight:400,marginTop:2}}>
              Your runway counts down to the end of term instead
            </span>
          </button>

          {!aid.none && (
            <div style={{...S.row,gap:10,alignItems:"flex-start",marginTop:12}}>
              <div style={{flex:1,minWidth:0}}>
                <Field label="How much?" htmlFor="sc-amt">
                  <input id="sc-amt" type="number" inputMode="decimal" placeholder="8400" value={aid.amount}
                    onChange={e=>setAid(a=>({...a,amount:e.target.value}))} style={S.input}/>
                </Field>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <Field label="When does it reach you?" htmlFor="sc-when">
                  <input id="sc-when" type="date" value={aidDate}
                    onChange={e=>setAid(a=>({...a,expected_on:e.target.value}))} style={S.input}/>
                </Field>
              </div>
            </div>
          )}
          {!aid.none && studentType && (
            <p style={{fontSize:12,color:"var(--muted)",marginTop:8,lineHeight:1.6}}>
              {explainDisbursementDate(studentType)}
            </p>
          )}
        </div>

        {error && <p role="alert" style={{fontSize:13,color:"var(--danger)"}}>{error}</p>}

        <div style={{...S.row,gap:10}}>
          <button onClick={dismiss} style={S.quietBtn({flex:1,padding:"12px",borderRadius:10,fontSize:14,minHeight:46})}>
            Not now
          </button>
          <button onClick={save} disabled={busy || !canSave} className="btn btn-primary"
            style={S.darkBtn({flex:1,minHeight:46,opacity:busy||!canSave?.6:1})}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Card>
  );
}
