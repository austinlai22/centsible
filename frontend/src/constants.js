/**
 * constants.js — static catalogues and seed/demo data.
 *
 * Anything here that has a security-relevant twin on the server (point
 * values, charity prices) is DISPLAY ONLY. The server's own catalogues in
 * routes/rewards.js are authoritative; the client sends an action key or a
 * charity id and never an amount.
 */

export const LEVELS = [
  // Literal hex, NOT var() tokens: Rewards.jsx builds translucent fills by
  // concatenating hex alpha onto these (color + "1A"), and "var(--x)1A" is not
  // a colour. Values are drawn from the validated categorical palette so the
  // five tiers stay distinguishable from each other.
  {level:1,name:"Seedling",   icon:"🌱",min:0,    color:"#1baf7a"},
  {level:2,name:"Budgeter",   icon:"🌿",min:200,  color:"#2a78d6"},
  {level:3,name:"Saver",      icon:"🌳",min:500,  color:"#0e9bb5"},
  {level:4,name:"Strategist", icon:"⚡",min:1000, color:"#9c36b5"},
  {level:5,name:"Cents Master",icon:"🔥",min:2000, color:"#eb6834"},
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
  Housing:        {icon:"🏠",color:"#2a78d6",colorLight:"#EAF2FB",period:"monthly"},
  Food:           {icon:"🍔",color:"#eb6834",colorLight:"#FDF0EB",period:"monthly"},
  Transport:      {icon:"🚗",color:"#4a3aa7",colorLight:"#EDEBF6",period:"monthly"},
  Health:         {icon:"💊",color:"#008300",colorLight:"#E6F3E6",period:"monthly"},
  Shopping:       {icon:"🛍️",color:"#e87ba4",colorLight:"#FDF2F6",period:"monthly"},
  Entertainment:  {icon:"🎬",color:"#9c36b5",colorLight:"#F5EBF8",period:"monthly"},
  // transfer:true — money moved between the user's OWN accounts. It is neither
  // income nor spending, and counting it as either corrupts every headline
  // figure. With a savings account linked, Plaid reports one transfer twice:
  // positive (out of checking) and negative (into savings). Treated naively
  // that inflates income AND expenses, and makes saving money reduce the
  // reported savings rate — the app told you that you were doing worse for
  // doing the right thing.
  Savings:        {icon:"💰",color:"#1baf7a",colorLight:"#E8F7F2",period:"monthly",transfer:true},
  Other:          {icon:"📦",color:"#96591f",colorLight:"#F4EEE9",period:"monthly"},
  // ── Student categories — termly/one-time expenses, shown in Semester view ──
  // Aid money arriving. period:"semester" is load-bearing: it keeps a lump-sum
  // refund out of the monthly savings rate, the same way it keeps a tuition
  // bill out. The runway is what reasons about this money.
  Disbursement:   {icon:"🏛️",color:"#0e9bb5",colorLight:"#E7F5F8",period:"semester",label:"Aid / Disbursement"},
  Tuition:        {icon:"🎓",color:"#a61e6d",colorLight:"#F6E8F0",period:"semester"},
  HousingDeposit: {icon:"🔑",color:"#1864ab",colorLight:"#E8F0F7",period:"semester",label:"Housing Deposit"},
  HealthInsurance:{icon:"🩺",color:"#0e9bb5",colorLight:"#E7F5F8",period:"semester",label:"Health Insurance"},
  BooksSupplies:  {icon:"📚",color:"#d9480f",colorLight:"#FBEDE7",period:"semester",label:"Books & Supplies"},
  Moving:         {icon:"🚚",color:"#5f3dc4",colorLight:"#EFECF9",period:"semester"},
};

/** Display label for a category — uses the explicit `label` override if
 *  present (for multi-word names that aren't valid as object keys). */
export const categoryLabel = (key) => CATEGORY_META[key]?.label || key;

/**
 * TEST FIXTURES ONLY — not app fallbacks.
 *
 * These used to be served whenever a fetch failed OR returned nothing, so a
 * brand-new account saw eleven budgets, two goals and 340 points that looked
 * exactly like real data. Worse, editing any single budget made the client PUT
 * the whole map it was holding, permanently saving all eleven invented targets
 * (including a $9,000 tuition budget) against an account that had set none of
 * them. The hooks now show true empty states; these remain only so the render
 * tests have realistic input.
 */
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

/**
 * Onboarding asks for the minimum that cannot be inferred or deferred.
 *
 * It used to ask eight questions. Three of them — financial goal, spending
 * style, and a monthly income figure — were stored and then never read by any
 * screen, which is friction that buys nothing and sits badly against the
 * privacy policy's "minimum necessary" promise. Student type, term system and
 * expected aid moved to a setup prompt on the Summary: they genuinely improve
 * the runway, but the app is usable without them and there is no reason to
 * block a first session on them.
 *
 * What is left is what nothing else can supply: a name, and the term the
 * runway measures against.
 */
export const ONBOARDING_STEPS = [
  {id:"name", q:"What should we call you?", type:"text", placeholder:"Your first name"},

  {id:"term", q:"When does your current term run?", type:"daterange",
   hint:"Centsible measures how long your money has to last against your term. You can change these dates any time in Settings."},
];

export const PRIVACY_SECTIONS = [
  {title:"The short version",         body:"• We collect only what we need to make the app work for you.\n• We do not sell your data. Ever. To anyone.\n• We do not use your financial data to train AI models or for advertising.\n• You can request an export, or delete everything we have on you, at any time.\n• If something changes, we'll tell you clearly before it takes effect."},
  // Keep in sync with §2a of centsible-privacy-policy.md — this is the same
  // disclosure, and the two disagreeing is itself a compliance problem.
  {title:"What we collect and why",   body:"Name: to personalise your experience.\n\nEmail address: to identify your account, sign you in, and contact you about account or security issues.\n\nPhone number (optional): to secure your account with multi-factor authentication. Never used for marketing.\n\nYour term dates, and optionally your course stage and expected aid: to work out how long your money has to last.\n\nTransactions you enter: to power your budget, breakdowns, and goal tracking.\n\nBank data (if connected): retrieved via a secure financial data provider (e.g. Plaid). We never see your bank username or password. You can disconnect at any time in About.\n\nApp diagnostics (crash logs, OS version): to fix bugs only. We do not access your location, contacts, camera, or microphone."},
  {title:"How we use your information",body:"Your data serves exactly one purpose: making Centsible useful to you.\n\nWe use it to show your spending summaries, budget progress, and goal tracking; generate alerts; calculate your financial health score and rewards; send notifications you've opted into; and improve the app from anonymised aggregate patterns.\n\nWe do NOT use your data to train AI models, serve ads, build third-party profiles, or make automated decisions affecting your finances."},
  {title:"Who we share your data with",body:"We share the minimum necessary with service providers who help us operate the app. Every provider is contractually prohibited from using your data for anything beyond the specific service they provide.\n\nWe do not share with advertisers, data brokers, or other users."},
  {title:"Your rights and controls",  body:"Access: email us to request a full export — there's no self-service button for this yet.\n\nDeletion: delete your account and all data via About → Delete my account. Data permanently removed within 30 days.\n\nCalifornia residents: CCPA's legal thresholds don't apply to us at this size, but we offer the same rights anyway — to know, delete, opt out of any sale (we don't sell it), and non-discrimination. We extend these to all users regardless of state."},
  {title:"Security",                  body:"TLS 1.3 in transit. AES-256 at rest. Minimal staff access, all logged. No bank credentials stored. Breach notification within 72 hours."},
  {title:"Changes to this policy",    body:"Material changes notified in-app 30 days before effect, with your explicit acknowledgement required."},
  {title:"Contact",                   body:"[Contact email — to be added] — we respond within 2 business days."},
];

// Keep in sync with centsible-terms-of-service.md — same reasoning as
// PRIVACY_SECTIONS above.
export const TERMS_SECTIONS = [
  {title:"What Centsible is (and isn't)", body:"A budgeting tool. Not a bank — we never hold your money. Not a lender — we don't extend credit or report to credit bureaus. Not a financial advisor — nothing here is personalized financial, investment, tax, or legal advice, it's arithmetic on the numbers you and your bank give us.\n\nThis is also an early-stage, individually-run project, not a funded company. Back up decisions that matter with your own judgment and your bank's own records, not just what the app shows."},
  {title:"Who you're agreeing with",  body:"Centsible is currently operated by an individual, as an independent, unincorporated project — not a registered company. By using the app, you're agreeing with that individual, not a corporation."},
  {title:"Eligibility and your account", body:"You must be at least 18 to create an account. You're responsible for keeping your password and any two-factor recovery codes safe — losing both an authenticator and a recovery code means losing access, with no way for us to recover it. You can delete your account any time from About → Delete my account."},
  {title:"Connecting a bank account", body:"Bank connections run through Plaid Inc. We never see your bank credentials — Plaid authenticates directly with your bank. Disconnect any time from About → Connected banks. We're not responsible for Plaid's own availability or terms."},
  {title:"Accuracy",                  body:"Every figure the app shows — runway, budgets, savings rate — is only as accurate as your bank's data and what you enter yourself. We don't verify either. Don't treat any number here as a substitute for checking your actual bank balance before a decision that matters."},
  {title:"No warranty, limited liability", body:"The app is provided \"as is,\" with no guarantee of uptime, accuracy, or fitness for any particular purpose — it currently runs on free infrastructure that sleeps when idle. To the extent the law allows, liability for any claim is capped at the greater of what you've paid us in the last 12 months or $50 — since the app is free today, that's $50 in practice."},
  {title:"Disputes",                  body:"Email us first — most things get resolved directly. Unresolved disputes go to binding individual arbitration rather than court, and you and Centsible each waive the right to a jury trial or a class action. Governing law is California."},
  {title:"Changes to these Terms",    body:"Material changes are announced in-app at least 30 days before they take effect and require your explicit acknowledgement, the same as the Privacy Policy."},
  {title:"Contact",                   body:"[Contact email — to be added] — we respond within 2 business days."},
];

export const NAV = [
  {id:"summary",      label:"Summary",  icon:"◎"},
  {id:"budget",       label:"Budget",   icon:"▦"},
  {id:"transactions", label:"Activity", icon:"↕"},
  {id:"goals",        label:"Goals",    icon:"◈"},
  {id:"about",        label:"About",    icon:"☰"},
];
