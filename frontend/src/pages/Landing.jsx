import { useState, useRef, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { S } from "../styles.js";
import { Brand } from "../components/Brand.jsx";
// Lazy, unlike everything else the landing page renders. These two carry
// the full text of the Terms and the Privacy Policy — several kB of prose
// that was landing in the first-paint chunk for a modal most visitors never
// open. They are opened by a deliberate click, which is ample time to fetch
// a small chunk, and About already loads them the same way, so the two
// share one chunk rather than duplicating it.
const TermsModal   = lazy(() => import("../components/TermsModal.jsx").then(m => ({ default: m.TermsModal })));
const PrivacyModal = lazy(() => import("../components/PrivacyModal.jsx").then(m => ({ default: m.PrivacyModal })));
import { Reveal } from "../components/Reveal.jsx";
import { stagger, useInView, prefersReducedMotion } from "../lib/reveal.js";

/**
 * Landing.jsx — the public marketing page, and the first thing a signed-out
 * visitor sees at the root URL.
 *
 * Before this, the root served the login form directly. That works for the
 * handful of people who already know what the app is, and tells a first-time
 * visitor nothing at all — they arrive at a password field for a product
 * they've never heard of. Every consumer fintech this borrows from (Nubank,
 * Revolut, Monzo, SoFi) puts the explanation first and the credentials one
 * click away, top-right, exactly where people look for them.
 *
 * Design notes
 * ------------
 * Same tokens as the app, deliberately — the dark --hero panels, the teal
 * primary, the mint --hero-accent — so the page you land on and the product
 * you sign into are recognisably the same thing. The one intentional
 * departure is pill-shaped buttons (--r-full instead of the app's --r-md),
 * which is the marketing-surface idiom in all four references and reads as
 * "brochure", not "control".
 *
 * The page alternates full-bleed bands: white → dark → white → tinted → dark.
 * Layout lives in .lp-* classes in styles.js because media queries cannot be
 * expressed inline.
 *
 * What is deliberately NOT here: user counts, testimonials, press logos,
 * "trusted by N students", savings statistics. Every one of those would be
 * invented. The app is early-stage and run by one person; the Terms already
 * say so, and a landing page that implies otherwise contradicts the document
 * it links to at the bottom of itself.
 */

/* ── Content ─────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: "🛬",
    title: "Runway, not a savings rate",
    body: "How many days of money you have, against how many days of term. Plus the exact date it runs out if nothing changes — the part a monthly budgeting app structurally cannot tell you, because it has no idea when your term ends.",
  },
  {
    icon: "🏛️",
    title: "Aid disbursements on the calendar",
    body: "Tell Centsible when each payment is due. Your runway then targets the next payment rather than an abstract month end — and if one is overdue, that warning outranks everything else on the screen.",
  },
  {
    icon: "🎓",
    title: "Your term, whatever it's called",
    body: "Set your own start and end dates and name them yourself. Semesters, quarters, trimesters, Michaelmas — the arithmetic doesn't care what your school calls it.",
  },
  {
    icon: "▦",
    title: "Budgets that know the difference",
    body: "Rent recurs every month. Tuition, books, a housing deposit and a health-insurance charge happen once a term. Centsible budgets those separately instead of smearing them across twelve months into a number that means nothing.",
  },
  {
    icon: "🏦",
    title: "Link a bank, or don't",
    body: "Connect an account through Plaid for real balances and automatic categorising — or type transactions in by hand. Both paths work, and the runway is honest about which one it's using.",
  },
  {
    icon: "◈",
    title: "Goals, and points worth something",
    body: "Save toward something specific with a target and a deadline. Earn points for staying under budget or keeping a logging streak, and redeem them as donations to real charities.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create an account",
    body: "An email and a password. No card, no trial timer, nothing to cancel later.",
  },
  {
    n: "02",
    title: "Say when your term runs",
    body: "Two dates. Add your expected aid payments too if you know them — or leave it and add them from Settings whenever they're confirmed.",
  },
  {
    n: "03",
    title: "Link a bank, or log a few days",
    body: "Either way, your runway appears as soon as there's enough history to project from honestly — and not a moment before.",
  },
];

const OUTCOMES = [
  {
    label: "The date",
    body: "Not “you're overspending a bit.” A specific day — the one your money runs out, and how many days short of your next payment that lands.",
  },
  {
    label: "The daily number",
    body: "What you're actually spending per day, sitting next to what you can afford per day for the rest of the term. The gap between them is the entire story.",
  },
  {
    label: "The one change",
    body: "A single lever sized against your own spending: how much less per day closes the gap, and roughly what that looks like in the category you'd feel it least.",
  },
];

const TRUST = [
  { icon: "🔐", title: "Your bank password never reaches us", body: "Connections run through Plaid, which authenticates with your bank directly. Centsible never receives or stores your credentials, and you can disconnect from inside the app." },
  { icon: "🛡️", title: "TLS 1.3 in transit, AES-256 at rest", body: "Optional two-factor authentication with an authenticator app and recovery codes, and no bank credentials stored anywhere in the system." },
  { icon: "🚫", title: "We don't sell your data", body: "Not to advertisers, not to data brokers, not to anyone. It isn't used to train AI models or build ad profiles either. There is no version of this that pays the bills." },
  { icon: "🗑️", title: "Leave with nothing left behind", body: "Delete your account and everything attached to it from About → Delete my account. Permanently removed within 30 days." },
];

const INCLUDED = [
  "Runway, budgets, activity and goals",
  "Bank connections through Plaid",
  "Aid disbursement tracking and overdue alerts",
  "Two-factor authentication",
  "Points, levels and charity donations",
  "Delete everything, any time",
];

const FAQS = [
  {
    q: "Is it actually free, or free for now?",
    a: "Free, in full, today — there is no paid tier, no trial, no feature held back, and no card collected at signup. It's also fair to be straight about the future: this is an early-stage project, not a funded company, so nobody can promise what the economics look like in three years. What is promised, and written into the Terms, is that a material change gets announced in-app 30 days before it takes effect.",
  },
  {
    q: "Do I have to connect a bank account?",
    a: "No. You can log transactions by hand and everything works — the runway, budgets, goals, all of it. Linking a bank buys you real balances and automatic categorising, which mostly buys you not having to remember. It's a convenience, not a requirement.",
  },
  {
    q: "Can Centsible see my bank login?",
    a: "No. Bank connections go through Plaid, which authenticates directly with your bank; your username and password are never sent to Centsible and never stored here. You can disconnect a bank at any time from About → Connected banks.",
  },
  {
    q: "What exactly is “runway”?",
    a: "The money you have available divided by what you're actually spending per day, measured against the days left until your next aid payment — or the end of term, whichever comes first. It's arithmetic: date maths, a trailing average, and a division. No model, no prediction, nothing you can't check by hand.",
  },
  {
    q: "What if I've only just signed up?",
    a: "Then it will tell you so. With two transactions of history there is no honest projection to make, and a confident-looking number built on noise is worse than an empty one — so the card says it doesn't have enough yet and asks for a few days of spending instead of guessing.",
  },
  {
    q: "I'm not on financial aid. Is this useful?",
    a: "Probably, if your money arrives in lumps — a stipend, a grant, a summer of work funding a year of study. If you're paid the same amount every month, a conventional budgeting app fits that shape better, and we'd rather say so than talk you into the wrong tool.",
  },
  {
    q: "My school doesn't use semesters.",
    a: "Fine. You set the start and end dates and the name yourself, so quarters, trimesters, and terms with names nobody outside your university recognises all work identically. Nothing in the maths assumes a particular calendar.",
  },
  {
    q: "Who's actually behind this?",
    a: "One person, building it as an independent project — not a registered company, and not a team. That's disclosed in the Terms of Service rather than buried, because it changes what you should reasonably expect: back up decisions that matter with your bank's own records, not just what this app shows you.",
  },
  {
    q: "Is any of this financial advice?",
    a: "No. Centsible is a budgeting tool — not a bank, not a lender, not a financial advisor. It never holds your money and never extends credit. Every figure is arithmetic on numbers you and your bank supply, and neither of those is verified, so check your real balance before any decision that matters.",
  },
  {
    q: "How old do I have to be?",
    a: "18 or over to create an account.",
  },
];

/* ── The hero product shot ───────────────────────────────────────────────── */

/**
 * A static replica of the real RunwayCard, in its "cutting it fine" state.
 *
 * Rendered rather than screenshotted so it stays sharp at any size, inherits
 * the live design tokens, and can't drift out of date as a stale PNG would.
 *
 * The figures are internally consistent, which matters more than it sounds —
 * a hero mock with numbers that don't divide is the first thing a careful
 * reader notices: $1,240 available ÷ $32.40/day = 38 days of runway; 52 days
 * left to term end means $1,240 ÷ 52 = $23.85/day sustainable; 38 days from
 * Oct 21 is Nov 28, which is 52 − 38 = 14 days short; and closing the gap
 * needs $32.40 − $23.85 = $8.55/day less.
 *
 * On arrival the card animates itself into that state: the bar fills from
 * empty and the headline figure counts down to 38. It is showing what the
 * real card shows — a number falling and a term filling up — so the motion
 * is the product's own story rather than decoration bolted onto a still.
 *
 * aria-hidden, as it always was. A counter ticking sixty times a second is
 * exactly the kind of thing that should never reach a screen reader, and
 * the surrounding copy already says everything this picture does.
 */
const DAYS_TO   = 38;    // where the figure lands — the card's real number
const DAYS_FROM = 100;   // where the count starts
const COUNT_MS  = 1500;
const COUNT_DELAY_MS = 320;   // kept in step with .lp-mock-fill's transition-delay

function RunwayMock() {
  const covered = Math.round((DAYS_TO / 52) * 100); // 73%
  const [cardRef, inView] = useInView();
  const daysRef = useRef(null);
  const [filled, setFilled] = useState(false);

  // Seed the starting figure BEFORE the first paint. The JSX renders the
  // final 38 so that the correct number is what exists without JavaScript,
  // under reduced motion, and in any snapshot of the markup — but painting
  // 38 and then snapping to 100 to count back down is a flicker, and
  // useEffect would run too late to prevent it.
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    if (daysRef.current) daysRef.current.textContent = String(DAYS_FROM);
  }, []);

  useEffect(() => {
    if (!inView) return;
    setFilled(true);                       // CSS handles the bar from here
    if (prefersReducedMotion()) return;
    const el = daysRef.current;
    if (!el) return;

    // Written straight to the DOM rather than through state: this ticks
    // ~90 times over a second and a half, and it does so while the whole
    // hero is mid-reveal. Ninety reconciliations of the surrounding card
    // buys nothing — nothing else on screen depends on the value.
    let raf = 0, startedAt = 0;
    const tick = (now) => {
      if (!startedAt) startedAt = now;
      const elapsed = now - startedAt - COUNT_DELAY_MS;
      if (elapsed >= 0) {
        const t = Math.min(1, elapsed / COUNT_MS);
        // easeOutCubic: leaves quickly, settles gently onto the final
        // number instead of stopping dead on it.
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(DAYS_FROM + (DAYS_TO - DAYS_FROM) * eased));
        if (t >= 1) return;                // lands exactly on DAYS_TO
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView]);

  return (
    <div ref={cardRef} className="card" aria-hidden="true"
      style={{ padding: "22px 22px 22px 21px", borderLeft: "3px solid var(--warning)", boxShadow: "var(--shadow-lg)" }}>
      <div style={{ ...S.between, gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>
            Runway · Fall 2026
          </p>
          <p className="tnum" style={{ ...S.display, fontSize: 34, fontWeight: 700, marginTop: 4, color: "var(--warning)" }}>
            <span ref={daysRef}>{DAYS_TO}</span> days
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            of money, but <strong style={{ color: "var(--ink)" }}>52 days</strong> left to Dec 12
          </p>
        </div>
        <span style={{ ...S.pill("var(--warning-bg)", "var(--warning)"), fontSize: 12, padding: "6px 12px", flexShrink: 0 }}>
          Cutting it fine
        </span>
      </div>

      <div style={{ height: 8, background: "var(--line)", borderRadius: "var(--r-full)", overflow: "hidden" }}>
        <div className={filled ? "lp-mock-fill is-filled" : "lp-mock-fill"}
          style={{ height: "100%", background: "var(--warning)", borderRadius: "var(--r-full)", "--fill": covered / 100 }} />
      </div>

      <div style={{ ...S.between, gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <span className="tnum" style={{ fontSize: 12, color: "var(--muted)" }}>
          Spending <strong style={{ color: "var(--ink)" }}>$32.40</strong>/day
        </span>
        <span className="tnum" style={{ fontSize: 12, color: "var(--muted)" }}>
          Sustainable: <strong style={{ color: "var(--ink)" }}>$23.85</strong>/day
        </span>
      </div>

      <div style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-line)", borderRadius: "var(--r-md)", padding: "12px 14px", marginTop: 14 }}>
        <p style={{ fontSize: 13, color: "var(--warning)", lineHeight: 1.6 }}>
          At this rate your money runs out <strong>Nov 28</strong> — 14 days before the term ends.
          Spending $8.55/day less closes the gap — about <strong>3 fewer food purchases a week</strong> 🍔
        </p>
      </div>
    </div>
  );
}

/* ── Small building blocks ───────────────────────────────────────────────── */

const Eyebrow = ({ children, on = "light" }) => (
  <span style={{
    display: "inline-block", marginBottom: 18,
    fontSize: 12, fontWeight: 600, letterSpacing: ".07em", textTransform: "uppercase",
    padding: "7px 14px", borderRadius: "var(--r-full)",
    background: on === "dark" ? "rgba(79,209,197,.13)" : "var(--primary-bg)",
    color: on === "dark" ? "var(--hero-accent)" : "var(--primary)",
  }}>{children}</span>
);

const Check = ({ children }) => (
  <li style={{ ...S.row, gap: 11, alignItems: "flex-start", listStyle: "none" }}>
    <span style={{ color: "var(--success)", fontSize: 15, lineHeight: 1.55, flexShrink: 0 }}>✓</span>
    <span style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.55 }}>{children}</span>
  </li>
);

/**
 * The top-right buttons, and every "create an account" CTA further down.
 *
 * A signed-in visitor gets one button into their account instead of a login
 * form they don't need — that is the whole reason the landing page is public
 * to them. `signedIn` may be the cached hint rather than a confirmed answer
 * (see lib/router.js): rendering optimistically is what keeps this from
 * being a spinner during a cold start, and being wrong costs one redirect.
 *
 * `authReady` is not used to gate rendering, only to soften the correction:
 * once the real answer lands the buttons cross-fade rather than snapping,
 * so the rare hint-was-wrong case reads as the page settling.
 */
const AuthCta = ({ signedIn, authReady, userName, onLogin, onSignup, onOpenApp, size = "sm" }) => {
  const cls = size === "lg" ? "lp-btn-lg" : "lp-btn-sm";
  if (signedIn) return (
    <button type="button" className={`lp-btn ${cls} lp-btn-primary`} onClick={onOpenApp}
      style={{ transition: authReady ? "opacity .2s" : "none" }}>
      {userName ? `Open Centsible, ${userName} →` : "Open Centsible →"}
    </button>
  );
  return (
    <>
      <button type="button" className={`lp-btn ${cls} lp-btn-plain`} onClick={onLogin}>Log in</button>
      <button type="button" className={`lp-btn ${cls} lp-btn-primary`} onClick={onSignup}>Sign up</button>
    </>
  );
};

const FooterCol = ({ title, children }) => (
  <div>
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--hero-ink)", marginBottom: 10 }}>
      {title}
    </p>
    {children}
  </div>
);

/* ── Page ────────────────────────────────────────────────────────────────── */

export function Landing({ onLogin, onSignup, onOpenApp, signedIn = false, authReady = false, userName = "" }) {
  const [legal, setLegal] = useState(null); // "terms" | "privacy" | null

  const cta = { signedIn, authReady, userName, onLogin, onSignup, onOpenApp };
  // Every in-page "create an account" button becomes "open the app" for
  // someone who already has one — inviting a signed-in user to sign up again
  // is the tell that a landing page was only ever built for strangers.
  const primaryAction = signedIn ? onOpenApp : onSignup;
  const primaryLabel  = signedIn ? "Open Centsible →" : "Create a free account →";

  return (
    <div className="lp">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <div className="lp-nav-in">
          <a href="#top" style={{ textDecoration: "none", color: "var(--ink)", display: "flex" }} aria-label="Centsible, home">
            <Brand size={22} />
          </a>
          <nav className="lp-nav-links" aria-label="Page sections">
            <a className="lp-nav-link" href="#what">What it does</a>
            <a className="lp-nav-link" href="#how">How it works</a>
            <a className="lp-nav-link" href="#pricing">Pricing</a>
            <a className="lp-nav-link" href="#faq">FAQ</a>
          </nav>
          <div className="lp-nav-cta">
            <AuthCta {...cta} />
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section id="top" className="lp-dark">
        <div className="lp-wrap lp-band">
          <div className="lp-hero-grid">
            <div>
              {/* The hero is already in view on load, so its observer fires
                  on the first frame — the reveal reads as the page arriving
                  rather than as a scroll effect. Same mechanism, no special
                  case for above-the-fold. */}
              <Reveal><Eyebrow on="dark">For students living term to term</Eyebrow></Reveal>
              {/* The space before <br /> is load-bearing: a <br> contributes
                  nothing to textContent, so without it the heading reads as
                  "Make your moneylast the term." to anything matching on text
                  — screen readers, in-page find, and the production smoke
                  test, which asserts on exactly this string. */}
              <Reveal as="h1" className="lp-h1" delay={70}>
                Make your money <br />last the term.
              </Reveal>
              <Reveal as="p" className="lp-lead" delay={140} style={{ color: "var(--hero-muted)", marginTop: 20, maxWidth: 520 }}>
                Most budgeting apps assume a paycheck every month. Centsible assumes what you
                actually get — one disbursement, then a long gap. It tells you how many days of
                money you have left, and the date it runs out.
              </Reveal>
              <Reveal delay={210} style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
                <button type="button" className="lp-btn lp-btn-lg lp-btn-accent" onClick={primaryAction}>
                  {primaryLabel}
                </button>
                <a className="lp-btn lp-btn-lg lp-btn-ghost" href="#how">See how it works</a>
              </Reveal>
              <Reveal as="p" delay={260} style={{ fontSize: 13, color: "var(--hero-muted)", marginTop: 20 }}>
                Free · No ads · No card required · We never sell your data
              </Reveal>
            </div>
            <Reveal delay={180}><RunwayMock /></Reveal>
          </div>
        </div>
      </section>

      {/* ── The problem ─────────────────────────────────────────────────── */}
      <section className="lp-wrap lp-band">
        <Reveal style={{ maxWidth: 720 }}>
          <Eyebrow>The problem</Eyebrow>
          <h2 className="lp-h2">
            A monthly savings rate can't answer the question you actually have.
          </h2>
        </Reveal>
        <div className="lp-grid-2" style={{ marginTop: 34 }}>
          <Reveal className="lp-card" style={{ background: "var(--bg)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 12 }}>
              What most apps measure
            </p>
            <p className="lp-h3" style={{ marginBottom: 10 }}>“What fraction did you save this month?”</p>
            <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7 }}>
              A good question on a salary. On one aid disbursement, it celebrates the month the
              money landed and then goes blank for the next four — measuring something that
              isn't happening, in a rhythm your money doesn't have.
            </p>
          </Reveal>
          <Reveal className="lp-card" delay={90} style={{ borderColor: "var(--primary)", borderWidth: 1, boxShadow: "var(--shadow-md)" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--primary)", marginBottom: 12 }}>
              What Centsible measures
            </p>
            <p className="lp-h3" style={{ marginBottom: 10 }}>“How many days of money do I have left?”</p>
            <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7 }}>
              And does that reach the next payment. Same arithmetic underneath — aimed at the
              deadline you actually live against, which is the day the aid runs out, not the
              last day of a calendar month.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── What it does ────────────────────────────────────────────────── */}
      <section id="what" className="lp-anchor lp-tint">
        <div className="lp-wrap lp-band">
          <Reveal style={{ maxWidth: 680 }}>
            <Eyebrow>What it does</Eyebrow>
            <h2 className="lp-h2">Built around a term, not a month.</h2>
            <p className="lp-lead" style={{ color: "var(--muted)", marginTop: 16 }}>
              Every part of the app assumes money arrives in lumps and has to stretch. That one
              assumption changes what's worth showing you.
            </p>
          </Reveal>
          <div className="lp-grid-3" style={{ marginTop: 36 }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} className="lp-card lp-card-hover" delay={stagger(i)}>
                <div style={{ ...S.iconBox("var(--primary-bg)", 44), marginBottom: 16, fontSize: 21 }}>{f.icon}</div>
                <p className="lp-h3" style={{ marginBottom: 9 }}>{f.title}</p>
                <p style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.68 }}>{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── The outcome ─────────────────────────────────────────────────── */}
      <section className="lp-dark">
        <div className="lp-wrap lp-band">
          <Reveal style={{ maxWidth: 720 }}>
            <Eyebrow on="dark">The outcome</Eyebrow>
            <h2 className="lp-h2">Three numbers, and one thing to do about them.</h2>
            <p className="lp-lead" style={{ color: "var(--hero-muted)", marginTop: 16 }}>
              You don't open a budgeting app to admire a chart. You open it to find out whether
              you're fine — and if you aren't, what to change.
            </p>
          </Reveal>
          <div className="lp-grid-3" style={{ marginTop: 36 }}>
            {OUTCOMES.map((o, i) => (
              <Reveal key={o.label} className="lp-card-dark" delay={stagger(i)}>
                <p className="tnum" style={{ ...S.display, fontSize: 30, fontWeight: 800, color: "var(--hero-accent)", lineHeight: 1 }}>
                  {String(i + 1).padStart(2, "0")}
                </p>
                <p className="lp-h3" style={{ color: "var(--hero-ink)", margin: "14px 0 9px" }}>{o.label}</p>
                <p style={{ fontSize: 14.5, color: "var(--hero-muted)", lineHeight: 1.68 }}>{o.body}</p>
              </Reveal>
            ))}
          </div>
          <Reveal as="p" style={{ fontSize: 15, color: "var(--hero-muted)", lineHeight: 1.7, marginTop: 28, maxWidth: 720 }}>
            And when there isn't enough history to say any of that honestly, Centsible says so
            rather than guessing. A confident number built on four transactions is worse than
            no number at all.
          </Reveal>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="lp-anchor lp-wrap lp-band">
        <Reveal style={{ maxWidth: 680 }}>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="lp-h2">Three steps, about two minutes.</h2>
        </Reveal>
        <div className="lp-grid-3" style={{ marginTop: 36 }}>
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={stagger(i, 90)}>
              <p className="tnum" style={{ ...S.display, fontSize: 15, fontWeight: 800, color: "var(--primary)", letterSpacing: ".06em" }}>
                {s.n}
              </p>
              <div style={{ height: 2, background: "var(--primary-bg)", margin: "12px 0 18px", borderRadius: 2 }} />
              <p className="lp-h3" style={{ marginBottom: 9 }}>{s.title}</p>
              <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.7 }}>{s.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal style={{ marginTop: 40 }}>
          <button type="button" className="lp-btn lp-btn-lg lp-btn-primary" onClick={primaryAction}>
            {signedIn ? "Open Centsible →" : "Start now — it's free →"}
          </button>
        </Reveal>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className="lp-anchor lp-tint">
        <div className="lp-wrap lp-band">
          <Reveal style={{ maxWidth: 680 }}>
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="lp-h2">Free. The whole thing.</h2>
            <p className="lp-lead" style={{ color: "var(--muted)", marginTop: 16 }}>
              Not a free tier with the useful half removed. There is one version of Centsible
              and this is it.
            </p>
          </Reveal>

          <div className="lp-grid-2" style={{ marginTop: 36, alignItems: "stretch" }}>
            <Reveal className="lp-card" style={{ boxShadow: "var(--shadow-md)", borderColor: "var(--primary)", padding: 30 }}>
              <div style={{ ...S.row, alignItems: "baseline", gap: 8 }}>
                <span className="tnum" style={{ ...S.display, fontSize: 52, fontWeight: 800, color: "var(--ink)", letterSpacing: "-.04em" }}>$0</span>
                <span style={{ fontSize: 16, color: "var(--muted)", fontWeight: 500 }}>/ forever</span>
              </div>
              <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}>
                No card at signup. No trial that expires. Nothing to cancel.
              </p>
              <ul style={{ ...S.col, gap: 12, margin: "24px 0 28px" }}>
                {INCLUDED.map(i => <Check key={i}>{i}</Check>)}
              </ul>
              <button type="button" className="lp-btn lp-btn-lg lp-btn-primary" style={{ width: "100%" }} onClick={primaryAction}>
                {signedIn ? "Open Centsible →" : "Create your account →"}
              </button>
            </Reveal>

            <Reveal className="lp-card" delay={90} style={{ background: "var(--surface)", padding: 30, display: "flex", flexDirection: "column" }}>
              <p className="lp-h3" style={{ marginBottom: 14 }}>Why it's free — and what that means</p>
              <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.72 }}>
                Budgeting apps usually make money three ways: a subscription, ads, or selling
                the data. Centsible does none of them. It's an early-stage project built by one
                person rather than a funded company, and it currently runs on infrastructure
                cheap enough that giving it away costs almost nothing.
              </p>
              <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.72, marginTop: 14 }}>
                The honest version of that: nobody can promise what the economics look like in
                three years. What is promised, and written into the Terms, is that any material
                change gets announced in the app 30 days before it takes effect — and that
                selling your data is never one of the options.
              </p>
              <div style={{ marginTop: "auto", paddingTop: 22 }}>
                <button type="button" onClick={() => setLegal("terms")}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--primary)", fontSize: 14, fontWeight: 600 }}>
                  Read the Terms →
                </button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Trust ───────────────────────────────────────────────────────── */}
      <section className="lp-wrap lp-band">
        <Reveal style={{ maxWidth: 680 }}>
          <Eyebrow>Privacy &amp; security</Eyebrow>
          <h2 className="lp-h2">It's your money. It stays your data.</h2>
        </Reveal>
        <div className="lp-grid-2" style={{ marginTop: 34 }}>
          {TRUST.map((t, i) => (
            <Reveal key={t.title} delay={stagger(i)} style={{ ...S.row, gap: 16, alignItems: "flex-start" }}>
              <div style={{ ...S.iconBox("var(--primary-bg)", 42), fontSize: 19 }}>{t.icon}</div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{t.title}</p>
                <p style={{ fontSize: 14.5, color: "var(--muted)", lineHeight: 1.68 }}>{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal as="p" style={{ fontSize: 14, color: "var(--muted)", marginTop: 30 }}>
          The full detail is in the{" "}
          <button type="button" onClick={() => setLegal("privacy")}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--primary)", fontSize: 14, fontWeight: 600, textDecoration: "underline" }}>
            Privacy Policy
          </button>.
        </Reveal>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="lp-anchor lp-tint">
        <div className="lp-wrap lp-band">
          <Reveal style={{ maxWidth: 680, marginBottom: 30 }}>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="lp-h2">The questions worth answering upfront.</h2>
          </Reveal>
          {/* Revealed per row, but with a much shorter step than the card
              grids: ten items at the usual 70ms would still be cascading
              long after the reader has started reading the first one. */}
          <div style={{ maxWidth: 820 }}>
            {FAQS.map((f, i) => (
              <Reveal as="details" key={f.q} className="lp-faq" delay={stagger(i, 35, 180)}>
                <summary>{f.q}</summary>
                <p className="lp-faq-body">{f.a}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <section className="lp-dark">
        <div className="lp-wrap lp-band" style={{ textAlign: "center" }}>
          <Reveal as="h2" className="lp-h2" style={{ maxWidth: 640, margin: "0 auto" }}>
            Find out how long your money actually lasts.
          </Reveal>
          <Reveal as="p" className="lp-lead" delay={70} style={{ color: "var(--hero-muted)", marginTop: 16, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Two dates and a few days of spending is enough to get a real answer.
          </Reveal>
          <Reveal delay={140} style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 28 }}>
            <button type="button" className="lp-btn lp-btn-lg lp-btn-accent" onClick={primaryAction}>
              {primaryLabel}
            </button>
            {/* The second button is "I already have an account", which is
                exactly the thing a signed-in visitor does not need told. */}
            {!signedIn && (
              <button type="button" className="lp-btn lp-btn-lg lp-btn-ghost" onClick={onLogin}>
                I already have one
              </button>
            )}
          </Reveal>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="lp-dark" style={{ borderTop: "1px solid rgba(255,255,255,.09)" }}>
        <div className="lp-wrap" style={{ paddingTop: 48, paddingBottom: 40 }}>
          <div className="lp-footer-grid">
            <div>
              <span style={{ color: "var(--hero-ink)" }}><Brand size={22} on="dark" /></span>
              <p style={{ fontSize: 14, color: "var(--hero-muted)", marginTop: 10, lineHeight: 1.65, maxWidth: 300 }}>
                Budgeting built for students whose money arrives once a term and has to last
                until the next one.
              </p>
            </div>

            <FooterCol title="Product">
              <a className="lp-footer-link" href="#what">What it does</a>
              <a className="lp-footer-link" href="#how">How it works</a>
              <a className="lp-footer-link" href="#pricing">Pricing</a>
              <a className="lp-footer-link" href="#faq">FAQ</a>
            </FooterCol>

            <FooterCol title="Account">
              {signedIn ? (
                <button type="button" className="lp-footer-link" onClick={onOpenApp}>Open Centsible</button>
              ) : (
                <>
                  <button type="button" className="lp-footer-link" onClick={onLogin}>Log in</button>
                  <button type="button" className="lp-footer-link" onClick={onSignup}>Sign up</button>
                </>
              )}
            </FooterCol>

            <FooterCol title="Legal">
              <button type="button" className="lp-footer-link" onClick={() => setLegal("terms")}>Terms of Service</button>
              <button type="button" className="lp-footer-link" onClick={() => setLegal("privacy")}>Privacy Policy</button>
            </FooterCol>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,.09)", marginTop: 36, paddingTop: 22 }}>
            <p style={{ fontSize: 12.5, color: "var(--hero-muted)", lineHeight: 1.7, maxWidth: 760 }}>
              Centsible is a budgeting tool — not a bank, a lender, or a financial advisor. It
              never holds your money and nothing in it is personalised financial advice. Figures
              are only as accurate as your bank's data and what you enter, neither of which is
              verified. Bank connections are provided by Plaid Inc.
            </p>
            <p style={{ fontSize: 12.5, color: "var(--hero-muted)", marginTop: 14 }}>
              © {new Date().getFullYear()} Centsible — an independent project.
            </p>
          </div>
        </div>
      </footer>

      {/* No fallback: the modals are portalled over the page, which stays
          fully readable underneath, so a spinner would only flash a
          placeholder over content the reader can already see. */}
      <Suspense fallback={null}>
        {legal === "terms" && <TermsModal onClose={() => setLegal(null)} />}
        {legal === "privacy" && <PrivacyModal onClose={() => setLegal(null)} />}
      </Suspense>
    </div>
  );
}
