/**
 * lib/jwt.js — JWT access + refresh token management
 *
 * Two-token strategy:
 *   Access token  — short-lived (15 min), sent as HttpOnly + Secure cookie.
 *                   Verified on every protected request.
 *   Refresh token — long-lived (7 days), sent as a separate HttpOnly cookie.
 *                   Used only on POST /auth/refresh to issue a new access token.
 *                   Stored (hashed) in the DB for rotation and revocation.
 *
 * Refresh token rotation:
 *   Each use of a refresh token issues a brand-new one and invalidates the old.
 *   If an already-used token is presented again, the entire token family is
 *   revoked — detecting that a token was stolen and replayed.
 *
 * Cookie flags:
 *   HttpOnly — not accessible to JavaScript (blocks XSS token theft)
 *   Secure   — only sent over HTTPS (enforced in production)
 *   SameSite — defaults to "none" in production to support cross-origin
 *             frontend/backend deployments (e.g. Vercel + Railway). Can be
 *             overridden to "strict" via COOKIE_SAME_SITE env var if both
 *             are on the same domain. CSRF protection is handled by the
 *             strict CORS origin check in index.js instead.
 */

import jwt        from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import crypto     from "crypto";
import { query }  from "../db/client.js";

/**
 * Refresh tokens are hashed with SHA-256, not bcrypt.
 *
 * bcrypt's cost is designed to slow down guessing of LOW-entropy secrets
 * (human passwords). A refresh token here is 256 bits of CSPRNG output —
 * brute-forcing it is infeasible regardless of hash speed, so bcrypt buys
 * nothing and costs something important: because a bcrypt hash embeds a
 * random salt, you cannot look a token UP by its hash. The previous
 * implementation worked around that by fetching the 50 newest active tokens
 * ACROSS ALL USERS and comparing one by one, which meant (a) any user whose
 * token fell outside that global window got a spurious 401 on a perfectly
 * valid token once the app had >50 concurrent sessions, and (b) reuse
 * detection was impossible, because a miss gave you no row and therefore no
 * family to revoke.
 *
 * SHA-256 is deterministic, so token_hash is a direct indexed lookup: O(1),
 * correct at any scale, and a miss-vs-revoked-hit distinction that makes real
 * theft detection possible (see rotateRefreshToken).
 */
function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXP     = process.env.JWT_ACCESS_EXPIRES  || "15m";
const REFRESH_EXP    = process.env.JWT_REFRESH_EXPIRES || "7d";

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set");
}

// ─── Issue ────────────────────────────────────────────────────────────────────

/** Creates a signed access token containing the user's id. */
export function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, ACCESS_SECRET, { expiresIn: ACCESS_EXP });
}

/**
 * Creates a raw refresh token, stores its SHA-256 hash in the DB, and returns
 * the raw token for the cookie.
 *
 * 32 random bytes rather than a UUID: uuid v4 carries 122 bits of entropy and
 * a recognisable structure, randomBytes(32) gives a full 256 with none.
 */
export async function issueRefreshToken(userId, familyId = uuid()) {
  const raw  = crypto.randomBytes(32).toString("base64url");
  const hash = hashToken(raw);

  // Parse expiry string into a real Date for the DB
  const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXP));

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hash, familyId, expiresAt]
  );

  return { raw, familyId };
}

// ─── Verify ───────────────────────────────────────────────────────────────────

/** Verifies an access token. Throws if invalid or expired. */
export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET); // { sub: userId, iat, exp }
}

/**
 * Validates and rotates a raw refresh token.
 *
 *   1. Direct indexed lookup on the SHA-256 hash
 *   2. Row missing entirely      → 401 (never issued, or already pruned)
 *   3. Row present but REVOKED   → replay of a spent token. This is the
 *                                  signal that a token was stolen: the
 *                                  legitimate client already rotated it, so
 *                                  whoever is presenting it now has a copy.
 *                                  Revoke the entire family, which logs out
 *                                  both the attacker and the victim's chain.
 *   4. Row present but EXPIRED   → 401, no family revocation (benign)
 *   5. Otherwise                 → revoke this token, issue its successor in
 *                                  the same family
 *
 * Returns: { userId, newRaw, familyId }
 */
export async function rotateRefreshToken(rawToken) {
  const { rows } = await query(
    "SELECT * FROM refresh_tokens WHERE token_hash = $1",
    [hashToken(rawToken)]
  );
  const matched = rows[0];

  if (!matched) {
    throw Object.assign(new Error("Invalid or expired refresh token"), { status: 401 });
  }

  if (matched.revoked) {
    // Reuse detected. Revoking the family is what makes rotation actually
    // worth doing — without it a stolen token just races the real user.
    await query(
      "UPDATE refresh_tokens SET revoked = TRUE WHERE family_id = $1 AND revoked = FALSE",
      [matched.family_id]
    );
    console.warn(
      `[auth] Refresh token reuse detected for user ${matched.user_id} — family ${matched.family_id} revoked`
    );
    throw Object.assign(new Error("Invalid or expired refresh token"), { status: 401 });
  }

  if (new Date(matched.expires_at) <= new Date()) {
    throw Object.assign(new Error("Invalid or expired refresh token"), { status: 401 });
  }

  // Invalidate the used token
  await query("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", [matched.id]);

  // Issue replacement in the same family
  const { raw: newRaw, familyId } = await issueRefreshToken(matched.user_id, matched.family_id);
  return { userId: matched.user_id, newRaw, familyId };
}

/**
 * Revokes a single refresh token by its raw value — used by logout.
 *
 * Only this token is revoked, not the family: logging out on your phone
 * should not sign you out on your laptop. Silently no-ops if the token is
 * unknown or already revoked, so logout always succeeds from the caller's
 * point of view.
 */
export async function revokeRefreshToken(rawToken) {
  await query(
    "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1 AND revoked = FALSE",
    [hashToken(rawToken)]
  );
}

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === "production";

// SameSite policy:
//   "none"   — required when the frontend and backend are on different
//              domains (e.g. app.flowapp.com calling api.flowapp.com, or
//              a Vercel frontend calling a Railway backend) — this is the
//              realistic default deployment shape for this app. "none"
//              REQUIRES secure:true, which is already enforced below.
//   "strict" — only correct if frontend and backend are served from the
//              exact same origin (same domain, same port) — uncommon for
//              this kind of split deployment, but supported if you set
//              COOKIE_SAME_SITE=strict in your environment.
// CSRF protection here comes primarily from the strict CORS origin check
// in index.js (only CLIENT_ORIGIN can make credentialed requests), not from
// SameSite — SameSite=None deliberately accepts that tradeoff.
const SAME_SITE = process.env.COOKIE_SAME_SITE || (IS_PROD ? "none" : "lax");

/** Cookie options shared by both token cookies. */
const baseCookieOpts = {
  httpOnly: true,                          // not accessible to JavaScript
  secure:   IS_PROD || SAME_SITE === "none", // SameSite=None requires Secure
  sameSite: SAME_SITE,
  path:     "/",
};

export function setTokenCookies(res, accessToken, refreshToken) {
  res.cookie("access_token",  accessToken,  { ...baseCookieOpts, maxAge: 15 * 60 * 1000 });         // 15 min
  res.cookie("refresh_token", refreshToken, { ...baseCookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7 days
}

export function clearTokenCookies(res) {
  res.clearCookie("access_token",  baseCookieOpts);
  res.clearCookie("refresh_token", baseCookieOpts);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Parses a duration string like "15m", "7d" into milliseconds. */
function parseDuration(str) {
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration string: ${str}`);
  return parseInt(match[1], 10) * units[match[2]];
}
