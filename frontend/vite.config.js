import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Substitutes __API_ORIGIN__ in index.html's Content-Security-Policy with the
 * origin of VITE_API_URL.
 *
 * The CSP has to name the API host explicitly, because connect-src 'self' only
 * covers the origin serving the page — and in every realistic deployment the
 * API lives somewhere else. Hardcoding it meant the value was correct in dev
 * and wrong in production unless a human remembered to edit it, and the
 * resulting failure is genuinely hard to diagnose: the backend's CORS is fine,
 * so it surfaces as an unexplained network error rather than a policy refusal.
 *
 * Deriving it from the same variable the app already fetches with means the
 * two cannot drift.
 */
function cspApiOrigin(env) {
  return {
    name: "csp-api-origin",
    transformIndexHtml(html) {
      const apiUrl = env.VITE_API_URL || "http://localhost:3001";
      let origin;
      try {
        origin = new URL(apiUrl).origin;
      } catch {
        // A malformed VITE_API_URL would otherwise emit a CSP containing the
        // literal placeholder, silently blocking every request.
        throw new Error(
          `[csp-api-origin] VITE_API_URL is not a valid URL: ${JSON.stringify(apiUrl)}`
        );
      }
      return html.replaceAll("__API_ORIGIN__", origin);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  if (mode === "production" && !env.VITE_API_URL) {
    // Failing the build is kinder than shipping a bundle that points at
    // localhost: the app would load, look fine, and fail on every request.
    throw new Error(
      "[build] VITE_API_URL must be set for a production build. " +
      "Vite inlines it at build time, so setting it afterwards has no effect."
    );
  }

  return {
    plugins: [react(), cspApiOrigin(env)],
    server: { port: 5173 },
    build: {
      // Surfaces accidental bundle growth instead of letting it creep.
      chunkSizeWarningLimit: 250,
    },
  };
});
