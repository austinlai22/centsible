import { useState, useRef, useEffect, useCallback } from "react";
import { authApi, plaidApi, transactionsApi, goalsApi, budgetsApi, rewardsApi, api, ApiError } from "./api.js";

/* ─── Global styles ──────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;0,500;0,600;1,300&family=DM+Sans:wght@300;400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --cream:#F5F0E8;--sand:#E8DFD0;--stone:#C8BAA8;--ink:#1A1714;
    --muted:#6B6259;--sage:#4A6741;--sage-light:#E8F0E6;
    --rose:#C0413A;--rose-light:#FAE8E7;--gold:#B8882A;
    --gold-light:#FDF3DC;--sky:#2A5C8A;--sky-light:#E4EEF7;
  }
  body{background:var(--cream);font-family:'DM Sans',sans-serif;color:var(--ink)}
  input,select{font-family:'DM Sans',sans-serif}
  ::-webkit-scrollbar{width:4px}
  ::-webkit-scrollbar-thumb{background:var(--stone);border-radius:4px}
  @keyframes slideUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
  .slide-up{animation:slideUp .3s ease both}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .fade-in{animation:fadeIn .22s ease both}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{animation:spin 1s linear infinite;display:inline-block}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
`;

/* ─── Formatters ─────────────────────────────────────────────────────────────── */
const fmt    = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
const fmtDec = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const pct    = (a,b) => b===0 ? 0 : Math.min(100, Math.round((a/b)*100));

/* ─── Style helpers ──────────────────────────────────────────────────────────── */
const S = {
  serif:   {fontFamily:"Fraunces,serif"},
  label:   {fontSize:11,color:"var(--muted)",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.8},
  input:   {width:"100%",border:"1px solid var(--sand)",borderRadius:10,padding:"11px 13px",fontSize:15,outline:"none"},
  row:     {display:"flex",alignItems:"center",gap:12},
  col:     {display:"flex",flexDirection:"column",gap:14},
  between: {display:"flex",justifyContent:"space-between",alignItems:"center"},
  iconBox: (colorLight,size=38) => ({width:size,height:size,borderRadius:10,background:colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.47,flexShrink:0}),
  pill:    (bg,color) => ({background:bg,color,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:500,whiteSpace:"nowrap"}),
  btn:     (bg,color,extra={}) => ({background:bg,color,border:"none",borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",...extra}),
  darkBtn: (extra={}) => ({background:"#1A1714",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",width:"100%",...extra}),
  sandBtn: (extra={}) => ({background:"var(--sand)",color:"var(--muted)",border:"none",borderRadius:7,padding:"4px 10px",fontSize:12,cursor:"pointer",...extra}),
};

/* ─── Static / seed data ─────────────────────────────────────────────────────── */
const LEVELS = [
  {level:1,name:"Seedling",   icon:"🌱",min:0,    color:"#4A6741"},
  {level:2,name:"Budgeter",   icon:"🌿",min:200,  color:"#2A5C8A"},
  {level:3,name:"Saver",      icon:"🌳",min:500,  color:"#B8882A"},
  {level:4,name:"Strategist", icon:"⚡",min:1000, color:"#7B5EA7"},
  {level:5,name:"Flow Master",icon:"🔥",min:2000, color:"#C0413A"},
];
const CHARITIES = [
  {id:1,name:"GiveDirectly",        cause:"Poverty relief",cost:50, logo:"🤝",desc:"Direct cash transfers to families living in extreme poverty."},
  {id:2,name:"Cool Earth",          cause:"Climate action", cost:75, logo:"🌍",desc:"Works with rainforest communities to halt deforestation."},
  {id:3,name:"Malaria Consortium",  cause:"Global health",  cost:100,logo:"🏥",desc:"Prevents and treats malaria across sub-Saharan Africa."},
  {id:4,name:"Wikimedia Foundation",cause:"Open knowledge", cost:50, logo:"📚",desc:"Keeps Wikipedia and free knowledge accessible to all."},
  {id:5,name:"Food Bank Network",   cause:"Food security",  cost:40, logo:"🥗",desc:"Distributes meals to food-insecure families across the U.S."},
  {id:6,name:"Rainforest Alliance", cause:"Sustainability", cost:60, logo:"🌿",desc:"Protects forests and promotes sustainable farming practices."},
];
// Display label + point value + the server-side action key (must match
// EARN_ACTIONS in server/routes/rewards.js — the server, not the client,
// determines the actual point value awarded).
const EARN_ACTIONS = [
  {action:"Stay under budget in any category",  pts:25, key:"stay_under_budget"},
  {action:"Log transactions 7 days in a row",   pts:30, key:"log_streak_7_days"},
  {action:"Hit your 20%+ savings rate target",  pts:50, key:"hit_savings_rate"},
  {action:"Add funds toward a savings goal",    pts:15, key:"add_goal_funds"},
  {action:"Set a spending limit on a category", pts:10, key:"set_spending_limit"},
  {action:"Complete your monthly budget review",pts:20, key:"complete_monthly_review"},
];
// Each category is tagged with a `period`:
//   "monthly"  — recurring (e.g. Food, Transport) — user enters ONE monthly
//                budget number; the semester total shown in Semester view is
//                derived by multiplying that monthly number by however many
//                months are actually in the active semester (Fall/Spring are
//                ~4mo, Winter ~1mo, Summer ~3mo — see semesterMonthCount()).
//   "semester" — one-time/termly (e.g. Tuition, Moving) — user enters ONE
//                flat budget number for the whole semester directly; there's
//                no natural "monthly rate" for a lump-sum tuition payment,
//                so no derivation happens for these.
// This tag ALSO determines which categories appear in the transaction-entry
// form's category dropdown once the user picks "Monthly" vs "One-time" as
// the transaction type — see the Transactions component.
// It does NOT hide categories from either Budget view — Month view and
// Semester view both always show every category; the toggle only changes
// (a) which date window actual spending is summed over, and (b) for
// monthly categories, whether the displayed budget number is the raw
// monthly figure or the derived semester total.
const CATEGORY_META = {
  Housing:        {icon:"🏠",color:"#2A5C8A",colorLight:"#E4EEF7",period:"monthly"},
  Food:           {icon:"🍔",color:"#B8882A",colorLight:"#FDF3DC",period:"monthly"},
  Transport:      {icon:"🚗",color:"#6B6259",colorLight:"#E8DFD0",period:"monthly"},
  Health:         {icon:"💊",color:"#4A6741",colorLight:"#E8F0E6",period:"monthly"},
  Shopping:       {icon:"🛍️",color:"#C0413A",colorLight:"#FAE8E7",period:"monthly"},
  Entertainment:  {icon:"🎬",color:"#7B5EA7",colorLight:"#F3EEF9",period:"monthly"},
  Savings:        {icon:"💰",color:"#4A6741",colorLight:"#E8F0E6",period:"monthly"},
  Other:          {icon:"📦",color:"#C8BAA8",colorLight:"#E8DFD0",period:"monthly"},
  // ── Student categories — termly/one-time expenses, shown in Semester view ──
  Tuition:        {icon:"🎓",color:"#8B3A62",colorLight:"#F7E8EF",period:"semester"},
  HousingDeposit: {icon:"🔑",color:"#2A5C8A",colorLight:"#E4EEF7",period:"semester",label:"Housing Deposit"},
  HealthInsurance:{icon:"🩺",color:"#4A6741",colorLight:"#E8F0E6",period:"semester",label:"Health Insurance"},
  BooksSupplies:  {icon:"📚",color:"#B8882A",colorLight:"#FDF3DC",period:"semester",label:"Books & Supplies"},
  Moving:         {icon:"🚚",color:"#6B6259",colorLight:"#E8DFD0",period:"semester"},
};
// Helper: display label for a category — uses the explicit `label` override
// if present (needed for multi-word names that aren't valid as-typed, like
// "Books & Supplies"), otherwise the key itself.
const categoryLabel = (key) => CATEGORY_META[key]?.label || key;

// Shown when the backend isn't connected (demo / artifact mode)
// Demo data shown when the backend isn't reachable (artifact/demo mode).
// Marked source:"plaid" so the UI treats them as read-only, same as real
// bank-synced rows — keeps demo behavior consistent with production.
const DEMO_TRANSACTIONS = [
  {id:"d1",date:"2025-05-18",desc:"Whole Foods",    amount:87.42, category:"Food",         type:"expense",source:"plaid"},
  {id:"d2",date:"2025-05-17",desc:"Rent",           amount:1850,  category:"Housing",      type:"expense",source:"plaid"},
  {id:"d3",date:"2025-05-16",desc:"Spotify",        amount:10.99, category:"Entertainment",type:"expense",source:"plaid"},
  {id:"d4",date:"2025-05-15",desc:"Salary",         amount:4200,  category:"Other",        type:"income", source:"plaid"},
  {id:"d5",date:"2025-05-14",desc:"Uber",           amount:18.5,  category:"Transport",    type:"expense",source:"plaid"},
  {id:"d6",date:"2025-05-13",desc:"Amazon",         amount:64.99, category:"Shopping",     type:"expense",source:"plaid"},
  {id:"d7",date:"2025-05-12",desc:"Gym membership", amount:45,    category:"Health",       type:"expense",source:"plaid"},
  {id:"d8",date:"2025-05-11",desc:"Coffee shop",    amount:6.5,   category:"Food",         type:"expense",source:"plaid"},
  {id:"d9",date:"2025-05-10",desc:"Electric bill",  amount:112,   category:"Housing",      type:"expense",source:"plaid"},
  {id:"d10",date:"2025-05-09",desc:"Movie tickets", amount:28,    category:"Entertainment",type:"expense",source:"plaid"},
  {id:"d11",date:"2025-05-08",desc:"Freelance",     amount:800,   category:"Other",        type:"income", source:"plaid"},
  {id:"d12",date:"2025-05-07",desc:"Gas station",   amount:54.3,  category:"Transport",    type:"expense",source:"plaid"},
];
const ONBOARDING_STEPS = [
  {id:"name",   q:"What should we call you?",              type:"text",  placeholder:"Your first name"},
  {id:"income", q:"What's your monthly take-home income?", type:"money", placeholder:"e.g. 4500"},
  {id:"goal",   q:"What's your primary financial goal?",   type:"choice",choices:["Save for a big purchase","Pay off debt","Build an emergency fund","Invest more","Just track spending"]},
  {id:"housing",q:"What's your monthly housing cost?",     type:"money", placeholder:"e.g. 1500"},
  {id:"style",  q:"How would you describe your spending?", type:"choice",choices:["Frugal & intentional","Balanced","I like to treat myself","Spontaneous spender"]},
];
const PRIVACY_SECTIONS = [
  {title:"The short version",         body:"• We collect only what we need to make the app work for you.\n• We do not sell your data. Ever. To anyone.\n• We do not use your financial data to train AI models or for advertising.\n• You can export or delete everything we have on you, at any time.\n• If something changes, we'll tell you clearly before it takes effect."},
  {title:"What we collect and why",   body:"Name (first name only): to personalise your experience.\n\nOnboarding answers (income, goals, spending style): to set up your budget.\n\nTransactions you enter: to power your budget, breakdowns, and goal tracking.\n\nBank data (if connected): retrieved via a secure financial data provider (e.g. Plaid). We never see your bank username or password. You can disconnect at any time in Settings.\n\nApp diagnostics (crash logs, OS version): to fix bugs only. We do not access your location, contacts, camera, or microphone."},
  {title:"How we use your information",body:"Your data serves exactly one purpose: making flo·w useful to you.\n\nWe use it to show your spending summaries, budget progress, and goal tracking; generate alerts; calculate your financial health score and rewards; send notifications you've opted into; and improve the app from anonymised aggregate patterns.\n\nWe do NOT use your data to train AI models, serve ads, build third-party profiles, or make automated decisions affecting your finances."},
  {title:"Who we share your data with",body:"We share the minimum necessary with service providers who help us operate the app. Every provider is contractually prohibited from using your data for anything beyond the specific service they provide.\n\nWe do not share with advertisers, data brokers, or other users."},
  {title:"Your rights and controls",  body:"Access: request a full export via Settings → Privacy.\n\nDeletion: delete your account and all data via Settings → Privacy → Delete my account. Data permanently removed within 30 days.\n\nCalifornia residents (CCPA): right to know, delete, opt out of sale (we don't sell it), and non-discrimination. We extend these rights to all users."},
  {title:"Security",                  body:"TLS 1.3 in transit. AES-256 at rest. Minimal staff access, all logged. No bank credentials stored. Breach notification within 72 hours."},
  {title:"Changes to this policy",    body:"Material changes notified in-app 30 days before effect, with your explicit acknowledgement required."},
  {title:"Contact",                   body:"privacy@flowapp.com — we respond within 2 business days."},
];

/* ─── Pure helpers ───────────────────────────────────────────────────────────── */
function getLevelInfo(pts){
  const cur  = LEVELS.slice().reverse().find(l=>pts>=l.min) || LEVELS[0];
  const next = LEVELS.find(l=>l.level===cur.level+1) || null;
  const prog = next ? pct(pts-cur.min, next.min-cur.min) : 100;
  return {cur,next,prog};
}

// ── Semester boundaries ─────────────────────────────────────────────────────
function semesterForDate(date=new Date()){
  const y=date.getFullYear();
  const d=(yy,mm,dd)=>new Date(yy,mm-1,dd);
  const iso=dt=>`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
  const bounds=[
    {name:"Fall",   start:d(y-1,8,15),  end:d(y-1,12,15)},
    {name:"Winter", start:d(y-1,12,15), end:d(y,1,15)},
    {name:"Winter", start:d(y,12,15),   end:d(y+1,1,15)},
    {name:"Spring", start:d(y,1,15),    end:d(y,5,15)},
    {name:"Summer", start:d(y,5,15),    end:d(y,8,15)},
    {name:"Fall",   start:d(y,8,15),    end:d(y,12,15)},
  ];
  const chosen=bounds.find(b=>date>=b.start&&date<b.end)||bounds[bounds.length-1];
  return {name:chosen.name,start:iso(chosen.start),end:iso(chosen.end)};
}

/**
 * shiftSemester — steps to the immediately adjacent semester in the given
 * direction (+1 = next, -1 = previous), relative to refDate's semester.
 * Steps exactly 1 day past the current semester's own boundary rather than
 * a fixed day-count — a fixed jump (e.g. "add 120 days") would overshoot or
 * undershoot depending on which semester you're stepping into, since Winter
 * (~1 month) is dramatically shorter than Fall/Spring (~4 months). Stepping
 * from a boundary always lands exactly one semester away, regardless of
 * either semester's length.
 */
function shiftSemester(refDate, direction){
  const cur = semesterForDate(refDate);
  const boundary = direction>0 ? new Date(cur.end+"T12:00:00") : new Date(cur.start+"T12:00:00");
  const landing = new Date(boundary.getTime() + direction*86400000);
  return semesterForDate(landing);
}

/** Formats a JS Date as "YYYY-MM-01" — the server's expected month key. */
function monthKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-01`;
}

/** Steps a date by whole calendar months (direction: +1 or -1), landing on the 1st. */
function shiftMonth(refDate, direction){
  return new Date(refDate.getFullYear(), refDate.getMonth()+direction, 1);
}

/**
 * semesterMonthCount — real length of a semester, expressed in "months",
 * used to derive a semester budget total from a monthly figure for
 * recurring categories (e.g. Dining budgeted at $400/mo shown as $1,600
 * for a 4-month Fall semester, but only ~$400 for the ~1-month Winter term).
 *
 * Computed from the actual day-span of the semester (not a hardcoded
 * per-semester constant) divided by the average days-per-month (30.44),
 * so this stays correct automatically if semesterForDate's boundaries are
 * ever adjusted — verified against real spans: Fall≈4.01, Winter≈1.02,
 * Spring≈3.94, Summer≈3.02 months.
 *
 * @param {Date} refDate — defaults to now
 * @returns {number} months, e.g. 4.01
 */
function semesterMonthCount(refDate=new Date()){
  const sem=semesterForDate(refDate);
  const start=new Date(sem.start+"T00:00:00");
  const end=new Date(sem.end+"T00:00:00");
  const days=(end-start)/86400000;
  return days/30.44;
}

/**
 * catSpendMap — sums expense transactions by category, ALWAYS across every
 * category (monthly and semester alike) — this does not filter categories
 * out. Each category is windowed by its OWN period tag:
 *   - a "monthly" category sums transactions within [monthStart, monthEnd)
 *     when activeView==="monthly", or within the active SEMESTER's full
 *     range when activeView==="semester" (so switching to Semester view
 *     shows the semester-to-date total for recurring categories too, not
 *     just for one-time ones).
 *   - a "semester" category always sums within the active semester's range,
 *     regardless of activeView — there's no "monthly window" that makes
 *     sense for a one-time category, so the toggle doesn't affect it.
 *
 * This replaced an earlier version that excluded whichever category type
 * didn't match the active view entirely — that was the wrong model; the
 * correct one (confirmed) is that both views always show every category,
 * and the toggle only changes the time window applied per-category.
 *
 * @param {Array}  transactions
 * @param {"monthly"|"semester"} activeView — which toggle position is selected
 * @param {Date}   refDate — defaults to now; pass a specific date for testing
 */
function catSpendMap(transactions, activeView="monthly", refDate=new Date()){
  const sem=semesterForDate(refDate);
  const y=refDate.getFullYear(), mo=refDate.getMonth();
  const monthStart=`${y}-${String(mo+1).padStart(2,"0")}-01`;
  const nextM=new Date(y,mo+1,1);
  const monthEnd=`${nextM.getFullYear()}-${String(nextM.getMonth()+1).padStart(2,"0")}-01`;

  const m={};
  transactions
    .filter(t=>t.type==="expense")
    .forEach(t=>{
      const catPeriod=CATEGORY_META[t.category]?.period||"monthly";
      // Semester-tagged categories always use the semester window.
      // Monthly-tagged categories use the month window UNLESS the active
      // view is "semester", in which case they're summed over the whole
      // semester too (semester-to-date for recurring spending).
      const useSemesterWindow = catPeriod==="semester" || activeView==="semester";
      const start = useSemesterWindow ? sem.start : monthStart;
      const end   = useSemesterWindow ? sem.end   : monthEnd;
      if(t.date>=start && t.date<end){
        m[t.category]=(m[t.category]||0)+Number(t.amount);
      }
    });
  return m;
}

/* ─── Data hooks ─────────────────────────────────────────────────────────────── */

/**
 * useApi — generic data-fetching hook.
 * Returns { data, loading, error, reload }.
 * Falls back to `fallback` when the fetch throws (keeps demo mode working).
 */
function useApi(fetcher, fallback, deps=[]) {
  const [data,    setData]    = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try   { setData(await fetcher()); }
    catch (e) { setError(e.message); setData(fallback); }
    finally   { setLoading(false); }
  }, deps); // eslint-disable-line

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

/**
 * useTransactions — loads from backend (Plaid-synced + manual, merged
 * server-side by GET /plaid/transactions); falls back to demo data if
 * unreachable. addTxn/updateTxn/deleteTxn persist to the manual-transaction
 * endpoints with optimistic local updates and rollback on failure.
 *
 * Important: updateTxn/deleteTxn only work on transactions with
 * source === "manual". Calling them on a Plaid-synced row will fail with a
 * 404 from the server — Transactions component should disable edit/delete
 * controls for non-manual rows (see source-aware UI below).
 */
function useTransactions() {
  const { data: txns, loading, error, reload } = useApi(
    async () => {
      const res = await plaidApi.getTransactions({ limit: 200 });
      // Normalise server shape to match what the UI expects
      return res.transactions.map(t => ({
        ...t,
        type:   Number(t.amount) < 0 ? "income" : "expense",
        amount: Math.abs(Number(t.amount)),
      }));
    },
    DEMO_TRANSACTIONS
  );

  const [local, setLocal] = useState(null); // overrides server data after mutations

  // Reset local overrides when a fresh server fetch lands
  useEffect(() => { setLocal(null); }, [txns]);

  const transactions = local ?? txns;

  const addTxn = async (t) => {
    const tempId = "tmp_" + Date.now();
    setLocal(p => [{ id: tempId, source: "manual", ...t }, ...(p ?? txns)]);
    try {
      const res = await transactionsApi.create(t);
      setLocal(p => (p ?? txns).map(x => x.id === tempId ? res.transaction : x));
      return res.transaction;
    } catch (e) {
      // Roll back the optimistic insert
      setLocal(p => (p ?? txns).filter(x => x.id !== tempId));
      throw e;
    }
  };

  const updateTxn = async (t) => {
    const prior = (local ?? txns).find(x => x.id === t.id);
    setLocal(p => (p ?? txns).map(x => x.id === t.id ? t : x));
    try {
      const { id, ...fields } = t;
      const res = await transactionsApi.update(id, fields);
      setLocal(p => (p ?? txns).map(x => x.id === id ? res.transaction : x));
      return res.transaction;
    } catch (e) {
      // Roll back to the prior row on failure
      setLocal(p => (p ?? txns).map(x => x.id === t.id ? prior : x));
      throw e;
    }
  };

  const deleteTxn = async (id) => {
    const prior = (local ?? txns).find(x => x.id === id);
    const priorIndex = (local ?? txns).findIndex(x => x.id === id);
    setLocal(p => (p ?? txns).filter(x => x.id !== id));
    try {
      await transactionsApi.delete(id);
    } catch (e) {
      // Roll back — re-insert at its original position
      setLocal(p => {
        const arr = [...(p ?? txns)];
        arr.splice(priorIndex, 0, prior);
        return arr;
      });
      throw e;
    }
  };

  return {
    transactions,
    txnLoading: loading,
    txnError:   error,
    reloadTxns: reload,
    addTxn, updateTxn, deleteTxn,
  };
}

/**
 * useAccounts — loads linked bank accounts from backend.
 */
function useAccounts() {
  return useApi(
    async () => {
      const res = await plaidApi.getAccounts();
      return res.accounts;
    },
    []
  );
}

/**
 * useGoals — loads goals from backend with optimistic local mutations.
 * Mirrors the same local-override pattern as useTransactions.
 */
function useGoals() {
  const DEMO_GOALS = [
    {id:"dg1",name:"Japan trip",    emoji:"✈️",target:4000, saved:1200,deadline:"2026-03-01"},
    {id:"dg2",name:"Emergency fund",emoji:"🏦",target:10000,saved:3500,deadline:null},
  ];

  const { data: serverGoals, loading, error, reload } = useApi(
    async () => {
      const res = await goalsApi.list();
      return res.goals;
    },
    DEMO_GOALS
  );

  const [local, setLocal] = useState(null);
  useEffect(() => { setLocal(null); }, [serverGoals]);

  const goals = local ?? serverGoals;

  const addGoal = async (goalData) => {
    // Optimistic add with a temp id
    const tempId = "tmp_" + Date.now();
    setLocal(p => [...(p ?? serverGoals), { id: tempId, ...goalData }]);
    try {
      const res  = await goalsApi.create(goalData);
      // Replace temp row with real server row
      setLocal(p => (p ?? serverGoals).map(g => g.id === tempId ? res.goal : g));
    } catch (e) {
      // Roll back on failure
      setLocal(p => (p ?? serverGoals).filter(g => g.id !== tempId));
      throw e;
    }
  };

  const updateGoal = async (id, fields) => {
    setLocal(p => (p ?? serverGoals).map(g => g.id === id ? { ...g, ...fields } : g));
    try {
      const res = await goalsApi.update(id, fields);
      setLocal(p => (p ?? serverGoals).map(g => g.id === id ? res.goal : g));
    } catch (e) {
      reload(); // Revert to server state on failure
      throw e;
    }
  };

  const deleteGoal = async (id) => {
    setLocal(p => (p ?? serverGoals).filter(g => g.id !== id));
    try {
      await goalsApi.delete(id);
    } catch (e) {
      reload();
      throw e;
    }
  };

  const addFunds = (id, amount) =>
    updateGoal(id, {
      saved: Math.min(
        (goals.find(g => g.id === id)?.target ?? 0),
        (goals.find(g => g.id === id)?.saved  ?? 0) + amount
      )
    });

  return { goals, loading, error, reload, addGoal, updateGoal, deleteGoal, addFunds };
}

/**
 * useBudgets — loads ALL category budgets from the backend in a single fetch
 * — both monthly-rate categories (Food, Transport, ...) and semester-total
 * categories (Tuition, Moving, ...) come back merged into one flat map,
 * because each category has exactly ONE stored value server-side (see
 * routes/data.js's CATEGORY_PERIOD). Toggling period is purely a DISPLAY
 * concern handled by Budget's displayBudget() — it does not trigger a
 * refetch and does not change what's stored. This fixes a prior version
 * that fetched a separate budget set per period, which made an edit in one
 * view invisible in the other (they were literally different server rows)
 * and made the derivation math in displayBudget() operate on the wrong
 * number entirely once you'd switched views.
 */
function useBudgets() {
  const DEMO_BUDGETS = {
    Housing:2000, Food:600, Transport:200, Shopping:300, Entertainment:150, Health:100,
    Tuition:9000, HousingDeposit:1500, HealthInsurance:800, BooksSupplies:400, Moving:250,
  };

  // period is purely UI state — which number Budget's displayBudget() shows
  // and which date window catSpendMap() sums actual spend over.
  const [period, setPeriod] = useState("monthly"); // "monthly" | "semester"

  // refDate drives WHICH month/semester is being viewed — defaults to today,
  // but can be navigated backward/forward independently of period. Kept as
  // a single Date rather than two separate month/semester trackers so
  // switching the period toggle doesn't lose your place — e.g. if you've
  // navigated to March and flip to Semester view, you land on the semester
  // that actually contains March, not back on "today."
  const [refDate, setRefDate] = useState(new Date());

  const month    = monthKey(refDate);
  const semester = semesterForDate(refDate).start;

  const { data: serverBudgets, loading, error, reload } = useApi(
    async () => {
      const res = await budgetsApi.get({ month, semester });
      return Object.keys(res.budgets).length > 0 ? res.budgets : DEMO_BUDGETS;
    },
    DEMO_BUDGETS,
    [month, semester] // re-fetch whenever navigation moves to a different month or semester
  );

  const [local, setLocal] = useState(null);
  useEffect(() => { setLocal(null); }, [serverBudgets]);

  const budgets = local ?? serverBudgets;

  const setBudgets = async (updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(budgets)
      : updaterOrValue;
    setLocal(next);
    try {
      // Explicitly pass the currently-viewed month/semester so an edit made
      // while navigated to a past/future period saves against THAT period,
      // not silently against today's.
      await budgetsApi.update(next, { month, semester });
    } catch (e) {
      reload();
      throw e;
    }
  };

  // Jumps back to the current real-world month/semester — used by a "Today"
  // shortcut so users who've navigated away don't have to click back
  // through every intermediate step.
  const goToToday = () => setRefDate(new Date());

  return { budgets, loading, error, reload, setBudgets, period, setPeriod, refDate, setRefDate, goToToday };
}

/**
 * useRewards — points + redemption history from backend.
 * earn() and redeem() are optimistic: UI updates instantly, rolls back on failure.
 */
function useRewards() {
  const { data: points, loading, error, reload } = useApi(
    async () => (await rewardsApi.get()).points,
    340   // demo fallback when backend is unreachable
  );
  const { data: history, reload: reloadHistory } = useApi(
    async () => (await rewardsApi.history()).redemptions,
    []
  );

  const [localPoints,  setLocalPoints]  = useState(null);
  const [localHistory, setLocalHistory] = useState(null);

  // Reset local overrides when fresh server data lands
  useEffect(() => { setLocalPoints(null); }, [points]);
  useEffect(() => { setLocalHistory(null); }, [history]);

  const curPoints  = localPoints  ?? points;
  const curHistory = localHistory ?? history;

  /**
   * earn(actionKey) — actionKey must match a key in the server's
   * EARN_ACTIONS catalogue (e.g. "stay_under_budget"). The server determines
   * the point value — the client cannot specify an arbitrary amount.
   */
  const earn = async (actionKey) => {
    try {
      const res = await rewardsApi.earn(actionKey);
      setLocalPoints(res.points);
      return res;
    } catch (e) {
      reload();
      throw e;
    }
  };

  /**
   * redeem(charity) — charity is the frontend's display object (id, name,
   * logo, cost). Only charity.id is sent to the server; cost and name are
   * looked up server-side so the client can't redeem at a forged price.
   */
  const redeem = async (charity) => {
    if (curPoints < charity.cost) throw new Error("Insufficient points");
    // Optimistic deduction + temp history entry
    setLocalPoints(p => (p ?? points) - charity.cost);
    const tempEntry = {
      id:           "tmp_" + Date.now(),
      charity_id:   charity.id,
      charity_name: charity.name,
      logo:         charity.logo,
      points_spent: charity.cost,
      usd_value:    +(charity.cost * 0.01).toFixed(2),
      redeemed_at:  new Date().toISOString(),
    };
    setLocalHistory(h => [tempEntry, ...(h ?? history)]);
    try {
      const res = await rewardsApi.redeem(charity.id);
      setLocalPoints(res.points);
      // Replace temp entry with the real server row (keep the logo for display)
      setLocalHistory(h =>
        (h ?? history).map(e =>
          e.id === tempEntry.id ? { ...res.redemption, logo: charity.logo } : e
        )
      );
      return res;
    } catch (e) {
      // Roll back both optimistic changes
      reload();
      reloadHistory();
      throw e;
    }
  };

  return {
    points: curPoints,
    history: curHistory,
    loading, error, reload,
    earn, redeem,
  };
}

/**
 * usePlaidLink — loads the Plaid Link SDK on demand and opens the Link flow.
 * Returns { open, ready, linking }.
 */
function usePlaidLink(onSuccess) {
  const [ready,   setReady]   = useState(false);
  const [linking, setLinking] = useState(false);
  const [error,   setError]   = useState("");
  const handlerRef = useRef(null);

  const open = useCallback(async () => {
    if (linking) return;
    setLinking(true);
    setError("");
    try {
      // 1. Get a link_token from our server
      const { link_token } = await plaidApi.createLinkToken();

      // 2. Load Plaid Link SDK if not already present
      if (!window.Plaid) {
        await new Promise((resolve, reject) => {
          const script    = document.createElement("script");
          script.src      = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
          script.onload   = resolve;
          script.onerror  = () => reject(new Error("Failed to load Plaid SDK"));
          document.head.appendChild(script);
        });
      }

      // 3. Open Plaid Link
      handlerRef.current = window.Plaid.create({
        token: link_token,
        onSuccess: async (public_token, metadata) => {
          try {
            await plaidApi.exchangeToken(
              public_token,
              metadata.institution?.institution_id,
              metadata.institution?.name
            );
            setLinking(false);
            onSuccess(metadata.institution?.name);
          } catch (e) {
            // Previously this only logged to the console — the user would
            // see the Plaid modal close with no indication anything failed,
            // and assume their bank was successfully linked when it wasn't.
            setLinking(false);
            setError(e.message || "Couldn't finish linking your account. Please try again.");
          }
        },
        onExit: (err) => {
          setLinking(false);
          // err is null on a normal user-initiated close — only show an
          // error if Plaid itself reported one (e.g. bank auth failure).
          if (err) setError(err.error_message || "Bank connection was cancelled or failed.");
        },
      });
      handlerRef.current.open();
      setReady(true);
    } catch (e) {
      console.error("[plaid-link]", e.message);
      setLinking(false);
      setError(e.message || "Couldn't start the bank connection flow. Please try again.");
    }
  }, [linking, onSuccess]);

  return { open, ready, linking, error };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════════════════════════════════════════ */
function Card({children,style={},onClick}){
  return <div onClick={onClick} style={{background:"#fff",borderRadius:16,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,.07)",cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}
function Badge({label,color,colorLight}){
  return <span style={S.pill(colorLight,color)}>{label}</span>;
}
function Field({label,children}){
  return <div><label style={S.label}>{label}</label>{children}</div>;
}
function SpendBar({spent,budget,color}){
  const p=pct(spent,budget); const over=p>=100;
  return(
    <div style={{marginTop:8}}>
      <div style={{...S.between,marginBottom:5}}>
        <span style={{fontSize:12,color:"var(--muted)"}}>{fmtDec(spent)} spent</span>
        <span style={{fontSize:12,color:over?"var(--rose)":"var(--muted)"}}>{over?"Over budget!":fmtDec(budget-spent)+" left"}</span>
      </div>
      <div style={{height:6,background:"var(--sand)",borderRadius:4,overflow:"hidden"}}>
        <div style={{height:"100%",width:p+"%",background:over?"var(--rose)":color,borderRadius:4,transition:"width .5s ease"}}/>
      </div>
    </div>
  );
}
function BottomSheet({onClose,title,subtitle,children,zIndex=200}){
  return(
    <div className="fade-in" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.52)",zIndex,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div className="slide-up" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,margin:"0 auto",background:"#fff",borderRadius:"22px 22px 0 0",maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"22px 22px 14px",borderBottom:"1px solid var(--sand)",...S.between,flexShrink:0}}>
          <div>
            <p style={{...S.serif,fontSize:20,fontWeight:400}}>{title}</p>
            {subtitle&&<p style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{subtitle}</p>}
          </div>
          <button style={S.sandBtn()} onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function MenuRow({icon,label,sub,right,onClick,danger=false,noBorder=false}){
  return(
    <button onClick={onClick} style={{width:"100%",...S.row,padding:"14px 0",background:"none",border:"none",borderBottom:noBorder?"none":"1px solid var(--sand)",cursor:"pointer",textAlign:"left"}}>
      <div style={{...S.iconBox("var(--sand)"),fontSize:17}}>{icon}</div>
      <div style={{flex:1}}>
        <p style={{fontSize:15,fontWeight:500,color:danger?"var(--rose)":"var(--ink)"}}>{label}</p>
        {sub&&<p style={{fontSize:12,color:"var(--muted)",marginTop:1}}>{sub}</p>}
      </div>
      {right||<span style={{color:"var(--stone)",fontSize:18}}>›</span>}
    </button>
  );
}
function Spinner({size=18}){
  return <span className="spin" style={{display:"inline-block",width:size,height:size,border:"2px solid var(--sand)",borderTopColor:"var(--ink)",borderRadius:"50%"}}/>;
}
// Shows a yellow banner when one or more linked accounts need re-authentication.
// Defensive against accounts being undefined (e.g. still loading) or null.
function SyncBanner({accounts}){
  const needsRelink = (accounts||[]).filter(a=>a.item_status==="relink_required");
  if(!needsRelink.length) return null;
  return(
    <div style={{background:"var(--gold-light)",border:"1px solid #e8d0a0",borderRadius:14,padding:"13px 16px",...S.row,gap:12}}>
      <span style={{fontSize:20,flexShrink:0}}>🔗</span>
      <div>
        <p style={{fontSize:14,fontWeight:600,color:"var(--gold)"}}>Action needed</p>
        <p style={{fontSize:12,color:"var(--gold)",marginTop:2}}>
          {needsRelink.map(a=>a.institution_name||a.name).join(", ")} needs to be re-linked. Go to About → Linked Accounts.
        </p>
      </div>
    </div>
  );
}

// Generic error banner shown when a data fetch fails. Always paired with a
// Retry button calling the hook's reload() — never just a dead-end message.
// Demo/fallback data is still shown beneath this (the hooks fall back to
// DEMO_* arrays on error), so the user sees something useful either way.
function ErrorBanner({message, onRetry}){
  if(!message) return null;
  return(
    <div style={{background:"var(--rose-light)",border:"1px solid #e8b4b2",borderRadius:14,padding:"13px 16px",...S.row,gap:12}}>
      <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
      <div style={{flex:1}}>
        <p style={{fontSize:14,fontWeight:600,color:"var(--rose)"}}>Couldn't load the latest data</p>
        <p style={{fontSize:12,color:"var(--rose)",marginTop:2,opacity:.85}}>Showing the most recent data available. {message}</p>
      </div>
      {onRetry && <button onClick={onRetry} style={S.btn("var(--rose)","#fff",{flexShrink:0,padding:"7px 12px",fontSize:12})}>Retry</button>}
    </div>
  );
}

// A single pulsing placeholder block — building unit for skeleton screens.
function SkeletonBlock({height=16, width="100%", radius=6, style={}}){
  return <div style={{height,width,borderRadius:radius,background:"linear-gradient(90deg,var(--sand) 25%,#f0e9dc 50%,var(--sand) 75%)",backgroundSize:"200% 100%",animation:"shimmer 1.5s ease infinite",...style}}/>;
}

// Skeleton for a single Card-shaped block (used for the Summary hero, Budget
// hero, etc.) — roughly matches the real card's proportions so the loading
// state doesn't jump/reflow much once real content swaps in.
function SkeletonCard({lines=3, style={}}){
  return(
    <Card style={style}>
      <SkeletonBlock height={12} width="40%" style={{marginBottom:14}}/>
      {Array.from({length:lines}).map((_,i)=>(
        <SkeletonBlock key={i} height={14} width={i===lines-1?"60%":"100%"} style={{marginBottom:i<lines-1?10:0}}/>
      ))}
    </Card>
  );
}

// Skeleton for a list of rows (transactions, goals, accounts) — N rows of
// icon + two lines + trailing amount, matching the real row layout.
function SkeletonList({rows=4}){
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

/* ═══════════════════════════════════════════════════════════════════════════════
   PRIVACY POLICY MODAL
═══════════════════════════════════════════════════════════════════════════════ */
function PrivacyModal({onClose,showAccept=false,onAccept}){
  const [scrolled,setScrolled]=useState(false);
  const ref=useRef(null);
  const onScroll=()=>{const el=ref.current;if(!el)return;if(el.scrollTop+el.clientHeight>=el.scrollHeight-40)setScrolled(true);};
  return(
    <div className="fade-in" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:300,display:"flex",alignItems:"flex-end"}}>
      <div className="slide-up" style={{width:"100%",maxWidth:480,margin:"0 auto",background:"#fff",borderRadius:"22px 22px 0 0",maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"22px 22px 14px",borderBottom:"1px solid var(--sand)",...S.between,flexShrink:0}}>
          <div><p style={{...S.serif,fontSize:20,fontWeight:400}}>Privacy Policy</p><p style={{fontSize:12,color:"var(--muted)",marginTop:2}}>Effective May 20, 2025</p></div>
          {!showAccept&&<button style={S.sandBtn()} onClick={onClose}>Close</button>}
        </div>
        <div ref={ref} onScroll={onScroll} style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>
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
          <div style={{padding:"14px 22px 32px",borderTop:"1px solid var(--sand)",flexShrink:0}}>
            {!scrolled&&<p style={{fontSize:12,color:"var(--muted)",textAlign:"center",marginBottom:10}}>Scroll to the bottom to continue</p>}
            <button onClick={scrolled?onAccept:undefined} style={{...S.darkBtn(),background:scrolled?"#1A1714":"var(--sand)",color:scrolled?"#fff":"var(--stone)",borderRadius:13,padding:"15px",cursor:scrolled?"pointer":"default",transition:"all .2s"}}>
              {scrolled?"I've read and accept the Privacy Policy →":"Keep scrolling to accept"}
            </button>
          </div>
        )}
        {!showAccept&&<div style={{height:12}}/>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   AUTH SCREEN
═══════════════════════════════════════════════════════════════════════════════ */
function AuthScreen({onAuth}){
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

  const submit = async () => {
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

  const IS={width:"100%",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"13px 16px",color:"#F5F0E8",fontSize:15,outline:"none"};
  const toggle=()=>{setMode(m=>m==="login"?"register":"login");setError("");};
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#1A1714",padding:24}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:44}}>
          <span style={{...S.serif,fontSize:36,color:"#F5F0E8",fontWeight:300,letterSpacing:"-1px"}}>flo<span style={{color:"#B8882A"}}>·</span>w</span>
          <p style={{color:"#C8BAA8",fontSize:14,marginTop:6}}>Your money, clearly.</p>
        </div>
        <div key={mode} className="slide-up" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"36px 32px"}}>
          <h2 style={{...S.serif,color:"#F5F0E8",fontSize:22,fontWeight:400,marginBottom:24}}>{mode==="login"?"Welcome back":"Create your account"}</h2>
          <div style={{...S.col,gap:14}}>
            {mode==="register"&&<div><label style={{...S.label,color:"#C8BAA8"}}>First name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Austin" style={IS}/></div>}
            <div><label style={{...S.label,color:"#C8BAA8"}}>Email</label><input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="you@example.com" type="email" autoComplete="email" style={IS}/></div>
            <div>
              <label style={{...S.label,color:"#C8BAA8"}}>Password</label>
              <input value={password} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder={mode==="register"?"At least 8 characters":"••••••••"} type="password" autoComplete={mode==="register"?"new-password":"current-password"} style={IS}/>
              {mode==="register"&&strength&&(
                <div style={{marginTop:8}}>
                  <div style={{height:3,background:"rgba(255,255,255,.1)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:strength.w,background:strength.color,borderRadius:2,transition:"width .3s"}}/></div>
                  <p style={{fontSize:11,color:strength.color,marginTop:4}}>{strength.label}</p>
                </div>
              )}
            </div>
            {error&&<div style={{background:"var(--rose-light)",border:"1px solid #e8b4b2",borderRadius:10,padding:"10px 14px"}}><p style={{fontSize:13,color:"var(--rose)"}}>⚠️ {error}</p></div>}
            <button onClick={submit} disabled={loading} style={{...S.darkBtn(),background:loading?"rgba(255,255,255,.15)":"#B8882A",color:loading?"#C8BAA8":"#1A1714",borderRadius:12,marginTop:4,transition:"all .2s",cursor:loading?"default":"pointer"}}>
              {loading?<Spinner size={16}/>:mode==="login"?"Log in →":"Create account →"}
            </button>
          </div>
        </div>
        <p style={{textAlign:"center",marginTop:20,fontSize:14,color:"#C8BAA8"}}>
          {mode==="login"?"Don't have an account? ":"Already have an account? "}
          <button onClick={toggle} style={{background:"none",border:"none",color:"#B8882A",fontSize:14,cursor:"pointer",fontWeight:600,padding:0}}>{mode==="login"?"Sign up":"Log in"}</button>
        </p>
        <p style={{textAlign:"center",marginTop:16,fontSize:11,color:"rgba(200,186,168,.5)",lineHeight:1.5}}>By continuing you agree to our Privacy Policy.<br/>We never sell your data.</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ONBOARDING
═══════════════════════════════════════════════════════════════════════════════ */
function Onboarding({onComplete}){
  const [step,setStep]       = useState(0);
  const [answers,setAnswers] = useState({});
  const [val,setVal]         = useState("");
  const [showPrivacy,setShowPrivacy] = useState(false);
  const inputRef = useRef(null);
  const totalSteps = ONBOARDING_STEPS.length+1;
  const isPrivacyStep = step===ONBOARDING_STEPS.length;
  const cur = !isPrivacyStep?ONBOARDING_STEPS[step]:null;

  useEffect(()=>{if(!isPrivacyStep){setVal(answers[cur.id]??"");setTimeout(()=>inputRef.current?.focus(),60);}},[step]);

  const next=()=>{const v=val.trim();if(!v)return;setAnswers(a=>({...a,[cur.id]:v}));setStep(s=>s+1);};
  const IS={width:"100%",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"14px 18px",color:"#F5F0E8",fontSize:17,outline:"none"};
  return(
    <>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#1A1714",padding:24}}>
        <div style={{width:"100%",maxWidth:460}}>
          <div style={{textAlign:"center",marginBottom:44}}><span style={{...S.serif,fontSize:30,color:"#F5F0E8",fontWeight:300,letterSpacing:"-0.5px"}}>flo<span style={{color:"#B8882A"}}>·</span>w</span></div>
          <div style={{height:2,background:"rgba(255,255,255,.1)",borderRadius:2,marginBottom:44,overflow:"hidden"}}>
            <div style={{height:"100%",width:(step/totalSteps*100)+"%",background:"#B8882A",borderRadius:2,transition:"width .5s ease"}}/>
          </div>
          {!isPrivacyStep?(
            <div key={step} className="slide-up" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"38px 34px"}}>
              <p style={{color:"#C8BAA8",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:"1.2px"}}>{step+1} of {totalSteps}</p>
              <h2 style={{...S.serif,color:"#F5F0E8",fontSize:25,fontWeight:400,marginBottom:28,lineHeight:1.35}}>{cur.q}</h2>
              {cur.type==="text"&&<input ref={inputRef} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&next()} placeholder={cur.placeholder} style={IS}/>}
              {cur.type==="money"&&<div style={{position:"relative"}}><span style={{position:"absolute",left:18,top:"50%",transform:"translateY(-50%)",color:"#C8BAA8",fontSize:17}}>$</span><input ref={inputRef} value={val} onChange={e=>setVal(e.target.value.replace(/[^0-9.]/g,""))} onKeyDown={e=>e.key==="Enter"&&next()} placeholder={cur.placeholder} inputMode="decimal" style={{...IS,paddingLeft:36}}/></div>}
              {cur.type==="choice"&&<div style={{...S.col,gap:9}}>{cur.choices.map(c=><button key={c} onClick={()=>setVal(c)} style={{background:val===c?"#B8882A":"rgba(255,255,255,.07)",border:val===c?"1px solid #B8882A":"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:"12px 16px",color:val===c?"#1A1714":"#F5F0E8",fontSize:14,textAlign:"left",cursor:"pointer",fontWeight:val===c?600:400,transition:"all .18s"}}>{c}</button>)}</div>}
              <button onClick={next} disabled={!val.trim()} style={{marginTop:26,...S.darkBtn(),background:val.trim()?"#B8882A":"rgba(255,255,255,.08)",color:val.trim()?"#1A1714":"#C8BAA8",borderRadius:12,cursor:val.trim()?"pointer":"default",transition:"all .2s"}}>Continue →</button>
            </div>
          ):(
            <div key="privacy-step" className="slide-up" style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:20,padding:"38px 34px"}}>
              <p style={{color:"#C8BAA8",fontSize:12,marginBottom:10,textTransform:"uppercase",letterSpacing:"1.2px"}}>{totalSteps} of {totalSteps}</p>
              <h2 style={{...S.serif,color:"#F5F0E8",fontSize:25,fontWeight:400,marginBottom:12,lineHeight:1.35}}>Before we begin</h2>
              <p style={{color:"#C8BAA8",fontSize:14,lineHeight:1.65,marginBottom:28}}>flo·w is built on the principle that your financial data belongs to you. Please take a moment to read our Privacy Policy.</p>
              <button onClick={()=>setShowPrivacy(true)} style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"15px 18px",color:"#F5F0E8",fontSize:14,cursor:"pointer",textAlign:"left",...S.between}}>
                <span>📋 Read our Privacy Policy</span><span style={{color:"#B8882A",fontSize:16}}>→</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {showPrivacy&&<PrivacyModal showAccept onAccept={()=>{setShowPrivacy(false);onComplete(answers);}} onClose={()=>setShowPrivacy(false)}/>}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUMMARY
═══════════════════════════════════════════════════════════════════════════════ */
function Summary({profile,transactions,goals,points,accounts,txnLoading,txnError,reloadTxns}){
  // Show a skeleton only on the very first load (no transactions yet at all,
  // including demo fallback) — once any data is present, prefer showing it
  // over a skeleton, even while a background reload is in flight.
  if(txnLoading && !transactions?.length){
    return(
      <div className="slide-up" style={{...S.col,gap:18}}>
        <SkeletonCard lines={4} style={{background:"#1A1714"}}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <SkeletonCard lines={2}/>
          <SkeletonCard lines={2}/>
        </div>
        <SkeletonCard lines={4}/>
        <SkeletonList rows={4}/>
      </div>
    );
  }

  const income   = transactions.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
  const expenses = transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  const saved    = income-expenses;
  const sr       = income>0?Math.round((saved/income)*100):0;
  // Summary is a general overview, not a period-specific budget view, so it
  // combines this month's monthly-category spend with this semester's
  // semester-category spend — e.g. Food (this month) and Tuition (this
  // semester) can both appear in the same breakdown list here, even though
  // the Budget page keeps them in separate Month/Semester tabs.
  const now      = new Date();
  const spend    = {...catSpendMap(transactions,"monthly",now), ...catSpendMap(transactions,"semester",now)};
  const topCats  = Object.entries(spend).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const recent   = [...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
  const {cur:lvl}= getLevelInfo(points);
  return(
    <div className="slide-up" style={{...S.col,gap:18}}>
      <ErrorBanner message={txnError} onRetry={reloadTxns}/>
      <SyncBanner accounts={accounts}/>
      <div style={{background:"#1A1714",borderRadius:20,padding:"26px 26px 22px",color:"#F5F0E8",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-24,top:-24,width:130,height:130,background:"rgba(184,136,42,.14)",borderRadius:"50%"}}/>
        <div style={{...S.between,marginBottom:5}}>
          <p style={{fontSize:12,color:"#C8BAA8",textTransform:"uppercase",letterSpacing:1}}>May 2025</p>
          <span style={{fontSize:12,background:"rgba(255,255,255,.1)",borderRadius:20,padding:"3px 10px",color:"#F5F0E8"}}>{lvl.icon} {lvl.name} · {points} pts</span>
        </div>
        <h2 style={{...S.serif,fontSize:28,fontWeight:400,marginBottom:4}}>Hey, {profile.name} 👋</h2>
        <p style={{color:"#C8BAA8",fontSize:14}}>{sr>20?"You're crushing it this month.":sr>0?"Staying on track — keep it up.":sr===0?"You're breaking even this month.":"Spending is exceeding income."}</p>
        <div style={{marginTop:18,...S.row,gap:18}}>
          {[["Income",income,"#8BC28A"],["Spent",expenses,"#B8882A"],["Saved",saved,saved>=0?"#8BC28A":"#C0413A"]].map(([l,v,c])=>(
            <div key={l}><p style={{fontSize:11,color:"#C8BAA8",marginBottom:2}}>{l}</p><p style={{...S.serif,fontSize:20,fontWeight:300,color:c}}>{fmt(v)}</p></div>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Card><p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Savings rate</p><p style={{...S.serif,fontSize:32,fontWeight:300,color:sr>=20?"var(--sage)":sr>=0?"var(--gold)":"var(--rose)"}}>{sr}%</p><p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>Target: 20%</p></Card>
        <Card><p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Goals</p><p style={{...S.serif,fontSize:32,fontWeight:300}}>{goals.length}</p><p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{goals.length===0?"None set yet":"active buckets"}</p></Card>
      </div>
      <Card>
        <p style={{fontSize:15,fontWeight:600,marginBottom:16}}>Spending breakdown</p>
        {topCats.map(([cat,amt])=>{const m=CATEGORY_META[cat]||CATEGORY_META.Other;const w=Math.round((amt/(expenses||1))*100);return(
          <div key={cat} style={{marginBottom:13}}>
            <div style={{...S.between,marginBottom:4}}><span style={{fontSize:14}}>{m.icon} {categoryLabel(cat)}</span><span style={{fontSize:14,fontWeight:500}}>{fmtDec(amt)} <span style={{color:"var(--muted)",fontWeight:400}}>({w}%)</span></span></div>
            <div style={{height:5,background:"var(--sand)",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:w+"%",background:m.color,borderRadius:3,transition:"width .5s"}}/></div>
          </div>
        );})}
      </Card>
      <Card style={{padding:0}}>
        <p style={{fontSize:15,fontWeight:600,padding:"18px 20px 12px"}}>Recent activity</p>
        {recent.map(t=>{const m=CATEGORY_META[t.category]||CATEGORY_META.Other;return(
          <div key={t.id} style={{...S.row,padding:"10px 20px",borderTop:"1px solid var(--sand)"}}>
            <div style={S.iconBox(m.colorLight)}>{m.icon}</div>
            <div style={{flex:1}}><p style={{fontSize:14,fontWeight:500}}>{t.desc}</p><p style={{fontSize:11,color:"var(--muted)"}}>{t.date}</p></div>
            <span style={{fontSize:14,fontWeight:600,color:t.type==="income"?"var(--sage)":"var(--ink)"}}>{t.type==="income"?"+":"-"}{fmtDec(t.amount)}</span>
          </div>
        );})}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BUDGET
═══════════════════════════════════════════════════════════════════════════════ */
function Budget({transactions,budgets,setBudgets,budgetsLoading,budgetsError,reloadBudgets,txnLoading,txnError,reloadTxns,period,setPeriod,refDate,setRefDate,goToToday}){
  const [editing,setEditing]=useState(null);
  const [editErr,setEditErr]=useState("");

  // Skeleton only on the very first load, before any budgets (even demo
  // fallback) are available.
  if((budgetsLoading&&!Object.keys(budgets||{}).length) || (txnLoading&&!transactions?.length)){
    return(
      <div className="slide-up" style={{...S.col,gap:16}}>
        <SkeletonCard lines={2} style={{background:"#1A1714"}}/>
        <SkeletonList rows={5}/>
      </div>
    );
  }

  // refDate (from useBudgets, navigable via the header below) replaces what
  // used to be a hardcoded "now" — every downstream calculation already
  // accepted an arbitrary reference date, so navigating just means feeding
  // them refDate instead of always today.
  const semInfo=semesterForDate(refDate);
  const spend=catSpendMap(transactions, period, refDate);
  const monthCount=semesterMonthCount(refDate); // e.g. 4.01 for Fall, 1.02 for Winter
  const isCurrentPeriod = period==="semester"
    ? semInfo.start===semesterForDate(new Date()).start
    : monthKey(refDate)===monthKey(new Date());

  // ALL categories always show, in both views — the toggle changes the
  // time window and (for monthly categories) whether the displayed budget
  // number is the raw monthly figure or the derived semester total. It
  // never hides a category.
  const allCats=Object.entries(CATEGORY_META).filter(([k])=>k!=="Savings");

  /**
   * Budget NUMBER to display/compare-against for a category in the active view:
   *   - semester-period category → its own stored value always (flat,
   *     entered directly, identical in both views)
   *   - monthly-period category in Month view → its own stored value
   *   - monthly-period category in Semester view → DERIVED: stored monthly
   *     value × real month-count of the active semester (not stored,
   *     recomputed fresh every render).
   */
  const displayBudget=(cat)=>{
    const meta=CATEGORY_META[cat];
    const stored=budgets[cat]||0;
    if(meta.period==="semester") return stored;
    return period==="semester" ? stored*monthCount : stored;
  };
  // A monthly category's budget is only directly editable in Month view —
  // its Semester-view number is derived, editing it there would be
  // ambiguous. Semester-period categories are always directly editable.
  const isEditable=(cat)=>CATEGORY_META[cat].period==="semester" || period==="monthly";

  const totalB=allCats.reduce((s,[k])=>s+displayBudget(k),0);
  const totalS=allCats.reduce((s,[k])=>s+(spend[k]||0),0);
  const saveEdit=async()=>{
    if(!editing) return;
    const n=parseFloat(editing.value);
    if(isNaN(n)||n<0) return;
    setEditErr("");
    try{
      await setBudgets(p=>({...p,[editing.category]:n}));
      setEditing(null);
    }catch(e){ setEditErr(e.message||"Couldn't save — please try again."); }
  };
  const overBudget=allCats.filter(([c])=>displayBudget(c)>0&&(spend[c]||0)>displayBudget(c));
  const nearBudget=allCats.filter(([c])=>displayBudget(c)>0&&(spend[c]||0)<=displayBudget(c)&&pct(spend[c]||0,displayBudget(c))>=80);

  const PeriodToggle=()=>(
    <div style={{...S.row,gap:0,background:"var(--sand)",borderRadius:12,padding:3}}>
      {[["monthly","Month"],["semester","Semester"]].map(([val,label])=>(
        <button key={val} onClick={()=>setPeriod(val)}
          style={{
            flex:1,padding:"8px 0",borderRadius:9,border:"none",cursor:"pointer",
            fontSize:13,fontWeight:600,transition:"all .15s",
            background:period===val?"#1A1714":"transparent",
            color:period===val?"#fff":"var(--muted)",
          }}>
          {label}
        </button>
      ))}
    </div>
  );

  // Navigation header: steps by whole calendar months in Month view, or by
  // whole semesters in Semester view — direction and unit both follow the
  // active toggle, so switching Month↔Semester doesn't require re-learning
  // what Previous/Next do. Shows a "Today" shortcut only when navigated
  // away from the current real-world period, so it doesn't clutter the
  // default view.
  const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const label = period==="semester"
    ? `${semInfo.name} ${new Date(semInfo.start+"T12:00:00").getFullYear()}`
    : `${MONTH_NAMES[refDate.getMonth()]} ${refDate.getFullYear()}`;
  const goPrev=()=>setRefDate(period==="semester" ? new Date(shiftSemester(refDate,-1).start+"T12:00:00") : shiftMonth(refDate,-1));
  const goNext=()=>setRefDate(period==="semester" ? new Date(shiftSemester(refDate, 1).start+"T12:00:00") : shiftMonth(refDate, 1));

  const PeriodNav=()=>(
    <div style={{...S.row,justifyContent:"space-between",gap:10}}>
      <button onClick={goPrev} aria-label="Previous period" style={S.sandBtn({padding:"8px 12px",fontSize:15,lineHeight:1})}>‹</button>
      <div style={{...S.col,gap:2,alignItems:"center",flex:1}}>
        <span style={{fontSize:14,fontWeight:600,color:"var(--ink)"}}>{label}</span>
        {!isCurrentPeriod&&<button onClick={goToToday} style={{fontSize:11,color:"var(--sky)",background:"none",border:"none",cursor:"pointer",padding:0}}>Jump to today</button>}
      </div>
      <button onClick={goNext} aria-label="Next period" style={S.sandBtn({padding:"8px 12px",fontSize:15,lineHeight:1})}>›</button>
    </div>
  );

  return(
    <div className="slide-up" style={{...S.col,gap:16}}>
      <ErrorBanner message={budgetsError||txnError} onRetry={budgetsError?reloadBudgets:reloadTxns}/>
      <PeriodToggle/>
      <PeriodNav/>
      <Card style={{background:"#1A1714",color:"#F5F0E8"}}>
        <p style={{fontSize:11,color:"#C8BAA8",textTransform:"uppercase",letterSpacing:1,marginBottom:5}}>
          {period==="semester" ? `${semInfo.name} semester budget` : `${label} budget`}
        </p>
        <p style={{...S.serif,fontSize:34,fontWeight:300}}>{fmt(totalB)}</p>
        <div style={{...S.row,gap:20,marginTop:12}}>
          <div><p style={{fontSize:11,color:"#C8BAA8"}}>Spent</p><p style={{fontSize:17,color:"#B8882A"}}>{fmt(totalS)}</p></div>
          <div><p style={{fontSize:11,color:"#C8BAA8"}}>Remaining</p><p style={{fontSize:17,color:totalB-totalS>=0?"#8BC28A":"#C0413A"}}>{fmt(totalB-totalS)}</p></div>
        </div>
        {period==="semester"&&<p style={{fontSize:11,color:"#C8BAA8",marginTop:10}}>{semInfo.start} – {semInfo.end}</p>}
      </Card>
      {overBudget.length>0&&<div style={{background:"var(--rose-light)",border:"1px solid #e8b4b2",borderRadius:14,padding:"14px 16px",...S.row,alignItems:"flex-start",gap:12}}><span style={{fontSize:20,flexShrink:0}}>⚠️</span><div><p style={{fontSize:14,fontWeight:600,color:"var(--rose)",marginBottom:3}}>Over budget in {overBudget.length} {overBudget.length===1?"category":"categories"}</p><p style={{fontSize:13,color:"var(--rose)",opacity:.85}}>{overBudget.map(([c])=>CATEGORY_META[c]?.icon+" "+categoryLabel(c)).join(" · ")}</p></div></div>}
      {nearBudget.length>0&&<div style={{background:"var(--gold-light)",border:"1px solid #e8d0a0",borderRadius:14,padding:"14px 16px",...S.row,alignItems:"flex-start",gap:12}}><span style={{fontSize:20,flexShrink:0}}>⚡</span><div><p style={{fontSize:14,fontWeight:600,color:"var(--gold)",marginBottom:3}}>Approaching limit in {nearBudget.length} {nearBudget.length===1?"category":"categories"}</p><p style={{fontSize:13,color:"var(--gold)",opacity:.85}}>{nearBudget.map(([c])=>CATEGORY_META[c]?.icon+" "+categoryLabel(c)).join(" · ")}</p></div></div>}
      {allCats.length===0&&(
        <Card style={{textAlign:"center",padding:"32px 24px"}}>
          <p style={{fontSize:14,color:"var(--muted)"}}>No categories yet.</p>
        </Card>
      )}
      {allCats.map(([cat,meta])=>{
        const budget=displayBudget(cat);const spent=spend[cat]||0;const p=budget>0?pct(spent,budget):0;const over=budget>0&&spent>budget;const near=budget>0&&p>=80&&!over;const isEd=editing?.category===cat;
        const editable=isEditable(cat);
        // Editing a monthly category's Semester-view number would be
        // ambiguous — is the user setting a new monthly rate, or trying to
        // set a one-off semester total that then wouldn't match monthly ×
        // count on a future render? Rather than guess, editing is disabled
        // here and the raw monthly figure is edited from Month view instead.
        return(
          <Card key={cat} style={{borderLeft:over?"3px solid var(--rose)":near?"3px solid var(--gold)":"3px solid transparent",paddingLeft:over||near?21:24}}>
            <div style={S.between}>
              <div style={{...S.row,gap:10}}>
                <div style={S.iconBox(meta.colorLight)}>{meta.icon}</div>
                <div>
                  <span style={{fontSize:15,fontWeight:500}}>{categoryLabel(cat)}</span>
                  {!editable&&<span style={{fontSize:10,color:"var(--muted)",marginLeft:6}}>· derived from monthly</span>}
                  {over&&<p style={{fontSize:11,color:"var(--rose)",fontWeight:600,marginTop:1}}>Over by {fmtDec(spent-budget)}</p>}
                  {near&&<p style={{fontSize:11,color:"var(--gold)",fontWeight:600,marginTop:1}}>{100-p}% of budget left</p>}
                </div>
              </div>
              {isEd?(
                <div style={{...S.row,gap:8}}><input value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value.replace(/[^0-9.]/g,"")})} onKeyDown={e=>e.key==="Enter"&&saveEdit()} autoFocus style={{width:88,border:"1px solid var(--stone)",borderRadius:8,padding:"5px 10px",fontSize:14,outline:"none",textAlign:"right"}}/><button onClick={saveEdit} style={S.btn("#1A1714","#fff",{borderRadius:8,padding:"5px 12px",fontSize:13})}>Save</button></div>
              ):(
                <div style={{...S.row,gap:10}}>
                  <span style={{fontSize:15,fontWeight:500,color:over?"var(--rose)":"var(--ink)"}}>{budget?fmt(budget):<span style={{color:"var(--stone)"}}>Not set</span>}</span>
                  {editable
                    ? <button onClick={()=>setEditing({category:cat,value:budgets[cat]?String(budgets[cat]):""})} style={S.sandBtn()}>Edit</button>
                    : <span style={{fontSize:11,color:"var(--stone)",padding:"4px 8px"}}>Set in Month view</span>
                  }
                </div>
              )}
            </div>
            {budget>0&&<SpendBar spent={spent} budget={budget} color={meta.color}/>}
            {isEd&&editErr&&<p style={{fontSize:12,color:"var(--rose)",marginTop:8}}>{editErr}</p>}
          </Card>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TRANSACTIONS
═══════════════════════════════════════════════════════════════════════════════ */
function Transactions({transactions,txnLoading,txnError,addTxn,updateTxn,deleteTxn,reloadTxns}){
  const [filterCat,setFilterCat]=useState("All");
  const [search,setSearch]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({date:"",desc:"",amount:"",category:"Food",type:"expense",frequency:"monthly"});
  const [saving,setSaving]=useState(false);
  const [saveErr,setSaveErr]=useState("");
  const setF=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  // Categories available for the currently-selected frequency — recomputed
  // whenever frequency changes. "monthly" frequency shows recurring
  // categories (Food, Transport, ...); "one-time" shows termly/lump-sum
  // categories (Tuition, Moving, ...). Category and frequency must stay in
  // sync — see setFrequency below, which resets category to the first valid
  // option whenever frequency changes, so a stale mismatched pair (e.g.
  // frequency=one-time but category=Food, left over from before the user
  // switched frequency) can never actually get submitted.
  const catsForFrequency=(freq)=>Object.entries(CATEGORY_META).filter(([k,meta])=>k!=="Savings"&&meta.period===(freq==="monthly"?"monthly":"semester"));
  const setFrequency=(freq)=>setForm(p=>{
    const opts=catsForFrequency(freq);
    const stillValid=opts.some(([k])=>k===p.category);
    return {...p, frequency:freq, category: stillValid ? p.category : (opts[0]?.[0]||p.category)};
  });
  const filtered=transactions.filter(t=>filterCat==="All"||t.category===filterCat).filter(t=>t.desc?.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const openAdd=()=>{setForm({date:new Date().toISOString().split("T")[0],desc:"",amount:"",category:"Food",type:"expense",frequency:"monthly"});setEditId(null);setSaveErr("");setShowAdd(true);};
  const openEdit=t=>{
    // Derive frequency from the transaction's existing category, since we
    // don't store frequency as its own column — it's implied by the
    // category's period tag. This keeps the two in sync automatically:
    // editing a Tuition row always opens with "One-time" selected.
    const freq=CATEGORY_META[t.category]?.period==="semester" ? "one-time" : "monthly";
    setForm({date:t.date,desc:t.desc,amount:String(t.amount),category:t.category,type:t.type,frequency:freq});
    setEditId(t.id);setSaveErr("");setShowAdd(true);
  };
  const saveForm=async()=>{
    const amt=parseFloat(form.amount);
    if(!form.desc.trim()||!form.date||isNaN(amt)) return;
    setSaving(true); setSaveErr("");
    try{
      if(editId) await updateTxn({...form,amount:amt,id:editId});
      else       await addTxn({...form,amount:amt});
      setShowAdd(false);
    }catch(e){ setSaveErr(e.message||"Failed to save"); }
    finally{ setSaving(false); }
  };
  const handleDelete=async(id)=>{
    if(!window.confirm("Delete this transaction?")) return;
    try{ await deleteTxn(id); }catch(e){ alert(e.message); }
  };
  return(
    <div className="slide-up" style={{...S.col,gap:14}}>
      <ErrorBanner message={txnError} onRetry={reloadTxns}/>
      <div style={{...S.row,gap:10}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{flex:1,background:"#fff",border:"1px solid var(--sand)",borderRadius:12,padding:"11px 16px",fontSize:14,outline:"none"}}/>
        <button onClick={reloadTxns} title="Sync from bank" style={S.sandBtn({padding:"10px 12px",fontSize:16})}>{txnLoading?<Spinner size={14}/>:"↻"}</button>
        <button onClick={openAdd} style={S.btn("#1A1714","#fff",{borderRadius:12,padding:"11px 18px"})}>+ Add</button>
      </div>
      <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:2}}>
        {["All",...Object.keys(CATEGORY_META)].map(c=><button key={c} onClick={()=>setFilterCat(c)} style={{background:filterCat===c?"#1A1714":"#fff",color:filterCat===c?"#fff":"var(--muted)",border:filterCat===c?"none":"1px solid var(--sand)",borderRadius:20,padding:"5px 12px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s"}}>{c==="All"?"All":CATEGORY_META[c]?.icon+" "+categoryLabel(c)}</button>)}
      </div>
      <Card style={{padding:0}}>
        {txnLoading&&!transactions.length&&<div style={{padding:32,textAlign:"center"}}><Spinner/></div>}
        {!txnLoading&&filtered.length===0&&<p style={{padding:32,textAlign:"center",color:"var(--muted)"}}>No transactions found.</p>}
        {filtered.map((t,i)=>{
          const m=CATEGORY_META[t.category]||CATEGORY_META.Other;
          // Plaid-synced rows (source === "plaid", or no source on legacy/demo
          // rows) are read-only — edits to bank data should come from Plaid,
          // not a manual override that would silently diverge from the bank.
          const isManual = t.source === "manual";
          return(
          <div key={t.id} style={{...S.row,padding:"12px 18px",borderBottom:i<filtered.length-1?"1px solid var(--sand)":"none"}}>
            <div style={S.iconBox(m.colorLight)}>{m.icon}</div>
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontSize:14,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.desc}</p>
              <div style={{...S.row,gap:6,marginTop:2}}>
                <span style={{fontSize:11,color:"var(--muted)"}}>{t.date}</span>
                <Badge label={categoryLabel(t.category)} color={m.color} colorLight={m.colorLight}/>
                {isManual && <Badge label="Manual" color="var(--muted)" colorLight="var(--sand)"/>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <p style={{fontSize:14,fontWeight:600,color:t.type==="income"?"var(--sage)":"var(--ink)"}}>{t.type==="income"?"+":"-"}{fmtDec(t.amount)}</p>
              {isManual ? (
                <div style={{...S.row,gap:8,marginTop:2,justifyContent:"flex-end"}}>
                  <button onClick={()=>openEdit(t)} style={{fontSize:11,color:"var(--muted)",background:"none",border:"none",cursor:"pointer"}}>Edit</button>
                  <button onClick={()=>handleDelete(t.id)} style={{fontSize:11,color:"var(--rose)",background:"none",border:"none",cursor:"pointer"}}>Delete</button>
                </div>
              ) : (
                <p style={{fontSize:10,color:"var(--stone)",marginTop:4}}>via bank sync</p>
              )}
            </div>
          </div>
        );})}
      </Card>
      {showAdd&&(
        <BottomSheet title={editId?"Edit transaction":"Add transaction"} onClose={()=>setShowAdd(false)} zIndex={150}>
          <div style={{...S.col,padding:"20px 22px 36px",overflowY:"auto",flex:1,minHeight:0}}>
            <Field label="Description"><input value={form.desc}   onChange={setF("desc")}   style={S.input}/></Field>
            <Field label="Amount ($)"><input  value={form.amount} onChange={setF("amount")} style={S.input} type="number"/></Field>
            <Field label="Date"><input        value={form.date}   onChange={setF("date")}   style={S.input} type="date"/></Field>
            <Field label="Frequency">
              <div style={{...S.row,gap:9}}>
                {[["monthly","Monthly"],["one-time","One-time"]].map(([val,label])=>(
                  <button key={val} type="button" onClick={()=>setFrequency(val)}
                    style={{flex:1,padding:"10px",borderRadius:10,border:form.frequency===val?"2px solid #1A1714":"1px solid var(--sand)",background:form.frequency===val?"#1A1714":"#fff",color:form.frequency===val?"#fff":"var(--muted)",cursor:"pointer",fontSize:14,fontWeight:500}}>
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={setF("category")} style={{...S.input,background:"#fff"}}>
                {catsForFrequency(form.frequency).map(([c,meta])=><option key={c} value={c}>{meta.icon} {categoryLabel(c)}</option>)}
              </select>
            </Field>
            <Field label="Type"><div style={{...S.row,gap:9}}>{["expense","income"].map(t=><button key={t} onClick={()=>setForm(p=>({...p,type:t}))} style={{flex:1,padding:"10px",borderRadius:10,border:form.type===t?"2px solid #1A1714":"1px solid var(--sand)",background:form.type===t?"#1A1714":"#fff",color:form.type===t?"#fff":"var(--muted)",cursor:"pointer",fontSize:14,fontWeight:500,textTransform:"capitalize"}}>{t}</button>)}</div></Field>
            {saveErr&&<p style={{fontSize:13,color:"var(--rose)"}}>{saveErr}</p>}
            <button onClick={saveForm} disabled={saving} style={S.darkBtn({marginTop:4,opacity:saving?.6:1})}>{saving?"Saving…":editId?"Save changes":"Add transaction"}</button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   GOALS
═══════════════════════════════════════════════════════════════════════════════ */
function Goals({goals, loading, error, reload, addGoal, updateGoal, deleteGoal, addFunds}){
  const [showAdd,setShowAdd]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({name:"",target:"",saved:"0",deadline:"",emoji:"🎯"});
  const EMOJIS=["🎯","✈️","🏠","🎓","💍","🚗","🏖️","💻","🎸","🌿","🐾","🏦"];
  const [saving,setSaving]=useState(false);
  const [saveErr,setSaveErr]=useState("");
  const [deletingId,setDeletingId]=useState(null);

  // Skeleton only on the very first load, before any goals (including demo
  // fallback) are available — once any data is present, prefer showing it.
  if(loading && !goals?.length){
    return(
      <div className="slide-up" style={{...S.col,gap:14}}>
        <SkeletonBlock height={46} radius={12}/>
        <SkeletonCard lines={3}/>
        <SkeletonCard lines={3}/>
      </div>
    );
  }

  const setF=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const openAdd=()=>{setForm({name:"",target:"",saved:"0",deadline:"",emoji:"🎯"});setEditId(null);setSaveErr("");setShowAdd(true);};
  const openEdit=g=>{setForm({name:g.name,target:String(g.target),saved:String(g.saved),deadline:g.deadline||"",emoji:g.emoji});setEditId(g.id);setSaveErr("");setShowAdd(true);};
  const saveForm=async()=>{
    if(!form.name.trim()||!form.target) return;
    const obj={name:form.name,target:parseFloat(form.target),saved:parseFloat(form.saved)||0,deadline:form.deadline||null,emoji:form.emoji};
    setSaving(true); setSaveErr("");
    try{
      if(editId) await updateGoal(editId, obj);
      else       await addGoal(obj);
      setShowAdd(false);
    }catch(e){ setSaveErr(e.message||"Couldn't save — please try again."); }
    finally{ setSaving(false); }
  };
  const handleDelete=async(id)=>{
    if(!window.confirm("Delete this goal? This can't be undone.")) return;
    setDeletingId(id);
    try{ await deleteGoal(id); }
    catch(e){ alert(e.message||"Couldn't delete — please try again."); }
    finally{ setDeletingId(null); }
  };
  return(
    <div className="slide-up" style={{...S.col,gap:14}}>
      <ErrorBanner message={error} onRetry={reload}/>
      <button onClick={openAdd} style={S.darkBtn()}>+ Create new goal</button>
      {goals.length===0&&<Card style={{textAlign:"center",padding:"44px 24px"}}><p style={{fontSize:38,marginBottom:10}}>🎯</p><p style={{...S.serif,fontSize:18,fontWeight:400,marginBottom:7}}>No goals yet</p><p style={{color:"var(--muted)",fontSize:14}}>Create a savings bucket for anything — a trip, an emergency fund.</p></Card>}
      {goals.map(g=>{const p=pct(g.saved,g.target);const done=p>=100;const days=g.deadline?Math.ceil((new Date(g.deadline)-new Date())/86400000):null;const pm=days>0?Math.ceil((g.target-g.saved)/Math.max(1,Math.ceil(days/30))):null;const isDeleting=deletingId===g.id;return(
        <Card key={g.id} style={{opacity:isDeleting?.5:1,transition:"opacity .2s"}}>
          <div style={S.between}><div style={{...S.row,gap:11}}><span style={{fontSize:26}}>{g.emoji}</span><div><p style={{fontSize:16,fontWeight:600}}>{g.name}</p>{done&&<span style={S.pill("var(--sage-light)","var(--sage)")}>Goal reached! 🎉</span>}</div></div><div style={{...S.row,gap:7}}><button onClick={()=>openEdit(g)} disabled={isDeleting} style={S.sandBtn()}>Edit</button><button onClick={()=>handleDelete(g.id)} disabled={isDeleting} style={S.sandBtn({background:"var(--rose-light)",color:"var(--rose)"})}>{isDeleting?<Spinner size={11}/>:"✕"}</button></div></div>
          <div style={{margin:"13px 0 9px"}}><div style={{...S.between,marginBottom:5}}><span style={{...S.serif,fontSize:20,fontWeight:300}}>{fmt(g.saved)}</span><span style={{fontSize:13,color:"var(--muted)"}}>of {fmt(g.target)}</span></div><div style={{height:8,background:"var(--sand)",borderRadius:6,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",background:done?"var(--sage)":"var(--gold)",borderRadius:6,transition:"width .5s"}}/></div><div style={{...S.between,marginTop:4}}><span style={{fontSize:11,color:"var(--muted)"}}>{p}% saved</span>{days!==null&&<span style={{fontSize:11,color:days<30?"var(--rose)":"var(--muted)"}}>{days>0?days+" days left":"Past deadline"}</span>}</div></div>
          {pm&&!done&&<p style={{fontSize:12,color:"var(--muted)",marginBottom:11,background:"var(--sand)",borderRadius:8,padding:"6px 10px"}}>💡 Save ~{fmt(pm)}/month to hit your goal on time</p>}
          {!done&&<div style={{...S.row,gap:8}}>{[50,100,250].map(a=><button key={a} onClick={()=>addFunds(g.id,a).catch(e=>alert(e.message))} disabled={isDeleting} style={S.sandBtn({flex:1,textAlign:"center",padding:"8px 0",borderRadius:9})}>+{fmt(a)}</button>)}</div>}
        </Card>
      );})}
      {showAdd&&(
        <BottomSheet title={editId?"Edit goal":"New goal"} onClose={()=>setShowAdd(false)} zIndex={150}>
          <div style={{...S.col,padding:"16px 22px 42px",overflowY:"auto",maxHeight:"70vh"}}>
            <div><label style={S.label}>Icon</label><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{EMOJIS.map(e=><button key={e} onClick={()=>setForm(p=>({...p,emoji:e}))} style={{width:42,height:42,borderRadius:10,border:form.emoji===e?"2px solid #1A1714":"1px solid var(--sand)",background:form.emoji===e?"var(--sand)":"#fff",fontSize:20,cursor:"pointer"}}>{e}</button>)}</div></div>
            <Field label="Goal name"><input value={form.name} onChange={setF("name")} placeholder="e.g. Japan trip" style={S.input}/></Field>
            <Field label="Target ($)"><input value={form.target} onChange={setF("target")} placeholder="3000" type="number" style={S.input}/></Field>
            <Field label="Already saved ($)"><input value={form.saved} onChange={setF("saved")} placeholder="0" type="number" style={S.input}/></Field>
            <Field label="Target date (optional)"><input value={form.deadline} onChange={setF("deadline")} type="date" style={S.input}/></Field>
            {saveErr&&<p style={{fontSize:13,color:"var(--rose)"}}>{saveErr}</p>}
            <button onClick={saveForm} disabled={saving} style={S.darkBtn({marginTop:4,opacity:saving?.6:1})}>{saving?"Saving…":editId?"Save changes":"Create goal"}</button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   REWARDS
═══════════════════════════════════════════════════════════════════════════════ */
/**
 * RedeemList — the actual charity selection + confirm UI. Extracted from
 * RewardsContent so it can be rendered two different ways:
 *   1. As the PRIMARY content of the outer sheet, when the user opened
 *      redemption directly (About page's "Redeem points" row) — no
 *      overview, no nested sheet, just the list itself.
 *   2. Nested inside its own BottomSheet on top of the general overview,
 *      when the user opened the overview first (e.g. via "How to earn")
 *      and then tapped the in-page "Redemption options" button to drill in.
 * asPrimary controls which of these renders — see RewardsContent below.
 */
function RedeemList({points,confirming,setConfirming,handleRedeem}){
  return(
    <div style={{...S.col,gap:12}}>
      <div style={{background:"var(--sage-light)",borderRadius:12,padding:"12px 14px",border:"1px solid #c5dac3"}}><p style={{fontSize:13,color:"var(--sage)",lineHeight:1.55}}>🌱 Every point becomes a real charitable contribution on your behalf. Points = <strong>$0.01 each</strong>.</p></div>
      {CHARITIES.map(ch=>{const canAfford=points>=ch.cost;const isC=confirming===ch.id;return(
        <div key={ch.id} style={{border:"1px solid "+(isC?"#c5dac3":"var(--sand)"),borderRadius:14,padding:"16px",background:isC?"var(--sage-light)":"#fff",transition:"all .2s"}}>
          <div style={{...S.row,gap:13,alignItems:"flex-start"}}>
            <span style={{fontSize:28,flexShrink:0}}>{ch.logo}</span>
            <div style={{flex:1}}>
              <div style={{...S.between,gap:8,marginBottom:4}}><p style={{fontSize:15,fontWeight:600}}>{ch.name}</p><Badge label={ch.cause} color="var(--sky)" colorLight="var(--sky-light)"/></div>
              <p style={{fontSize:12,color:"var(--muted)",lineHeight:1.5}}>{ch.desc}</p>
              <div style={{marginTop:10,...S.between,gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:13,color:"var(--gold)",fontWeight:600}}>{ch.cost} pts = ${(ch.cost*.01).toFixed(2)}</span>
                {!isC?(<button onClick={()=>canAfford&&setConfirming(ch.id)} style={S.btn(canAfford?"#1A1714":"var(--sand)",canAfford?"#fff":"var(--stone)",{cursor:canAfford?"pointer":"default"})}>{canAfford?"Donate":"Need more pts"}</button>):(<div style={{...S.row,gap:8}}><button onClick={()=>setConfirming(null)} style={S.sandBtn({padding:"7px 12px"})}>Cancel</button><button onClick={()=>handleRedeem(ch)} style={S.btn("var(--sage)","#fff",{padding:"7px 14px"})}>Confirm ✓</button></div>)}
              </div>
            </div>
          </div>
        </div>
      );})}
    </div>
  );
}

function RewardsContent({points,redeemed,earn,redeem,startOnRedeem=false}){
  const [showRedeem,setShowRedeem]=useState(false); // only used for the drill-in-from-overview path now
  const [confirming,setConfirming]=useState(null);
  const {cur,next,prog}=getLevelInfo(points);
  const handleRedeem=async ch=>{
    try{
      await redeem(ch);
      setConfirming(null); setShowRedeem(false);
    }catch(e){ alert(e.message); }
  };

  // Opened directly via "Redeem points" — skip the overview entirely and
  // show only the redemption list, as the sheet's actual primary content
  // (not nested inside a second sheet on top of the overview). This is the
  // fix for the original bug: "Redeem points" was opening the full
  // overview with a second sheet stacked on top, which read as "just the
  // same overview as How to earn."
  if(startOnRedeem){
    return <RedeemList points={points} confirming={confirming} setConfirming={setConfirming} handleRedeem={handleRedeem}/>;
  }

  return(
    <div style={{...S.col,gap:18}}>
      <div style={{background:"#1A1714",borderRadius:20,padding:"28px 26px 24px",color:"#F5F0E8",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-30,top:-30,width:160,height:160,background:cur.color+"1A",borderRadius:"50%"}}/>
        <div style={{...S.row,gap:14,marginBottom:18}}>
          <div style={{width:58,height:58,borderRadius:16,background:cur.color+"33",border:"2px solid "+cur.color+"88",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{cur.icon}</div>
          <div><p style={{fontSize:11,color:"#C8BAA8",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>Your level</p><p style={{...S.serif,fontSize:26,fontWeight:400}}>{cur.name}</p></div>
        </div>
        <div style={{...S.row,alignItems:"baseline",gap:6,marginBottom:16}}><span style={{...S.serif,fontSize:42,fontWeight:300,color:"#B8882A"}}>{points}</span><span style={{fontSize:15,color:"#C8BAA8"}}>points</span></div>
        {next?(<><div style={{...S.between,marginBottom:7}}><span style={{fontSize:12,color:"#C8BAA8"}}>Next: {next.icon} {next.name}</span><span style={{fontSize:12,color:"#B8882A",fontWeight:600}}>{next.min-points} pts to go</span></div><div style={{height:6,background:"rgba(255,255,255,.1)",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:prog+"%",background:"#B8882A",borderRadius:4,transition:"width .6s ease"}}/></div></>):<p style={{fontSize:13,color:"#B8882A",fontWeight:500}}>🔥 Maximum level — you're a Flow Master!</p>}
      </div>
      <Card>
        <p style={{fontSize:15,fontWeight:600,marginBottom:14}}>All levels</p>
        {LEVELS.map((l,i)=>{const reached=points>=l.min;const isCur=cur.level===l.level;return(
          <div key={l.level} style={{...S.row,padding:"10px 0",borderBottom:i<LEVELS.length-1?"1px solid var(--sand)":"none"}}>
            <div style={{width:40,height:40,borderRadius:12,background:reached?l.color+"22":"var(--sand)",border:isCur?"2px solid "+l.color:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{l.icon}</div>
            <div style={{flex:1}}><p style={{fontSize:14,fontWeight:isCur?600:400,color:reached?"var(--ink)":"var(--stone)"}}>{l.name}</p><p style={{fontSize:11,color:"var(--muted)"}}>From {l.min} pts</p></div>
            {isCur&&<span style={S.pill(l.color+"22",l.color)}>Current</span>}
            {!reached&&<span style={{fontSize:16,color:"var(--stone)"}}>🔒</span>}
            {reached&&!isCur&&<span style={{fontSize:14,color:"var(--sage)"}}>✓</span>}
          </div>
        );})}
      </Card>
      <Card>
        <p style={{fontSize:15,fontWeight:600,marginBottom:4}}>How to earn points</p>
        <p style={{fontSize:12,color:"var(--muted)",marginBottom:14}}>Points reward healthy financial behaviour — not just app usage.</p>
        {EARN_ACTIONS.map((a,i)=>(
          <div key={i} style={{...S.between,padding:"10px 0",borderBottom:i<EARN_ACTIONS.length-1?"1px solid var(--sand)":"none"}}>
            <span style={{fontSize:13,flex:1,paddingRight:12}}>{a.action}</span>
            <span style={{fontSize:13,fontWeight:600,color:"var(--gold)",whiteSpace:"nowrap"}}>+{a.pts} pts</span>
          </div>
        ))}
        <button onClick={async()=>{try{await earn("complete_monthly_review");}catch(e){alert(e.message);}}} style={{marginTop:16,width:"100%",background:"var(--gold-light)",border:"1px solid var(--gold)",borderRadius:10,padding:"11px",fontSize:13,fontWeight:600,cursor:"pointer",color:"var(--gold)"}}>✨ Simulate earning 20 pts (demo)</button>
      </Card>
      <button onClick={()=>setShowRedeem(true)} style={S.darkBtn({display:"flex",alignItems:"center",justifyContent:"center",gap:10,borderRadius:14,padding:"16px",fontSize:15})}>
        <span>🤝</span> Redemption options · {points} pts available
      </button>
      {redeemed.length>0&&(
        <Card>
          <p style={{fontSize:15,fontWeight:600,marginBottom:14}}>Your giving history</p>
          {redeemed.map((r,i)=>(
            <div key={r.id} style={{...S.row,padding:"10px 0",borderBottom:i<redeemed.length-1?"1px solid var(--sand)":"none"}}>
              <span style={{fontSize:22}}>{r.logo}</span>
              <div style={{flex:1}}><p style={{fontSize:13,fontWeight:500}}>{r.name}</p><p style={{fontSize:11,color:"var(--muted)"}}>{r.date}</p></div>
              <span style={{fontSize:13,fontWeight:600,color:"var(--sage)"}}>-{r.pts} pts</span>
            </div>
          ))}
        </Card>
      )}
      {/* Nested sheet — only reachable via the "Redemption options" button
          above, i.e. when the user opened the general overview first and
          drilled in from inside it. This is a legitimately different
          interaction from opening "Redeem points" directly (handled by the
          early return above) and correctly stays a layered sheet here. */}
      {showRedeem&&(
        <BottomSheet title="Redeem points" subtitle={`${points} pts available`} onClose={()=>{setShowRedeem(false);setConfirming(null);}} zIndex={250}>
          <div style={{overflowY:"auto",flex:1,padding:"16px 20px 36px"}}>
            <RedeemList points={points} confirming={confirming} setConfirming={setConfirming} handleRedeem={handleRedeem}/>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ABOUT
═══════════════════════════════════════════════════════════════════════════════ */
function About({profile,setProfile,points,redeemed,earn,redeem,accounts,accountsLoading,accountsError,reloadAccounts,onLogout}){
  const [section,setSection]=useState(null);
  const {cur,prog}=getLevelInfo(points);
  const [pForm,setPForm]=useState({name:profile.name||"",email:profile.email||"",phone:"",address:""});
  const [saving,setSaving]=useState(false);
  const [saveErr,setSaveErr]=useState("");
  const open=s=>()=>setSection(s);
  const close=()=>setSection(null);
  const SecLabel=({label})=><p style={{fontSize:11,color:"var(--muted)",textTransform:"uppercase",letterSpacing:1.1,fontWeight:600,padding:"18px 0 6px"}}>{label}</p>;

  const saveProfile=async()=>{
    setSaving(true);setSaveErr("");
    try{
      const res=await api.put("/auth/me",{name:pForm.name,email:pForm.email});
      // setProfile here is actually setAuthUser (see App root) — the updater's
      // `p` is the full authUser object, so spreading it preserves onboarded_at
      // and every other server field; we only overwrite name/email.
      setProfile(p=>({...p,name:res.user.name,email:res.user.email}));
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
      await plaidApi.removeItem(a.plaid_item_id||a.id);
      reloadAccounts();
    }catch(e){ alert(e.message||"Couldn't remove this account — please try again."); }
    finally{ setRemovingId(null); }
  };

  return(
    <>
      <div className="slide-up" style={{...S.col,gap:4}}>
        {/* profile hero */}
        <div style={{background:"#1A1714",borderRadius:20,padding:"24px 22px",color:"#F5F0E8",...S.row,gap:16,marginBottom:8}}>
          <div style={{width:54,height:54,borderRadius:"50%",background:"#B8882A",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,flexShrink:0,color:"#1A1714"}}>{(profile.name||"?").charAt(0).toUpperCase()}</div>
          <div style={{flex:1}}><p style={{...S.serif,fontSize:22,fontWeight:400}}>{profile.name}</p><p style={{fontSize:13,color:"#C8BAA8",marginTop:2}}>{cur.icon} {cur.name} · {points} pts</p></div>
        </div>
        <Card style={{padding:"0 20px"}}>
          <SecLabel label="My Profile"/>
          <MenuRow icon="👤" label="Personal info" sub={profile.email||"Add your email"} onClick={open("profile")}/>
          <MenuRow icon="📍" label="Address" sub={pForm.address||"Add your address"} onClick={open("profile")} noBorder/>
        </Card>
        <Card style={{padding:"0 20px"}}>
          <SecLabel label="Linked Accounts"/>
          <MenuRow icon="🏦" label="Connected banks" sub={accounts.length?accounts.length+" account"+(accounts.length===1?"":"s")+" linked":"No accounts linked"} onClick={open("accounts")} noBorder/>
        </Card>
        <Card style={{padding:"0 20px"}}>
          <SecLabel label="Rewards"/>
          <div style={{padding:"12px 0 6px",borderBottom:"1px solid var(--sand)"}}>
            <div style={{...S.row,gap:10,marginBottom:10}}>
              <span style={{fontSize:24}}>{cur.icon}</span>
              <div style={{flex:1}}><p style={{fontSize:14,fontWeight:600}}>{cur.name}</p><p style={{fontSize:12,color:"var(--muted)"}}>Level {cur.level} of {LEVELS.length}</p></div>
              <span style={{...S.serif,fontSize:20,fontWeight:300,color:"var(--gold)"}}>{points} pts</span>
            </div>
            <div style={{height:5,background:"var(--sand)",borderRadius:4,overflow:"hidden"}}><div style={{height:"100%",width:prog+"%",background:"var(--gold)",borderRadius:4}}/></div>
          </div>
          <MenuRow icon="🤝" label="Redeem points" sub="Donate to causes you care about" onClick={open("redeem")}/>
          <MenuRow icon="⭐" label="How to earn" sub="See all ways to gain points" onClick={open("rewards")} noBorder/>
        </Card>
        <Card style={{padding:"0 20px"}}>
          <SecLabel label="Privacy & Legal"/>
          <MenuRow icon="🔒" label="Privacy Policy" sub="How we handle your data" onClick={open("privacy")} noBorder/>
        </Card>
        <button onClick={onLogout} style={{background:"#fff",border:"1px solid var(--sand)",borderRadius:14,padding:"15px",fontSize:15,fontWeight:500,cursor:"pointer",color:"var(--rose)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>→ Log out</button>
        <p style={{textAlign:"center",fontSize:12,color:"var(--stone)",paddingBottom:8}}>flo·w v1.0.0 · Made with care</p>
      </div>

      {/* profile sheet */}
      {section==="profile"&&(
        <BottomSheet title="Personal info" onClose={close}>
          <div style={{...S.col,padding:"20px 22px 36px",overflowY:"auto",flex:1,minHeight:0}}>
            {[{l:"Full name",k:"name"},{l:"Email",k:"email"},{l:"Phone",k:"phone"},{l:"Home address",k:"address"}].map(f=>(
              <Field key={f.k} label={f.l}><input value={pForm[f.k]} onChange={e=>setPForm(p=>({...p,[f.k]:e.target.value}))} style={S.input}/></Field>
            ))}
            {saveErr&&<p style={{fontSize:13,color:"var(--rose)"}}>{saveErr}</p>}
            <button onClick={saveProfile} disabled={saving} style={S.darkBtn({marginTop:4,opacity:saving?.6:1})}>{saving?"Saving…":"Save changes"}</button>
          </div>
        </BottomSheet>
      )}

      {/* accounts sheet */}
      {section==="accounts"&&(
        <BottomSheet title="Linked accounts" subtitle="Powered by Plaid — we never see your credentials" onClose={close}>
          <div style={{...S.col,padding:"16px 20px 36px",overflowY:"auto",flex:1,minHeight:0}}>
            <ErrorBanner message={accountsError} onRetry={reloadAccounts}/>
            {accountsLoading && !accounts.length ? (
              <SkeletonList rows={2}/>
            ) : (
              <>
                {accounts.length===0&&<p style={{fontSize:14,color:"var(--muted)",textAlign:"center",padding:"24px 0"}}>No accounts linked yet.</p>}
                {accounts.map(a=>{
                  const isRemoving = removingId===a.id;
                  return(
                  <div key={a.id} style={{border:"1px solid var(--sand)",borderRadius:13,padding:"14px 16px",...S.between,opacity:isRemoving?.5:1,transition:"opacity .2s"}}>
                    <div style={{...S.row,gap:12}}>
                      <div style={S.iconBox("var(--sand)")}>🏦</div>
                      <div>
                        <p style={{fontSize:14,fontWeight:500}}>{a.name}</p>
                        <p style={{fontSize:12,color:"var(--muted)"}}>{a.institution_name} ···· {a.mask}</p>
                        {a.balance_current!=null&&<p style={{fontSize:12,color:"var(--muted)"}}>{fmtDec(a.balance_current)}</p>}
                        {a.item_status!=="good"&&<p style={{fontSize:11,color:"var(--rose)",fontWeight:600,marginTop:2}}>⚠️ Re-link required</p>}
                      </div>
                    </div>
                    <button onClick={()=>handleRemoveAccount(a)} disabled={isRemoving} style={S.sandBtn({background:"var(--rose-light)",color:"var(--rose)"})}>{isRemoving?<Spinner size={12}/>:"Remove"}</button>
                  </div>
                );})}
              </>
            )}
            {linkError && (
              <div style={{background:"var(--rose-light)",border:"1px solid #e8b4b2",borderRadius:12,padding:"12px 14px"}}>
                <p style={{fontSize:13,color:"var(--rose)"}}>⚠️ {linkError}</p>
              </div>
            )}
            <button onClick={openPlaidLink} disabled={linking} style={S.darkBtn({opacity:linking?.6:1})}>
              {linking?"Opening Plaid…":"+ Link a bank account"}
            </button>
            <p style={{fontSize:11,color:"var(--muted)",textAlign:"center",lineHeight:1.6}}>🔒 Your bank credentials are handled by Plaid. We only receive transaction data.</p>
          </div>
        </BottomSheet>
      )}

      {/* rewards sheet */}
      {(section==="rewards"||section==="redeem")&&(
        <BottomSheet
          title={section==="redeem" ? "Redeem points" : "Rewards"}
          subtitle={section==="redeem" ? `${points} pts available` : "Levels, points, and charitable giving"}
          onClose={close}>
          <div style={{overflowY:"auto",flex:1,padding:"16px 16px 36px"}}>
            <RewardsContent points={points} redeemed={redeemed} earn={earn} redeem={redeem} startOnRedeem={section==="redeem"}/>
          </div>
        </BottomSheet>
      )}

      {/* privacy sheet */}
      {section==="privacy"&&<PrivacyModal onClose={close}/>}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   NAV + APP ROOT
═══════════════════════════════════════════════════════════════════════════════ */
const NAV=[
  {id:"summary",      label:"Summary",  icon:"◎"},
  {id:"budget",       label:"Budget",   icon:"▦"},
  {id:"transactions", label:"Activity", icon:"↕"},
  {id:"goals",        label:"Goals",    icon:"◈"},
  {id:"about",        label:"About",    icon:"☰"},
];

export default function App(){
  // ── Auth state ──────────────────────────────────────────────────────────────
  // authUser.onboarded_at (from the DB) is the single source of truth for
  // whether onboarding is complete — no separate local "profile" state needed.
  // This means a page refresh, a new browser, or a new device all correctly
  // skip onboarding once it's been done, because the server remembers.
  const [authUser,setAuthUser]   = useState(null);
  const [authReady,setAuthReady] = useState(false);
  const [tab,setTab]             = useState("summary");

  // ── Live data hooks ─────────────────────────────────────────────────────────
  const txnHook      = useTransactions();
  const accountsHook = useAccounts();
  const goalsHook    = useGoals();
  const budgetsHook  = useBudgets();
  const rewardsHook  = useRewards();

  // ── Local UI state ──────────────────────────────────────────────────────────
  const [showRewards,setShowRewards] = useState(false);

  // ── Session check on mount ──────────────────────────────────────────────────
  useEffect(()=>{
    authApi.me()
      .then(res=>{ setAuthUser(res.user); setAuthReady(true); })
      .catch(()=>{ setAuthUser(false); setAuthReady(true); });
  },[]);

  const handleLogout=async()=>{
    try{ await authApi.logout(); }catch(_){}
    setAuthUser(false);
  };

  // Called when the onboarding flow finishes. Persists answers to the server
  // (so they survive refreshes/devices), then updates local authUser state
  // with the server's response — onboarded_at is now set, so the gate below
  // naturally falls through to the main app on the next render.
  const handleOnboardingComplete = async (answers) => {
    try {
      const res = await authApi.completeOnboarding({
        name:          answers.name,
        income:        answers.income,
        financialGoal: answers.goal,
        housingCost:   answers.housing,
        spendingStyle: answers.style,
      });
      setAuthUser(res.user);
      const h = parseFloat(answers.housing);
      if (h > 0) budgetsHook.setBudgets(p => ({ ...p, Housing: h }));
    } catch (e) {
      // If persistence fails, surface it rather than silently trapping
      // the user on the onboarding screen with no feedback.
      alert("Couldn't save your info — please try again. (" + e.message + ")");
    }
  };

  // ── Loading splash ──────────────────────────────────────────────────────────
  if(!authReady) return(
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",background:"#1A1714",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <span style={{...S.serif,fontSize:32,color:"#F5F0E8",fontWeight:300,letterSpacing:"-0.5px",opacity:.6}}>flo<span style={{color:"#B8882A"}}>·</span>w</span>
      </div>
    </>
  );

  // ── Not authenticated ───────────────────────────────────────────────────────
  if(!authUser) return(
    <><style>{CSS}</style>
    <AuthScreen onAuth={user=>setAuthUser(user)}/></>
  );

  // ── Onboarding ──────────────────────────────────────────────────────────────
  // Gate is authUser.onboarded_at, not local state — set once by the server
  // and never reset client-side except by a real account action.
  if(!authUser.onboarded_at) return(
    <><style>{CSS}</style>
    <Onboarding onComplete={handleOnboardingComplete}/></>
  );

  // ── Main app ────────────────────────────────────────────────────────────────
  const {cur:lvl}=getLevelInfo(rewardsHook.points);
  // profile is derived entirely from authUser — the server is the only
  // source of truth for name/email/onboarding answers. setProfile passed
  // to children is really setAuthUser, so any update (e.g. editing name in
  // About) flows back into the same state this gate checks.
  const profile = {
    name:          authUser.name || "",
    email:         authUser.email || "",
    income:        authUser.income,
    goal:          authUser.financial_goal,
    housing:       authUser.housing_cost,
    style:         authUser.spending_style,
  };

  const sharedProps={
    profile, setProfile:setAuthUser,
    points:   rewardsHook.points,
    redeemed: rewardsHook.history,
    earn:     rewardsHook.earn,
    redeem:   rewardsHook.redeem,
    onLogout: handleLogout,
  };

  const PAGE={
    summary:      ()=><Summary      {...sharedProps} transactions={txnHook.transactions} goals={goalsHook.goals} accounts={accountsHook.data} txnLoading={txnHook.loading} txnError={txnHook.error} reloadTxns={txnHook.reload}/>,
    budget:       ()=><Budget       transactions={txnHook.transactions} budgets={budgetsHook.budgets} setBudgets={budgetsHook.setBudgets} budgetsLoading={budgetsHook.loading} budgetsError={budgetsHook.error} reloadBudgets={budgetsHook.reload} txnLoading={txnHook.loading} txnError={txnHook.error} reloadTxns={txnHook.reload} period={budgetsHook.period} setPeriod={budgetsHook.setPeriod} refDate={budgetsHook.refDate} setRefDate={budgetsHook.setRefDate} goToToday={budgetsHook.goToToday}/>,
    transactions: ()=><Transactions {...txnHook}/>,
    goals:        ()=><Goals        {...goalsHook}/>,
    about:        ()=><About        {...sharedProps} accounts={accountsHook.data} accountsLoading={accountsHook.loading} accountsError={accountsHook.error} reloadAccounts={accountsHook.reload}/>,
  };
  const Page=PAGE[tab]||PAGE.summary;

  return(
    <>
      <style>{CSS}</style>
      <div style={{maxWidth:480,margin:"0 auto",minHeight:"100vh",display:"flex",flexDirection:"column",background:"var(--cream)"}}>
        {/* top bar */}
        <div style={{padding:"14px 18px 12px",...S.between,position:"sticky",top:0,background:"var(--cream)",zIndex:10,borderBottom:"1px solid var(--sand)"}}>
          <span style={{...S.serif,fontSize:22,fontWeight:300,letterSpacing:"-0.5px"}}>flo<span style={{color:"#B8882A"}}>·</span>w</span>
          <button onClick={()=>setShowRewards(true)} style={{...S.row,gap:7,background:"#1A1714",border:"none",borderRadius:20,padding:"7px 14px",cursor:"pointer"}}>
            <span style={{fontSize:14}}>{lvl.icon}</span>
            <span style={{fontSize:12,color:"#F5F0E8",fontWeight:500}}>{lvl.name}</span>
            <span style={{fontSize:12,color:"#B8882A",fontWeight:700}}>{rewardsHook.points} pts</span>
          </button>
        </div>
        {/* page */}
        <div style={{flex:1,padding:"18px 14px 96px",overflowY:"auto"}}>
          <Page/>
        </div>
        {/* bottom nav */}
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#fff",borderTop:"1px solid var(--sand)",display:"flex",zIndex:20,paddingBottom:16,paddingTop:6}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"4px 0"}}>
              <span style={{fontSize:16,color:tab===n.id?"#1A1714":"var(--stone)",transition:"color .15s"}}>{n.icon}</span>
              <span style={{fontSize:9,fontWeight:tab===n.id?700:400,color:tab===n.id?"#1A1714":"var(--stone)",letterSpacing:".3px"}}>{n.label}</span>
            </button>
          ))}
        </div>
      </div>
      {/* rewards overlay */}
      {showRewards&&(
        <BottomSheet title="Rewards" onClose={()=>setShowRewards(false)} zIndex={150}>
          <div style={{overflowY:"auto",flex:1,padding:"16px 14px 48px"}}>
            <RewardsContent points={rewardsHook.points} redeemed={rewardsHook.history} earn={rewardsHook.earn} redeem={rewardsHook.redeem}/>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
