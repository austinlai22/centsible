/**
 * constants.js — static catalogues and seed/demo data.
 *
 * Anything here that has a security-relevant twin on the server (point
 * values, charity prices) is DISPLAY ONLY. The server's own catalogues in
 * routes/rewards.js are authoritative; the client sends an action key or a
 * charity id and never an amount.
 */

export const LEVELS = [
  {level:1,name:"Seedling",   icon:"🌱",min:0,    color:"#4A6741"},
  {level:2,name:"Budgeter",   icon:"🌿",min:200,  color:"#2A5C8A"},
  {level:3,name:"Saver",      icon:"🌳",min:500,  color:"#B8882A"},
  {level:4,name:"Strategist", icon:"⚡",min:1000, color:"#7B5EA7"},
  {level:5,name:"Flow Master",icon:"🔥",min:2000, color:"#C0413A"},
];

export const CHARITIES = [
  {id:1,name:"GiveDirectly",        cause:"Poverty relief",cost:50, logo:"🤝",desc:"Direct cash transfers to families living in extreme poverty."},
  {id:2,name:"Cool Earth",          cause:"Climate action", cost:75, logo:"🌍",desc:"Works with rainforest communities to halt deforestation."},
  {id:3,name:"Malaria Consortium",  cause:"Global health",  cost:100,logo:"🏥",desc:"Prevents and treats malaria across sub-Saharan Africa."},
  {id:4,name:"Wikimedia Foundation",cause:"Open knowledge", cost:50, logo:"📚",desc:"Keeps Wikipedia and free knowledge accessible to all."},
  {id:5,name:"Food Bank Network",   cause:"Food security",  cost:40, logo:"🥗",desc:"Distributes meals to food-insecure families across the U.S."},
  {id:6,name:"Rainforest Alliance", cause:"Sustainability", cost:60, logo:"🌿",desc:"Protects forests and promotes sustainable farming practices."},
];

/** Charity lookup by id — used to re-attach display fields (logo/name) to
 *  server redemption rows, which only carry ids and amounts. */
export const CHARITY_BY_ID = Object.fromEntries(CHARITIES.map(c => [c.id, c]));

// Display label + point value + the server-side action key (must match
// EARN_ACTIONS in server/routes/rewards.js — the server, not the client,
// determines the actual point value awarded).
export const EARN_ACTIONS = [
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
//                months are actually in the active semester.
//   "semester" — one-time/termly (e.g. Tuition, Moving) — user enters ONE
//                flat budget number for the whole semester directly.
// Must stay in sync with CATEGORY_PERIOD in server/routes/data.js.
export const CATEGORY_META = {
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

/** Display label for a category — uses the explicit `label` override if
 *  present (for multi-word names that aren't valid as object keys). */
export const categoryLabel = (key) => CATEGORY_META[key]?.label || key;

// Demo data shown when the backend isn't reachable.
// Marked source:"plaid" so the UI treats them as read-only, same as real
// bank-synced rows — keeps demo behavior consistent with production.
export const DEMO_TRANSACTIONS = [
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

export const DEMO_GOALS = [
  {id:"dg1",name:"Japan trip",    emoji:"✈️",target:4000, saved:1200,deadline:"2026-03-01"},
  {id:"dg2",name:"Emergency fund",emoji:"🏦",target:10000,saved:3500,deadline:null},
];

export const DEMO_BUDGETS = {
  Housing:2000, Food:600, Transport:200, Shopping:300, Entertainment:150, Health:100,
  Tuition:9000, HousingDeposit:1500, HealthInsurance:800, BooksSupplies:400, Moving:250,
};

export const ONBOARDING_STEPS = [
  {id:"name",   q:"What should we call you?",              type:"text",  placeholder:"Your first name"},
  {id:"income", q:"What's your monthly take-home income?", type:"money", placeholder:"e.g. 4500"},
  {id:"goal",   q:"What's your primary financial goal?",   type:"choice",choices:["Save for a big purchase","Pay off debt","Build an emergency fund","Invest more","Just track spending"]},
  {id:"housing",q:"What's your monthly housing cost?",     type:"money", placeholder:"e.g. 1500"},
  {id:"style",  q:"How would you describe your spending?", type:"choice",choices:["Frugal & intentional","Balanced","I like to treat myself","Spontaneous spender"]},
];

export const PRIVACY_SECTIONS = [
  {title:"The short version",         body:"• We collect only what we need to make the app work for you.\n• We do not sell your data. Ever. To anyone.\n• We do not use your financial data to train AI models or for advertising.\n• You can export or delete everything we have on you, at any time.\n• If something changes, we'll tell you clearly before it takes effect."},
  // Keep in sync with §2a of flow-privacy-policy.md — this is the same
  // disclosure, and the two disagreeing is itself a compliance problem.
  {title:"What we collect and why",   body:"Name: to personalise your experience.\n\nEmail address: to identify your account, sign you in, and contact you about account or security issues.\n\nPhone number (optional): to secure your account with multi-factor authentication. Never used for marketing.\n\nHome address (optional): you can add one in Settings, and clear it at any time. The app works fully without it.\n\nOnboarding answers (income, goals, spending style): to set up your budget.\n\nTransactions you enter: to power your budget, breakdowns, and goal tracking.\n\nBank data (if connected): retrieved via a secure financial data provider (e.g. Plaid). We never see your bank username or password. You can disconnect at any time in Settings.\n\nApp diagnostics (crash logs, OS version): to fix bugs only. We do not access your location, contacts, camera, or microphone."},
  {title:"How we use your information",body:"Your data serves exactly one purpose: making flo·w useful to you.\n\nWe use it to show your spending summaries, budget progress, and goal tracking; generate alerts; calculate your financial health score and rewards; send notifications you've opted into; and improve the app from anonymised aggregate patterns.\n\nWe do NOT use your data to train AI models, serve ads, build third-party profiles, or make automated decisions affecting your finances."},
  {title:"Who we share your data with",body:"We share the minimum necessary with service providers who help us operate the app. Every provider is contractually prohibited from using your data for anything beyond the specific service they provide.\n\nWe do not share with advertisers, data brokers, or other users."},
  {title:"Your rights and controls",  body:"Access: request a full export via Settings → Privacy.\n\nDeletion: delete your account and all data via Settings → Privacy → Delete my account. Data permanently removed within 30 days.\n\nCalifornia residents (CCPA): right to know, delete, opt out of sale (we don't sell it), and non-discrimination. We extend these rights to all users."},
  {title:"Security",                  body:"TLS 1.3 in transit. AES-256 at rest. Minimal staff access, all logged. No bank credentials stored. Breach notification within 72 hours."},
  {title:"Changes to this policy",    body:"Material changes notified in-app 30 days before effect, with your explicit acknowledgement required."},
  {title:"Contact",                   body:"privacy@flowapp.com — we respond within 2 business days."},
];

export const NAV = [
  {id:"summary",      label:"Summary",  icon:"◎"},
  {id:"budget",       label:"Budget",   icon:"▦"},
  {id:"transactions", label:"Activity", icon:"↕"},
  {id:"goals",        label:"Goals",    icon:"◈"},
  {id:"about",        label:"About",    icon:"☰"},
];
