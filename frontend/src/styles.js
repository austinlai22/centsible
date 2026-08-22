/**
 * styles.js — design tokens, global stylesheet, and inline-style helpers.
 *
 * Layout model
 * ------------
 * The app used to be hard-capped at 480px on every screen, so a desktop
 * browser rendered a phone-width column floating in the middle of a monitor.
 * It's now three layouts driven purely by CSS media queries (no JS, no
 * resize listeners, no hydration mismatch):
 *
 *   < 768px   phone    — bottom tab bar, single column, edge-to-edge
 *   768–1023  tablet   — collapsed icon rail on the left, wider content
 *   ≥ 1024px  desktop  — full sidebar with labels, multi-column card grids
 *
 * Class-based layout rather than inline styles specifically because inline
 * styles cannot express media queries — that limitation is why the original
 * was stuck at one size.
 */

export const BRAND_FONTS = "'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
export const SERIF_FONTS = "Fraunces, Georgia, 'Times New Roman', serif";

export const CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    --cream:#F5F0E8;--sand:#E8DFD0;--stone:#C8BAA8;--ink:#1A1714;
    --muted:#6B6259;--sage:#4A6741;--sage-light:#E8F0E6;
    --rose:#C0413A;--rose-light:#FAE8E7;--gold:#B8882A;
    --gold-light:#FDF3DC;--sky:#2A5C8A;--sky-light:#E4EEF7;
    --sidebar-w:240px;
  }

  html{-webkit-text-size-adjust:100%}
  body{
    background:var(--cream);
    font-family:${BRAND_FONTS};
    color:var(--ink);
    -webkit-font-smoothing:antialiased;
    -moz-osx-font-smoothing:grayscale;
  }
  input,select,button,textarea{font-family:inherit}

  /* Keyboard focus must stay visible — several controls set outline:none. */
  :focus-visible{outline:2px solid var(--sky);outline-offset:2px;border-radius:4px}

  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:var(--stone);border-radius:4px}

  @keyframes slideUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
  .slide-up{animation:slideUp .3s ease both}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .fade-in{animation:fadeIn .22s ease both}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{animation:spin 1s linear infinite;display:inline-block}
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @keyframes popIn{from{opacity:0;transform:scale(.97) translateY(8px)}to{opacity:1;transform:none}}

  /* ── App shell ─────────────────────────────────────────────────────────── */
  /* 100dvh, not 100vh: on mobile Safari/Chrome the dynamic viewport unit
     accounts for the collapsing URL bar, which otherwise clips the layout. */
  .shell{min-height:100dvh;display:flex;flex-direction:column;background:var(--cream)}
  @media (min-width:768px){.shell{flex-direction:row}}

  .sidebar{display:none}
  @media (min-width:768px){
    .sidebar{
      display:flex;flex-direction:column;gap:2px;
      width:var(--sidebar-w);flex-shrink:0;
      padding:22px 12px;border-right:1px solid var(--sand);
      position:sticky;top:0;height:100dvh;background:var(--cream);
    }
  }
  @media (min-width:768px) and (max-width:1023px){
    :root{--sidebar-w:74px}
    .sidebar{align-items:center;padding:22px 8px}
    .sidebar-label,.sidebar-brand-text{display:none}
  }

  .sidebar-item{
    display:flex;align-items:center;gap:12px;width:100%;
    padding:11px 12px;border:none;border-radius:11px;background:none;
    cursor:pointer;text-align:left;color:var(--muted);
    font-size:14px;font-weight:500;transition:background .15s,color .15s;
  }
  .sidebar-item:hover{background:var(--sand)}
  .sidebar-item[aria-current="page"]{background:var(--ink);color:#fff}
  @media (min-width:768px) and (max-width:1023px){
    .sidebar-item{justify-content:center;padding:11px 0}
  }

  .main{flex:1;min-width:0;display:flex;flex-direction:column}

  .topbar{
    position:sticky;top:0;z-index:10;background:var(--cream);
    border-bottom:1px solid var(--sand);
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
    background:#fff;border-top:1px solid var(--sand);display:flex;
    padding-top:6px;padding-bottom:calc(8px + env(safe-area-inset-bottom));
  }
  @media (min-width:768px){.bottomnav{display:none}}

  .bottomnav-item{
    flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
    background:none;border:none;cursor:pointer;padding:4px 0;
    min-height:44px;   /* Apple/WCAG minimum touch target */
  }

  /* ── Responsive card grids ─────────────────────────────────────────────── */
  /* One column on phones; two from 1024px so desktop stops rendering a
     1000px-wide single column of short cards. */
  .grid-cards{display:grid;gap:14px;grid-template-columns:1fr}
  @media (min-width:1024px){.grid-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}

  .grid-stats{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
  @media (min-width:1024px){.grid-stats{grid-template-columns:repeat(4,minmax(0,1fr))}}

  .grid-split{display:grid;gap:16px;grid-template-columns:1fr}
  @media (min-width:1024px){.grid-split{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);align-items:start}}

  /* ── Sheets: bottom sheet on phones, centred dialog on larger screens ──── */
  .sheet-backdrop{
    position:fixed;inset:0;background:rgba(0,0,0,.52);
    display:flex;align-items:flex-end;justify-content:center;
  }
  @media (min-width:768px){.sheet-backdrop{align-items:center;padding:24px}}

  .sheet-panel{
    width:100%;max-width:480px;background:#fff;
    border-radius:22px 22px 0 0;max-height:92dvh;
    display:flex;flex-direction:column;
  }
  @media (min-width:768px){
    .sheet-panel{border-radius:20px;max-width:560px;max-height:86dvh}
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
  serif:   {fontFamily:SERIF_FONTS},
  label:   {fontSize:11,color:"var(--muted)",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.8},
  input:   {width:"100%",border:"1px solid var(--sand)",borderRadius:10,padding:"11px 13px",fontSize:16,outline:"none",background:"#fff"},
  row:     {display:"flex",alignItems:"center",gap:12},
  col:     {display:"flex",flexDirection:"column",gap:14},
  between: {display:"flex",justifyContent:"space-between",alignItems:"center"},
  iconBox: (colorLight,size=38) => ({width:size,height:size,borderRadius:10,background:colorLight,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*.47,flexShrink:0}),
  pill:    (bg,color) => ({background:bg,color,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:500,whiteSpace:"nowrap"}),
  btn:     (bg,color,extra={}) => ({background:bg,color,border:"none",borderRadius:10,padding:"10px 16px",fontSize:13,fontWeight:600,cursor:"pointer",...extra}),
  darkBtn: (extra={}) => ({background:"#1A1714",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:14,fontWeight:600,cursor:"pointer",width:"100%",...extra}),
  sandBtn: (extra={}) => ({background:"var(--sand)",color:"var(--muted)",border:"none",borderRadius:7,padding:"4px 10px",fontSize:12,cursor:"pointer",...extra}),
};
