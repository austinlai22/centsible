/**
 * lib/mfa.js — multi-factor authentication.
 *
 * Currently TOTP (authenticator app). The factor table is keyed by type, so
 * adding SMS later means a new row and a new branch here, not a migration.
 *
 * The rules that matter, in one place because each one is a way to either lock
 * a user out of their own money or let someone else in:
 *
 *   - An UNCONFIRMED factor never gates a login. Abandoning the setup screen
 *     must not lock you out.
 *   - A code is accepted at most once (last_counter), because a TOTP code
 *     stays valid for its whole window and can be observed and replayed.
 *   - Failed attempts lock the factor temporarily. Six digits is only a
 *     million possibilities; unlimited guessing defeats the whole mechanism.
 *   - Recovery codes are single-use and shown exactly once.
 */

import crypto from "crypto";
import { query, connectClient } from "../db/client.js";
import { encrypt, decrypt } from "./crypto.js";
import * as totp from "./totp.js";

export const FACTOR_TYPES = Object.freeze({ TOTP: "totp", SMS: "sms" });

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES     = 15;
const RECOVERY_CODE_COUNT = 10;

/** SHA-256, matching the reasoning in lib/jwt.js for high-entropy secrets. */
const hashCode = (raw) =>
  crypto.createHash("sha256").update(raw.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

// ─── Factor state ─────────────────────────────────────────────────────────────

export async function getFactor(userId, type = FACTOR_TYPES.TOTP) {
  const { rows } = await query(
    "SELECT * FROM user_mfa_factors WHERE user_id = $1 AND type = $2",
    [userId, type]
  );
  return rows[0] || null;
}

/**
 * Does this user have MFA actually switched on?
 *
 * confirmed_at IS NOT NULL is the whole question — a half-finished enrolment
 * must not stand between a user and their account.
 */
export async function hasConfirmedMfa(userId) {
  const { rows } = await query(
    "SELECT 1 FROM user_mfa_factors WHERE user_id = $1 AND confirmed_at IS NOT NULL LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}

export async function getStatus(userId) {
  const factor = await getFactor(userId);
  const { rows } = await query(
    "SELECT COUNT(*)::int AS remaining FROM mfa_recovery_codes WHERE user_id = $1 AND used_at IS NULL",
    [userId]
  );
  return {
    enabled:                !!factor?.confirmed_at,
    pendingSetup:           !!factor && !factor.confirmed_at,
    type:                   factor?.type ?? null,
    confirmedAt:            factor?.confirmed_at ?? null,
    recoveryCodesRemaining: rows[0].remaining,
  };
}

// ─── Enrolment ────────────────────────────────────────────────────────────────

/**
 * Begins TOTP enrolment: mints a secret, stores it unconfirmed, and returns
 * what the UI needs to show a QR code.
 *
 * Re-running replaces any unconfirmed secret — a user who abandoned setup and
 * came back gets a clean one rather than a stale QR their app never scanned.
 * It deliberately refuses to clobber a CONFIRMED factor, which would silently
 * invalidate the authenticator entry the user is currently relying on.
 */
export async function startTotpEnrolment(userId, accountName) {
  const existing = await getFactor(userId);
  if (existing?.confirmed_at) {
    throw Object.assign(
      new Error("Two-factor authentication is already enabled. Turn it off first to re-enrol."),
      { status: 409 }
    );
  }

  const secret = totp.generateSecret();
  await query(
    `INSERT INTO user_mfa_factors (user_id, type, secret_enc, confirmed_at, last_counter, failed_attempts)
     VALUES ($1, $2, $3, NULL, NULL, 0)
     ON CONFLICT (user_id, type)
     DO UPDATE SET secret_enc = EXCLUDED.secret_enc,
                   confirmed_at = NULL, last_counter = NULL,
                   failed_attempts = 0, locked_until = NULL, updated_at = NOW()`,
    [userId, FACTOR_TYPES.TOTP, encrypt(secret)]
  );

  return {
    secret, // shown once, for users who type it in instead of scanning
    uri: totp.toURI({ secret, accountName, issuer: "Centsible" }),
  };
}

/**
 * Completes enrolment by proving the user's app produces valid codes, then
 * issues recovery codes.
 *
 * Requiring proof before switching MFA on is the point: enabling it off the
 * back of an unverified secret means the next login is against an
 * authenticator entry that may never have been scanned correctly.
 */
export async function confirmTotpEnrolment(userId, token) {
  const factor = await getFactor(userId);
  if (!factor)             throw Object.assign(new Error("Start setup first."), { status: 400 });
  if (factor.confirmed_at) throw Object.assign(new Error("Already enabled."),   { status: 409 });

  const counter = totp.verify(decrypt(factor.secret_enc), token);
  if (counter === null) {
    throw Object.assign(new Error("That code isn't right. Check your authenticator app and try again."), { status: 400 });
  }

  await query(
    "UPDATE user_mfa_factors SET confirmed_at = NOW(), last_counter = $1, failed_attempts = 0, updated_at = NOW() WHERE id = $2",
    [counter, factor.id]
  );

  return generateRecoveryCodes(userId);
}

// ─── Verification at login ────────────────────────────────────────────────────

/**
 * Verifies a TOTP code during sign-in.
 *
 * Replay: a code is only accepted if its time-step is strictly greater than
 * the last one accepted. Both the check and the write happen in one UPDATE so
 * two simultaneous requests carrying the same observed code cannot both pass.
 */
export async function verifyTotpCode(userId, token) {
  const factor = await getFactor(userId);
  if (!factor?.confirmed_at) return { ok: false, reason: "not_enabled" };

  if (factor.locked_until && new Date(factor.locked_until) > new Date()) {
    return { ok: false, reason: "locked", lockedUntil: factor.locked_until };
  }

  const counter = totp.verify(decrypt(factor.secret_enc), token);

  if (counter === null) return recordFailure(factor);

  const { rowCount } = await query(
    `UPDATE user_mfa_factors
        SET last_counter = $1, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = $2 AND (last_counter IS NULL OR last_counter < $1)`,
    [counter, factor.id]
  );
  if (rowCount === 0) {
    // The code was CORRECT but its time-step was already spent.
    //
    // Deliberately not counted as a failed attempt. By far the most common
    // cause is a legitimate user whose authenticator still displays the code
    // they just used — enabling MFA and immediately signing in elsewhere hits
    // this every time — and burning their lockout budget for typing what the
    // screen shows would lock real users out of their own money. An attacker
    // replaying an observed code gains nothing either way: it is still
    // refused. Rate limiting on the route covers volume abuse.
    return { ok: false, reason: "replay" };
  }
  return { ok: true };
}

async function recordFailure(factor, reason = "invalid") {
  const attempts = factor.failed_attempts + 1;
  const lock = attempts >= MAX_FAILED_ATTEMPTS;
  await query(
    `UPDATE user_mfa_factors
        SET failed_attempts = $1,
            locked_until = CASE WHEN $2 THEN NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes' ELSE locked_until END,
            updated_at = NOW()
      WHERE id = $3`,
    [lock ? 0 : attempts, lock, factor.id]
  );
  return { ok: false, reason: lock ? "locked" : reason, attemptsRemaining: lock ? 0 : MAX_FAILED_ATTEMPTS - attempts };
}

// ─── Recovery codes ───────────────────────────────────────────────────────────

/**
 * Replaces every recovery code with a fresh set, returned in the clear once.
 *
 * Old codes are deleted rather than kept alongside: regenerating is what a
 * user does when they believe the previous list leaked, and leaving those
 * working would make the action pointless.
 */
export async function generateRecoveryCodes(userId) {
  // Crockford-ish alphabet: no 0/O/1/I/L, because these get read off a screen
  // and typed by hand, often months later and often under stress.
  const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
  const make = () => {
    const pick = n => Array.from(crypto.randomBytes(n))
      .map(b => ALPHABET[b % ALPHABET.length]).join("");
    return `${pick(4)}-${pick(4)}`;
  };

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, make);

  const client = await connectClient();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
    for (const code of codes) {
      await client.query(
        "INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, hashCode(code)]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return codes;
}

/**
 * Spends a recovery code. Single-use, enforced by the WHERE clause rather than
 * a read-then-write, so the same code submitted twice concurrently is only
 * honoured once.
 */
export async function consumeRecoveryCode(userId, code) {
  if (!code || typeof code !== "string") return false;
  const { rowCount } = await query(
    `UPDATE mfa_recovery_codes SET used_at = NOW()
      WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL`,
    [userId, hashCode(code)]
  );
  return rowCount === 1;
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

/** Turns MFA off entirely and burns any remaining recovery codes. */
export async function disableMfa(userId) {
  const client = await connectClient();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_mfa_factors  WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
