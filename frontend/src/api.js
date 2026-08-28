/**
 * api.js — Centralised fetch wrapper for the flo·w backend
 *
 * Why a wrapper instead of raw fetch everywhere?
 *   1. Single place to set credentials:true (required for HttpOnly cookies)
 *   2. Automatic silent token refresh — if a request gets 401, we try
 *      POST /auth/refresh once, then retry the original request.
 *      The user never sees an interruption for an expired access token.
 *   3. All errors are normalised to { message } so components don't need
 *      to parse different error shapes.
 *   4. BASE_URL lives here — swap it per environment without touching components.
 *
 * Usage:
 *   import { api } from "./api.js";
 *   const { user } = await api.post("/auth/login", { email, password });
 *   const { transactions } = await api.get("/plaid/transactions");
 */

const BASE_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

// Warn loudly in production if VITE_API_URL was not set at build time.
// Without this, all API calls silently point to localhost — which works
// locally but produces confusing network errors in any deployed environment.
// This runs once at module load time, so the warning appears in the browser
// console immediately when the app boots.
if (!import.meta.env?.VITE_API_URL && import.meta.env?.PROD) {
  console.warn(
    "[flo·w] VITE_API_URL was not set at build time. " +
    "All API calls will target http://localhost:3001, which will fail in production. " +
    "Set VITE_API_URL as a build-time environment variable and rebuild."
  );
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

let isRefreshing = false;          // prevent concurrent refresh loops
let refreshQueue = [];             // requests waiting on a refresh

async function coreFetch(path, options = {}, isRetry = false) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",        // always send cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      },
    });
  } catch (networkErr) {
    // fetch() rejects for genuine network failures AND for CORS refusals —
    // the browser deliberately hides which, so this is as specific as the app
    // can honestly be. Saying "couldn't reach the server" at least points at
    // the right layer; the previous "Something went wrong" sent people looking
    // at their password.
    throw new ApiError(
      "Couldn't reach the server. Check your connection — or, if you're running this yourself, that the API is running and CLIENT_ORIGIN matches this site's address.",
      0
    );
  }

  // ── Silent token refresh on 401 ──────────────────────────────────────────
  if (res.status === 401 && !isRetry) {
    // If a refresh is already in flight, queue this request behind it
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject, path, options });
      });
    }

    isRefreshing = true;
    try {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!refreshRes.ok) {
        // Refresh token is also invalid — session is dead, force re-login
        flushQueue(null);
        throw new ApiError("Session expired — please log in again.", 401);
      }

      // Retry all queued requests with fresh cookie
      flushQueue("ok");
      isRefreshing = false;

      // Retry the original request (isRetry = true to prevent infinite loop)
      return coreFetch(path, options, true);
    } catch (err) {
      isRefreshing = false;
      flushQueue(null);
      throw err;
    }
  }

  // ── Parse response ────────────────────────────────────────────────────────
  let body;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  if (!res.ok) {
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status);
  }

  return body;
}

function flushQueue(result) {
  refreshQueue.forEach(({ resolve, reject, path, options }) => {
    if (result) resolve(coreFetch(path, options, true));
    else reject(new ApiError("Session expired — please log in again.", 401));
  });
  refreshQueue = [];
}

// ─── Public error class ───────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name  = "ApiError";
    this.status = status;
  }
}

// ─── HTTP method helpers ──────────────────────────────────────────────────────

export const api = {
  get:    (path, opts = {}) =>
    coreFetch(path, { method: "GET", ...opts }),

  post:   (path, body, opts = {}) =>
    coreFetch(path, { method: "POST",   body: JSON.stringify(body), ...opts }),

  put:    (path, body, opts = {}) =>
    coreFetch(path, { method: "PUT",    body: JSON.stringify(body), ...opts }),

  delete: (path, opts = {}) =>
    coreFetch(path, { method: "DELETE", ...opts }),
};

// ─── Plaid helpers ────────────────────────────────────────────────────────────

export const plaidApi = {
  /** Get a link_token to initialise Plaid Link in the browser */
  createLinkToken: () =>
    api.post("/plaid/create-link-token", {}),

  /** Exchange the one-time public_token Plaid Link returns after auth */
  exchangeToken: (public_token, institution_id, institution_name) =>
    api.post("/plaid/exchange-token", { public_token, institution_id, institution_name }),

  /** Fetch cached transactions. All params optional. */
  getTransactions: ({ from, to, limit } = {}) => {
    const params = new URLSearchParams();
    if (from)  params.set("from",  from);
    if (to)    params.set("to",    to);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return api.get(`/plaid/transactions${qs ? "?" + qs : ""}`);
  },

  /** Fetch cached account metadata */
  getAccounts: () =>
    api.get("/plaid/accounts"),

  /** Unlink a bank item by its DB UUID */
  removeItem: (itemId) =>
    api.delete(`/plaid/items/${itemId}`),

  /** Trigger a manual transaction sync for all linked accounts */
  sync: () =>
    api.post("/plaid/sync", {}),
};

// Thin wrappers so components import one thing, not raw paths

// ─── Goals helpers ────────────────────────────────────────────────────────────

// ─── Manual transactions helpers ──────────────────────────────────────────────
// Reading transactions (both Plaid-synced and manual, merged) is
// plaidApi.getTransactions — these three only handle writes for
// manually-entered transactions.

export const transactionsApi = {
  create: (txn)         => api.post("/api/transactions", txn),
  update: (id, fields)  => api.put(`/api/transactions/${id}`, fields),
  delete: (id)          => api.delete(`/api/transactions/${id}`),
};

export const goalsApi = {
  list:   ()           => api.get("/api/goals"),
  create: (goal)       => api.post("/api/goals", goal),
  update: (id, fields) => api.put(`/api/goals/${id}`, fields),
  delete: (id)         => api.delete(`/api/goals/${id}`),
};

// ─── Budgets helpers ──────────────────────────────────────────────────────────

export const budgetsApi = {
  /**
   * Returns { budgets, month, semester } — budgets is a single flat map
   * covering EVERY category (both monthly-rate and semester-total ones),
   * e.g. { Housing: 2000, Tuition: 9000, ... }. There's no `period` param —
   * each category has exactly one stored value; period-based derivation
   * (e.g. showing Housing's semester total) is a display concern handled
   * client-side by Budget's displayBudget(), not a fetch concern.
   * @param {object} opts
   * @param {string} [opts.month]     — YYYY-MM-DD, which calendar month's monthly-category values to read
   * @param {string} [opts.semester]  — YYYY-MM-DD semester start, which semester's one-time-category values to read
   */
  get: ({ month, semester } = {}) => {
    const params = new URLSearchParams();
    if (month)    params.set("month", month);
    if (semester) params.set("semester", semester);
    const qs = params.toString();
    return api.get(`/api/budgets${qs ? "?" + qs : ""}`);
  },
  /**
   * Accepts { Housing: 2000, Tuition: 9000, ... } — any mix of category
   * types in one call. Each category is automatically routed server-side
   * to its own correct period (see CATEGORY_PERIOD in routes/data.js) —
   * there's no period param to pass here.
   */
  update: (budgets, { month, semester } = {}) => {
    const params = new URLSearchParams();
    if (month)    params.set("month", month);
    if (semester) params.set("semester", semester);
    const qs = params.toString();
    return api.put(`/api/budgets${qs ? "?" + qs : ""}`, budgets);
  },
};

// ─── Rewards helpers ──────────────────────────────────────────────────────────

export const rewardsApi = {
  get:     ()           => api.get("/api/rewards"),
  earn:    (action)     => api.post("/api/rewards/earn", { action }),
  redeem:  (charityId)  => api.post("/api/rewards/redeem", { charity_id: charityId }),
  history: ()           => api.get("/api/rewards/history"),
};

export const authApi = {
  register: (email, password, name) =>
    api.post("/auth/register", { email, password, name }),

  login: (email, password) =>
    api.post("/auth/login", { email, password }),

  logout: () =>
    api.post("/auth/logout", {}),

  me: () =>
    api.get("/auth/me"),

  /** Persists onboarding answers and marks the account as onboarded server-side. */
  completeOnboarding: (answers) =>
    api.post("/auth/onboarding", answers),

  /**
   * Permanently deletes the account. The server cascades to transactions,
   * budgets, goals, rewards, and linked Plaid items. The privacy policy
   * promises this route exists in the UI — it previously only existed on the
   * server, with nothing calling it.
   */
  deleteAccount: () =>
    api.delete("/auth/me"),

  refresh: () =>
    api.post("/auth/refresh", {}),
};

// ─── Academic calendar ───────────────────────────────────────────────────────
// The student's own term dates and expected aid payments. Both feed the runway
// calculation, which is meaningless with the wrong boundaries.

export const termsApi = {
  list:   ()           => api.get("/api/terms"),
  create: (term)       => api.post("/api/terms", term),
  update: (id, fields) => api.put(`/api/terms/${id}`, fields),
  delete: (id)         => api.delete(`/api/terms/${id}`),
};

export const disbursementsApi = {
  list:   ()           => api.get("/api/disbursements"),
  create: (d)          => api.post("/api/disbursements", d),
  update: (id, fields) => api.put(`/api/disbursements/${id}`, fields),
  delete: (id)         => api.delete(`/api/disbursements/${id}`),
};

// ─── Two-factor authentication ───────────────────────────────────────────────

export const mfaApi = {
  /** { enabled, pendingSetup, type, confirmedAt, recoveryCodesRemaining } */
  status: () => api.get("/auth/mfa"),

  /** Begins enrolment. Returns { secret, uri, qr } — qr is a data: URI. */
  startTotp: () => api.post("/auth/mfa/totp/start", {}),

  /** Proves a code and switches MFA on. Returns { recoveryCodes } ONCE. */
  confirmTotp: (token) => api.post("/auth/mfa/totp/confirm", { token }),

  /** Password re-auth required — an unlocked session alone isn't enough. */
  disable: (password) => api.post("/auth/mfa/disable", { password }),

  regenerateRecoveryCodes: (password) =>
    api.post("/auth/mfa/recovery/regenerate", { password }),

  /**
   * Completes a login challenge. Called while holding only the short-lived
   * mfa_pending cookie — there is no session yet. Pass either a TOTP code or
   * a recovery code.
   */
  verify: ({ token, recoveryCode }) =>
    api.post("/auth/mfa/verify", token ? { token } : { recoveryCode }),
};
