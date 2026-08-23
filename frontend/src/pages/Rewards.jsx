import { useState } from "react";
import { S } from "../styles.js";
import { CHARITIES, EARN_ACTIONS, LEVELS } from "../constants.js";
import { formatDate } from "../lib/format.js";
import { getLevelInfo } from "../lib/periods.js";
import { Card, Badge, Sheet } from "../components/ui.jsx";

/**
 * The charity selection + confirm UI, extracted so it can render two ways:
 *   1. As the sheet's PRIMARY content, when the user opened redemption
 *      directly from About → "Redeem points" (startOnRedeem).
 *   2. Nested in its own sheet on top of the overview, when the user opened
 *      the overview first and drilled in via "Redemption options".
 */
export function RedeemList({points,confirming,setConfirming,handleRedeem}){
  return(
    <div style={{...S.col,gap:12}}>
      <div style={{background:"var(--success-bg)",borderRadius:12,padding:"12px 14px",border:"1px solid var(--success-line)"}}>
        <p style={{fontSize:13,color:"var(--success)",lineHeight:1.55}}>
          🌱 Every point becomes a real charitable contribution on your behalf. Points = <strong>$0.01 each</strong>.
        </p>
      </div>
      {CHARITIES.map(ch=>{
        const canAfford=points>=ch.cost;
        const isC=confirming===ch.id;
        return(
          <div key={ch.id} style={{border:"1px solid "+(isC?"var(--success-line)":"var(--line)"),borderRadius:14,padding:16,background:isC?"var(--success-bg)":"#fff",transition:"all .2s"}}>
            <div style={{...S.row,gap:13,alignItems:"flex-start"}}>
              <span style={{fontSize:28,flexShrink:0}}>{ch.logo}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{...S.between,gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <p style={{fontSize:15,fontWeight:600}}>{ch.name}</p>
                  <Badge label={ch.cause} color="var(--info)" colorLight="var(--info-bg)"/>
                </div>
                <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{ch.desc}</p>
                <div style={{marginTop:10,...S.between,gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,color:"var(--primary)",fontWeight:600}}>{ch.cost} pts = ${(ch.cost*.01).toFixed(2)}</span>
                  {!isC?(
                    <button onClick={()=>canAfford&&setConfirming(ch.id)} disabled={!canAfford}
                      style={S.btn(canAfford?"var(--primary)":"var(--line)",canAfford?"#fff":"var(--subtle)",{cursor:canAfford?"pointer":"default",minHeight:36})}>
                      {canAfford?"Donate":"Need more pts"}
                    </button>
                  ):(
                    <div style={{...S.row,gap:8}}>
                      <button onClick={()=>setConfirming(null)} style={S.quietBtn({padding:"8px 12px",minHeight:36})}>Cancel</button>
                      <button onClick={()=>handleRedeem(ch)} style={S.btn("var(--success)","#fff",{padding:"8px 14px",minHeight:36})}>Confirm →</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RewardsContent({points,redeemed,earn,redeem,startOnRedeem=false}){
  const [showRedeem,setShowRedeem]=useState(false);
  const [confirming,setConfirming]=useState(null);
  const {cur,next,prog}=getLevelInfo(points);

  const handleRedeem=async ch=>{
    try{
      await redeem(ch);
      setConfirming(null); setShowRedeem(false);
    }catch(e){ alert(e.message); }
  };

  // Opened directly via "Redeem points" — show only the redemption list as
  // the sheet's own content, rather than the full overview with a second
  // sheet stacked on top (which read as "the same screen as How to earn").
  if(startOnRedeem){
    return <RedeemList points={points} confirming={confirming} setConfirming={setConfirming} handleRedeem={handleRedeem}/>;
  }

  return(
    <div style={{...S.col,gap:18}}>
      <div style={{background:"var(--hero)",borderRadius:20,padding:"28px 26px 24px",color:"var(--hero-ink)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-30,top:-30,width:160,height:160,background:cur.color+"1A",borderRadius:"50%"}}/>
        <div style={{...S.row,gap:14,marginBottom:18,position:"relative"}}>
          <div style={{width:58,height:58,borderRadius:16,background:cur.color+"33",border:"2px solid "+cur.color+"88",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>{cur.icon}</div>
          <div>
            <p style={{fontSize:11,color:"var(--hero-muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Your level</p>
            <p style={{...S.display,fontSize:26,fontWeight:400}}>{cur.name}</p>
          </div>
        </div>
        <div style={{...S.row,alignItems:"baseline",gap:6,marginBottom:16,position:"relative"}}>
          <span style={{...S.display,fontSize:42,fontWeight:300,color:"var(--hero-accent)"}}>{points}</span>
          <span style={{fontSize:15,color:"var(--hero-muted)"}}>points</span>
        </div>
        {next?(
          <div style={{position:"relative"}}>
            <div style={{...S.between,marginBottom:7,gap:8}}>
              <span style={{fontSize:12,color:"var(--hero-muted)"}}>Next: {next.icon} {next.name}</span>
              <span style={{fontSize:12,color:"var(--hero-accent)",fontWeight:600}}>{next.min-points} pts to go</span>
            </div>
            <div style={{height:6,background:"rgba(255,255,255,.1)",borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:prog+"%",background:"var(--hero-accent)",borderRadius:4,transition:"width .6s ease"}}/>
            </div>
          </div>
        ):<p style={{fontSize:13,color:"var(--hero-accent)",fontWeight:500,position:"relative"}}>🔥 Maximum level — you're a Flow Master!</p>}
      </div>

      <Card>
        <p style={{fontSize:15,fontWeight:600,marginBottom:14}}>All levels</p>
        {LEVELS.map((l,i)=>{
          const reached=points>=l.min;
          const isCur=cur.level===l.level;
          return(
            <div key={l.level} style={{...S.row,padding:"10px 0",borderBottom:i<LEVELS.length-1?"1px solid var(--line)":"none"}}>
              <div style={{width:40,height:40,borderRadius:12,background:reached?l.color+"22":"var(--line)",border:isCur?"2px solid "+l.color:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{l.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14,fontWeight:isCur?600:400,color:reached?"var(--ink)":"var(--subtle)"}}>{l.name}</p>
                <p style={{fontSize:11,color:"var(--muted)"}}>From {l.min} pts</p>
              </div>
              {isCur&&<span style={S.pill(l.color+"22",l.color)}>Current</span>}
              {!reached&&<span style={{fontSize:16,color:"var(--subtle)"}}>🔒</span>}
              {reached&&!isCur&&<span style={{fontSize:14,color:"var(--success)"}}>✓</span>}
            </div>
          );
        })}
      </Card>

      <Card>
        <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>How to earn points</p>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>Points reward healthy financial behaviour — not just app usage.</p>
        {EARN_ACTIONS.map((a,i)=>(
          <div key={a.key} style={{...S.between,padding:"10px 0",gap:12,borderBottom:i<EARN_ACTIONS.length-1?"1px solid var(--line)":"none"}}>
            <span style={{fontSize:13,flex:1}}>{a.action}</span>
            <span style={{fontSize:13,fontWeight:600,color:"var(--primary)",whiteSpace:"nowrap"}}>+{a.pts} pts</span>
          </div>
        ))}
        <button onClick={async()=>{try{await earn("complete_monthly_review");}catch(e){alert(e.message);}}}
          style={{marginTop:16,width:"100%",background:"var(--warning-bg)",border:"1px solid var(--warning-line)",borderRadius:10,padding:"12px",fontSize:13,fontWeight:600,cursor:"pointer",color:"var(--warning)",minHeight:44}}>
          ✨ Simulate earning 20 pts (demo)
        </button>
      </Card>

      <button onClick={()=>setShowRedeem(true)} style={S.darkBtn({display:"flex",alignItems:"center",justifyContent:"center",gap:10,borderRadius:14,padding:"16px",fontSize:15})}>
        <span>🤝</span> Redemption options · {points} pts available
      </button>

      {redeemed?.length>0&&(
        <Card>
          <p style={{fontSize:15,fontWeight:600,marginBottom:14}}>Your giving history</p>
          {redeemed.map((r,i)=>(
            <div key={r.id} style={{...S.row,padding:"10px 0",borderBottom:i<redeemed.length-1?"1px solid var(--line)":"none"}}>
              <span style={{fontSize:22}}>{r.logo}</span>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:13,fontWeight:500}}>{r.name}</p>
                <p style={{fontSize:11,color:"var(--muted)"}}>{formatDate(r.date)}</p>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:"var(--success)",whiteSpace:"nowrap"}}>−{r.pts} pts</span>
            </div>
          ))}
        </Card>
      )}

      {showRedeem&&(
        <Sheet title="Redeem points" subtitle={`${points} pts available`} onClose={()=>{setShowRedeem(false);setConfirming(null);}} zIndex={250}>
          <div style={{overflowY:"auto",flex:1,minHeight:0,padding:"16px 20px calc(36px + env(safe-area-inset-bottom))"}}>
            <RedeemList points={points} confirming={confirming} setConfirming={setConfirming} handleRedeem={handleRedeem}/>
          </div>
        </Sheet>
      )}
    </div>
  );
}
