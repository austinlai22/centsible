import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { authApi, termsApi, disbursementsApi } from "./api.js";
import { CSS, S } from "./styles.js";
import { NAV } from "./constants.js";
import { getLevelInfo, semesterForDate } from "./lib/periods.js";
import { Sheet, PageFallback, SkeletonBlock } from "./components/ui.jsx";
import { Brand } from "./components/Brand.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { usePath, navigate, readSessionHint, writeSessionHint } from "./lib/router.js";

import { useTransactions } from "./hooks/useTransactions.js";
import { useAccounts }     from "./hooks/useApi.js";
import { useGoals }        from "./hooks/useGoals.js";
import { useBudgets }      from "./hooks/useBudgets.js";
import { useRewards }      from "./hooks/useRewards.js";
import { useTerms, useDisbursements } from "./hooks/useCalendar.js";

// Landing and AuthScreen stay in the main bundle: one of the two is the first
// paint for every signed-out visitor, and the other is a single click behind
// it — a Suspense flash on "Log in" is worse than the bytes.
//
// Onboarding used to sit here too, from when the auth form was the root URL
// and onboarding was one step behind it. With the landing page in front, it
// is two navigations deep and cannot be reached without a network round-trip
// to register first, which is more than enough time for its chunk to arrive.
import { Landing } from "./pages/Landing.jsx";
import { AuthScreen } from "./pages/AuthScreen.jsx";

const Onboarding   = lazy(() => import("./pages/Onboarding.jsx").then(m => ({ default: m.Onboarding })));
const Summary      = lazy(() => import("./pages/Summary.jsx"));
const Budget       = lazy(() => import("./pages/Budget.jsx"));
const Transactions = lazy(() => import("./pages/Transactions.jsx"));
const Goals        = lazy(() => import("./pages/Goals.jsx"));
const About        = lazy(() => import("./pages/About.jsx"));
const RewardsSheet = lazy(() => import("./pages/Rewards.jsx").then(m => ({ default: m.RewardsContent })));

/**
 * The wordmark renders on two different surfaces — the light sidebar and the
 * dark loading splash — so the accent dot takes the surface as a prop.
 * --hero-accent is a mint tuned for contrast against the dark panel; on white
 * it drops to roughly 2:1 and the dot effectively disappears, turning the
 * wordmark into "flo w".
 */

/**
 * The four URLs this app has.
 *
 * "/" is public and stays public for everyone, signed in or not: the landing
 * page is the front door, not a redirect gate. A signed-in visitor who types
 * the bare domain gets the marketing page with a button into their account,
 * which is how every consumer bank site behaves — bouncing them straight
 * into the app would mean they could never read their own pricing or FAQ
 * page again without logging out.
 *
 * Anything not listed here is canonicalised to "/" rather than 404ing;
 * there is no content at any other path to be wrong about.
 */
const ROUTES = { "/": "landing", "/login": "login", "/signup": "signup", "/app": "app" };

/** The splash, for the brief moments where there is genuinely nothing to draw. */
const Splash = () => (
  <div style={{minHeight:"100dvh",background:"var(--hero)",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <span style={{opacity:.6,color:"var(--hero-ink)"}}><Brand size={32} on="dark"/></span>
  </div>
);

/**
 * The app chrome — sidebar, top bar, bottom tab bar — around whichever page
 * is showing.
 *
 * Extracted so the loading state can render the SAME shell instead of
 * replacing the entire screen with a splash. On free-tier hosting the
 * session check is a cold start that can run to a minute, and a dark screen
 * holding nothing but a wordmark for that long is indistinguishable from a
 * site that has crashed — which is exactly what people assume. None of this
 * furniture ever depended on the answer: the nav, the brand and the layout
 * are knowable immediately, so they should be on screen immediately.
 *
 * `pending` means the session itself has not resolved, so the rewards pill
 * has no value to show. It renders a skeleton rather than what
 * getLevelInfo(0) would return — "🌱 Seedling · 0 pts" is a real state a real
 * account can be in, so showing it to someone holding 400 points is not a
 * placeholder, it is a wrong number. The nav stays live: picking a tab while
 * the session loads is a preference the app can honour once it arrives.
 */
function AppShell({ tab, setTab, onRewards, level, points, pending = false, children }) {
  return (
    <div className="shell">

      {/* Sidebar — tablet/desktop only; collapses to an icon rail 768–1023 */}
      <nav className="sidebar" aria-label="Main">
        <div style={{padding:"0 12px 20px"}}>
          <span className="sidebar-brand-text"><Brand size={24}/></span>
        </div>
        {NAV.map(n=>(
          <button key={n.id} className="sidebar-item" onClick={()=>setTab(n.id)}
            aria-current={tab===n.id?"page":undefined} title={n.label}>
            <span style={{fontSize:17,lineHeight:1}}>{n.icon}</span>
            <span className="sidebar-label">{n.label}</span>
          </button>
        ))}
        <div style={{marginTop:"auto"}}>
          <button className="sidebar-item" onClick={onRewards} title="Rewards" disabled={pending}>
            {pending ? <SkeletonBlock height={17} width={17} radius={5}/>
                     : <span style={{fontSize:17,lineHeight:1}}>{level.icon}</span>}
            <span className="sidebar-label">
              {pending ? <SkeletonBlock height={11} width={54}/> : `${points} pts`}
            </span>
          </button>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <span className="topbar-brand"><Brand/></span>
          <span style={{fontSize:15,fontWeight:600,display:"none"}}/>
          <button onClick={onRewards} disabled={pending}
            style={{...S.row,gap:7,background:"var(--hero)",border:"none",borderRadius:20,padding:"7px 14px",cursor:pending?"default":"pointer",marginLeft:"auto",minHeight:38}}>
            {pending ? (
              /* Sized to roughly what the real pill occupies, so the top bar
                 does not jump sideways the moment the session lands. */
              <SkeletonBlock height={12} width={96} radius={6}/>
            ) : (
              <>
                <span style={{fontSize:14}}>{level.icon}</span>
                <span style={{fontSize:12,color:"var(--hero-ink)",fontWeight:500}}>{level.name}</span>
                <span style={{fontSize:12,color:"var(--hero-accent)",fontWeight:700}}>{points} pts</span>
              </>
            )}
          </button>
        </header>

        <main className="content">{children}</main>
      </div>

      {/* Bottom tab bar — phones only */}
      <nav className="bottomnav" aria-label="Main">
        {NAV.map(n=>(
          <button key={n.id} className="bottomnav-item" onClick={()=>setTab(n.id)}
            aria-current={tab===n.id?"page":undefined}>
            <span style={{fontSize:16,color:tab===n.id?"var(--hero)":"var(--subtle)",transition:"color .15s"}}>{n.icon}</span>
            <span style={{fontSize:9,fontWeight:tab===n.id?700:400,color:tab===n.id?"var(--hero)":"var(--subtle)",letterSpacing:".3px"}}>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App(){
  // authUser.onboarded_at (from the DB) is the single source of truth for
  // whether onboarding is complete — so a refresh, a new browser, or a new
  // device all correctly skip it once it's done.
  const [authUser,setAuthUser]   = useState(null);
  const [authReady,setAuthReady] = useState(false);
  const [tab,setTab]             = useState("summary");
  const [showRewards,setShowRewards] = useState(false);

  const path  = usePath();
  const route = ROUTES[path] ?? null;

  // Gates every data hook's first fetch on a CONFIRMED session (authReady has
  // resolved AND authUser is a real user object, not the false/null it starts
  // as). Without this, each hook fired on the very first paint — before
  // authApi.me() could possibly have resolved — so every request 401'd, and
  // nothing was wired to retry once login actually succeeded. That left the
  // app stuck on demo-fallback data and a permanent "Session expired" banner
  // for the rest of the tab's life, even with a perfectly valid session.
  //
  // route==="app" is the second half of that gate, and it is about the
  // landing page specifically: "/" is public and now renders for signed-in
  // visitors too, so without it a marketing page would fire seven authed API
  // calls at a backend that sleeps when idle — waking it, and spending a cold
  // start, for a reader who may never sign in. useApi re-runs when `enabled`
  // flips, so the data loads on arrival at /app instead.
  const authed = authReady && !!authUser && route === "app";

  const txn      = useTransactions(authed);
  const accounts = useAccounts(authed);
  const goals    = useGoals(authed);
  const termsH   = useTerms(authed);
  const disbH    = useDisbursements(authed);
  const budgets  = useBudgets(authed, termsH.terms);
  const rewards  = useRewards(authed);

  useEffect(()=>{
    authApi.me()
      .then(res=>{ setAuthUser(res.user);  setAuthReady(true); writeSessionHint(true); })
      .catch(()=>{ setAuthUser(false);     setAuthReady(true); writeSessionHint(false); });
  },[]);

  // Redirects, as an effect rather than inline in render: navigate() writes to
  // window.history and dispatches an event, and doing that during a render
  // means mutating global state while React is deciding what to draw.
  useEffect(()=>{
    // A URL with nothing behind it. replace, not push, so Back doesn't
    // return to the address that was never a page.
    if(route===null) return navigate("/", {replace:true});
    if(!authReady) return;
    // Already signed in and asking for the login form — send them where they
    // were actually trying to go.
    if((route==="login"||route==="signup") && authUser) navigate("/app", {replace:true});
    // The one genuinely protected route. The server enforces this too; this
    // only avoids rendering a shell that would 401 on every request.
    if(route==="app" && !authUser) navigate("/login", {replace:true});
  },[route,authReady,authUser]);

  /**
   * Everything that has to be refetched when a bank is linked or unlinked.
   *
   * Both events change more than the account list, and the server has
   * already done the work by the time the client hears about it:
   *
   *   unlink — DELETE /plaid/items cascades through plaid_item_id, so that
   *            bank's TRANSACTIONS are deleted along with its accounts
   *   link   — POST /plaid/exchange runs syncItem before it responds, so a
   *            new bank's transactions exist the moment the modal closes
   *
   * Each call site used to reload only the accounts, which left Activity,
   * Summary and Budget showing a removed bank's spending — and the runway
   * computing against it — until the user happened to reload the page.
   *
   * It lives here rather than in About because App owns the hooks, so the
   * knowledge of WHICH caches bank data feeds stays in one place. A page
   * that mutates a bank should not also have to remember that transactions
   * are downstream of it; that is the coupling that let this rot in the
   * first place, and that would rot again the next time a hook is added.
   */
  const refreshBankData=useCallback(
    ()=>Promise.all([accounts.reload(), txn.reload()]),
    [accounts.reload, txn.reload]
  );

  const handleLogout=async()=>{
    try{ await authApi.logout(); }catch{ /* clear locally regardless */ }
    setAuthUser(false);
    writeSessionHint(false);
    navigate("/");   // back to the landing page, not the login form
  };

  const handleOnboardingComplete = async (answers) => {
    try {
      const res = await authApi.completeOnboarding({ name: answers.name });
      setAuthUser(res.user);

      // Persist the term they entered, if they gave one. Non-fatal: onboarding
      // has already succeeded on the server, and the runway falls back to the
      // built-in calendar until they set this in Settings.
      if (answers.term?.start && answers.term?.end) {
        try {
          // Name it after the season it starts in — "Fall 2026" rather than
          // "Term 2026". Editable in Settings for schools that name terms
          // differently (Michaelmas, Q1, and so on).
          const startDate = new Date(answers.term.start + "T12:00:00");
          const season = semesterForDate(startDate).name;
          await termsApi.create({
            name: `${season} ${startDate.getFullYear()}`,
            start_date: answers.term.start,
            end_date: answers.term.end,
          });
          await termsH.reload();
        } catch { /* correctable later in Settings */ }
      }

    } catch (e) {
      alert("Couldn't save your info — please try again. (" + e.message + ")");
    }
  };

  /**
   * "/" — public, and rendered IMMEDIATELY, without waiting on authApi.me().
   *
   * This is the one route that must not block on the session. The API sleeps
   * when idle, so a cold start is tens of seconds, and gating the landing
   * page on it would show a first-time visitor a splash screen for the whole
   * of that — for an answer ("you are not signed in") that has no bearing on
   * anything they came to read. Landing takes the session as three states and
   * renders its own call to action from the cached hint until the real answer
   * arrives.
   */
  if(route==="landing" || route===null) return(
    <>
      <style>{CSS}</style>
      <Landing
        authReady={authReady}
        signedIn={authReady ? !!authUser : readSessionHint()}
        userName={authUser?.name || ""}
        onLogin={()=>navigate("/login")}
        onSignup={()=>navigate("/signup")}
        onOpenApp={()=>navigate("/app")}/>
    </>
  );

  if(route==="login" || route==="signup"){
    // Hold the splash while a signed-in visitor is being bounced to /app by
    // the redirect effect — rendering a login form for a fraction of a second
    // to someone who is already logged in is worse than a beat of nothing.
    if(authReady && authUser) return <><style>{CSS}</style><Splash/></>;
    return(
      <>
        <style>{CSS}</style>
        <AuthScreen
          mode={route==="signup" ? "register" : "login"}
          onModeChange={m=>navigate(m==="register" ? "/signup" : "/login")}
          onAuth={user=>{ writeSessionHint(true); setAuthUser(user); navigate("/app"); }}
          onBack={()=>navigate("/")}/>
      </>
    );
  }

  // From here down is /app, which the redirect effect guarantees is reached
  // only with a resolved, signed-in session.
  //
  // While the session is still in flight, show the app's own furniture with
  // skeletons in it rather than a splash — but only when the cached hint says
  // this person is probably signed in. Without that check, someone who is NOT
  // signed in would spend the whole cold start looking at a convincing empty
  // dashboard before being bounced to the login form, which is a worse lie
  // than a blank screen. The hint is wrong rarely and cheaply; see
  // lib/router.js.
  if(!authReady) return(
    <>
      <style>{CSS}</style>
      {readSessionHint() ? (
        <AppShell tab={tab} setTab={setTab} pending><PageFallback/></AppShell>
      ) : <Splash/>}
    </>
  );

  // Known signed out. The redirect effect is already sending them to /login,
  // so this is a frame or two, not a screen anyone reads.
  if(!authUser) return <><style>{CSS}</style><Splash/></>;

  if(!authUser.onboarded_at) return(
    <>
      <style>{CSS}</style>
      {/* Onboarding is its own chunk now; the splash is the same dark panel
          the app already shows while the session resolves, so a slow network
          reads as a continuation rather than a new blank screen. */}
      <Suspense fallback={<Splash/>}>
        <Onboarding onComplete={handleOnboardingComplete}/>
      </Suspense>
    </>
  );

  const {cur:lvl}=getLevelInfo(rewards.points);

  // profile is derived entirely from authUser — the server is the only source
  // of truth. setProfile passed to children is really setAuthUser, so an edit
  // in About flows back into the same state this component gates on.
  const profile = {
    name:    authUser.name || "",
    email:   authUser.email || "",
    phone:   authUser.phone || "",
    income:  authUser.income,
    goal:    authUser.financial_goal,
    housing: authUser.housing_cost,
    style:   authUser.spending_style,
  };

  const rewardProps={
    points:   rewards.points,
    redeemed: rewards.history,
    earn:     rewards.earn,
    redeem:   rewards.redeem,
  };

  const PAGE={
    summary: ()=><Summary profile={profile} user={authUser} setUser={setAuthUser}
                   transactions={txn.transactions} goals={goals.goals}
                   points={rewards.points} accounts={accounts.accounts}
                   terms={termsH.terms} disbursements={disbH.disbursements}
                   reloadDisbursements={disbH.reload}
                   loading={txn.loading} error={txn.error} reload={txn.reload}/>,
    budget: ()=><Budget transactions={txn.transactions}
                  budgets={budgets.budgets} setBudgets={budgets.setBudgets}
                  budgetsLoading={budgets.loading} budgetsError={budgets.error} reloadBudgets={budgets.reload}
                  txnLoading={txn.loading} txnError={txn.error} reloadTxns={txn.reload}
                  period={budgets.period} setPeriod={budgets.setPeriod}
                  refDate={budgets.refDate} setRefDate={budgets.setRefDate} goToToday={budgets.goToToday}
                  terms={termsH.terms}/>,
    transactions: ()=><Transactions {...txn}/>,
    goals:        ()=><Goals {...goals}/>,
    about:        ()=><About profile={profile} setProfile={setAuthUser} {...rewardProps}
                       accounts={accounts.accounts} accountsLoading={accounts.loading}
                       accountsError={accounts.error} reloadAccounts={accounts.reload}
                       refreshBankData={refreshBankData}
                       terms={termsH.terms} reloadTerms={termsH.reload}
                       disbursements={disbH.disbursements} reloadDisbursements={disbH.reload}
                       onLogout={handleLogout}/>,
  };
  const Page=PAGE[tab]||PAGE.summary;

  return(
    <>
      <style>{CSS}</style>
      <AppShell tab={tab} setTab={setTab} onRewards={()=>setShowRewards(true)}
        level={lvl} points={rewards.points}>
        {/* Keyed on the tab so switching away from a broken page clears
            the error instead of showing it on the next one too. */}
        <ErrorBoundary variant="page" key={tab}>
          <Suspense fallback={<PageFallback/>}>
            <Page/>
          </Suspense>
        </ErrorBoundary>
      </AppShell>

      {showRewards&&(
        <Sheet title="Rewards" onClose={()=>setShowRewards(false)} zIndex={150}>
          <div style={{overflowY:"auto",flex:1,minHeight:0,padding:"16px 14px calc(48px + env(safe-area-inset-bottom))"}}>
            <Suspense fallback={<PageFallback/>}>
              <RewardsSheet {...rewardProps}/>
            </Suspense>
          </div>
        </Sheet>
      )}
    </>
  );
}
