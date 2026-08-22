import { useState, useEffect } from "react";
import { goalsApi } from "../api.js";
import { DEMO_GOALS } from "../constants.js";
import { useApi } from "./useApi.js";

/** Savings goals with optimistic local mutations. */
export function useGoals() {
  const { data: serverGoals, loading, error, reload } = useApi(
    async () => (await goalsApi.list()).goals,
    DEMO_GOALS
  );

  const [local, setLocal] = useState(null);
  useEffect(() => { setLocal(null); }, [serverGoals]);

  const goals = local ?? serverGoals;

  const addGoal = async (goalData) => {
    const tempId = "tmp_" + Date.now();
    setLocal(p => [...(p ?? serverGoals), { id: tempId, ...goalData }]);
    try {
      const res = await goalsApi.create(goalData);
      setLocal(p => (p ?? serverGoals).map(g => g.id === tempId ? res.goal : g));
    } catch (e) {
      setLocal(p => (p ?? serverGoals).filter(g => g.id !== tempId));
      throw e;
    }
  };

  const updateGoal = async (id, fields) => {
    setLocal(p => (p ?? serverGoals).map(g => g.id === id ? { ...g, ...fields } : g));
    try {
      const res = await goalsApi.update(id, fields);
      setLocal(p => (p ?? serverGoals).map(g => g.id === id ? res.goal : g));
    } catch (e) {
      reload(); // revert to server state
      throw e;
    }
  };

  const deleteGoal = async (id) => {
    setLocal(p => (p ?? serverGoals).filter(g => g.id !== id));
    try {
      await goalsApi.delete(id);
    } catch (e) {
      reload();
      throw e;
    }
  };

  /** Adds to a goal's saved amount, capped at its target. */
  const addFunds = (id, amount) => {
    const g = goals.find(x => x.id === id);
    if (!g) return Promise.resolve();
    return updateGoal(id, {
      saved: Math.min(Number(g.target) || 0, (Number(g.saved) || 0) + amount),
    });
  };

  return { goals, loading, error, reload, addGoal, updateGoal, deleteGoal, addFunds };
}
