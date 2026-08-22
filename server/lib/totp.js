/**
 * lib/totp.js — RFC 4226 (HOTP) + RFC 6238 (TOTP), implemented directly.
 *
 * Why not a library: otplib v12 is deprecated, and v13 is a breaking rewrite
 * that requires registering a crypto plugin. TOTP itself is HMAC-SHA1 over a
 * counter plus dynamic truncation — fully specified, ~40 lines, and the RFC
 * ships official test vectors, so correctness here is *demonstrable* rather
 * than trusted. See scripts/test-totp.mjs, which checks every vector in
 * RFC 6238 Appendix B.
 *
 * This is deliberately not "rolling your own crypto": the primitive is
 * node:crypto's HMAC. What's implemented here is the encoding around it.
 */

import crypto from "crypto";

// RFC 4648 base32 alphabet. Authenticator apps expect secrets in this form.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character in secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/**
 * A new random secret, base32-encoded.
 *
 * 20 bytes (160 bits) matches the HMAC-SHA1 block the RFC assumes and is what
 * Google Authenticator and 1Password expect. Longer secrets are legal but
 * some authenticator apps silently truncate or reject them.
 */
export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/** RFC 4226 HOTP. */
function hotp(keyBuf, counter, digits = 6, algorithm = "sha1") {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(algorithm, keyBuf).update(counterBuf).digest();

  // Dynamic truncation (RFC 4226 §5.3): the low nibble of the last byte picks
  // a 4-byte window; the top bit is masked off so the result is unsigned
  // regardless of platform integer handling.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
     (hmac[offset + 3] & 0xff);

  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Time step index for a given moment. Exposed for replay tracking. */
export function counterFor(atMs = Date.now(), stepSeconds = 30) {
  return Math.floor(atMs / 1000 / stepSeconds);
}

export function generate(secretB32, { atMs = Date.now(), step = 30, digits = 6, algorithm = "sha1" } = {}) {
  return hotp(base32Decode(secretB32), counterFor(atMs, step), digits, algorithm);
}

/**
 * Verifies a token, returning the matched counter or null.
 *
 * Returning the COUNTER rather than a boolean is what makes replay prevention
 * possible: a TOTP code stays valid for its whole 30-second step (longer with
 * drift tolerance), so an attacker who observes a code — over the shoulder, in
 * a phished form, in a log — can reuse it until it expires. The caller records
 * the highest counter already accepted for that user and refuses anything at
 * or below it. Without this, "verified once" and "verified twice" are
 * indistinguishable.
 *
 * `window` allows ±N steps for clock drift between the server and the user's
 * phone. 1 (±30s) is the usual choice; larger windows widen the replay and
 * brute-force surface proportionally.
 */
export function verify(secretB32, token, { atMs = Date.now(), step = 30, digits = 6, window = 1, algorithm = "sha1" } = {}) {
  const clean = String(token || "").replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(clean)) return null;

  const key = base32Decode(secretB32);
  const centre = counterFor(atMs, step);

  for (let drift = -window; drift <= window; drift++) {
    const counter = centre + drift;
    if (counter < 0) continue;
    const expected = hotp(key, counter, digits, algorithm);
    // Constant-time compare so response timing can't leak how many leading
    // digits were correct.
    const a = Buffer.from(expected), b = Buffer.from(clean);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return counter;
  }
  return null;
}

/**
 * otpauth:// URI for QR enrolment.
 *
 * Both issuer and the issuer prefix in the label are set: some apps read one,
 * some the other, and omitting either produces entries that all show up as
 * bare email addresses with no app name once a user has a few accounts.
 */
export function toURI({ secret, accountName, issuer = "flow", digits = 6, step = 30, algorithm = "SHA1" }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm,
    digits: String(digits),
    period: String(step),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
