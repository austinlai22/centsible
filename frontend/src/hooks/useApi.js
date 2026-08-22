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
 */
export function useApi(fetcher, fallback, deps=[]) {
  const [data,    setData]    = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try   { setData(await fetcher()); }
    catch (e) { setError(e.message); setData(fallback); }
    finally   { setLoading(false); }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

/** Linked bank accounts. */
export function useAccounts() {
  const { data, loading, error, reload } = useApi(
    async () => (await plaidApi.getAccounts()).accounts,
    []
  );
  return { accounts: data, loading, error, reload };
}
