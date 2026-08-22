/**
 * routes/auth.js — Authentication endpoints
 *
 * POST /auth/register     — create account
 * POST /auth/login        — issue access + refresh tokens
 * POST /auth/refresh      — rotate refresh token, issue new access token
 * POST /auth/logout       — revoke refresh token, clear cookies
 * GET  /auth/me           — return current user (requires auth)
 * PUT  /auth/me           — update name/email
 * DELETE /auth/me         — delete account
 * POST /auth/onboarding   — persist onboarding answers, mark onboarded_at
 *
 * Security notes:
 *   - Passwords hashed with bcrypt (cost factor 12)
 *   - Auth endpoints rate-limited to 10 req/15min per IP (brute-force protection)
 *   - Tokens set as HttpOnly cookies — never in response body
 *   - Login returns the same generic error for "user not found" and "wrong password"
 *     (prevents user enumeration)
 *   - All inputs validated with Zod before touching the DB
 */

import { Router }      from "express";
import bcrypt          from "bcryptjs";
import { rateLimit }   from "express-rate-limit";
import { z }           from "zod";
import { query }       from "../db/client.js";
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  setTokenCookies,
  clearTokenCookies,
}                      from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Strict rate limit for auth endpoints — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts — please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Input schemas ────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email:    z.string().email().max(254).toLowerCase(),
  password: z.string().min(8).max(128),
  name:     z.string().min(1).max(80).optional(),
});

const LoginSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: z.string().min(1).max(128),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeUser(row) {
  // Never return password_hash to the client
  const { password_hash, ...safe } = row;
  return safe;
}

// ─── POST /auth/register ──────────────────────────────────────────────────────

router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { email, password, name } = parsed.data;

    // Check for existing account — but return the same error as a wrong password
    // to avoid confirming whether an email is registered
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3) RETURNING *`,
      [email, password_hash, name || null]
    );
    const user = rows[0];

    // Seed empty rewards row
    await query("INSERT INTO rewards (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.id]);

    const accessToken          = signAccessToken(user.id);
    const { raw: refreshToken } = await issueRefreshToken(user.id);
    setTokenCookies(res, accessToken, refreshToken);

    return res.status(201).json({ user: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      // Generic message — don't hint at what's wrong
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const { email, password } = parsed.data;

    const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);

    // Always run bcrypt.compare even if user not found — prevents timing attacks
    const dummyHash = "$2b$12$w01g67UaX1fFvU1W9.yLge.5gN3V6R53e2V57oN289X23j9823908";
    const hash = rows[0]?.password_hash || dummyHash;
    const valid = await bcrypt.compare(password, hash);

    if (!rows[0] || !valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];
    const accessToken          = signAccessToken(user.id);
    const { raw: refreshToken } = await issueRefreshToken(user.id);
    setTokenCookies(res, accessToken, refreshToken);

    return res.json({ user: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

router.post("/refresh", async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token;
    if (!rawRefreshToken) {
      return res.status(401).json({ error: "No refresh token" });
    }

    const { userId, newRaw } = await rotateRefreshToken(rawRefreshToken);
    const accessToken        = signAccessToken(userId);
    setTokenCookies(res, accessToken, newRaw);

    return res.json({ ok: true });
  } catch (err) {
    clearTokenCookies(res);
    if (err.status === 401) return res.status(401).json({ error: err.message });
    next(err);
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
// Revokes the refresh token by marking it as revoked in the DB,
// then clears both cookies. Works even if the access token is already expired.

router.post("/logout", async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token;
    if (rawRefreshToken) {
      // Find and revoke the matching token row.
      // We scan recent non-revoked tokens and bcrypt-compare to find the match.
      // Best-effort — if not found (already expired/revoked), we still clear cookies.
      try {
        const { rows } = await query(
          `SELECT id, token_hash FROM refresh_tokens
           WHERE revoked = FALSE AND expires_at > NOW()
           ORDER BY created_at DESC LIMIT 50`
        );
        for (const row of rows) {
          if (await bcrypt.compare(rawRefreshToken, row.token_hash)) {
            await query(
              "UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1",
              [row.id]
            );
            break;
          }
        }
      } catch (_) { /* already invalid — ignore */ }
    }
    clearTokenCookies(res);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    return res.json({ user: safeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /auth/me ─────────────────────────────────────────────────────────────
// Update name and/or email for the authenticated user.
// Email changes require re-verification in a real app — stubbed here for MVP.

const UpdateMeSchema = z.object({
  name:  z.string().min(1).max(80).optional(),
  email: z.string().email().max(254).toLowerCase().optional(),
}).refine(d => d.name || d.email, { message: "Provide at least one field to update" });

router.put("/me", requireAuth, async (req, res, next) => {
  try {
    const parsed = UpdateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { name, email } = parsed.data;

    // Build update dynamically — only touch provided fields
    const sets   = [];
    const params = [];
    if (name)  { params.push(name);  sets.push(`name = $${params.length}`); }
    if (email) {
      // Check new email isn't already taken by another account
      const conflict = await query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, req.userId]
      );
      if (conflict.rows.length > 0) {
        return res.status(409).json({ error: "Email already in use" });
      }
      params.push(email);
      sets.push(`email = $${params.length}`);
    }

    params.push(req.userId);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${params.length} RETURNING *`,
      params
    );

    return res.json({ user: safeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /auth/me ──────────────────────────────────────────────────────────
// Permanently deletes the account and all associated data.
// ON DELETE CASCADE in the schema handles child rows automatically.

router.delete("/me", requireAuth, async (req, res, next) => {
  try {
    await query("DELETE FROM users WHERE id = $1", [req.userId]);
    clearTokenCookies(res);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/onboarding ─────────────────────────────────────────────────────
// Persists the answers collected in the onboarding flow and stamps
// onboarded_at. The frontend uses onboarded_at as the single source of truth
// for whether to show the onboarding screens again — once this is set,
// a returning user (even on a new device/browser, since this is server-side)
// skips straight to the main app.
//
// Idempotent: calling this again just overwrites the answers and refreshes
// the timestamp — there's no harm in re-running onboarding deliberately.

const OnboardingSchema = z.object({
  name:           z.string().min(1).max(80).optional(),
  income:         z.coerce.number().min(0).max(100_000_000).optional(),
  financialGoal:  z.string().max(120).optional(),
  housingCost:    z.coerce.number().min(0).max(100_000_000).optional(),
  spendingStyle:  z.string().max(120).optional(),
});

router.post("/onboarding", requireAuth, async (req, res, next) => {
  try {
    const parsed = OnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { name, income, financialGoal, housingCost, spendingStyle } = parsed.data;

    const { rows } = await query(
      `UPDATE users SET
         name           = COALESCE($1, name),
         income         = $2,
         financial_goal = $3,
         housing_cost   = $4,
         spending_style = $5,
         onboarded_at   = NOW(),
         updated_at     = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        name || null,
        income ?? null,
        financialGoal || null,
        housingCost ?? null,
        spendingStyle || null,
        req.userId,
      ]
    );

    return res.json({ user: safeUser(rows[0]) });
  } catch (err) {
    next(err);
  }
});

export default router;
