/**
 * middleware/auth.js — Session middleware
 *
 * requireAuth     — hard gate: 401 if no valid session
 * optionalAuth    — soft gate: attaches req.userId if session present, continues either way
 * requireOwns     — ownership check factory: 401 if req.userId !== target user ID
 *
 * Changes from step 3 baseline:
 *   - requireAuth now confirms the user still exists in the DB.
 *     A deleted user whose access token hasn't expired yet can no longer
 *     authenticate — the row check catches them.
 *   - req.user is attached (not just req.userId) so downstream handlers
 *     can check account state (e.g. is_suspended) without extra queries.
 *   - optionalAuth added for routes that behave differently per-auth state.
 *   - requireOwns factory added for explicit ownership assertions.
 *   - UUID format validated before any DB query to return clean 400s instead
 *     of Postgres errors on malformed IDs.
 */

import { verifyAccessToken } from "../lib/jwt.js";
import { query }             from "../db/client.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── requireAuth ─────────────────────────────────────────────────────────────
// Hard gate. Rejects with 401 if:
//   - No access_token cookie
//   - Token is invalid or expired
//   - User row no longer exists in the DB

export async function requireAuth(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.clearCookie("access_token");
    return res.status(401).json({ error: "Session expired — please log in again" });
  }

  const userId = payload.sub;
  if (!UUID_RE.test(userId)) {
    // Should never happen with tokens we issue — indicates tampering
    return res.status(401).json({ error: "Invalid session" });
  }

  // Confirm the account still exists.
  // This catches deleted accounts that still have a valid unexpired token.
  try {
    const { rows } = await query(
      "SELECT id, email, name FROM users WHERE id = $1",
      [userId]
    );
    if (!rows[0]) {
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      return res.status(401).json({ error: "Account not found" });
    }
    // Attach both for convenience — routes can use either
    req.userId = userId;
    req.user   = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

// ─── optionalAuth ────────────────────────────────────────────────────────────
// Soft gate. Attaches req.userId and req.user if a valid session is present,
// but always calls next() — the route handler decides what to do with the gap.

export async function optionalAuth(req, _res, next) {
  const token = req.cookies?.access_token;
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const userId  = payload.sub;
    if (!UUID_RE.test(userId)) return next();

    const { rows } = await query(
      "SELECT id, email, name FROM users WHERE id = $1",
      [userId]
    );
    if (rows[0]) {
      req.userId = userId;
      req.user   = rows[0];
    }
  } catch {
    // Invalid token — just proceed unauthenticated, don't error
  }
  next();
}

// ─── requireOwns ─────────────────────────────────────────────────────────────
// Factory that returns middleware asserting req.userId matches a target.
// Usage: router.get("/:userId/profile", requireAuth, requireOwns("userId"), handler)
//
// This is a belt-and-suspenders layer on top of per-query user_id scoping —
// use it on any route where the user ID appears in the URL path.

export function requireOwns(paramName) {
  return (req, res, next) => {
    const targetId = req.params[paramName];

    if (!targetId) {
      return res.status(400).json({ error: `Missing param: ${paramName}` });
    }
    if (!UUID_RE.test(targetId)) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    if (req.userId !== targetId) {
      // Return 404 rather than 403 — don't confirm the resource exists
      return res.status(404).json({ error: "Not found" });
    }
    next();
  };
}

// ─── validateUUID ────────────────────────────────────────────────────────────
// Inline param validator — use as middleware on any route with a UUID path param.
// Usage: router.delete("/items/:itemId", requireAuth, validateUUID("itemId"), handler)

export function validateUUID(paramName) {
  return (req, res, next) => {
    if (!UUID_RE.test(req.params[paramName])) {
      return res.status(400).json({ error: "Invalid ID format" });
    }
    next();
  };
}
