/**
 * routes/mfa.js — two-factor authentication endpoints, mounted at /auth/mfa.
 *
 *   GET  /auth/mfa                 status (requires session)
 *   POST /auth/mfa/totp/start      begin enrolment, returns secret + QR
 *   POST /auth/mfa/totp/confirm    prove a code, switch MFA on, return recovery codes
 *   POST /auth/mfa/disable         turn MFA off (re-authenticates with password)
 *   POST /auth/mfa/recovery/regenerate   fresh codes (re-authenticates)
 *   POST /auth/mfa/verify          complete a login challenge (NO session yet)
 *
 * Note which of these require a session and which do not. /verify is reached
 * mid-login, when the user has proven their password but not their second
 * factor — it is authorised by the short-lived mfa_pending cookie and by
 * nothing else.
 */

import { Router }    from "express";
import bcrypt        from "bcryptjs";
import QRCode        from "qrcode";
import { rateLimit } from "express-rate-limit";
import { z }         from "zod";
import { query }     from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  signAccessToken, issueRefreshToken, setTokenCookies,
  verifyMfaPendingToken, clearMfaPendingCookie,
} from "../lib/jwt.js";
import {
  getStatus, startTotpEnrolment, confirmTotpEnrolment,
  verifyTotpCode, consumeRecoveryCode, disableMfa, generateRecoveryCodes,
} from "../lib/mfa.js";

const router = Router();

// Tighter than the global limiter. A six-digit code is only a million
// possibilities; the per-factor lockout in lib/mfa.js handles a single
// targeted account, and this handles someone spraying many accounts from one
// address.
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MFA_RATE_LIMIT_MAX ?? 20),
  message: { error: "Too many attempts — please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const CodeSchema = z.object({
  token: z.string().min(6).max(10).optional(),
  recoveryCode: z.string().min(4).max(32).optional(),
}).refine(d => d.token || d.recoveryCode, { message: "Enter a code" });

/** Re-authenticates with the current password before a sensitive change. */
async function requirePassword(userId, password) {
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const hash = rows[0]?.password_hash;
  // A Google-only account has no password to re-check. Once Google sign-in
  // lands this needs a provider-appropriate re-auth (a fresh Google assertion)
  // rather than silently allowing MFA to be switched off with no proof at all.
  if (!hash) {
    throw Object.assign(
      new Error("This account has no password set. Re-authentication isn't available yet for provider-only accounts."),
      { status: 501 }
    );
  }
  if (!(await bcrypt.compare(password || "", hash))) {
    throw Object.assign(new Error("Incorrect password."), { status: 401 });
  }
}

// ─── GET /auth/mfa ────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res, next) => {
  try {
    return res.json(await getStatus(req.userId));
  } catch (err) { next(err); }
});

// ─── POST /auth/mfa/totp/start ────────────────────────────────────────────────

router.post("/totp/start", requireAuth, async (req, res, next) => {
  try {
    const { secret, uri } = await startTotpEnrolment(req.userId, req.user.email);
    // Rendered server-side into a data: URI so the frontend needs no QR
    // library. index.html's CSP already allows img-src data:.
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
    return res.json({ secret, uri, qr });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ─── POST /auth/mfa/totp/confirm ──────────────────────────────────────────────

router.post("/totp/confirm", requireAuth, mfaLimiter, async (req, res, next) => {
  try {
    const parsed = CodeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    // Returned exactly once — never retrievable again, only replaceable.
    const recoveryCodes = await confirmTotpEnrolment(req.userId, parsed.data.token);
    return res.json({ enabled: true, recoveryCodes });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ─── POST /auth/mfa/disable ───────────────────────────────────────────────────

router.post("/disable", requireAuth, mfaLimiter, async (req, res, next) => {
  try {
    // Password required: otherwise anyone who gets momentary access to an
    // unlocked, already-signed-in session can strip the second factor off the
    // account and lock the real owner out at leisure.
    await requirePassword(req.userId, req.body?.password);
    await disableMfa(req.userId);
    return res.json({ enabled: false });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ─── POST /auth/mfa/recovery/regenerate ───────────────────────────────────────

router.post("/recovery/regenerate", requireAuth, mfaLimiter, async (req, res, next) => {
  try {
    await requirePassword(req.userId, req.body?.password);
    const recoveryCodes = await generateRecoveryCodes(req.userId);
    return res.json({ recoveryCodes });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ─── POST /auth/mfa/verify ────────────────────────────────────────────────────
// Completes a login challenge. Deliberately NOT behind requireAuth: at this
// point the user has proven their password but not their second factor, so
// they have no session yet. Authorised solely by the mfa_pending cookie.

router.post("/verify", mfaLimiter, async (req, res, next) => {
  try {
    const pending = req.cookies?.mfa_pending;
    if (!pending) {
      return res.status(401).json({ error: "Your sign-in attempt expired. Please log in again." });
    }

    let userId;
    try {
      ({ sub: userId } = verifyMfaPendingToken(pending));
    } catch {
      clearMfaPendingCookie(res);
      return res.status(401).json({ error: "Your sign-in attempt expired. Please log in again." });
    }

    const parsed = CodeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { token, recoveryCode } = parsed.data;

    let ok = false;
    if (recoveryCode) {
      ok = await consumeRecoveryCode(userId, recoveryCode);
      if (!ok) return res.status(401).json({ error: "That recovery code isn't valid or has already been used." });
    } else {
      const result = await verifyTotpCode(userId, token);
      if (!result.ok) {
        if (result.reason === "locked") {
          return res.status(429).json({ error: "Too many incorrect codes. Try again in 15 minutes." });
        }
        if (result.reason === "replay") {
          // Distinct message: the code was right, just already spent. Telling
          // this user "that code isn't right" sends them to check their phone's
          // clock or re-scan the QR, when all they need to do is wait for the
          // next code to appear.
          return res.status(401).json({ error: "You've already used that code. Wait for your app to show the next one." });
        }
        return res.status(401).json({
          error: "That code isn't right.",
          attemptsRemaining: result.attemptsRemaining,
        });
      }
      ok = true;
    }

    // Second factor proven — only now does a real session exist.
    const { rows } = await query("SELECT * FROM users WHERE id = $1", [userId]);
    if (!rows[0]) {
      clearMfaPendingCookie(res);
      return res.status(401).json({ error: "Account not found" });
    }

    clearMfaPendingCookie(res);
    const accessToken           = signAccessToken(userId);
    const { raw: refreshToken } = await issueRefreshToken(userId);
    setTokenCookies(res, accessToken, refreshToken);

    const { password_hash, ...safe } = rows[0];
    return res.json({ user: safe });
  } catch (err) { next(err); }
});

export default router;
