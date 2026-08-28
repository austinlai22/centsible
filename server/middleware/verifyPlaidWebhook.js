/**
 * middleware/verifyPlaidWebhook.js
 *
 * Plaid signs every webhook with a JWT using a rotating key pair hosted at:
 *   https://api.plaid.com/webhook_verification_key/get
 *
 * Verification steps (per Plaid docs):
 *   1. Decode the JWT header to get the key ID (kid)
 *   2. Fetch Plaid's public key for that kid (cached — Plaid rotates ~monthly)
 *   3. Verify the JWT signature
 *   4. Check that the body hash in the JWT payload matches SHA-256(req.rawBody)
 *      This confirms the payload wasn't tampered with in transit
 *
 * If any step fails the request is rejected with 400 before the route handler runs.
 * Attackers cannot forge valid webhooks without Plaid's private key.
 *
 * Key caching: we cache public keys for 5 minutes to avoid hammering
 * Plaid's key endpoint, but re-fetch immediately if we see an unknown kid.
 */

import crypto from "crypto";
import { importJWK, jwtVerify } from "jose";
import { plaidClient } from "../lib/plaid.js";

// In-memory key cache: { [kid]: { jwk, fetchedAt } }
const keyCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getPublicKey(kid) {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.key;
  }

  // Fetch from Plaid — this is an authenticated call using our credentials
  const res  = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const jwk  = res.data.key;

  // Plaid signs webhooks with ES256. Passing the algorithm explicitly rather
  // than letting it be inferred from the JWK matters: an attacker who could
  // influence the key document should never be able to talk us into a weaker
  // algorithm.
  const key = await importJWK(jwk, "ES256");

  keyCache.set(kid, { key, fetchedAt: Date.now() });
  return key;
}

export async function verifyPlaidWebhook(req, res, next) {
  try {
    // Raw body must have been captured in index.js before JSON parser ran
    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: "Missing raw body for webhook verification" });
    }

    // Plaid sends the signature in the Plaid-Verification header
    const signedJwt = req.headers["plaid-verification"];
    if (!signedJwt) {
      return res.status(400).json({ error: "Missing Plaid-Verification header" });
    }

    // ── Step 1: Decode header to get kid ──────────────────────────────────────
    const [headerB64] = signedJwt.split(".");
    let header;
    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
    } catch (_) {
      return res.status(400).json({ error: "Malformed JWT header" });
    }

    if (!header.kid) {
      return res.status(400).json({ error: "JWT header missing kid" });
    }

    // ── Step 2: Fetch / retrieve cached public key ────────────────────────────
    let publicKey;
    try {
      publicKey = await getPublicKey(header.kid);
    } catch (_) {
      return res.status(400).json({ error: "Could not retrieve Plaid verification key" });
    }

    // ── Step 3: Verify JWT signature ──────────────────────────────────────────
    let payload;
    try {
      // jwtVerify also enforces exp/nbf if present, which the previous
      // JWS-only check did not.
      ({ payload } = await jwtVerify(signedJwt, publicKey, { algorithms: ["ES256"] }));
    } catch (_) {
      return res.status(400).json({ error: "Webhook signature verification failed" });
    }

    // ── Step 3b: Reject stale signatures ──────────────────────────────────────
    // Plaid's JWT carries iat. Without a freshness check, a valid webhook
    // captured once can be replayed indefinitely — the signature never stops
    // being valid on its own.
    const MAX_AGE_SECONDS = 5 * 60;
    if (typeof payload.iat !== "number" || Math.abs(Date.now() / 1000 - payload.iat) > MAX_AGE_SECONDS) {
      return res.status(400).json({ error: "Webhook timestamp outside the accepted window" });
    }

    // ── Step 4: Verify body hash ──────────────────────────────────────────────
    const expectedHash = crypto
      .createHash("sha256")
      .update(rawBody, "utf8")
      .digest("hex");

    if (payload.request_body_sha256 !== expectedHash) {
      return res.status(400).json({ error: "Webhook body hash mismatch" });
    }

    // All checks passed — attach payload for the route handler
    req.plaidWebhookPayload = req.body;
    next();
  } catch (err) {
    console.error("[webhook] Verification error:", err.message);
    return res.status(400).json({ error: "Webhook verification error" });
  }
}
