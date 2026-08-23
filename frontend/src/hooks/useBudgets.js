import { useState, useEffect } from "react";
import { budgetsApi } from "../api.js";
import { monthKey, semesterForDate } from "../lib/periods.js";
import { useApi } from "./useApi.js";

/**
 * Loads ALL category budgets in a single fetch — monthly-rate categories
 * (Food, Transport…) and semester-total categories (Tuition, Moving…) come
 * back merged into one flat map, because each category has exactly ONE stored
 * value server-side (see CATEGORY_PERIOD in routes/data.js).
 *
 * Toggling period is purely a DISPLAY concern handled by Budget's
 * displayBudget() — it does not refetch and does not change what's stored.
 */
export function useBudgets(enabled = true) {
  // Purely UI state: which number displayBudget() shows, and which window
  // catSpendMap() sums actual spend over.
  const [period, setPeriod] = useState("monthly"); // "monthly" | "semester"

  // Which month/semester is being viewed. Kept as one Date rather than two
  // trackers so flipping the period toggle doesn't lose your place — navigate
  // to March, switch to Semester, and you land on the semester containing
  // March rather than back on today.
  const [refDate, setRefDate] = useState(new Date());

  const month    = monthKey(refDate);
  const semester = semesterForDate(refDate).start;

  const { data: serverBudgets, loading, error, reload } = useApi(
    async () => {
      const res = await budgetsApi.get({ month, semester });
      // No demo fallback: an account with no budgets set must LOOK like one.
      return res.budgets || {};
    },
    {},
    [month, semester], // refetch when navigation moves to a different period
    enabled
  );

  const [local, setLocal] = useState(null);
  useEffect(() => { setLocal(null); }, [serverBudgets]);

  const budgets = local ?? serverBudgets;

  const setBudgets = async (updaterOrValue) => {
    const next = typeof updaterOrValue === "function"
      ? updaterOrValue(budgets)
      : updaterOrValue;
    setLocal(next);
    try {
      // Pass the currently-viewed month/semester explicitly so an edit made
      // while navigated to a past period saves against THAT period, not today.
      await budgetsApi.update(next, { month, semester });
    } catch (e) {
      reload();
      throw e;
    }
  };

  const goToToday = () => setRefDate(new Date());

  return { budgets, loading, error, reload, setBudgets, period, setPeriod, refDate, setRefDate, goToToday };
}
