/**
 * router.js — the smallest thing that can be called a router.
 *
 * The app needs exactly four URLs: a public landing page, a login form, a
 * signup form, and the signed-in app. That is not enough to justify pulling
 * in react-router (~20 kB, and the main bundle is already close enough to
 * the 250 kB build guard that Onboarding had to be split out to make room).
 * pushState plus a popstate listener is the whole mechanism.
 *
 * Why real paths and not the location.hash this started as: /login has to be
 * linkable, typed, and bookmarkable — it is the URL you send someone who
 * already has an account. /#login works but reads as a workaround, and a
 * fragment is never sent to the server, so it can never become a real route
 * later without breaking every link already in the wild.
 *
 * The cost of real paths is that the HOST has to serve index.html for a URL
 * with no file behind it, or a hard refresh on /login 404s. nginx.conf
 * already does this (try_files ... /index.html); vercel.json needed a
 * catch-all rewrite adding.
 */
import { useState, useEffect } from "react";

/** Strips a trailing slash so /login/ and /login are the same route. */
export const normalize = (p) => {
  const s = (p || "/").replace(/\/+$/, "");
  return s === "" ? "/" : s;
};

/**
 * Current pathname, re-rendering on back/forward and on navigate() below.
 *
 * Reads pathname only, never the hash: the landing page's own #pricing /
 * #faq anchors must scroll the page, not swap the route out from under it.
 */
export function usePath() {
  const [path, setPath] = useState(() => normalize(window.location.pathname));
  useEffect(() => {
    const onPop = () => setPath(normalize(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return path;
}

/**
 * Navigate, client-side.
 *
 * pushState deliberately does NOT fire popstate — that event is for the
 * user's own back/forward, not for programmatic changes — so nothing would
 * tell usePath to re-read the URL. Dispatching one by hand is the standard
 * way to close that loop, and it keeps every subscriber on one code path
 * rather than having navigate() reach into a specific component's setState.
 *
 * `replace` is for corrections the user should not be able to go "back" to:
 * canonicalising an unknown URL, or bouncing off a page they aren't
 * authenticated for. A pushState there would trap them in a redirect loop
 * every time they hit Back.
 */
export function navigate(to, { replace = false } = {}) {
  const target = normalize(to);
  if (normalize(window.location.pathname) === target && !replace) return;
  window.history[replace ? "replaceState" : "pushState"](null, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * onClick handler for an <a href="/somewhere"> that should route client-side.
 *
 * The href stays real so the link is middle-clickable, copyable, and
 * crawlable; this only intercepts the plain left-click. Modified clicks
 * (new tab, new window, download) fall through to the browser, which is the
 * behaviour people expect from a link and the reason this isn't a <button>.
 */
export function linkHandler(to) {
  return (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
}

/**
 * A hint about whether the visitor is signed in, readable synchronously.
 *
 * The session itself is an httpOnly cookie — deliberately invisible to JS —
 * so the only way to know is to ask the server, and that answer can take a
 * while: the API runs on infrastructure that sleeps when idle, and a cold
 * start is tens of seconds. The landing page cannot hold its primary call to
 * action hostage to that; a spinner where the "Log in" button should be is a
 * worse first impression than either possible answer.
 *
 * So the last known answer is cached here and used to render immediately,
 * then corrected the moment authApi.me() actually resolves.
 *
 * This is NOT a security boundary and must never be treated as one. It holds
 * no identity, no token and no personal data — one boolean-ish string — and
 * every route that matters is enforced by the server against the real
 * cookie. The worst a forged value can do is show the wrong button on a
 * marketing page, and clicking it lands on the login form.
 */
const HINT_KEY = "centsible.session_hint";

export const readSessionHint = () => {
  // Private windows and "block site data" both make this throw rather than
  // return null, which would take the whole landing page down with it.
  try { return window.localStorage.getItem(HINT_KEY) === "1"; }
  catch { return false; }
};

export const writeSessionHint = (signedIn) => {
  try {
    if (signedIn) window.localStorage.setItem(HINT_KEY, "1");
    else window.localStorage.removeItem(HINT_KEY);
  } catch { /* the hint is an optimisation; losing it costs one button flash */ }
};
