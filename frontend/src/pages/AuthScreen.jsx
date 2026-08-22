import { useState } from "react";
import { authApi, ApiError } from "../api.js";
import { S } from "../styles.js";
import { Spinner } from "../components/ui.jsx";

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

  const strength = (() => {
    if(!password.length) return null;
    if(password.length<8)  return {label:"Too short",color:"var(--rose)",w:"25%"};
    if(!/[A-Z]/.test(password)||!/[0-9]/.test(password)) return {label:"Fair",color:"var(--gold)",w:"55%"};
    if(password.length<12) return {label:"Good",color:"var(--gold)",w:"75%"};
    return {label:"Strong",color:"var(--sage)",w:"100%"};
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
      onAuth(res.user);
    } catch(err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  // fontSize 16 is load-bearing: iOS Safari auto-zooms the viewport when a
  // focused input is smaller than 16px, which visibly jerks the whole page.
  const IS={width:"100%",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"13px 16px",color:"#F5F0E8",fontSize:16,outline:"none"};
  const toggle=()=>{setMode(m=>m==="login"?"register":"login");setError("");};

  return(
    <div style={{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#1A1714",padding:24}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:44}}>
          <span style={{...S.serif,fontSize:36,color:"#F5F0E8",fontWeight:300,letterSpacing:"-1px"}}>flo<span style={{color:"#B8882A"}}>·</span>w</span>
          <p style={{color:"#C8BAA8",fontSize:14,marginTop:6}}>Your money, clearly.</p>
        </div>

        <form key={mode} onSubmit={submit} className="slide-up"
          style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"36px 32px"}}>
          <h2 style={{...S.serif,color:"#F5F0E8",fontSize:22,fontWeight:400,marginBottom:24}}>
            {mode==="login"?"Welcome back":"Create your account"}
          </h2>
          <div style={{...S.col,gap:14}}>
            {mode==="register"&&(
              <div>
                <label htmlFor="name" style={{...S.label,color:"#C8BAA8"}}>First name</label>
                <input id="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Austin" autoComplete="given-name" style={IS}/>
              </div>
            )}
            <div>
              <label htmlFor="email" style={{...S.label,color:"#C8BAA8"}}>Email</label>
              <input id="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
                type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck="false" style={IS}/>
            </div>
            <div>
              <label htmlFor="password" style={{...S.label,color:"#C8BAA8"}}>Password</label>
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
              <div role="alert" style={{background:"var(--rose-light)",border:"1px solid #e8b4b2",borderRadius:10,padding:"10px 14px"}}>
                <p style={{fontSize:13,color:"var(--rose)"}}>⚠️ {error}</p>
              </div>
            )}
            <button type="submit" disabled={loading}
              style={{...S.darkBtn(),background:loading?"rgba(255,255,255,.15)":"#B8882A",color:loading?"#C8BAA8":"#1A1714",borderRadius:12,marginTop:4,transition:"all .2s",cursor:loading?"default":"pointer",minHeight:46}}>
              {loading?<Spinner size={16}/>:mode==="login"?"Log in →":"Create account →"}
            </button>
          </div>
        </form>

        <p style={{textAlign:"center",marginTop:20,fontSize:14,color:"#C8BAA8"}}>
          {mode==="login"?"Don't have an account? ":"Already have an account? "}
          <button type="button" onClick={toggle} style={{background:"none",border:"none",color:"#B8882A",fontSize:14,cursor:"pointer",fontWeight:600,padding:0}}>
            {mode==="login"?"Sign up":"Log in"}
          </button>
        </p>
        <p style={{textAlign:"center",marginTop:16,fontSize:11,color:"rgba(200,186,168,.5)",lineHeight:1.5}}>
          By continuing you agree to our Privacy Policy.<br/>We never sell your data.
        </p>
      </div>
    </div>
  );
}
