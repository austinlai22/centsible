/**
 * styles.js — design tokens, global stylesheet, and inline-style helpers.
 *
 * Colour strategy
 * ---------------
 * Primary is TEAL (#0B6E78), not the coral you might expect from Monzo's card.
 * Monzo's own digital primary is blue-green for the same reason this app needs
 * it to be: in a budgeting product, red, green and amber are already spoken
 * for. They mean "over budget", "goal reached" and "approaching limit" — those
 * meanings are load-bearing, appearing in ~90 places across the UI. A red or
 * green brand colour would make ordinary chrome indistinguishable from a
 * status warning, so the brand has to live somewhere those three don't.
 *
 * Teal is the useful compromise: it inherits blue's trust/stability
 * associations (the reason nearly every legacy bank is blue) and green's
 * growth/money associations, while colliding with neither status colour. It
 * also reads calm rather than urgent, which matters for an audience of
 * students looking at numbers that are often bad news.
 *
 * Dark surfaces (--hero) take the Revolut lesson: near-black panels for
 * emphasis, with one saturated accent. They carry their own on-dark scale
 * because light-surface tokens are unreadable on them.
 *
 * Every foreground/background pairing below was verified against WCAG 2.1;
 * the lowest text pair is 4.9:1 (AA needs 4.5:1), and the on-dark scale is
 * AAA throughout.
 *
 * Layout strategy
 * ---------------
 *   < 768px   phone    — bottom tab bar, single column, edge-to-edge
 *   768–1023  tablet   — collapsed icon rail on the left, wider content
 *   ≥ 1024px  desktop  — full sidebar with labels, multi-column card grids
 *
 * Class-based layout rather than inline styles specifically because inline
 * styles cannot express media queries.
 */

export const DISPLAY_FONTS = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const BODY_FONTS    = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

export const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    /* ── Surfaces ─────────────────────────────────────────────────────── */
    --bg:#F4F7F8;              /* page */
    --surface:#FFFFFF;         /* cards, sheets */
    --line:#DCE5E8;            /* dividers, progress tracks, quiet buttons */
    --line-strong:#B4C4CA;     /* input borders — needs to read as a control */
    --subtle:#93A7AE;          /* placeholder, disabled, "not set" */

    /* ── Text ─────────────────────────────────────────────────────────── */
    --ink:#0F2027;             /* 16.7:1 on surface */
    --muted:#5A6B72;           /* 5.6:1 on surface */

    /* ── Brand ────────────────────────────────────────────────────────── */
    --primary:#0B6E78;         /* white label sits at 6.0:1 */
    --primary-dark:#075E68;    /* hover / active */
    --primary-bg:#E4F1F2;      /* tinted fills, selected states */

    /* ── Dark hero panels, with their own on-dark scale ───────────────── */
    --hero:#06232B;
    --hero-ink:#F2F7F8;        /* 15.2:1 */
    --hero-muted:#9DB3B8;      /*  7.5:1 */
    --hero-accent:#4FD1C5;     /*  8.8:1 — replaces the old gold */

    /* ── Status. RESERVED: never use these for brand or decoration ──────
       Each has three steps: the text/icon colour, a tinted fill, and a
       mid-tone for 1px borders. Using the full-strength colour as a border
       makes an informational banner shout as loudly as an error. Status is
       always paired with an icon and words, never signalled by colour alone. */
    --success:#1A7A52;   --success-bg:#E4F3EC;   --success-line:#A7D6BF;   --success-on-hero:#5FD39B;
    --danger:#C92A2A;    --danger-bg:#FBEAEA;    --danger-line:#EEB2B2;    --danger-on-hero:#FF8A80;
    --warning:#9C5D00;   --warning-bg:#FAF0E1;   --warning-line:#E3C68C;   --warning-on-hero:#F5C26B;
    --info:#1C6FA8;      --info-bg:#E6F0F7;      --info-line:#A9C8E0;

    /* ── Shape & depth ────────────────────────────────────────────────── */
    --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:20px; --r-full:999px;
    --shadow-sm:0 1px 2px rgba(15,32,39,.06), 0 1px 3px rgba(15,32,39,.04);
    --shadow-md:0 4px 12px rgba(15,32,39,.08);
    --shadow-lg:0 16px 40px rgba(15,32,39,.16);

    --sidebar-w:240px;
  }

  html{-webkit-text-size-adjust:100%}
  body{
    background:var(--bg);
    font-family:${BODY_FONTS};
    color:var(--ink);
    -webkit-font-smoothing:antialiased;
    -moz-osx-font-smoothing:grayscale;
  }
  input,select,button,textarea{font-family:inherit}

  /* Money must line up column-to-column. Proportional digits make a list of
     currency values look ragged and genuinely harder to compare. */
  .tnum, input[type="number"]{font-variant-numeric:tabular-nums}

  /* Keyboard focus must stay visible — several controls set outline:none. */
  :focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-radius:4px}

  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:var(--r-full)}

  @keyframes slideUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
  .slide-up{animation:slideUp .3s ease both}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .fade-in{animation:fadeIn .22s ease both}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{animation:spin 1s linear infinite;display:inline-block}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @keyframes popIn{from{opacity:0;transform:scale(.97) translateY(8px)}to{opacity:1;transform:none}}

  /* ── App shell ─────────────────────────────────────────────────────────── */
  /* 100dvh, not 100vh: on mobile the dynamic viewport unit accounts for the
     collapsing URL bar, which otherwise clips the layout. */
  .shell{min-height:100dvh;display:flex;flex-direction:column;background:var(--bg)}
  @media (min-width:768px){.shell{flex-direction:row}}

  .sidebar{display:none}
  @media (min-width:768px){
    .sidebar{
      display:flex;flex-direction:column;gap:2px;
      width:var(--sidebar-w);flex-shrink:0;
      padding:22px 12px;border-right:1px solid var(--line);
      position:sticky;top:0;height:100dvh;background:var(--surface);
    }
  }
  @media (min-width:768px) and (max-width:1023px){
    :root{--sidebar-w:74px}
    .sidebar{align-items:center;padding:22px 8px}
    .sidebar-label,.sidebar-brand-text{display:none}
  }

  .sidebar-item{
    display:flex;align-items:center;gap:12px;width:100%;
    padding:11px 12px;border:none;border-radius:var(--r-md);background:none;
    cursor:pointer;text-align:left;color:var(--muted);
    font-size:14px;font-weight:500;transition:background .15s,color .15s;
  }
  .sidebar-item:hover{background:var(--primary-bg);color:var(--primary)}
  .sidebar-item[aria-current="page"]{background:var(--primary);color:#fff}
  @media (min-width:768px) and (max-width:1023px){
    .sidebar-item{justify-content:center;padding:11px 0}
  }

  .main{flex:1;min-width:0;display:flex;flex-direction:column}

  .topbar{
    position:sticky;top:0;z-index:10;background:var(--bg);
    border-bottom:1px solid var(--line);
    display:flex;align-items:center;justify-content:space-between;gap:12px;
    padding:12px 16px;
  }
  @media (min-width:1024px){.topbar{padding:16px 32px}}
  @media (min-width:768px){.topbar-brand{display:none}}

  /* Bottom padding clears the fixed tab bar plus the iOS home indicator. */
  .content{
    flex:1;width:100%;max-width:560px;margin:0 auto;
    padding:18px 14px calc(104px + env(safe-area-inset-bottom));
  }
  @media (min-width:768px){.content{max-width:760px;padding:22px 22px 40px}}
  @media (min-width:1024px){.content{max-width:1100px;padding:28px 32px 48px}}

  .bottomnav{
    position:fixed;bottom:0;left:0;right:0;z-index:20;
    background:var(--surface);border-top:1px solid var(--line);display:flex;
    padding-top:6px;padding-bottom:calc(8px + env(safe-area-inset-bottom));
  }
  @media (min-width:768px){.bottomnav{display:none}}

  .bottomnav-item{
    flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
    background:none;border:none;cursor:pointer;padding:4px 0;
    min-height:44px;   /* Apple/WCAG minimum touch target */
  }

  /* ── Buttons ───────────────────────────────────────────────────────────── */
  /* The previous design had no hover or active states at all, so nothing on
     screen responded to the pointer before it was clicked. */
  .btn{
    border:none;cursor:pointer;font-weight:600;
    border-radius:var(--r-md);
    transition:background .15s, transform .06s, box-shadow .15s, opacity .15s;
  }
  .btn:active{transform:translateY(1px)}
  .btn:disabled{cursor:default;opacity:.55;transform:none}

  .btn-primary{background:var(--primary);color:#fff}
  .btn-primary:hover:not(:disabled){background:var(--primary-dark)}

  .btn-quiet{background:var(--line);color:var(--muted)}
  .btn-quiet:hover:not(:disabled){background:var(--line-strong);color:var(--ink)}

  .btn-danger{background:var(--danger-bg);color:var(--danger)}
  .btn-danger:hover:not(:disabled){background:var(--danger);color:#fff}

  /* ── Cards ─────────────────────────────────────────────────────────────── */
  .card{
    background:var(--surface);
    border:1px solid var(--line);
    border-radius:var(--r-lg);
    box-shadow:var(--shadow-sm);
  }
  .card-interactive{transition:box-shadow .18s, transform .18s, border-color .18s}
  .card-interactive:hover{box-shadow:var(--shadow-md);border-color:var(--line-strong)}

  /* ── Responsive card grids ─────────────────────────────────────────────── */
  .grid-cards{display:grid;gap:14px;grid-template-columns:1fr}
  @media (min-width:1024px){.grid-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}

  .grid-stats{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
  @media (min-width:1024px){.grid-stats{grid-template-columns:repeat(4,minmax(0,1fr))}}

  .grid-split{display:grid;gap:16px;grid-template-columns:1fr}
  @media (min-width:1024px){.grid-split{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start}}

  /* ── Sheets: bottom sheet on phones, centred dialog on larger screens ──── */
  .sheet-backdrop{
    position:fixed;inset:0;background:rgba(6,35,43,.55);
    display:flex;align-items:flex-end;justify-content:center;
    backdrop-filter:blur(2px);
  }
  @media (min-width:768px){.sheet-backdrop{align-items:center;padding:24px}}

  .sheet-panel{
    width:100%;max-width:480px;background:var(--surface);
    border-radius:var(--r-xl) var(--r-xl) 0 0;max-height:92dvh;
    display:flex;flex-direction:column;box-shadow:var(--shadow-lg);
  }
  @media (min-width:768px){
    .sheet-panel{border-radius:var(--r-xl);max-width:560px;max-height:86dvh}
    .sheet-panel.slide-up{animation:popIn .22s ease both}
  }

  /* Tables/wide content must scroll inside themselves, never the page. */
  .scroll-x{overflow-x:auto;-webkit-overflow-scrolling:touch}

  @media (prefers-reduced-motion:reduce){
    *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
  }
`;

/* ─── Inline style helpers (component-level, non-responsive) ──────────────── */
export const S = {
  /* Display face for headings and money figures. Named `display` rather than
     `serif` since the type is now a geometric sans. */
  display: {fontFamily:DISPLAY_FONTS, letterSpacing:"-0.02em"},
  /* Money and other figures, so digits align between rows. */
  num:     {fontVariantNumeric:"tabular-nums"},

  label:   {fontSize:11,color:"var(--muted)",display:"block",marginBottom:6,textTransform:"uppercase",letterSpacing:".08em",fontWeight:600},
  input:   {width:"100%",border:"1px solid var(--line-strong)",borderRadius:var_("--r-md"),padding:"12px 14px",fontSize:16,outline:"none",background:"var(--surface)",color:"var(--ink)"},
  row:     {display:"flex",alignItems:"center",gap:12},
  col:     {display:"flex",flexDirection:"column",gap:14},
  between: {display:"flex",justifyContent:"space-between",alignItems:"center"},
  iconBox: (bg,size=38) => ({width:size,height:size,borderRadius:var_("--r-md"),background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.47,flexShrink:0}),
  pill:    (bg,color) => ({background:bg,color,borderRadius:var_("--r-sm"),padding:"3px 9px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}),

  /* btn/darkBtn/quietBtn return inline styles AND are paired with the .btn
     classes above for hover/active, which inline styles can't express. */
  btn:     (bg,color,extra={}) => ({background:bg,color,border:"none",borderRadius:var_("--r-md"),padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",...extra}),
  darkBtn: (extra={}) => ({background:"var(--primary)",color:"#fff",border:"none",borderRadius:var_("--r-md"),padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",width:"100%",...extra}),
  quietBtn:(extra={}) => ({background:"var(--line)",color:"var(--muted)",border:"none",borderRadius:var_("--r-sm"),padding:"6px 12px",fontSize:12,fontWeight:600,cursor:"pointer",...extra}),
};

function var_(name){ return `var(${name})`; }
