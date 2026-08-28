import { createPortal } from "react-dom";
import { S } from "../styles.js";
import { TERMS_SECTIONS } from "../constants.js";

/**
 * Terms of Service, shown from About. No accept-gate like PrivacyModal has —
 * signup already carries a "by continuing you agree to our Terms of Service
 * and Privacy Policy" line (see AuthScreen), so this is a reference view, not
 * a second acceptance flow.
 *
 * Portal-rendered for the same reason as PrivacyModal: every page's
 * "slide-up" animation leaves a `transform` on its container (fill-mode:
 * both), which otherwise traps a fixed-position modal inside that page's box
 * instead of the real viewport.
 */
export function TermsModal({ onClose }) {
  return createPortal(
    <div className="fade-in sheet-backdrop" style={{ zIndex: 300 }}>
      <div className="slide-up sheet-panel" role="dialog" aria-modal="true" aria-label="Terms of Service">
        <div style={{ padding: "22px 22px 14px", borderBottom: "1px solid var(--line)", ...S.between, gap: 12, flexShrink: 0 }}>
          <div>
            <p style={{ ...S.display, fontSize: 20, fontWeight: 400 }}>Terms of Service</p>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Effective August 28, 2026</p>
          </div>
          <button style={S.quietBtn({ flexShrink: 0 })} onClick={onClose}>Close</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", minHeight: 0 }}>
          <div style={{ background: "var(--warning-bg)", borderRadius: 12, padding: "14px 16px", marginBottom: 22, border: "1px solid var(--warning-line)" }}>
            <p style={{ fontSize: 13, color: "var(--warning)", fontWeight: 600, marginBottom: 4 }}>Worth knowing upfront</p>
            <p style={{ fontSize: 13, color: "var(--warning)", lineHeight: 1.6 }}>This is a budgeting tool, not a bank, lender, or financial advisor — and it's currently run by one person, not a company.</p>
          </div>
          {TERMS_SECTIONS.map((s, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <p style={{ ...S.display, fontSize: 16, fontWeight: 400, marginBottom: 8 }}>{s.title}</p>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.75, whiteSpace: "pre-line" }}>{s.body}</p>
            </div>
          ))}
          <div style={{ height: 12 }} />
        </div>

        <div style={{ height: 12, flexShrink: 0 }} />
      </div>
    </div>,
    document.body
  );
}
