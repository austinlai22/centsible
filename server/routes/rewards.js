/**
 * routes/rewards.js — Points and charitable redemption persistence
 *
 * GET  /api/rewards            — current point balance
 * POST /api/rewards/earn       — award points for a completed action
 * POST /api/rewards/redeem     — spend points on a charity donation
 * GET  /api/rewards/history    — redemption history
 *
 * Design notes:
 *   - Points are stored server-side as the single source of truth.
 *     The frontend never sets an absolute point value — it can only request
 *     an earn or a redeem, and the server applies the delta atomically.
 *   - Redemption is the security-sensitive operation: it must be impossible
 *     to redeem more points than you have, even under concurrent requests.
 *     We enforce this with a single atomic UPDATE...WHERE clause rather than
 *     a read-then-write, which would have a race condition window.
 *   - Charity list and earn-action catalogue are defined server-side
 *     (CHARITIES, EARN_ACTIONS below) so the client can't claim arbitrary
 *     point values or invent a charity ID that bypasses cost validation.
 */

import { Router } from "express";
import { z }      from "zod";
import { query, pool } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// ─── Server-side catalogues ───────────────────────────────────────────────────
// Mirrors the frontend's CHARITIES and EARN_ACTIONS arrays.
// Kept here as the source of truth so a client can't forge a point award
// or redeem at a price it invented.

const CHARITIES = {
  1: { name: "GiveDirectly",         cost: 50  },
  2: { name: "Cool Earth",           cost: 75  },
  3: { name: "Malaria Consortium",   cost: 100 },
  4: { name: "Wikimedia Foundation", cost: 50  },
  5: { name: "Food Bank Network",    cost: 40  },
  6: { name: "Rainforest Alliance",  cost: 60  },
};

/**
 * Earnable actions.
 *
 * Each carries a point value AND a `verify` that checks the claim against the
 * user's real data. Previously /earn just added points for whatever key it was
 * sent, with no cooldown: twenty calls to one action was worth 400 points, so
 * levels measured button-pressing rather than behaviour. Now a claim must be
 * both TRUE (verify passes) and UNCLAIMED this month (the UNIQUE constraint on
 * reward_claims).
 *
 * `verify` receives (userId, periodKey) and returns a reason string when the
 * claim does not hold, or null when it does.
 */
const EARN_ACTIONS = {
  stay_under_budget: {
    points: 25,
    async verify(userId, periodKey) {
      // At least one budgeted category whose month-to-date spend is under it.
      const { rows } = await query(
        `SELECT 1
           FROM user_budgets b
           LEFT JOIN transactions t
             ON t.user_id = b.user_id AND t.category = b.category
            AND t.amount > 0
            AND to_char(t.date,'YYYY-MM') = $2
          WHERE b.user_id = $1 AND b.period = 'monthly' AND b.amount > 0
          GROUP BY b.category, b.amount
         HAVING COALESCE(SUM(t.amount),0) < b.amount
          LIMIT 1`,
        [userId, periodKey]
      );
      return rows.length ? null : "No category is under budget yet this month.";
    },
  },

  set_spending_limit: {
    points: 10,
    async verify(userId) {
      const { rows } = await query(
        "SELECT 1 FROM user_budgets WHERE user_id = $1 AND amount > 0 LIMIT 1",
        [userId]
      );
      return rows.length ? null : "Set a budget on a category first.";
    },
  },

  add_goal_funds: {
    points: 15,
    async verify(userId) {
      const { rows } = await query(
        "SELECT 1 FROM user_goals WHERE user_id = $1 AND saved > 0 LIMIT 1",
        [userId]
      );
      return rows.length ? null : "Add funds to a savings goal first.";
    },
  },

  hit_savings_rate: {
    points: 50,
    async verify(userId, periodKey) {
      // Savings-category rows are transfers between the user's own accounts,
      // so they are excluded from both sides — exactly as the client does.
      const { rows } = await query(
        `SELECT COALESCE(SUM(CASE WHEN amount < 0 THEN -amount END),0) AS income,
                COALESCE(SUM(CASE WHEN amount > 0 THEN  amount END),0) AS spent
           FROM transactions
          WHERE user_id = $1
            AND to_char(date,'YYYY-MM') = $2
            AND category IS DISTINCT FROM 'Savings'`,
        [userId, periodKey]
      );
      const { income, spent } = rows[0];
      if (Number(income) <= 0) return "No income recorded this month yet.";
      const rate = ((Number(income) - Number(spent)) / Number(income)) * 100;
      return rate >= 20 ? null : `Savings rate is ${Math.round(rate)}% — the target is 20%.`;
    },
  },

  log_streak_7_days: {
    points: 30,
    async verify(userId) {
      // Seven DISTINCT consecutive days carrying a manually-logged
      // transaction, anywhere in the last 30 days.
      const { rows } = await query(
        `WITH days AS (
           SELECT DISTINCT date::date AS d
             FROM transactions
            WHERE user_id = $1 AND source = 'manual'
              AND date >= CURRENT_DATE - INTERVAL '30 days'
         ), grouped AS (
           SELECT d, d - (ROW_NUMBER() OVER (ORDER BY d))::int AS grp FROM days
         )
         SELECT COUNT(*) AS run FROM grouped GROUP BY grp ORDER BY run DESC LIMIT 1`,
        [userId]
      );
      const run = Number(rows[0]?.run || 0);
      return run >= 7 ? null : `Longest streak is ${run} day(s) — 7 needed.`;
    },
  },

  // Deliberately has no verify: "reviewing" your budget leaves no trace in the
  // data, so the server cannot confirm it. It stays claimable once a month
  // rather than being awarded on demand.
  complete_monthly_review: { points: 20, verify: null },
};

/** Calendar month a claim belongs to. */
const periodKeyFor = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

const USD_PER_POINT = 0.01;

// ─── GET /api/rewards ─────────────────────────────────────────────────────────

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT points FROM rewards WHERE user_id = $1",
      [req.userId]
    );
    // Row should always exist (seeded at registration) but guard anyway
    const points = rows[0]?.points ?? 0;
    return res.json({ points });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/rewards/earn ───────────────────────────────────────────────────

const EarnSchema = z.object({
  action: z.enum(Object.keys(EARN_ACTIONS)),
});

router.post("/earn", async (req, res, next) => {
  try {
    const parsed = EarnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Unknown earn action" });
    }
    const action = parsed.data.action;
    const spec   = EARN_ACTIONS[action];
    const period = periodKeyFor();

    // 1. Is the claim actually true? The client asserting it is not evidence.
    if (spec.verify) {
      const reason = await spec.verify(req.userId, period);
      if (reason) return res.status(409).json({ error: reason, earned: 0 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 2. Claim it for this month. The UNIQUE (user_id, action, period_key)
      //    constraint does the work — ON CONFLICT DO NOTHING means a second
      //    attempt inserts no row and awards nothing, and two simultaneous
      //    requests cannot both succeed.
      const claim = await client.query(
        `INSERT INTO reward_claims (user_id, action, period_key, points)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, action, period_key) DO NOTHING
         RETURNING id`,
        [req.userId, action, period, spec.points]
      );

      if (claim.rowCount === 0) {
        await client.query("ROLLBACK");
        const { rows } = await query("SELECT points FROM rewards WHERE user_id = $1", [req.userId]);
        return res.status(409).json({
          error: "You've already claimed this one for the month.",
          points: rows[0]?.points ?? 0,
          earned: 0,
        });
      }

      // 3. Only now are the points real.
      const { rows } = await client.query(
        `INSERT INTO rewards (user_id, points)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
           SET points = rewards.points + $2, updated_at = NOW()
         RETURNING points`,
        [req.userId, spec.points]
      );

      await client.query("COMMIT");
      return res.json({ points: rows[0].points, earned: spec.points });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/rewards/redeem ─────────────────────────────────────────────────

const RedeemSchema = z.object({
  charity_id: z.coerce.number().int(),
});

router.post("/redeem", async (req, res, next) => {
  try {
    const parsed = RedeemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid charity_id" });
    }
    const { charity_id } = parsed.data;
    const charity = CHARITIES[charity_id];
    if (!charity) {
      return res.status(400).json({ error: "Unknown charity" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Atomic conditional deduction — this is the critical line.
      // The WHERE clause ensures we only deduct if the balance covers the cost,
      // closing the race-condition window a read-then-write would have under
      // concurrent requests (e.g. two redeem clicks in quick succession).
      const upd = await client.query(
        `UPDATE rewards
         SET points = points - $1, updated_at = NOW()
         WHERE user_id = $2 AND points >= $1
         RETURNING points`,
        [charity.cost, req.userId]
      );

      if (upd.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Insufficient points" });
      }

      const usdValue = +(charity.cost * USD_PER_POINT).toFixed(2);
      const ins = await client.query(
        `INSERT INTO reward_redemptions
           (user_id, charity_id, charity_name, points_spent, usd_value)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, charity_id, charity_name, points_spent, usd_value, redeemed_at`,
        [req.userId, charity_id, charity.name, charity.cost, usdValue]
      );

      await client.query("COMMIT");

      return res.json({
        points: upd.rows[0].points,
        redemption: ins.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/rewards/history ─────────────────────────────────────────────────

router.get("/history", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, charity_id, charity_name, points_spent, usd_value, redeemed_at
       FROM reward_redemptions
       WHERE user_id = $1
       ORDER BY redeemed_at DESC
       LIMIT 100`,
      [req.userId]
    );
    return res.json({ redemptions: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
