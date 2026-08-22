import { useState, useEffect, useRef } from "react";
import { S } from "../styles.js";
import { ONBOARDING_STEPS } from "../constants.js";
import { PrivacyModal } from "../components/PrivacyModal.jsx";

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
    setVal(answers[ONBOARDING_STEPS[step].id] ?? "");
    const t=setTimeout(()=>inputRef.current?.focus(),60);
    return ()=>clearTimeout(t); // otherwise focus fires after unmount
  },[step]); // eslint-disable-line react-hooks/exhaustive-deps

  const next=()=>{
    const v=val.trim();
    if(!v) return;
    setAnswers(a=>({...a,[cur.id]:v}));
    setStep(s=>s+1);
  };
  // Answers are kept in state, so stepping back and forward preserves them.
  const back=()=>setStep(s=>Math.max(0,s-1));

  const IS={width:"100%",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"14px 18px",color:"#F5F0E8",fontSize:17,outline:"none"};

  return(
    <>
      <div style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#1A1714",padding:24}}>
        <div style={{width:"100%",maxWidth:460}}>
          <div style={{textAlign:"center",marginBottom:44}}>
            <span style={{...S.serif,fontSize:30,color:"#F5F0E8",fontWeight:300,letterSpacing:"-0.5px"}}>flo<span style={{color:"#B8882A"}}>·</span>w</span>
          </div>

          <div style={{height:2,background:"rgba(255,255,255,.1)",borderRadius:2,marginBottom:44,overflow:"hidden"}}>
            <div style={{height:"100%",width:(step/totalSteps*100)+"%",background:"#B8882A",borderRadius:2,transition:"width .5s ease"}}/>
          </div>

          {!isPrivacyStep?(
            <div key={step} className="slide-up" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"38px 34px"}}>
              <p style={{color:"#C8BAA8",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:"1.2px"}}>{step+1} of {totalSteps}</p>
              <h2 style={{...S.serif,color:"#F5F0E8",fontSize:25,fontWeight:400,marginBottom:28,lineHeight:1.35}}>{cur.q}</h2>

              {cur.type==="text"&&(
                <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&next()} placeholder={cur.placeholder} style={IS}/>
              )}

              {cur.type==="money"&&(
                <div style={{position:"relative"}}>
                  <span style={{position:"absolute",left:18,top:"50%",transform:"translateY(-50%)",color:"#C8BAA8",fontSize:17}}>$</span>
                  <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value.replace(/[^0-9.]/g,""))}
                    onKeyDown={e=>e.key==="Enter"&&next()} placeholder={cur.placeholder} inputMode="decimal"
                    style={{...IS,paddingLeft:36}}/>
                </div>
              )}

              {cur.type==="choice"&&(
                <div style={{...S.col,gap:9}}>
                  {cur.choices.map(c=>(
                    <button key={c} type="button" onClick={()=>setVal(c)}
                      style={{background:val===c?"#B8882A":"rgba(255,255,255,.07)",border:val===c?"1px solid #B8882A":"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:"12px 16px",color:val===c?"#1A1714":"#F5F0E8",fontSize:14,textAlign:"left",cursor:"pointer",fontWeight:val===c?600:400,transition:"all .18s",minHeight:44}}>
                      {c}
                    </button>
                  ))}
                </div>
              )}

              <div style={{...S.row,gap:10,marginTop:26}}>
                {step>0&&(
                  <button type="button" onClick={back}
                    style={{...S.darkBtn(),width:"auto",flexShrink:0,background:"rgba(255,255,255,.08)",color:"#C8BAA8",borderRadius:12,padding:"13px 18px"}}>
                    ← Back
                  </button>
                )}
                <button type="button" onClick={next} disabled={!val.trim()}
                  style={{...S.darkBtn(),background:val.trim()?"#B8882A":"rgba(255,255,255,.08)",color:val.trim()?"#1A1714":"#C8BAA8",borderRadius:12,cursor:val.trim()?"pointer":"default",transition:"all .2s"}}>
                  Continue →
                </button>
              </div>
            </div>
          ):(
            <div key="privacy-step" className="slide-up" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"38px 34px"}}>
              <p style={{color:"#C8BAA8",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:"1.2px"}}>{totalSteps} of {totalSteps}</p>
              <h2 style={{...S.serif,color:"#F5F0E8",fontSize:25,fontWeight:400,marginBottom:12,lineHeight:1.35}}>Before we begin</h2>
              <p style={{color:"#C8BAA8",fontSize:14,lineHeight:1.65,marginBottom:28}}>
                flo·w is built on the principle that your financial data belongs to you. Please take a moment to read our Privacy Policy.
              </p>
              <button type="button" onClick={()=>setShowPrivacy(true)}
                style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"15px 18px",color:"#F5F0E8",fontSize:14,cursor:"pointer",textAlign:"left",...S.between}}>
                <span>📄 Read our Privacy Policy</span><span style={{color:"#B8882A",fontSize:16}}>→</span>
              </button>
              <button type="button" onClick={back}
                style={{...S.darkBtn(),marginTop:12,background:"rgba(255,255,255,.08)",color:"#C8BAA8",borderRadius:12}}>
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
