import { useState, useEffect } from "react";
import { plaidApi, transactionsApi } from "../api.js";
import { DEMO_TRANSACTIONS } from "../constants.js";
import { useApi } from "./useApi.js";

/**
 * Loads transactions (Plaid-synced + manual, merged server-side by
 * GET /plaid/transactions) and falls back to demo data when unreachable.
 * add/update/delete persist to the manual-transaction endpoints with
 * optimistic local updates and rollback on failure.
 *
 * update/delete only work on rows with source === "manual"; the server
 * returns 404 for Plaid-synced rows, so the UI disables those controls.
 */
export function useTransactions(enabled = true) {
  const { data: txns, loading, error, reload } = useApi(
    async () => {
      const res = await plaidApi.getTransactions({ limit: 200 });
      return (res.transactions || []).map(t => ({
        ...t,
        // Server stores Plaid's sign convention: positive = debit (expense),
        // negative = credit (income).
        type:   Number(t.amount) < 0 ? "income" : "expense",
        amount: Math.abs(Number(t.amount)),
      }));
    },
    DEMO_TRANSACTIONS,
    [],
    enabled
  );

  const [local, setLocal] = useState(null); // overrides server data after mutations
  useEffect(() => { setLocal(null); }, [txns]);

  const transactions = local ?? txns;

  const addTxn = async (t) => {
    const tempId = "tmp_" + Date.now();
    setLocal(p => [{ id: tempId, source: "manual", ...t }, ...(p ?? txns)]);
    try {
      const res = await transactionsApi.create(t);
      setLocal(p => (p ?? txns).map(x => x.id === tempId ? res.transaction : x));
      return res.transaction;
    } catch (e) {
      setLocal(p => (p ?? txns).filter(x => x.id !== tempId));
      throw e;
    }
  };

  const updateTxn = async (t) => {
    const prior = (local ?? txns).find(x => x.id === t.id);
    setLocal(p => (p ?? txns).map(x => x.id === t.id ? t : x));
    try {
      const { id, ...fields } = t;
      const res = await transactionsApi.update(id, fields);
      setLocal(p => (p ?? txns).map(x => x.id === id ? res.transaction : x));
      return res.transaction;
    } catch (e) {
      setLocal(p => (p ?? txns).map(x => x.id === t.id ? prior : x));
      throw e;
    }
  };

  const deleteTxn = async (id) => {
    const prior = (local ?? txns).find(x => x.id === id);
    const priorIndex = (local ?? txns).findIndex(x => x.id === id);
    setLocal(p => (p ?? txns).filter(x => x.id !== id));
    try {
      await transactionsApi.delete(id);
    } catch (e) {
      setLocal(p => {
        const arr = [...(p ?? txns)];
        arr.splice(priorIndex, 0, prior);
        return arr;
      });
      throw e;
    }
  };

  return { transactions, loading, error, reload, addTxn, updateTxn, deleteTxn };
}
