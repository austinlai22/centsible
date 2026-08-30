/**
 * reveal.js — content rises into place as it scrolls into view.
 *
 * The Apple / Huntington idiom. Two decisions are worth stating, because
 * both are the opposite of what the naive version does:
 *
 * ONE-WAY. Once an element has been revealed it stays revealed — the
 * observer stops watching it. Re-hiding on scroll-up makes a page feel
 * unstable, punishes anyone who scrolls back to re-read something, and
 * turns a browser's find-in-page into a fight. The effect is meant to be
 * noticed once and then forgotten.
 *
 * ONE OBSERVER, not one per element. A landing page reveals a few dozen
 * elements; a separate IntersectionObserver for each is a few dozen sets of
 * bookkeeping the browser has to run on every scroll frame. A single shared
 * observer with the same options costs one.
 *
 * The hidden state lives in CSS (.lp-reveal in styles.js) rather than being
 * applied by this module, which is safe here in a way it would not be on a
 * server-rendered page: this app renders entirely on the client and #root is
 * empty in the HTML, so "JavaScript didn't run" already means "no page", not
 * "an invisible page". The failure mode that IS worth guarding is
 * IntersectionObserver missing entirely — handled below by revealing
 * immediately rather than leaving the page blank.
 */
import { useEffect, useRef } from "react";

const SUPPORTED = typeof window !== "undefined" && "IntersectionObserver" in window;

let observer = null;

function sharedObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("lp-reveal-in");
        observer.unobserve(entry.target);
      }
    },
    {
      // Fire a little before the element reaches the bottom edge, so it is
      // finishing its transition as it arrives rather than starting one the
      // reader has to wait through. The negative bottom margin is what makes
      // the effect feel like the page keeping up rather than lagging.
      rootMargin: "0px 0px -12% 0px",
      // Deliberately tiny. A higher threshold means a card taller than the
      // viewport — which the feature cards become on a narrow phone — could
      // never satisfy it, and would stay invisible forever.
      threshold: 0.01,
    }
  );
  return observer;
}

/** Ref to attach to an element that should reveal on scroll. */
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!SUPPORTED) { el.classList.add("lp-reveal-in"); return; }
    const ob = sharedObserver();
    ob.observe(el);
    return () => ob.unobserve(el);
  }, []);
  return ref;
}

/** Stagger helper: enough to read as a cascade, capped so it never drags. */
export const stagger = (i, step = 70, max = 240) => Math.min(i * step, max);
