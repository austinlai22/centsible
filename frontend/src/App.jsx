import { useState, useEffect, lazy, Suspense } from "react";
import { authApi, termsApi, disbursementsApi } from "./api.js";
import { CSS, S } from "./styles.js";
import { NAV } from "./constants.js";
import { getLevelInfo, semesterForDate } from "./lib/periods.js";
import { Sheet, PageFallback } from "./components/ui.jsx";
import { Brand } from "./components/Brand.jsx";

import { useTransactions } from "./hooks/useTransactions.js";
import { useAccounts }     from "./hooks/useApi.js";
import { useGoals }        from "./hooks/useGoals.js";
import { useBudgets }      from "./hooks/useBudgets.js";
import { useRewards }      from "./hooks/useRewards.js";
import { useTerms, useDisbursements } from "./hooks/useCalendar.js";

// Auth and onboarding are needed on first paint for a signed-out visitor, so
// they stay in the main bundle. Everything below only renders after a
// successful login, so each page ships as its own chunk that downloads while
// the shell is already interactive.
import { AuthScreen } from "./pages/AuthScreen.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";

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

export default function App(){
  // authUser.onboarded_at (from the DB) is the single source of truth for
  // whether onboarding is complete — so a refresh, a new browser, or a new
  // device all correctly skip it once it's done.
  const [authUser,setAuthUser]   = useState(null);
  const [authReady,setAuthReady] = useState(false);
  const [tab,setTab]             = useState("summary");
  const [showRewards,setShowRewards] = useState(false);

  // Gates every data hook's first fetch on a CONFIRMED session (authReady has
  // resolved AND authUser is a real user object, not the false/null it starts
  // as). Without this, each hook fired on the very first paint — before
  // authApi.me() could possibly have resolved — so every request 401'd, and
  // nothing was wired to retry once login actually succeeded. That left the
  // app stuck on demo-fallback data and a permanent "Session expired" banner
  // for the rest of the tab's life, even with a perfectly valid session.
  const authed = authReady && !!authUser;

  const txn      = useTransactions(authed);
  const accounts = useAccounts(authed);
  const goals    = useGoals(authed);
  const termsH   = useTerms(authed);
  const disbH    = useDisbursements(authed);
  const budgets  = useBudgets(authed, termsH.terms);
  const rewards  = useRewards(authed);

  useEffect(()=>{
    authApi.me()
      .then(res=>{ setAuthUser(res.user); setAuthReady(true); })
      .catch(()=>{ setAuthUser(false); setAuthReady(true); });
  },[]);

  const handleLogout=async()=>{
    try{ await authApi.logout(); }catch{ /* clear locally regardless */ }
    setAuthUser(false);
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

  if(!authReady) return(
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100dvh",background:"var(--hero)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{opacity:.6,color:"var(--hero-ink)"}}><Brand size={32} on="dark"/></span>
      </div>
    </>
  );

  if(!authUser) return(
    <><style>{CSS}</style><AuthScreen onAuth={user=>setAuthUser(user)}/></>
  );

  if(!authUser.onboarded_at) return(
    <><style>{CSS}</style><Onboarding onComplete={handleOnboardingComplete}/></>
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
                       terms={termsH.terms} reloadTerms={termsH.reload}
                       disbursements={disbH.disbursements} reloadDisbursements={disbH.reload}
                       onLogout={handleLogout}/>,
  };
  const Page=PAGE[tab]||PAGE.summary;

  return(
    <>
      <style>{CSS}</style>
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
            <button className="sidebar-item" onClick={()=>setShowRewards(true)} title="Rewards">
              <span style={{fontSize:17,lineHeight:1}}>{lvl.icon}</span>
              <span className="sidebar-label">{rewards.points} pts</span>
            </button>
          </div>
        </nav>

        <div className="main">
          <header className="topbar">
            <span className="topbar-brand"><Brand/></span>
            <span style={{fontSize:15,fontWeight:600,display:"none"}}/>
            <button onClick={()=>setShowRewards(true)}
              style={{...S.row,gap:7,background:"var(--hero)",border:"none",borderRadius:20,padding:"7px 14px",cursor:"pointer",marginLeft:"auto",minHeight:38}}>
              <span style={{fontSize:14}}>{lvl.icon}</span>
              <span style={{fontSize:12,color:"var(--hero-ink)",fontWeight:500}}>{lvl.name}</span>
              <span style={{fontSize:12,color:"var(--hero-accent)",fontWeight:700}}>{rewards.points} pts</span>
            </button>
          </header>

          <main className="content">
            <Suspense fallback={<PageFallback/>}>
              <Page/>
            </Suspense>
          </main>
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
