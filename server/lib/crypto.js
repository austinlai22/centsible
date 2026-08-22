/**
 * lib/crypto.js — AES-256-GCM symmetric encryption
 *
 * Used to encrypt Plaid access_tokens before writing to the database.
 * Even if someone gets a raw DB dump, they cannot use the tokens without
 * the ENCRYPTION_KEY environment variable.
 *
 * Algorithm: AES-256-GCM
 *   - 256-bit key  (32 bytes from env)
 *   - 96-bit IV    (12 bytes, random per encryption)
 *   - 128-bit auth tag (16 bytes, appended to ciphertext)
 *
 * Stored format (colon-separated, base64 values):
 *   "<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 *
 * Rotation: if you ever need to rotate the key, decrypt all rows with the
 * old key and re-encrypt with the new one in a migration script before
 * updating the env variable.
 */

import crypto from "crypto";

const ALGORITHM  = "aes-256-gcm";
const IV_BYTES   = 12; // 96 bits — GCM recommended IV size
const KEY_BYTES  = 32; // 256 bits

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext string.
 * @param {string} plaintext
 * @returns {string}  "<iv>:<authTag>:<ciphertext>" — all base64
 */
export function encrypt(plaintext) {
  const key    = getKey();
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a value produced by encrypt().
 * @param {string} ciphertext  "<iv>:<authTag>:<data>" — all base64
 * @returns {string}  original plaintext
 */
export function decrypt(ciphertext) {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = ciphertext.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format");
  }

  const iv         = Buffer.from(ivB64,      "base64");
  const authTag    = Buffer.from(authTagB64, "base64");
  const encrypted  = Buffer.from(dataB64,    "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(encrypted) + decipher.final("utf8");
}
