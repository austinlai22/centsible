import { useState } from "react";
import { authApi, mfaApi, ApiError } from "../api.js";
import { S } from "../styles.js";
import { Spinner } from "../components/ui.jsx";

const IS = {width:"100%",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"13px 16px",color:"var(--hero-ink)",fontSize:16,outline:"none"};

/**
 * The second-factor step. Reached only after the password is accepted, while
 * the browser holds the short-lived mfa_pending cookie and nothing else — the
 * user is not signed in yet, and closing this screen leaves them signed out.
 */
function MfaChallenge({ onAuth, onCancel }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await mfaApi.verify(
        useRecovery ? { recoveryCode: value.trim() } : { token: value.replace(/\s/g, "") }
      );
      onAuth(res.user);
    } catch (err) {
      setError(err.message || "That didn't work. Please try again.");
      setValue("");
    } finally { setLoading(false); }
  };

  const swap = () => { setUseRecovery(v => !v); setValue(""); setError(""); };

  return (
    <form onSubmit={submit} className="slide-up"
      style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"36px 32px"}}>
      <h2 style={{...S.display,color:"var(--hero-ink)",fontSize:22,fontWeight:400,marginBottom:8}}>Two-factor authentication</h2>
      <p style={{color:"var(--hero-muted)",fontSize:14,lineHeight:1.55,marginBottom:22}}>
        {useRecovery
          ? "Enter one of the recovery codes you saved when you turned on two-factor authentication."
          : "Enter the 6-digit code from your authenticator app."}
      </p>
      <div style={{...S.col,gap:14}}>
        <input
          value={value}
          onChange={e=>setValue(useRecovery ? e.target.value : e.target.value.replace(/[^0-9]/g,"").slice(0,6))}
          placeholder={useRecovery ? "abcd-efgh" : "123456"}
          // one-time-code lets iOS and Android offer the code from the
          // authenticator app or clipboard directly above the keyboard.
          autoComplete="one-time-code"
          inputMode={useRecovery ? "text" : "numeric"}
          autoFocus
          style={{...IS, letterSpacing: useRecovery ? "normal" : "0.4em", textAlign:"center", fontSize:20}}
        />
        {error && (
          <div role="alert" style={{background:"var(--danger-bg)",border:"1px solid var(--danger-line)",borderRadius:10,padding:"10px 14px"}}>
            <p style={{fontSize:13,color:"var(--danger)"}}>⚠️ {error}</p>
          </div>
        )}
        <button type="submit" disabled={loading || !value.trim()}
          style={{...S.darkBtn(),background:loading||!value.trim()?"rgba(255,255,255,.15)":"var(--hero-accent)",color:loading||!value.trim()?"var(--hero-muted)":"var(--hero)",borderRadius:12,minHeight:46}}>
          {loading ? <Spinner size={16}/> : "Verify →"}
        </button>
      </div>
      <div style={{marginTop:18,textAlign:"center"}}>
        <button type="button" onClick={swap} style={{background:"none",border:"none",color:"var(--hero-accent)",fontSize:13,cursor:"pointer",padding:0}}>
          {useRecovery ? "Use my authenticator app instead" : "I've lost my device — use a recovery code"}
        </button>
        <p style={{marginTop:12}}>
          <button type="button" onClick={onCancel} style={{background:"none",border:"none",color:"var(--hero-muted)",fontSize:13,cursor:"pointer",padding:0}}>
            Cancel and sign in as someone else
          </button>
        </p>
      </div>
    </form>
  );
}

/**
 * Login / register. Rendered as a real <form> so mobile keyboards show a
 * "Go" key and password managers recognise the fields — the previous version
 * wired Enter up manually per-input, which browsers can't introspect.
 */
export function AuthScreen({onAuth}){
  const [mode,setMode]     = useState("login");
  const [email,setEmail]   = useState("");
  const [password,setPass] = useState("");
  const [name,setName]     = useState("");
  const [error,setError]   = useState("");
  const [loading,setLoading] = useState(false);
  // Set when the server answers a correct password with mfaRequired. The
  // browser now holds only the 5-minute mfa_pending cookie — no session.
  const [mfaStep,setMfaStep] = useState(false);

  const strength = (() => {
    if(!password.length) return null;
    if(password.length<8)  return {label:"Too short",color:"var(--danger)",w:"25%"};
    if(!/[A-Z]/.test(password)||!/[0-9]/.test(password)) return {label:"Fair",color:"var(--warning)",w:"55%"};
    if(password.length<12) return {label:"Good",color:"var(--warning)",w:"75%"};
    return {label:"Strong",color:"var(--success)",w:"100%"};
  })();

  const submit = async (e) => {
    e?.preventDefault();
    setError("");
    if(!email.trim()||!password.trim()) return setError("Please fill in all fields.");
    if(mode==="register"&&password.length<8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      const res = mode==="login"
        ? await authApi.login(email.trim(), password)
        : await authApi.register(email.trim(), password, name.trim()||undefined);

      // Password was correct but the account has a second factor. Do NOT call
      // onAuth here — there is no session yet, and treating this as a
      // successful login would render the app against an unauthenticated
      // browser, which then 401s on every request.
      if (res.mfaRequired) { setMfaStep(true); setPass(""); return; }

      onAuth(res.user);
    } catch(err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  // IS is module-scoped above. fontSize 16 there is load-bearing: iOS Safari
  // auto-zooms the viewport when a focused input is smaller than 16px.
  const toggle=()=>{setMode(m=>m==="login"?"register":"login");setError("");};

  return(
    <div style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--hero)",padding:24}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:44}}>
          <span style={{...S.display,fontSize:36,color:"var(--hero-ink)",fontWeight:300,letterSpacing:"-1px"}}>flo<span style={{color:"var(--hero-accent)"}}>·</span>w</span>
          <p style={{color:"var(--hero-muted)",fontSize:14,marginTop:6}}>Your money, clearly.</p>
        </div>

        {mfaStep ? (
          <MfaChallenge
            onAuth={onAuth}
            onCancel={()=>{ setMfaStep(false); setPass(""); setError(""); }}
          />
        ) : (
        <form key={mode} onSubmit={submit} className="slide-up"
          style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"36px 32px"}}>
          <h2 style={{...S.display,color:"var(--hero-ink)",fontSize:22,fontWeight:400,marginBottom:24}}>
            {mode==="login"?"Welcome back":"Create your account"}
          </h2>
          <div style={{...S.col,gap:14}}>
            {mode==="register"&&(
              <div>
                <label htmlFor="name" style={{...S.label,color:"var(--hero-muted)"}}>First name</label>
                <input id="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Austin" autoComplete="given-name" style={IS}/>
              </div>
            )}
            <div>
              <label htmlFor="email" style={{...S.label,color:"var(--hero-muted)"}}>Email</label>
              <input id="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false" style={IS}/>
            </div>
            <div>
              <label htmlFor="password" style={{...S.label,color:"var(--hero-muted)"}}>Password</label>
              <input id="password" value={password} onChange={e=>setPass(e.target.value)}
                placeholder={mode==="register"?"At least 8 characters":"••••••••"} type="password"
                autoComplete={mode==="register"?"new-password":"current-password"} style={IS}/>
              {mode==="register"&&strength&&(
                <div style={{marginTop:8}}>
                  <div style={{height:3,background:"rgba(255,255,255,.1)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:strength.w,background:strength.color,borderRadius:2,transition:"width .3s"}}/>
                  </div>
                  <p style={{fontSize:11,color:strength.color,marginTop:4}}>{strength.label}</p>
                </div>
              )}
            </div>
            {error&&(
              <div role="alert" style={{background:"var(--danger-bg)",border:"1px solid var(--danger-line)",borderRadius:10,padding:"10px 14px"}}>
                <p style={{fontSize:13,color:"var(--danger)"}}>⚠️ {error}</p>
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{...S.darkBtn(),background:loading?"rgba(255,255,255,.15)":"var(--hero-accent)",color:loading?"var(--hero-muted)":"var(--hero)",borderRadius:12,marginTop:4,transition:"all .2s",cursor:loading?"default":"pointer",minHeight:46}}>
              {loading?<Spinner size={16}/>:mode==="login"?"Log in →":"Create account →"}
            </button>
          </div>
        </form>
        )}

        {!mfaStep && (
        <p style={{textAlign:"center",marginTop:20,fontSize:14,color:"var(--hero-muted)"}}>
          {mode==="login"?"Don't have an account? ":"Already have an account? "}
          <button type="button" onClick={toggle} style={{background:"none",border:"none",color:"var(--hero-accent)",fontSize:14,cursor:"pointer",fontWeight:600,padding:0}}>
            {mode==="login"?"Sign up":"Log in"}
          </button>
        </p>
        )}
        <p style={{textAlign:"center",marginTop:16,fontSize:11,color:"rgba(200,186,168,.5)",lineHeight:1.5}}>
          By continuing you agree to our Privacy Policy.<br/>We never sell your data.
        </p>
      </div>
    </div>
  );
}
