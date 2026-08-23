import { useState, useEffect } from "react";
import { rewardsApi } from "../api.js";
import { CHARITY_BY_ID } from "../constants.js";
import { useApi } from "./useApi.js";

/**
 * Points balance + redemption history.
 *
 * Server rows carry { id, charity_id, charity_name, points_spent, usd_value,
 * redeemed_at }. The giving-history UI previously read r.logo / r.name /
 * r.date / r.pts — none of which exist on those rows — so every history entry
 * rendered as a blank row. decorate() maps server fields to display fields
 * once, here, so the page never has to know about the wire format.
 */
function decorate(row) {
  return {
    ...row,
    logo: CHARITY_BY_ID[row.charity_id]?.logo || "💚",
    name: row.charity_name,
    pts:  row.points_spent,
    date: row.redeemed_at,
  };
}

export function useRewards(enabled = true) {
  const { data: points, loading, error, reload } = useApi(
    async () => (await rewardsApi.get()).points,
    340,  // demo fallback when the backend is unreachable
    [],
    enabled
  );
  const { data: history, reload: reloadHistory } = useApi(
    async () => ((await rewardsApi.history()).redemptions || []).map(decorate),
    [],
    [],
    enabled
  );

  const [localPoints,  setLocalPoints]  = useState(null);
  const [localHistory, setLocalHistory] = useState(null);

  useEffect(() => { setLocalPoints(null); },  [points]);
  useEffect(() => { setLocalHistory(null); }, [history]);

  const curPoints  = localPoints  ?? points;
  const curHistory = localHistory ?? history;

  /**
   * actionKey must match a key in the server's EARN_ACTIONS catalogue. The
   * server decides the point value — the client cannot specify an amount.
   */
  const earn = async (actionKey) => {
    try {
      const res = await rewardsApi.earn(actionKey);
      setLocalPoints(res.points);
      return res;
    } catch (e) {
      reload();
      throw e;
    }
  };

  /**
   * Only charity.id is sent; cost and name are looked up server-side so the
   * client can't redeem at a forged price.
   */
  const redeem = async (charity) => {
    if (curPoints < charity.cost) throw new Error("Insufficient points");
    setLocalPoints(p => (p ?? points) - charity.cost);
    const tempEntry = decorate({
      id:           "tmp_" + Date.now(),
      charity_id:   charity.id,
      charity_name: charity.name,
      points_spent: charity.cost,
      usd_value:    +(charity.cost * 0.01).toFixed(2),
      redeemed_at:  new Date().toISOString(),
    });
    setLocalHistory(h => [tempEntry, ...(h ?? history)]);
    try {
      const res = await rewardsApi.redeem(charity.id);
      setLocalPoints(res.points);
      setLocalHistory(h =>
        (h ?? history).map(e => e.id === tempEntry.id ? decorate(res.redemption) : e)
      );
      return res;
    } catch (e) {
      reload();
      reloadHistory();
      throw e;
    }
  };

  return { points: curPoints, history: curHistory, loading, error, reload, earn, redeem };
}
