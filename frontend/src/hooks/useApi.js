import { useState, useEffect, useCallback } from "react";
import { plaidApi } from "../api.js";

/**
 * useApi — generic data-fetching hook.
 *
 * Every hook in this folder returns the SAME shape: { data, loading, error,
 * reload }. That uniformity is deliberate — the previous version had
 * useTransactions return { txnLoading, txnError, reloadTxns } while every
 * other hook returned { loading, error, reload }, and App.jsx read
 * `txnHook.loading`. Those were silently `undefined`, so the Summary and
 * Budget pages could never show a transaction error, a skeleton, or a working
 * Retry button — the failure mode was invisible rather than loud.
 *
 * `fallback` keeps demo mode working: on a fetch error the hook surfaces the
 * error AND serves placeholder data, so the UI shows something useful under
 * an error banner instead of an empty screen.
 *
 * `enabled` gates whether the fetch runs at all. This exists because App.jsx
 * calls useTransactions/useAccounts/useGoals/useBudgets/useRewards
 * unconditionally at the top of the component — required by the Rules of
 * Hooks, since App can't call them only after login without changing hook
 * order between renders. Without this gate, every one of those hooks fired
 * its first fetch on the very first page paint, BEFORE the session cookie
 * exists (the user hasn't logged in yet), so every request 401'd. Nothing
 * then re-triggered a retry once login succeeded — no dependency here ever
 * changed — so the app stayed on the demo-fallback data and a permanent
 * "Session expired" banner for the rest of that browser tab's life, even
 * though the session was perfectly valid. Confirmed: a full page reload
 * after login "fixed" it, because on that fresh mount the cookie already
 * existed before the hook's first fetch — which is exactly the symptom of a
 * missing dependency, not an auth bug.
 */
export function useApi(fetcher, fallback, deps=[], enabled=true) {
  const [data,    setData]    = useState(fallback);
  const [loading, setLoading] = useState(enabled);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError(null);
    try   { setData(await fetcher()); }
    catch (e) { setError(e.message); setData(fallback); }
    finally   { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  useEffect(() => {
    if (enabled) load();
    else setLoading(false); // signed out: nothing to fetch, no spinner either
  }, [load, enabled]);

  return { data, loading, error, reload: load };
}

/** Linked bank accounts. */
export function useAccounts(enabled = true) {
  const { data, loading, error, reload } = useApi(
    async () => (await plaidApi.getAccounts()).accounts,
    [],
    [],
    enabled
  );
  return { accounts: data, loading, error, reload };
}
