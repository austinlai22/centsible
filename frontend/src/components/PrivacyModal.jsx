import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { S } from "../styles.js";
import { PRIVACY_SECTIONS } from "../constants.js";

/**
 * Privacy policy, shown either as a plain modal (from About) or as an
 * accept-gated step during onboarding (showAccept).
 *
 * Portal-rendered for the same reason as Sheet (components/ui.jsx): every
 * page wraps its content in a div whose "slide-up" animation permanently
 * leaves a `transform` on that ancestor (fill-mode: both), which otherwise
 * traps this "fixed, full-viewport" modal inside that page's content box
 * instead of the real browser viewport.
 */
export function PrivacyModal({onClose,showAccept=false,onAccept}){
  const [scrolled,setScrolled]=useState(false);
  const ref=useRef(null);

  const onScroll=()=>{
    const el=ref.current;
    if(!el) return;
    if(el.scrollTop+el.clientHeight>=el.scrollHeight-40) setScrolled(true);
  };

  return createPortal(
    <div className="fade-in sheet-backdrop" style={{zIndex:300}}>
      <div className="slide-up sheet-panel" role="dialog" aria-modal="true" aria-label="Privacy Policy">
        <div style={{padding:"22px 22px 14px",borderBottom:"1px solid var(--sand)",...S.between,gap:12,flexShrink:0}}>
          <div>
            <p style={{...S.serif,fontSize:20,fontWeight:400}}>Privacy Policy</p>
            <p style={{fontSize:12,color:"var(--muted)",marginTop:2}}>Effective May 20, 2025</p>
          </div>
          {!showAccept&&<button style={S.sandBtn({flexShrink:0})} onClick={onClose}>Close</button>}
        </div>

        <div ref={ref} onScroll={onScroll} style={{flex:1,overflowY:"auto",padding:"20px 22px",minHeight:0}}>
          <div style={{background:"var(--sage-light)",borderRadius:12,padding:"14px 16px",marginBottom:22,border:"1px solid #c5dac3"}}>
            <p style={{fontSize:13,color:"var(--sage)",fontWeight:600,marginBottom:4}}>Our commitment to you</p>
            <p style={{fontSize:13,color:"var(--sage)",lineHeight:1.6}}>We don't sell your data. We don't train AI on it. You can delete everything, anytime.</p>
          </div>
          {PRIVACY_SECTIONS.map((s,i)=>(
            <div key={i} style={{marginBottom:24}}>
              <p style={{...S.serif,fontSize:16,fontWeight:400,marginBottom:8}}>{s.title}</p>
              <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.75,whiteSpace:"pre-line"}}>{s.body}</p>
            </div>
          ))}
          <div style={{height:12}}/>
        </div>

        {showAccept&&(
          <div style={{padding:"14px 22px calc(24px + env(safe-area-inset-bottom))",borderTop:"1px solid var(--sand)",flexShrink:0}}>
            {!scrolled&&<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",marginBottom:10}}>Scroll to the bottom to continue</p>}
            <button onClick={scrolled?onAccept:undefined} disabled={!scrolled}
              style={{...S.darkBtn(),background:scrolled?"#1A1714":"var(--sand)",color:scrolled?"#fff":"var(--stone)",borderRadius:13,padding:"15px",cursor:scrolled?"pointer":"default",transition:"all .2s"}}>
              {scrolled?"I've read and accept the Privacy Policy →":"Keep scrolling to accept"}
            </button>
          </div>
        )}
        {!showAccept&&<div style={{height:12,flexShrink:0}}/>}
      </div>
    </div>,
    document.body
  );
}
