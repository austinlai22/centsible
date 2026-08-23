import { useState, useCallback } from "react";
import { api, plaidApi, authApi } from "../api.js";
import { S } from "../styles.js";
import { LEVELS } from "../constants.js";
import { fmtDec } from "../lib/format.js";
import { getLevelInfo } from "../lib/periods.js";
import { Card, Field, Sheet, MenuRow, Spinner, ErrorBanner, SkeletonList } from "../components/ui.jsx";
import { PrivacyModal } from "../components/PrivacyModal.jsx";
import { MfaSettings } from "../components/MfaSettings.jsx";
import { RewardsContent } from "./Rewards.jsx";
import { usePlaidLink } from "../hooks/usePlaidLink.js";

export default function About({
  profile,setProfile,points,redeemed,earn,redeem,
  accounts,accountsLoading,accountsError,reloadAccounts,onLogout,
}){
  const [section,setSection]=useState(null);
  const {cur,prog}=getLevelInfo(points);
  const [pForm,setPForm]=useState({
    name:  profile.name  || "",
    email: profile.email || "",
    phone: profile.phone || "",
  });
  const [saving,setSaving]=useState(false);
  const [saveErr,setSaveErr]=useState("");
  const [deleting,setDeleting]=useState(false);

  const open=s=>()=>setSection(s);
  const close=()=>setSection(null);
  const SecLabel=({label})=><p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1.1,fontWeight:600,padding:"18px 0 6px"}}>{label}</p>;

  const saveProfile=async()=>{
    if(!pForm.name.trim() && !pForm.email.trim()) return setSaveErr("Enter a name or an email.");
    setSaving(true);setSaveErr("");
    try{
      const res=await api.put("/auth/me",{
        name:pForm.name, email:pForm.email, phone:pForm.phone,
      });
      // setProfile is really setAuthUser — spreading `p` preserves
      // onboarded_at and every other server field.
      setProfile(p=>({
        ...p,
        name:res.user.name, email:res.user.email, phone:res.user.phone,
      }));
      close();
    }catch(e){setSaveErr(e.message||"Failed to save");}
    finally{setSaving(false);}
  };

  const onLinkSuccess=useCallback(()=>reloadAccounts(),[reloadAccounts]);
  const {open:openPlaidLink,linking,error:linkError}=usePlaidLink(onLinkSuccess);

  const [removingId,setRemovingId]=useState(null);
  const handleRemoveAccount=async(a)=>{
    if(!window.confirm("Remove "+a.name+"?")) return;
    setRemovingId(a.id);
    try{
      // plaid_item_id is the plaid_items row UUID, which is what
      // DELETE /plaid/items/:itemId validates. Falling back to a.id sent a
      // Plaid account string and always 400'd.
      await plaidApi.removeItem(a.plaid_item_id);
      reloadAccounts();
    }catch(e){ alert(e.message||"Couldn't remove this account — please try again."); }
    finally{ setRemovingId(null); }
  };

  // The privacy policy promises deletion via Settings → Privacy, and
  // DELETE /auth/me has existed all along — it just had no UI reaching it.
  const handleDeleteAccount=async()=>{
    if(!window.confirm("Permanently delete your account and all of your data? This cannot be undone.")) return;
    if(!window.confirm("Last chance — this erases your transactions, budgets, goals, and linked accounts. Continue?")) return;
    setDeleting(true);
    try{
      await authApi.deleteAccount();
      onLogout();
    }catch(e){ alert(e.message||"Couldn't delete your account — please try again."); }
    finally{ setDeleting(false); }
  };

  return(
    <>
      <div className="slide-up" style={{...S.col,gap:4}}>
        <div style={{background:"var(--hero)",borderRadius:20,padding:"24px 22px",color:"var(--hero-ink)",...S.row,gap:16,marginBottom:8}}>
          <div style={{width:54,height:54,borderRadius:"50%",background:"var(--hero-accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,flexShrink:0,color:"var(--hero)"}}>
            {(profile.name||"?").charAt(0).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <p style={{...S.display,fontSize:22,fontWeight:400}}>{profile.name||"Your account"}</p>
            <p style={{fontSize:13,color:"var(--hero-muted)",marginTop:2}}>{cur.icon} {cur.name} · {points} pts</p>
          </div>
        </div>

        <Card style={{padding:"0 20px"}}>
          <SecLabel label="My Profile"/>
          <MenuRow icon="👤" label="Personal info" sub={profile.email||"Add your email"} onClick={open("profile")} noBorder/>
        </Card>

        <Card style={{padding:"0 20px"}}>
          <SecLabel label="Linked Accounts"/>
          <MenuRow icon="🏦" label="Connected banks"
            sub={accounts?.length?accounts.length+" account"+(accounts.length===1?"":"s")+" linked":"No accounts linked"}
            onClick={open("accounts")} noBorder/>
        </Card>

        <Card style={{padding:"0 20px"}}>
          <SecLabel label="Rewards"/>
          <div style={{padding:"12px 0 6px",borderBottom:"1px solid var(--line)"}}>
            <div style={{...S.row,gap:10,marginBottom:10}}>
              <span style={{fontSize:24}}>{cur.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontSize:14,fontWeight:600}}>{cur.name}</p>
                <p style={{fontSize:12,color:"var(--muted)"}}>Level {cur.level} of {LEVELS.length}</p>
              </div>
              <span style={{...S.display,fontSize:20,fontWeight:300,color:"var(--primary)"}}>{points} pts</span>
            </div>
            <div style={{height:5,background:"var(--line)",borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:prog+"%",background:"var(--primary)",borderRadius:4}}/>
            </div>
          </div>
          <MenuRow icon="🤝" label="Redeem points" sub="Donate to causes you care about" onClick={open("redeem")}/>
          <MenuRow icon="⭐" label="How to earn" sub="See all ways to gain points" onClick={open("rewards")} noBorder/>
        </Card>

        <Card style={{padding:"0 20px"}}>
          <SecLabel label="Security"/>
          <MenuRow icon="🔐" label="Two-factor authentication"
            sub="Require a code from your phone at sign-in"
            onClick={open("security")} noBorder/>
        </Card>

        <Card style={{padding:"0 20px"}}>
          <SecLabel label="Privacy & Legal"/>
          <MenuRow icon="📄" label="Privacy Policy" sub="How we handle your data" onClick={open("privacy")}/>
          <MenuRow icon="🗑️" label="Delete my account" sub="Permanently erase all of your data" danger
            onClick={handleDeleteAccount}
            right={deleting?<Spinner size={14}/>:undefined} noBorder/>
        </Card>

        <button onClick={onLogout} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:14,padding:"15px",fontSize:15,fontWeight:500,cursor:"pointer",color:"var(--danger)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,minHeight:48}}>
          ⏻ Log out
        </button>
        <p style={{textAlign:"center",fontSize:12,color:"var(--subtle)",paddingBottom:8}}>flo·w v1.0.0 · Made with care</p>
      </div>

      {section==="profile"&&(
        <Sheet title="Personal info" onClose={close}>
          <div style={{...S.col,padding:"20px 22px calc(36px + env(safe-area-inset-bottom))",overflowY:"auto",flex:1,minHeight:0}}>
            <Field label="Full name" htmlFor="p-name">
              <input id="p-name" value={pForm.name} onChange={e=>setPForm(p=>({...p,name:e.target.value}))} style={S.input} autoComplete="name"/>
            </Field>
            <Field label="Email" htmlFor="p-email">
              <input id="p-email" value={pForm.email} onChange={e=>setPForm(p=>({...p,email:e.target.value}))} style={S.input} type="email" autoComplete="email" autoCapitalize="none"/>
            </Field>
            <Field label="Phone" htmlFor="p-phone">
              <input id="p-phone" value={pForm.phone} onChange={e=>setPForm(p=>({...p,phone:e.target.value}))} style={S.input} type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 123 4567"/>
            </Field>

            {saveErr&&<p role="alert" style={{fontSize:13,color:"var(--danger)"}}>{saveErr}</p>}
            <button onClick={saveProfile} disabled={saving} style={S.darkBtn({marginTop:4,opacity:saving?.6:1,minHeight:46})}>
              {saving?"Saving…":"Save changes"}
            </button>
          </div>
        </Sheet>
      )}

      {section==="accounts"&&(
        <Sheet title="Linked accounts" subtitle="Powered by Plaid — we never see your credentials" onClose={close}>
          <div style={{...S.col,padding:"16px 20px calc(36px + env(safe-area-inset-bottom))",overflowY:"auto",flex:1,minHeight:0}}>
            <ErrorBanner message={accountsError} onRetry={reloadAccounts}/>
            {accountsLoading && !accounts?.length ? (
              <SkeletonList rows={2}/>
            ) : (
              <>
                {!accounts?.length&&<p style={{fontSize:14,color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>No accounts linked yet.</p>}
                {(accounts||[]).map(a=>{
                  const isRemoving = removingId===a.id;
                  return(
                    <div key={a.id} style={{border:"1px solid var(--line)",borderRadius:13,padding:"14px 16px",...S.between,gap:10,opacity:isRemoving?.5:1,transition:"opacity .2s"}}>
                      <div style={{...S.row,gap:12,minWidth:0}}>
                        <div style={S.iconBox("var(--line)")}>🏦</div>
                        <div style={{minWidth:0}}>
                          <p style={{fontSize:14,fontWeight:500}}>{a.name}</p>
                          <p style={{fontSize:12,color:"var(--muted)"}}>{a.institution_name} ···· {a.mask}</p>
                          {a.balance_current!=null&&<p style={{fontSize:12,color:"var(--muted)"}}>{fmtDec(a.balance_current)}</p>}
                          {a.item_status!=="good"&&<p style={{fontSize:11,color:"var(--danger)",fontWeight:600,marginTop:2}}>⚠️ Re-link required</p>}
                        </div>
                      </div>
                      <button onClick={()=>handleRemoveAccount(a)} disabled={isRemoving} style={S.quietBtn({background:"var(--danger-bg)",color:"var(--danger)",flexShrink:0,minHeight:34})}>
                        {isRemoving?<Spinner size={12}/>:"Remove"}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
            {linkError && (
              <div role="alert" style={{background:"var(--danger-bg)",border:"1px solid var(--danger-line)",borderRadius:12,padding:"12px 14px"}}>
                <p style={{fontSize:13,color:"var(--danger)"}}>⚠️ {linkError}</p>
              </div>
            )}
            <button onClick={openPlaidLink} disabled={linking} style={S.darkBtn({opacity:linking?.6:1,minHeight:46})}>
              {linking?"Opening Plaid…":"+ Link a bank account"}
            </button>
            <p style={{fontSize:11,color:"var(--muted)",textAlign:"center",lineHeight:1.6}}>
              🔒 Your bank credentials are handled by Plaid. We only receive transaction data.
            </p>
          </div>
        </Sheet>
      )}

      {(section==="rewards"||section==="redeem")&&(
        <Sheet
          title={section==="redeem" ? "Redeem points" : "Rewards"}
          subtitle={section==="redeem" ? `${points} pts available` : "Levels, points, and charitable giving"}
          onClose={close}>
          <div style={{overflowY:"auto",flex:1,minHeight:0,padding:"16px 16px calc(36px + env(safe-area-inset-bottom))"}}>
            <RewardsContent points={points} redeemed={redeemed} earn={earn} redeem={redeem} startOnRedeem={section==="redeem"}/>
          </div>
        </Sheet>
      )}

      {section==="security"&&(
        <Sheet title="Security" subtitle="Two-factor authentication" onClose={close}>
          <div style={{overflowY:"auto",flex:1,minHeight:0,padding:"4px 16px calc(36px + env(safe-area-inset-bottom))"}}>
            <MfaSettings/>
          </div>
        </Sheet>
      )}

      {section==="privacy"&&<PrivacyModal onClose={close}/>}
    </>
  );
}
