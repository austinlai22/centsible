import { Component } from "react";
import { S } from "../styles.js";
import { Brand } from "./Brand.jsx";

/**
 * Catches render errors so one broken component doesn't blank the whole app.
 *
 * Without a boundary, React unmounts the entire tree when any component throws
 * — the user gets a white page with nothing to click and no indication that
 * anything is recoverable. In a finance app that reads as "my data is gone".
 *
 * Must be a class: componentDidCatch and getDerivedStateFromError have no hook
 * equivalent.
 *
 * Two levels are used (see main.jsx and App.jsx):
 *   root — last resort, offers a reload
 *   page — contains the failure to one tab, so the nav still works and the
 *          user can move somewhere useful instead of restarting
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Console is the only sink today. When error reporting is added, this is
    // the single place it hooks into.
    console.error("[Centsible] render error:", error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isPage = this.props.variant === "page";

    const reset = () => this.setState({ error: null });

    const body = (
      <div style={{
        background: "var(--surface)", border: "1px solid var(--line)",
        borderRadius: "var(--r-lg)", padding: 28, maxWidth: 520, width: "100%",
        boxShadow: "var(--shadow-sm)",
      }}>
        <p style={{ ...S.display, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {isPage ? "This page hit a problem" : "Something broke"}
        </p>
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, marginBottom: 20 }}>
          {isPage
            ? "The rest of the app is fine — you can switch tabs, or try loading this one again."
            : "This is a bug on our side, not something you did. Your data is safe; nothing was changed."}
        </p>

        <div style={{ ...S.row, gap: 10, flexWrap: "wrap" }}>
          {isPage && (
            <button onClick={reset} className="btn btn-primary"
              style={S.btn("var(--primary)", "#fff", { minHeight: 44, padding: "11px 18px", fontSize: 14 })}>
              Try again
            </button>
          )}
          <button onClick={() => window.location.reload()}
            style={isPage
              ? S.quietBtn({ minHeight: 44, padding: "11px 18px", fontSize: 14 })
              : S.btn("var(--primary)", "#fff", { minHeight: 44, padding: "11px 18px", fontSize: 14 })}>
            Reload the app
          </button>
        </div>

        {/* The message, not the stack: enough for a bug report, without a wall
            of minified frames. */}
        <details style={{ marginTop: 18 }}>
          <summary style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
            Technical details
          </summary>
          <code style={{
            display: "block", marginTop: 8, fontSize: 12, lineHeight: 1.5,
            color: "var(--muted)", wordBreak: "break-word",
            fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
          }}>
            {String(error?.message || error)}
          </code>
        </details>
      </div>
    );

    if (isPage) return <div style={{ padding: "8px 0" }}>{body}</div>;

    return (
      <div style={{
        minHeight: "100dvh", background: "var(--bg)", display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 24, padding: 24,
      }}>
        <Brand size={28} />
        {body}
      </div>
    );
  }
}
