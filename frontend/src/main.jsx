import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.jsx";
import { CSS } from "./styles.js";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";

// Optional: with no VITE_SENTRY_DSN set at build time, this never runs, and
// ErrorBoundary's Sentry.captureException call below is a safe no-op (the
// SDK never throws for being uninitialized) — local dev without a Sentry
// project configured behaves exactly as before this existed.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Errors only. Session replay and tracing share the same 5k/month
    // free-tier event quota, and a handful of testers don't produce enough
    // traffic to make spending that budget on tracing worthwhile yet.
    tracesSampleRate: 0,
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <>
      {/* The stylesheet lives here too, so the boundary's fallback is
          styled even when App itself is what failed. */}
      <style>{CSS}</style>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </>
  </React.StrictMode>
);
