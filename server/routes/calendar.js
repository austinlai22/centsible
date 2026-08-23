/**
 * routes/calendar.js — academic terms and aid disbursements.
 *
 * Mounted at /api. These two together define the shape of a student's
 * financial year, which is what separates this app from a monthly-salary
 * budgeting tool:
 *
 *   terms         — when the money has to last FROM and UNTIL
 *   disbursements — when the money actually arrives
 *
 * The hardcoded Aug 15 / Dec 15 calendar this replaces is one US semester
 * system among many. A quarter-system student given semester boundaries gets a
 * wrong runway, which is worse than no runway at all.
 */

import { Router } from "express";
import { z }      from "zod";
import { query }  from "../db/client.js";
import { requireAuth, validateUUID } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

// ─── Terms ────────────────────────────────────────────────────────────────────

const TermSchema = z.object({
  name:       z.string().min(1).max(60),
  start_date: z.string().regex(DATE),
  end_date:   z.string().regex(DATE),
}).refine(t => t.end_date > t.start_date, {
  message: "A term has to end after it starts", path: ["end_date"],
})
  // A 3-year "term" is a data-entry slip, not a term, and it would silently
  // flatten the runway calculation into meaninglessness.
  .refine(t => (new Date(t.end_date) - new Date(t.start_date)) / 86_400_000 <= 400, {
    message: "A term longer than 400 days is probably a mistake", path: ["end_date"],
  });

router.get("/terms", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, start_date, end_date FROM user_terms
        WHERE user_id = $1 ORDER BY start_date ASC`,
      [req.userId]
    );
    return res.json({
      terms: rows.map(r => ({ ...r, start_date: iso(r.start_date), end_date: iso(r.end_date) })),
    });
  } catch (err) { next(err); }
});

router.post("/terms", async (req, res, next) => {
  try {
    const parsed = TermSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { name, start_date, end_date } = parsed.data;

    // Terms must not overlap: a date belonging to two terms makes "which term
    // am I in" ambiguous, and every downstream figure depends on that answer.
    const clash = await query(
      `SELECT name FROM user_terms
        WHERE user_id = $1 AND start_date < $3 AND end_date > $2`,
      [req.userId, start_date, end_date]
    );
    if (clash.rows.length) {
      return res.status(409).json({ error: `That overlaps your "${clash.rows[0].name}" term.` });
    }

    const { rows } = await query(
      `INSERT INTO user_terms (user_id, name, start_date, end_date)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, start_date)
       DO UPDATE SET name = EXCLUDED.name, end_date = EXCLUDED.end_date, updated_at = NOW()
       RETURNING id, name, start_date, end_date`,
      [req.userId, name, start_date, end_date]
    );
    const t = rows[0];
    return res.status(201).json({ term: { ...t, start_date: iso(t.start_date), end_date: iso(t.end_date) } });
  } catch (err) { next(err); }
});

router.put("/terms/:id", validateUUID("id"), async (req, res, next) => {
  try {
    const parsed = TermSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { name, start_date, end_date } = parsed.data;

    const clash = await query(
      `SELECT name FROM user_terms
        WHERE user_id = $1 AND id <> $2 AND start_date < $4 AND end_date > $3`,
      [req.userId, req.params.id, start_date, end_date]
    );
    if (clash.rows.length) {
      return res.status(409).json({ error: `That overlaps your "${clash.rows[0].name}" term.` });
    }

    const { rows } = await query(
      `UPDATE user_terms SET name=$1, start_date=$2, end_date=$3, updated_at=NOW()
        WHERE id=$4 AND user_id=$5
        RETURNING id, name, start_date, end_date`,
      [name, start_date, end_date, req.params.id, req.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "Term not found" });
    const t = rows[0];
    return res.json({ term: { ...t, start_date: iso(t.start_date), end_date: iso(t.end_date) } });
  } catch (err) { next(err); }
});

router.delete("/terms/:id", validateUUID("id"), async (req, res, next) => {
  try {
    const { rowCount } = await query(
      "DELETE FROM user_terms WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: "Term not found" });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Disbursements ────────────────────────────────────────────────────────────

const DisbursementSchema = z.object({
  label:       z.string().min(1).max(80),
  amount:      z.number().positive().max(1_000_000_000),
  expected_on: z.string().regex(DATE),
  received_on: z.string().regex(DATE).nullable().optional(),
});

router.get("/disbursements", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, label, amount, expected_on, received_on
         FROM user_disbursements WHERE user_id = $1 ORDER BY expected_on ASC`,
      [req.userId]
    );
    return res.json({
      disbursements: rows.map(r => ({
        ...r,
        amount:      Number(r.amount),
        expected_on: iso(r.expected_on),
        received_on: r.received_on ? iso(r.received_on) : null,
      })),
    });
  } catch (err) { next(err); }
});

router.post("/disbursements", async (req, res, next) => {
  try {
    const parsed = DisbursementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { label, amount, expected_on, received_on } = parsed.data;
    const { rows } = await query(
      `INSERT INTO user_disbursements (user_id, label, amount, expected_on, received_on)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, label, amount, expected_on, received_on`,
      [req.userId, label, amount, expected_on, received_on || null]
    );
    const d = rows[0];
    return res.status(201).json({
      disbursement: { ...d, amount: Number(d.amount), expected_on: iso(d.expected_on),
                      received_on: d.received_on ? iso(d.received_on) : null },
    });
  } catch (err) { next(err); }
});

router.put("/disbursements/:id", validateUUID("id"), async (req, res, next) => {
  try {
    const parsed = DisbursementSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const existing = await query(
      "SELECT * FROM user_disbursements WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: "Disbursement not found" });
    const cur = existing.rows[0];
    const next_ = {
      label:       parsed.data.label       ?? cur.label,
      amount:      parsed.data.amount      ?? Number(cur.amount),
      expected_on: parsed.data.expected_on ?? iso(cur.expected_on),
      received_on: "received_on" in parsed.data
        ? parsed.data.received_on
        : (cur.received_on ? iso(cur.received_on) : null),
    };

    const { rows } = await query(
      `UPDATE user_disbursements SET label=$1, amount=$2, expected_on=$3, received_on=$4, updated_at=NOW()
        WHERE id=$5 AND user_id=$6
        RETURNING id, label, amount, expected_on, received_on`,
      [next_.label, next_.amount, next_.expected_on, next_.received_on, req.params.id, req.userId]
    );
    const d = rows[0];
    return res.json({
      disbursement: { ...d, amount: Number(d.amount), expected_on: iso(d.expected_on),
                      received_on: d.received_on ? iso(d.received_on) : null },
    });
  } catch (err) { next(err); }
});

router.delete("/disbursements/:id", validateUUID("id"), async (req, res, next) => {
  try {
    const { rowCount } = await query(
      "DELETE FROM user_disbursements WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: "Disbursement not found" });
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
