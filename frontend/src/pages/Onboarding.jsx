import { useState, useEffect, useRef } from "react";
import { S } from "../styles.js";
import { ONBOARDING_STEPS } from "../constants.js";
import {
  TERM_SYSTEMS, STUDENT_TYPES, suggestTermEnd,
  suggestDisbursementDate, explainDisbursementDate,
} from "../lib/calendar.js";
import { PrivacyModal } from "../components/PrivacyModal.jsx";
import { Brand } from "../components/Brand.jsx";

export function Onboarding({onComplete}){
  const [step,setStep]       = useState(0);
  const [answers,setAnswers] = useState({});
  const [val,setVal]         = useState("");
  const [showPrivacy,setShowPrivacy] = useState(false);
  const inputRef = useRef(null);

  const totalSteps    = ONBOARDING_STEPS.length+1;
  const isPrivacyStep = step===ONBOARDING_STEPS.length;
  const cur           = !isPrivacyStep?ONBOARDING_STEPS[step]:null;

  useEffect(()=>{
    if(isPrivacyStep) return;
    const stepDef = ONBOARDING_STEPS[step];
    const prior = answers[stepDef.id];
    if (prior !== undefined) { setVal(prior); }
    else if (stepDef.type === "daterange") {
      // Prefill the end date from the term system so the student adjusts a
      // plausible range instead of filling two empty fields.
      setVal({ start:"", end:"" });
    } else if (stepDef.type === "disbursement") {
      setVal({
        amount:"", none:false,
        expected_on: suggestDisbursementDate(answers.term?.start, answers.studentType),
      });
    } else {
      setVal("");
    }
    const t=setTimeout(()=>inputRef.current?.focus(),60);
    return ()=>clearTimeout(t); // otherwise focus fires after unmount
  },[step]); // eslint-disable-line react-hooks/exhaustive-deps

  const CHOICE_SOURCES = { TERM_SYSTEMS, STUDENT_TYPES };
  // Choice steps either carry literal strings or name a catalogue to read.
  const choices = cur?.choicesKey
    ? CHOICE_SOURCES[cur.choicesKey].map(c => ({ value:c.id, label:c.label, hint:c.hint }))
    : (cur?.choices || []).map(c => ({ value:c, label:c }));

  const isRange = cur?.type==="daterange";
  const isDisb  = cur?.type==="disbursement";
  // "No aid" is a real answer, not an evasion: plenty of students are
  // self-funded or working, and forcing a fabricated disbursement would make
  // the runway count down to a payment that never arrives.
  const disbOk  = isDisb && (val?.none || (val?.amount && Number(val.amount) > 0 && val?.expected_on));
  // A date range is two values, so this step's answer is an object.
  const rangeOk = isRange && val?.start && val?.end && val.end > val.start;
  const canAdvance = cur?.optional
    || (isRange ? rangeOk : isDisb ? disbOk : String(val ?? "").trim().length > 0);

  const next=()=>{
    if(!canAdvance) return;
    const v = (isRange || isDisb) ? val : String(val ?? "").trim();
    // Optional steps may be skipped outright; don't store an empty answer.
    const empty = isRange ? !rangeOk : isDisb ? !disbOk : !v;
    setAnswers(a => empty ? a : ({...a,[cur.id]:v}));
    setStep(s=>s+1);
  };
  // Answers are kept in state, so stepping back and forward preserves them.
  const back=()=>setStep(s=>Math.max(0,s-1));

  const IS={width:"100%",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"14px 18px",color:"var(--hero-ink)",fontSize:17,outline:"none"};

  return(
    <>
      <div style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--hero)",padding:24}}>
        <div style={{width:"100%",maxWidth:460}}>
          <div style={{textAlign:"center",marginBottom:44}}>
            <span style={{color:"var(--hero-ink)"}}><Brand size={30} on="dark"/></span>
          </div>

          <div style={{height:2,background:"rgba(255,255,255,.1)",borderRadius:2,marginBottom:44,overflow:"hidden"}}>
            <div style={{height:"100%",width:(step/totalSteps*100)+"%",background:"var(--hero-accent)",borderRadius:2,transition:"width .5s ease"}}/>
          </div>

          {!isPrivacyStep?(
            <div key={step} className="slide-up" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"38px 34px"}}>
              <p style={{color:"var(--hero-muted)",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:"1.2px"}}>{step+1} of {totalSteps}</p>
              <h2 style={{...S.display,color:"var(--hero-ink)",fontSize:25,fontWeight:400,marginBottom:cur.hint?10:28,lineHeight:1.35}}>{cur.q}</h2>
              {cur.hint && (
                <p style={{color:"var(--hero-muted)",fontSize:13,lineHeight:1.6,marginBottom:24}}>{cur.hint}</p>
              )}

              {cur.type==="text"&&(
                <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&next()} placeholder={cur.placeholder} style={IS}/>
              )}

              {cur.type==="money"&&(
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:18,top:"50%",transform:"translateY(-50%)",color:"var(--hero-muted)",fontSize:17}}>$</span>
                  <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value.replace(/[^0-9.]/g,""))}
                    onKeyDown={e=>e.key==="Enter"&&next()} placeholder={cur.placeholder} inputMode="decimal"
                    style={{...IS,paddingLeft:36}}/>
                </div>
              )}

              {cur.type==="daterange"&&(
                <div style={{...S.col,gap:12}}>
                  <div>
                    <label htmlFor="ob-start" style={{...S.label,color:"var(--hero-muted)"}}>Term starts</label>
                    <input id="ob-start" ref={inputRef} type="date" value={val?.start||""}
                      onChange={e=>setVal(v=>{
                        const start=e.target.value;
                        // Propose an end date from the term system so the
                        // student corrects a plausible guess rather than
                        // filling a blank field.
                        const end=(!v?.end||v.end===suggestTermEnd(v?.start,'semester'))
                          ? suggestTermEnd(start,'semester') : v.end;
                        return {...(v||{}),start,end};
                      })} style={IS}/>
                  </div>
                  <div>
                    <label htmlFor="ob-end" style={{...S.label,color:"var(--hero-muted)"}}>Term ends</label>
                    <input id="ob-end" type="date" value={val?.end||""}
                      onChange={e=>setVal(v=>({...(v||{}),end:e.target.value}))} style={IS}/>
                  </div>
                  {val?.start && val?.end && val.end <= val.start && (
                    <p style={{fontSize:12,color:"var(--danger-on-hero)"}}>The end date needs to be after the start date.</p>
                  )}
                </div>
              )}

              {cur.type==="disbursement"&&(
                <div style={{...S.col,gap:12}}>
                  <button type="button"
                    onClick={()=>setVal(v=>({...(v||{}),none:!v?.none}))}
                    style={{background:val?.none?"var(--hero-accent)":"rgba(255,255,255,.07)",
                      border:val?.none?"1px solid var(--hero-accent)":"1px solid rgba(255,255,255,.12)",
                      borderRadius:12,padding:"12px 16px",color:val?.none?"var(--hero)":"var(--hero-ink)",
                      fontSize:14,textAlign:"left",cursor:"pointer",minHeight:44}}>
                    I don't receive financial aid
                    <span style={{display:"block",fontSize:12,marginTop:2,
                      color:val?.none?"var(--hero)":"var(--hero-muted)",opacity:val?.none?.75:1}}>
                      Your runway will count down to the end of term instead
                    </span>
                  </button>

                  {!val?.none && (
                    <>
                      <div>
                        <label htmlFor="ob-amt" style={{...S.label,color:"var(--hero-muted)"}}>How much do you receive?</label>
                        <input id="ob-amt" type="number" inputMode="decimal" placeholder="8400"
                          value={val?.amount||""}
                          onChange={e=>setVal(v=>({...(v||{}),amount:e.target.value}))} style={IS}/>
                      </div>
                      <div>
                        <label htmlFor="ob-when" style={{...S.label,color:"var(--hero-muted)"}}>When does it reach you?</label>
                        <input id="ob-when" type="date" value={val?.expected_on||""}
                          onChange={e=>setVal(v=>({...(v||{}),expected_on:e.target.value}))} style={IS}/>
                        <p style={{fontSize:12,color:"var(--hero-muted)",marginTop:8,lineHeight:1.6}}>
                          {explainDisbursementDate(answers.studentType)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {cur.type==="choice"&&(
                <div style={{...S.col,gap:9}}>
                  {choices.map(c=>(
                    <button key={c.value} type="button" onClick={()=>setVal(c.value)}
                      style={{background:val===c.value?"var(--hero-accent)":"rgba(255,255,255,.07)",
                        border:val===c.value?"1px solid var(--hero-accent)":"1px solid rgba(255,255,255,.12)",
                        borderRadius:12,padding:"12px 16px",color:val===c.value?"var(--hero)":"var(--hero-ink)",
                        fontSize:14,textAlign:"left",cursor:"pointer",fontWeight:val===c.value?600:400,
                        transition:"all .18s",minHeight:44}}>
                      {c.label}
                      {c.hint && (
                        <span style={{display:"block",fontSize:12,fontWeight:400,marginTop:2,
                          color:val===c.value?"var(--hero)":"var(--hero-muted)",opacity:val===c.value?.75:1}}>
                          {c.hint}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div style={{...S.row,gap:10,marginTop:26}}>
                {step>0&&(
                  <button type="button" onClick={back}
                    style={{...S.darkBtn(),width:"auto",flexShrink:0,background:"rgba(255,255,255,.08)",color:"var(--hero-muted)",borderRadius:12,padding:"13px 18px"}}>
                    ← Back
                  </button>
                )}
                <button type="button" onClick={next} disabled={!canAdvance}
                  style={{...S.darkBtn(),background:canAdvance?"var(--hero-accent)":"rgba(255,255,255,.08)",color:canAdvance?"var(--hero)":"var(--hero-muted)",borderRadius:12,cursor:canAdvance?"pointer":"default",transition:"all .2s"}}>
                  {cur.optional && (isRange ? !rangeOk : !String(val ?? "").trim()) ? "Skip for now →" : "Continue →"}
                </button>
              </div>
            </div>
          ):(
            <div key="privacy-step" className="slide-up" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"38px 34px"}}>
              <p style={{color:"var(--hero-muted)",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:"1.2px"}}>{totalSteps} of {totalSteps}</p>
              <h2 style={{...S.display,color:"var(--hero-ink)",fontSize:25,fontWeight:400,marginBottom:12,lineHeight:1.35}}>Before we begin</h2>
              <p style={{color:"var(--hero-muted)",fontSize:14,lineHeight:1.65,marginBottom:28}}>
                Centsible is built on the principle that your financial data belongs to you. Please take a moment to read our Privacy Policy.
              </p>
              <button type="button" onClick={()=>setShowPrivacy(true)}
                style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"15px 18px",color:"var(--hero-ink)",fontSize:14,cursor:"pointer",textAlign:"left",...S.between}}>
                <span>📄 Read our Privacy Policy</span><span style={{color:"var(--hero-accent)",fontSize:16}}>→</span>
              </button>
              <button type="button" onClick={back}
                style={{...S.darkBtn(),marginTop:12,background:"rgba(255,255,255,.08)",color:"var(--hero-muted)",borderRadius:12}}>
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>

      {showPrivacy&&(
        <PrivacyModal showAccept
          onAccept={()=>{setShowPrivacy(false);onComplete(answers);}}
          onClose={()=>setShowPrivacy(false)}/>
      )}
    </>
  );
}
