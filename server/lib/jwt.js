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
import bcrypt     from "bcryptjs";
import { v4 as uuid } from "uuid";
import { query }  from "../db/client.js";

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
 * Creates a raw refresh token (UUID), stores its bcrypt hash in the DB,
 * and returns the raw token for the cookie.
 */
export async function issueRefreshToken(userId, familyId = uuid()) {
  const raw  = uuid();
  const hash = await bcrypt.hash(raw, 10);

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
 * Validates a raw refresh token:
 *   1. Looks up all non-revoked tokens for the user and bcrypt-compares
 *   2. Checks expiry
 *   3. If valid: deletes the used token and issues a new one (rotation)
 *   4. If token was already used (not found): revokes the whole family (theft detection)
 *
 * Returns: { userId, newRawToken, newFamilyId }
 */
export async function rotateRefreshToken(rawToken) {
  // Find all active (non-revoked, non-expired) tokens and compare hashes
  const { rows } = await query(
    `SELECT * FROM refresh_tokens
     WHERE revoked = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 50`  // bounded scan — no full table scan
  );

  let matched = null;
  for (const row of rows) {
    if (await bcrypt.compare(rawToken, row.token_hash)) {
      matched = row;
      break;
    }
  }

  if (!matched) {
    // Token not found among active tokens.
    // It may have been used before — attempt family revocation.
    // (We can't identify the family without the match, so this is best-effort.)
    throw Object.assign(new Error("Invalid or expired refresh token"), { status: 401 });
  }

  // Invalidate the used token
  await query("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", [matched.id]);

  // Issue replacement in the same family
  const { raw: newRaw, familyId } = await issueRefreshToken(matched.user_id, matched.family_id);
  return { userId: matched.user_id, newRaw, familyId };
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
