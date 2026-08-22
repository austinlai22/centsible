import { useState, useEffect } from "react";
import { mfaApi } from "../api.js";
import { S } from "../styles.js";
import { Card, Field, Spinner } from "./ui.jsx";

/**
 * Two-factor setup, shown inside About → Security.
 *
 * The enrolment order is deliberate: scan → prove a code → THEN switch on and
 * hand over recovery codes. Enabling first and verifying later produces
 * accounts protected by a secret the user's app may never have scanned
 * correctly, and the owner only finds out at their next sign-in.
 */

/** Recovery codes are displayed exactly once — never retrievable again. */
function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // clipboard blocked; the codes are selectable on screen
    }
  };

  return (
    <div style={{...S.col, gap:14}}>
      <div style={{background:"var(--gold-light)",border:"1px solid var(--gold)",borderRadius:12,padding:"14px 16px"}}>
        <p style={{fontSize:14,fontWeight:600,color:"var(--gold)",marginBottom:4}}>Save these now</p>
        <p style={{fontSize:13,color:"var(--gold)",lineHeight:1.55}}>
          This is the only time these codes are shown. Each one works once, and they're
          the only way back into your account if you lose your phone.
        </p>
      </div>
      <div style={{background:"var(--sand)",borderRadius:12,padding:"16px",display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"8px 16px"}}>
        {codes.map(c => (
          <code key={c} style={{fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",fontSize:14,letterSpacing:".05em",userSelect:"all"}}>{c}</code>
        ))}
      </div>
      <button onClick={copy} style={S.sandBtn({padding:"12px",borderRadius:10,fontSize:14,minHeight:44})}>
        {copied ? "✓ Copied" : "Copy all codes"}
      </button>
      <button onClick={onDone} style={S.darkBtn({minHeight:46})}>I've saved them</button>
    </div>
  );
}

export function MfaSettings() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep]       = useState("idle"); // idle | enrol | codes | disable
  const [enrol, setEnrol]     = useState(null);   // { secret, uri, qr }
  const [codes, setCodes]     = useState(null);
  const [token, setToken]     = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const refresh = async () => {
    try { setStatus(await mfaApi.status()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const begin = async () => {
    setBusy(true); setError("");
    try { setEnrol(await mfaApi.startTotp()); setStep("enrol"); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setBusy(true); setError("");
    try {
      const res = await mfaApi.confirmTotp(token.replace(/\s/g, ""));
      setCodes(res.recoveryCodes);
      setStep("codes");
      setToken("");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true); setError("");
    try {
      await mfaApi.disable(password);
      setPassword(""); setStep("idle");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const regenerate = async () => {
    setBusy(true); setError("");
    try {
      const res = await mfaApi.regenerateRecoveryCodes(password);
      setPassword(""); setCodes(res.recoveryCodes); setStep("codes");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{padding:"18px 0"}}><Spinner/></div>;

  const err = error && (
    <p role="alert" style={{fontSize:13,color:"var(--rose)",marginTop:4}}>{error}</p>
  );

  if (step === "codes" && codes) {
    return (
      <Card style={{marginTop:12}}>
        <p style={{fontSize:15,fontWeight:600,marginBottom:14}}>Your recovery codes</p>
        <RecoveryCodes codes={codes} onDone={() => { setCodes(null); setStep("idle"); }}/>
      </Card>
    );
  }

  if (step === "enrol" && enrol) {
    return (
      <Card style={{marginTop:12}}>
        <p style={{fontSize:15,fontWeight:600,marginBottom:6}}>Set up your authenticator</p>
        <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:16}}>
          Scan this with Google Authenticator, 1Password, Authy, or any TOTP app,
          then enter the 6-digit code it shows.
        </p>
        <div style={{textAlign:"center",marginBottom:16}}>
          <img src={enrol.qr} alt="QR code for two-factor setup" width={200} height={200}
               style={{borderRadius:12,background:"#fff",maxWidth:"100%",height:"auto"}}/>
        </div>
        <button onClick={()=>setShowSecret(v=>!v)}
          style={{background:"none",border:"none",color:"var(--sky)",fontSize:12,cursor:"pointer",padding:0,marginBottom:12}}>
          {showSecret ? "Hide setup key" : "Can't scan? Enter a key instead"}
        </button>
        {showSecret && (
          <p style={{fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",fontSize:13,wordBreak:"break-all",
                     background:"var(--sand)",borderRadius:8,padding:"10px 12px",marginBottom:14,userSelect:"all"}}>
            {enrol.secret}
          </p>
        )}
        <Field label="6-digit code" htmlFor="mfa-token">
          <input id="mfa-token" value={token} autoFocus autoComplete="one-time-code" inputMode="numeric"
            onChange={e=>setToken(e.target.value.replace(/[^0-9]/g,"").slice(0,6))}
            onKeyDown={e=>e.key==="Enter"&&token.length===6&&confirm()}
            placeholder="123456"
            style={{...S.input,textAlign:"center",letterSpacing:"0.4em",fontSize:20}}/>
        </Field>
        {err}
        <div style={{...S.row,gap:10,marginTop:14}}>
          <button onClick={()=>{setStep("idle");setEnrol(null);setToken("");setError("");}}
            style={S.sandBtn({flex:1,padding:"12px",borderRadius:10,fontSize:14,minHeight:46})}>Cancel</button>
          <button onClick={confirm} disabled={busy||token.length!==6}
            style={S.darkBtn({flex:1,opacity:busy||token.length!==6?.6:1,minHeight:46})}>
            {busy ? "Verifying…" : "Turn on"}
          </button>
        </div>
      </Card>
    );
  }

  if (step === "disable") {
    return (
      <Card style={{marginTop:12}}>
        <p style={{fontSize:15,fontWeight:600,marginBottom:6}}>Turn off two-factor authentication</p>
        <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>
          Your account will be protected by your password alone. Enter it to confirm.
        </p>
        <Field label="Password" htmlFor="mfa-pw">
          <input id="mfa-pw" type="password" value={password} autoComplete="current-password"
            onChange={e=>setPassword(e.target.value)} style={S.input}/>
        </Field>
        {err}
        <div style={{...S.row,gap:10,marginTop:14}}>
          <button onClick={()=>{setStep("idle");setPassword("");setError("");}}
            style={S.sandBtn({flex:1,padding:"12px",borderRadius:10,fontSize:14,minHeight:46})}>Cancel</button>
          <button onClick={turnOff} disabled={busy||!password}
            style={S.btn("var(--rose)","#fff",{flex:1,padding:"13px",borderRadius:12,fontSize:14,opacity:busy||!password?.6:1,minHeight:46})}>
            {busy ? "Turning off…" : "Turn off"}
          </button>
        </div>
      </Card>
    );
  }

  // Idle
  return (
    <Card style={{marginTop:12}}>
      <div style={{...S.between,gap:12,marginBottom:8}}>
        <div style={{minWidth:0}}>
          <p style={{fontSize:15,fontWeight:600}}>Two-factor authentication</p>
          <p style={{fontSize:12,color:status?.enabled?"var(--sage)":"var(--muted)",marginTop:2}}>
            {status?.enabled ? "✓ On — authenticator app" : "Off"}
          </p>
        </div>
      </div>
      <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6,marginBottom:14}}>
        {status?.enabled
          ? "You'll be asked for a code from your authenticator app each time you sign in."
          : "Add a second step at sign-in, so knowing your password isn't enough to reach your finances."}
      </p>

      {status?.enabled && (
        <p style={{fontSize:12,color: status.recoveryCodesRemaining <= 2 ? "var(--rose)" : "var(--muted)", marginBottom:14}}>
          {status.recoveryCodesRemaining} recovery {status.recoveryCodesRemaining === 1 ? "code" : "codes"} left
          {status.recoveryCodesRemaining <= 2 && " — generate a new set soon"}
        </p>
      )}
      {err}

      {!status?.enabled ? (
        <button onClick={begin} disabled={busy} style={S.darkBtn({opacity:busy?.6:1,minHeight:46})}>
          {busy ? "Starting…" : "Turn on two-factor"}
        </button>
      ) : (
        <div style={{...S.col,gap:10}}>
          <Field label="Password (to change these settings)" htmlFor="mfa-pw2">
            <input id="mfa-pw2" type="password" value={password} autoComplete="current-password"
              onChange={e=>setPassword(e.target.value)} style={S.input}/>
          </Field>
          <div style={{...S.row,gap:10}}>
            <button onClick={regenerate} disabled={busy||!password}
              style={S.sandBtn({flex:1,padding:"12px",borderRadius:10,fontSize:13,minHeight:44,opacity:busy||!password?.6:1})}>
              New recovery codes
            </button>
            <button onClick={()=>{setStep("disable");setError("");}}
              style={S.sandBtn({flex:1,padding:"12px",borderRadius:10,fontSize:13,minHeight:44,background:"var(--rose-light)",color:"var(--rose)"})}>
              Turn off
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
