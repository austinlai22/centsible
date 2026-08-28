import { S } from "../styles.js";

/**
 * The wordmark.
 *
 * "Cents" is tinted so the pun reads at a glance — untinted, the name looks
 * like a misspelling of "sensible" rather than a play on it.
 *
 * `on` selects the tint for the surface underneath: --primary is tuned for
 * light backgrounds and falls to roughly 2:1 against the dark panels, where
 * --hero-accent is the readable one. Getting this wrong makes half the
 * wordmark disappear, which is exactly how the previous mark rendered as
 * "flo w" on the light sidebar.
 *
 * Lives in its own module rather than App.jsx: AuthScreen and Onboarding both
 * need it, and importing from App.jsx — which imports them — is a circular
 * dependency that happens to work in ESM until it doesn't.
 */
export const Brand = ({ size = 22, on = "light" }) => (
  <span style={{ ...S.display, fontSize: size, fontWeight: 700, letterSpacing: "-0.03em" }}>
    <span style={{ color: on === "dark" ? "var(--hero-accent)" : "var(--primary)" }}>Cents</span>ible
  </span>
);
