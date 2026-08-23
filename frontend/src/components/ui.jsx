import { useEffect } from "react";
import { createPortal } from "react-dom";
import { S } from "../styles.js";
import { pct, fmtDec } from "../lib/format.js";

export function Card({children,style={},onClick,className=""}){
  return (
    <div onClick={onClick} className={className}
      style={{background:"#fff",borderRadius:16,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,.07)",cursor:onClick?"pointer":"default",...style}}>
      {children}
    </div>
  );
}

export function Badge({label,color,colorLight}){
  return <span style={S.pill(colorLight,color)}>{label}</span>;
}

export function Field({label,children,htmlFor}){
  return <div><label style={S.label} htmlFor={htmlFor}>{label}</label>{children}</div>;
}

export function SpendBar({spent,budget,color}){
  const p=pct(spent,budget); const over=p>=100;
  return(
    <div style={{marginTop:8}}>
      <div style={{...S.between,marginBottom:5,gap:8}}>
        <span style={{fontSize:12,color:"var(--muted)"}}>{fmtDec(spent)} spent</span>
        <span style={{fontSize:12,color:over?"var(--rose)":"var(--muted)",textAlign:"right"}}>
          {over?"Over budget!":fmtDec(budget-spent)+" left"}
        </span>
      </div>
      <div style={{height:6,background:"var(--sand)",borderRadius:4,overflow:"hidden"}}
           role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
        <div style={{height:"100%",width:p+"%",background:over?"var(--rose)":color,borderRadius:4,transition:"width .5s ease"}}/>
      </div>
    </div>
  );
}

/**
 * Sheet — a bottom sheet on phones, a centred dialog from 768px up.
 *
 * Both variants are the same DOM; only CSS differs (see .sheet-backdrop /
 * .sheet-panel in styles.js). A bottom sheet anchored to the bottom edge of a
 * 27" monitor is a phone idiom applied where it doesn't belong.
 *
 * Rendered via a portal into document.body rather than in place. Every page
 * wraps its content in a div with className="slide-up", whose animation ends
 * at `transform: translateY(0)` with fill-mode "both" — so the ancestor holds
 * a transform permanently, not just during the animation. A transform on any
 * ancestor creates a new containing block for position:fixed descendants,
 * so without the portal this sheet's "fixed, full-viewport" backdrop was
 * actually fixed to that PAGE's content box instead of the browser viewport —
 * on a tall page the box's top could sit above y=0, and the sheet rendered
 * partly or entirely above the visible screen. A portal escapes the whole
 * ancestor chain, so no page-level CSS can trap it again.
 */
export function Sheet({onClose,title,subtitle,children,zIndex=200}){
  // Escape to close, and lock background scrolling while open — without the
  // lock, scrolling inside the sheet chains to the page behind it on iOS.
  useEffect(()=>{
    const onKey = e => { if(e.key === "Escape") onClose?.(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  },[onClose]);

  return createPortal(
    <div className="fade-in sheet-backdrop" style={{zIndex}} onClick={onClose}>
      <div className="slide-up sheet-panel" role="dialog" aria-modal="true" aria-label={title}
           onClick={e=>e.stopPropagation()}>
        <div style={{padding:"22px 22px 14px",borderBottom:"1px solid var(--sand)",...S.between,gap:12,flexShrink:0}}>
          <div style={{minWidth:0}}>
            <p style={{...S.serif,fontSize:20,fontWeight:400}}>{title}</p>
            {subtitle&&<p style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{subtitle}</p>}
          </div>
          <button style={S.sandBtn({flexShrink:0})} onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function MenuRow({icon,label,sub,right,onClick,danger=false,noBorder=false}){
  return(
    <button onClick={onClick} style={{width:"100%",...S.row,padding:"14px 0",background:"none",border:"none",borderBottom:noBorder?"none":"1px solid var(--sand)",cursor:"pointer",textAlign:"left",minHeight:44}}>
      <div style={{...S.iconBox("var(--sand)"),fontSize:17}}>{icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:15,fontWeight:500,color:danger?"var(--rose)":"var(--ink)"}}>{label}</p>
        {sub&&<p style={{fontSize:12,color:"var(--muted)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</p>}
      </div>
      {right||<span style={{color:"var(--stone)",fontSize:18}}>›</span>}
    </button>
  );
}

export function Spinner({size=18}){
  return <span className="spin" role="status" aria-label="Loading"
    style={{display:"inline-block",width:size,height:size,border:"2px solid var(--sand)",borderTopColor:"var(--ink)",borderRadius:"50%"}}/>;
}

/** Yellow banner when one or more linked accounts need re-authentication. */
export function SyncBanner({accounts}){
  const needsRelink = (accounts||[]).filter(a=>a.item_status==="relink_required");
  if(!needsRelink.length) return null;
  return(
    <div style={{background:"var(--gold-light)",border:"1px solid #e8d0a0",borderRadius:14,padding:"13px 16px",...S.row,gap:12,alignItems:"flex-start"}}>
      <span style={{fontSize:20,flexShrink:0}}>🔔</span>
      <div>
        <p style={{fontSize:14,fontWeight:600,color:"var(--gold)"}}>Action needed</p>
        <p style={{fontSize:12,color:"var(--gold)",marginTop:2}}>
          {needsRelink.map(a=>a.institution_name||a.name).join(", ")} needs to be re-linked. Go to About → Linked Accounts.
        </p>
      </div>
    </div>
  );
}

/**
 * Shown when a fetch fails. Always paired with a Retry button calling the
 * hook's reload() — never a dead-end message. Demo/fallback data still shows
 * beneath it, so the user sees something useful either way.
 */
export function ErrorBanner({message, onRetry}){
  if(!message) return null;
  return(
    <div role="alert" style={{background:"var(--rose-light)",border:"1px solid #e8b4b2",borderRadius:14,padding:"13px 16px",...S.row,gap:12,alignItems:"flex-start"}}>
      <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:14,fontWeight:600,color:"var(--rose)"}}>Couldn't load the latest data</p>
        <p style={{fontSize:12,color:"var(--rose)",marginTop:2,opacity:.85}}>Showing the most recent data available. {message}</p>
      </div>
      {onRetry && <button onClick={onRetry} style={S.btn("var(--rose)","#fff",{flexShrink:0,padding:"7px 12px",fontSize:12})}>Retry</button>}
    </div>
  );
}

export function SkeletonBlock({height=16, width="100%", radius=6, style={}}){
  return <div style={{height,width,borderRadius:radius,background:"linear-gradient(90deg,var(--sand) 25%,#f0e9dc 50%,var(--sand) 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.5s ease infinite",...style}}/>;
}

export function SkeletonCard({lines=3, style={}}){
  return(
    <Card style={style}>
      <SkeletonBlock height={12} width="40%" style={{marginBottom:14}}/>
      {Array.from({length:lines}).map((_,i)=>(
        <SkeletonBlock key={i} height={14} width={i===lines-1?"60%":"100%"} style={{marginBottom:i<lines-1?10:0}}/>
      ))}
    </Card>
  );
}

export function SkeletonList({rows=4}){
  return(
    <Card style={{padding:0}}>
      {Array.from({length:rows}).map((_,i)=>(
        <div key={i} style={{...S.row,padding:"12px 18px",borderBottom:i<rows-1?"1px solid var(--sand)":"none"}}>
          <SkeletonBlock height={38} width={38} radius={10}/>
          <div style={{flex:1}}>
            <SkeletonBlock height={13} width="55%" style={{marginBottom:6}}/>
            <SkeletonBlock height={11} width="30%"/>
          </div>
          <SkeletonBlock height={14} width={50}/>
        </div>
      ))}
    </Card>
  );
}

/** Full-page fallback while a lazily-loaded page chunk downloads. */
export function PageFallback(){
  return(
    <div style={{...S.col,gap:16}}>
      <SkeletonCard lines={3} style={{background:"#1A1714"}}/>
      <SkeletonList rows={4}/>
    </div>
  );
}
