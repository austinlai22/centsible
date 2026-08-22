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

const EARN_ACTIONS = {
  stay_under_budget:      25,
  log_streak_7_days:      30,
  hit_savings_rate:       50,
  add_goal_funds:         15,
  set_spending_limit:     10,
  complete_monthly_review:20,
};

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
    const pts = EARN_ACTIONS[parsed.data.action];

    // Upsert in case the rewards row somehow doesn't exist yet
    const { rows } = await query(
      `INSERT INTO rewards (user_id, points)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
         SET points = rewards.points + $2, updated_at = NOW()
       RETURNING points`,
      [req.userId, pts]
    );

    return res.json({ points: rows[0].points, earned: pts });
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
