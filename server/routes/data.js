/**
 * routes/data.js — Goals, budgets, and manual transactions persistence
 *
 * All endpoints require authentication. Every query is scoped to req.userId
 * so IDOR is structurally impossible — you can only read and write your own data.
 *
 * Goals:
 *   GET    /api/goals          — list all goals for the user
 *   POST   /api/goals          — create a goal
 *   PUT    /api/goals/:id      — update a goal (name, target, saved, deadline, emoji)
 *   DELETE /api/goals/:id      — delete a goal
 *
 * Budgets:
 *   GET    /api/budgets        — get all category budgets for the current month
 *   PUT    /api/budgets        — upsert one or more category amounts
 *
 * Manual transactions:
 *   POST   /api/transactions       — create a manually-entered transaction
 *   PUT    /api/transactions/:id   — update a manual transaction
 *   DELETE /api/transactions/:id   — delete a manual transaction
 *
 *   Note: there is deliberately no GET /api/transactions here — reading
 *   transactions (both Plaid-synced and manual, merged) is handled by
 *   GET /plaid/transactions in routes/plaid.js, which already queries the
 *   same table without filtering by source. These endpoints only handle
 *   writes for the 'manual' source. A manual row can never collide with or
 *   overwrite a Plaid-synced row — see the source column migration in
 *   db/migrate.js for why.
 *
 * Budget month convention:
 *   Budgets are stored per-month (first day of month: 2025-05-01).
 *   GET returns the current month by default; pass ?month=YYYY-MM-DD to query others.
 *   PUT always writes to the current month unless ?month is specified.
 */

import { Router } from "express";
import { z }      from "zod";
import { query }  from "../db/client.js";
import { requireAuth, validateUUID } from "../middleware/auth.js";

const router = Router();

// All routes require a valid session
router.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the first day of a given month as a YYYY-MM-DD string. */
function monthStart(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Parses a ?month= query param; falls back to current month. */
function parseMonth(raw) {
  if (!raw) return monthStart();
  // Accept YYYY-MM or YYYY-MM-DD — normalise to first of month
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (!match) return monthStart();
  return `${match[1]}-${match[2]}-01`;
}

// ─── Semester helpers ──────────────────────────────────────────────────────────
// Academic-year semester boundaries, "mid" = the 15th of the named month:
//   Fall:   Aug 15 – Dec 14
//   Winter: Dec 15 – Jan 14
//   Spring: Jan 15 – May 14
//   Summer: May 15 – Aug 14
//
// A semester's canonical "start date" (its identifier, mirroring how
// monthStart's 1st-of-month serves as the calendar month's identifier) is
// used as the value stored in user_budgets.month when period='semester'.
// Because Winter and Spring start in a different calendar year than Fall
// (e.g. Fall 2025 starts 2025-08-15, but Winter 2025→2026 starts
// 2025-12-15 and belongs to that same academic year even though most of
// it falls in January of the following year), the start date alone is
// enough to uniquely identify a semester without a separate year field.

/** Given a JS Date, returns { name, start, end } for the semester it falls in. */
function semesterForDate(date = new Date()) {
  const y = date.getFullYear();
  const d = (yy, mm, dd) => new Date(Date.UTC(yy, mm - 1, dd));
  const iso = (dt) => dt.toISOString().split("T")[0];

  // Candidate boundaries anchored to this calendar year and adjacent years,
  // since a date near a year boundary (e.g. early January) belongs to a
  // semester that started the previous December.
  const bounds = [
    { name: "Fall",   start: d(y - 1, 8, 15), end: d(y - 1, 12, 15) },
    { name: "Winter", start: d(y - 1, 12, 15), end: d(y, 1, 15) },
    { name: "Winter", start: d(y, 12, 15), end: d(y + 1, 1, 15) },
    { name: "Spring", start: d(y, 1, 15), end: d(y, 5, 15) },
    { name: "Summer", start: d(y, 5, 15), end: d(y, 8, 15) },
    { name: "Fall",   start: d(y, 8, 15), end: d(y, 12, 15) },
  ];

  const match = bounds.find(b => date >= b.start && date < b.end);
  // Fallback should never trigger (bounds above are exhaustive across a
  // 2-year window) but guards against an unexpected edge case rather than
  // returning undefined.
  const chosen = match || bounds[bounds.length - 1];

  return { name: chosen.name, start: iso(chosen.start), end: iso(chosen.end) };
}

/** Parses a ?semester= query param (an ISO start date); falls back to the current semester. */
function parseSemester(raw) {
  if (!raw) return semesterForDate().start;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? raw : semesterForDate().start;
}

// Which period each category naturally belongs to — must stay in sync with
// CATEGORY_META's `period` field in frontend/src/App.jsx. This is the
// server's authoritative answer to "is this category recurring or one-time,"
// used by the budgets routes and manual-transaction validation below. A
// category is NEVER stored under both periods — a recurring category's one
// stored number is its monthly rate; a one-time category's one stored
// number is its flat semester total. Deriving one view's number from the
// other is a frontend display concern (see displayBudget() in App.jsx),
// not a storage concern.
const CATEGORY_PERIOD = {
  Housing: "monthly", Food: "monthly", Transport: "monthly", Health: "monthly",
  Shopping: "monthly", Entertainment: "monthly", Savings: "monthly", Other: "monthly",
  Tuition: "semester", HousingDeposit: "semester", HealthInsurance: "semester",
  BooksSupplies: "semester", Moving: "semester",
};

const VALID_CATEGORIES = Object.keys(CATEGORY_PERIOD);

// ─── Input schemas ────────────────────────────────────────────────────────────

// Deadlines are capped rather than merely well-formed: a goal dated 1999 can
// never be met, and the UI computes "days left" and a required monthly
// contribution from it, both of which are nonsense for a past date.
const MAX_YEARS_AHEAD = 50;
const notInThePast = (d) => !d || d >= new Date().toISOString().slice(0, 10);
const withinHorizon = (d) => {
  if (!d) return true;
  const limit = new Date(); limit.setFullYear(limit.getFullYear() + MAX_YEARS_AHEAD);
  return d <= limit.toISOString().slice(0, 10);
};

const GoalCreateSchema = z.object({
  name:     z.string().min(1).max(120),
  emoji:    z.string().max(8).optional().default("🎯"),
  target:   z.number().positive().max(1_000_000_000),
  saved:    z.number().min(0).optional().default(0),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
              .refine(notInThePast,  { message: "Target date can't be in the past" })
              .refine(withinHorizon, { message: "Target date is unrealistically far away" })
              .nullable().optional(),
})
  // saved > target is not a real state: progress is capped at 100% everywhere
  // it's displayed, so storing 99999 against a 1000 target silently diverges
  // from what every screen shows.
  .refine(d => d.saved === undefined || d.saved <= d.target,
          { message: "Amount saved can't exceed the goal target", path: ["saved"] });

const GoalUpdateSchema = GoalCreateSchema.innerType().partial();

// Keys are constrained to VALID_CATEGORIES rather than any string: with a
// free-form key a client could write budgets under categories the app has no
// concept of ("Yacht": 90000). Those rows are invisible in the UI (which
// iterates CATEGORY_META, not the response) but still count toward the totals
// the server returns, so the budget hero would disagree with the sum of the
// visible category cards and nothing on screen would explain why.
const BudgetUpsertSchema = z.record(
  z.enum(VALID_CATEGORIES),
  z.number().min(0)            // amount — 0 effectively removes the budget
).refine(obj => Object.keys(obj).length > 0, { message: "Provide at least one category" });

// ─── GET /api/goals ───────────────────────────────────────────────────────────

router.get("/goals", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         id, name, emoji, target, saved, deadline,
         created_at, updated_at
       FROM user_goals
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [req.userId]
    );
    // Coerce numeric strings from Postgres into JS numbers
    const goals = rows.map(g => ({
      ...g,
      target:  Number(g.target),
      saved:   Number(g.saved),
      deadline: g.deadline ? g.deadline.toISOString().split("T")[0] : null,
    }));
    return res.json({ goals });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/goals ──────────────────────────────────────────────────────────

router.post("/goals", async (req, res, next) => {
  try {
    const parsed = GoalCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { name, emoji, target, saved, deadline } = parsed.data;

    const { rows } = await query(
      `INSERT INTO user_goals (user_id, name, emoji, target, saved, deadline)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, emoji, target, saved, deadline, created_at`,
      [req.userId, name, emoji, target, saved, deadline || null]
    );
    const g = rows[0];
    return res.status(201).json({
      goal: { ...g, target: Number(g.target), saved: Number(g.saved) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/goals/:id ───────────────────────────────────────────────────────

router.put("/goals/:id", validateUUID("id"), async (req, res, next) => {
  try {
    const parsed = GoalUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    // Confirm the goal belongs to this user before updating
    const existing = await query(
      "SELECT id, target, saved FROM user_goals WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Goal not found" });
    }

    // saved <= target has to be re-checked here, not just in the schema: an
    // update may set only one of the two, so the invariant spans the request
    // body AND the stored row. The create-time refine can't see the stored
    // value, which is how saved=99999 against a target of 1000 got through.
    const nextTarget = parsed.data.target ?? Number(existing.rows[0].target);
    const nextSaved  = parsed.data.saved  ?? Number(existing.rows[0].saved);
    if (nextSaved > nextTarget) {
      return res.status(400).json({ error: "Amount saved can't exceed the goal target" });
    }

    // Build SET clause from only the fields provided
    const fields = parsed.data;
    const sets   = [];
    const params = [];

    const allowed = ["name", "emoji", "target", "saved", "deadline"];
    for (const key of allowed) {
      if (key in fields) {
        params.push(fields[key] ?? null);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    params.push(req.params.id, req.userId);
    const { rows } = await query(
      `UPDATE user_goals
       SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND user_id = $${params.length}
       RETURNING id, name, emoji, target, saved, deadline, updated_at`,
      params
    );
    const g = rows[0];
    return res.json({
      goal: { ...g, target: Number(g.target), saved: Number(g.saved) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/goals/:id ────────────────────────────────────────────────────

router.delete("/goals/:id", validateUUID("id"), async (req, res, next) => {
  try {
    const { rowCount } = await query(
      "DELETE FROM user_goals WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Goal not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/budgets ─────────────────────────────────────────────────────────
// Always returns EVERY category's single stored budget value, merged into one
// flat map — {Housing: 2000, Tuition: 9000, ...}. There is no ?period= query
// param anymore: each category has exactly one stored number (a monthly rate
// for recurring categories, a flat semester total for one-time ones), so
// there's nothing to select between. Deriving a semester total from a
// monthly rate is done client-side in displayBudget() (App.jsx) — the
// server just needs to hand back what's actually stored for each category,
// windowed to the right month/semester so history/future periods work too.
//
// ?month=YYYY-MM-DD and ?semester=YYYY-MM-DD narrow which stored period to
// read for monthly vs semester categories respectively — both default to
// "current" if omitted. Since the two category groups are windowed
// independently (a monthly category's number lives in a specific calendar
// month; a one-time category's number lives in a specific semester), both
// params can matter simultaneously when viewing a past month within the
// current semester, or vice versa.

router.get("/budgets", async (req, res, next) => {
  try {
    const month    = parseMonth(req.query.month);
    const semester = parseSemester(req.query.semester);

    const { rows } = await query(
      `SELECT category, amount, period
       FROM user_budgets
       WHERE user_id = $1
         AND ((period = 'monthly'  AND month = $2)
           OR (period = 'semester' AND month = $3))`,
      [req.userId, month, semester]
    );
    const budgets = Object.fromEntries(rows.map(r => [r.category, Number(r.amount)]));
    return res.json({ budgets, month, semester });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/budgets ─────────────────────────────────────────────────────────
// Accepts { Housing: 2000, Tuition: 9000, ... } — any mix of monthly and
// semester categories in one call. Each category is automatically routed to
// its own correct period via CATEGORY_PERIOD — the client never specifies
// which period a category belongs to, since that's inherent to the category
// itself, not a per-request choice. A recurring category's number always
// overwrites its ONE monthly-rate row; a one-time category's number always
// overwrites its ONE semester-total row. There is no way for a single
// category to end up with two disconnected stored values anymore.

router.put("/budgets", async (req, res, next) => {
  try {
    const parsed = BudgetUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const month    = parseMonth(req.query.month);
    const semester = parseSemester(req.query.semester);
    const categories = parsed.data;

    const client = await (await import("../db/client.js")).pool.connect();
    try {
      await client.query("BEGIN");
      for (const [category, amount] of Object.entries(categories)) {
        const period    = CATEGORY_PERIOD[category] || "monthly";
        const periodDate = period === "semester" ? semester : month;
        await client.query(
          `INSERT INTO user_budgets (user_id, category, amount, month, period)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, category, month, period)
           DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()`,
          [req.userId, category, amount, periodDate, period]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Return the full updated map, same windowing as GET, so the client can
    // immediately reconcile without a separate refetch.
    const { rows } = await query(
      `SELECT category, amount, period
       FROM user_budgets
       WHERE user_id = $1
         AND ((period = 'monthly'  AND month = $2)
           OR (period = 'semester' AND month = $3))`,
      [req.userId, month, semester]
    );
    const budgets = Object.fromEntries(rows.map(r => [r.category, Number(r.amount)]));
    return res.json({ budgets, month, semester });
  } catch (err) {
    next(err);
  }
});

// ─── Manual transactions ───────────────────────────────────────────────────────
// These three endpoints only ever write rows with source = 'manual'.
// Plaid-synced rows (source = 'plaid', written by lib/sync.js) are never
// touched here — a manual edit/delete can't accidentally mutate bank data,
// and a future Plaid sync can't accidentally overwrite a manual entry,
// because the two sets of rows are never selected by the same WHERE clause
// across these two files.
//
// Note: there is no GET here. Reading transactions (Plaid-synced and manual,
// merged into one list) is handled by GET /plaid/transactions in
// routes/plaid.js, which queries the same table without filtering by source.

// A transaction dated 2099 sorts to the top of Activity forever and lands in
// no navigable budget period. Tomorrow is allowed (timezone slack); years are
// not.
const withinReason = (d) => {
  const max = new Date(); max.setDate(max.getDate() + 1);
  return d <= max.toISOString().slice(0, 10) && d >= "2000-01-01";
};

const TxnCreateSchema = z.object({
  desc:     z.string().min(1).max(200),
  amount:   z.number().positive().max(1_000_000_000),
  category: z.enum(VALID_CATEGORIES),
  type:     z.enum(["income", "expense"]),
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
              .refine(withinReason, { message: "Date must be between 2000 and tomorrow" }),
});

const TxnUpdateSchema = TxnCreateSchema.partial();

// ─── POST /api/transactions ───────────────────────────────────────────────────

router.post("/transactions", async (req, res, next) => {
  try {
    const parsed = TxnCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { desc, amount, category, type, date } = parsed.data;

    // Store sign convention matching Plaid: positive = expense (debit),
    // negative = income (credit). The frontend's useTransactions hook
    // already expects this and converts it back to {amount: abs, type}.
    const signedAmount = type === "income" ? -Math.abs(amount) : Math.abs(amount);

    const { rows } = await query(
      `INSERT INTO transactions
         (user_id, amount, description, category, date, source)
       VALUES ($1, $2, $3, $4, $5, 'manual')
       RETURNING id, amount, description AS desc, category, date, source, created_at`,
      [req.userId, signedAmount, desc, category, date]
    );

    const t = rows[0];
    return res.status(201).json({
      transaction: {
        id:       t.id,
        desc:     t.desc,
        category: t.category,
        date:     t.date.toISOString().split("T")[0],
        type:     Number(t.amount) < 0 ? "income" : "expense",
        amount:   Math.abs(Number(t.amount)),
        source:   t.source,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/transactions/:id ─────────────────────────────────────────────────

router.put("/transactions/:id", validateUUID("id"), async (req, res, next) => {
  try {
    const parsed = TxnUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    // Confirm this is a manual row owned by this user before allowing edits.
    // A Plaid-synced row (source = 'plaid') is never editable through this
    // endpoint, even if id and user_id otherwise match — bank-sourced
    // transactions should only ever change via a future Plaid sync.
    const existing = await query(
      "SELECT * FROM transactions WHERE id = $1 AND user_id = $2 AND source = 'manual'",
      [req.params.id, req.userId]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "Manual transaction not found" });
    }

    const fields = parsed.data;
    const sets   = [];
    const params = [];

    if ("desc" in fields)     { params.push(fields.desc);     sets.push(`description = $${params.length}`); }
    if ("category" in fields) { params.push(fields.category); sets.push(`category = $${params.length}`); }
    if ("date" in fields)     { params.push(fields.date);     sets.push(`date = $${params.length}`); }

    // amount and type share a sign convention — if either is provided,
    // recompute the signed amount using the existing row as fallback for
    // whichever of the two wasn't included in this update.
    if ("amount" in fields || "type" in fields) {
      const amount = fields.amount ?? Math.abs(Number(existing.rows[0].amount));
      const type   = fields.type   ?? (Number(existing.rows[0].amount) < 0 ? "income" : "expense");
      const signedAmount = type === "income" ? -Math.abs(amount) : Math.abs(amount);
      params.push(signedAmount);
      sets.push(`amount = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    params.push(req.params.id, req.userId);
    const { rows } = await query(
      `UPDATE transactions
       SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${params.length - 1} AND user_id = $${params.length} AND source = 'manual'
       RETURNING id, amount, description AS desc, category, date, source`,
      params
    );

    const t = rows[0];
    return res.json({
      transaction: {
        id:       t.id,
        desc:     t.desc,
        category: t.category,
        date:     t.date.toISOString().split("T")[0],
        type:     Number(t.amount) < 0 ? "income" : "expense",
        amount:   Math.abs(Number(t.amount)),
        source:   t.source,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/transactions/:id ──────────────────────────────────────────────

router.delete("/transactions/:id", validateUUID("id"), async (req, res, next) => {
  try {
    // source = 'manual' in the WHERE clause means a Plaid-synced transaction
    // can never be deleted through this endpoint, even by its rightful owner —
    // removing bank-sourced history should happen by unlinking the account
    // (DELETE /plaid/items/:id), not by deleting individual rows.
    const { rowCount } = await query(
      "DELETE FROM transactions WHERE id = $1 AND user_id = $2 AND source = 'manual'",
      [req.params.id, req.userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Manual transaction not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

