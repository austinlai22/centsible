/**
 * Validates lib/totp.js against the official RFC test vectors.
 *
 * RFC 6238 Appendix B publishes expected TOTP values for a known seed at known
 * timestamps. Matching them is strong evidence the implementation is correct —
 * stronger than "it generates something the phone accepts", which also passes
 * when both sides are wrong in the same way.
 */
import {
  generate, verify, counterFor, base32Encode, base32Decode, generateSecret, toURI,
} from "../lib/totp.js";

let pass = 0, fail = 0;
const t = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); pass++; }
  catch (e) { console.log(`  FAIL  ${label}\n          ${e.message}`); fail++; }
};
const eq = (a, b, m = "") => { if (String(a) !== String(b)) throw new Error(`${m} got ${a}, want ${b}`); };

// RFC 6238 seed: the ASCII string "12345678901234567890".
const SEED = base32Encode(Buffer.from("12345678901234567890", "ascii"));

console.log("=== RFC 6238 Appendix B — SHA1, 8 digits ===");
// [unix seconds, expected 8-digit TOTP]
const VECTORS = [
  [59,          "94287082"],
  [1111111109,  "07081804"],
  [1111111111,  "14050471"],
  [1234567890,  "89005924"],
  [2000000000,  "69279037"],
  [20000000000, "65353130"],
];
for (const [secs, expected] of VECTORS) {
  t(`t=${secs} -> ${expected}`, () =>
    eq(generate(SEED, { atMs: secs * 1000, digits: 8 }), expected, `at t=${secs}`));
}

console.log("\n=== 6-digit derivation (what the app actually uses) ===");
for (const [secs, expected] of VECTORS) {
  t(`t=${secs} -> ${expected.slice(-6)}`, () =>
    eq(generate(SEED, { atMs: secs * 1000, digits: 6 }), expected.slice(-6), `at t=${secs}`));
}

console.log("\n=== base32 round-trip ===");
t("encode/decode is lossless", () => {
  for (let i = 0; i < 200; i++) {
    const buf = Buffer.from(Array.from({ length: 1 + (i % 32) }, (_, j) => (i * 7 + j) & 255));
    if (!base32Decode(base32Encode(buf)).equals(buf)) throw new Error(`failed at length ${buf.length}`);
  }
});
t("rejects invalid characters", () => {
  try { base32Decode("ABC!DEF"); } catch { return; }
  throw new Error("accepted an invalid base32 string");
});
t("generateSecret is 32 chars of base32 (160 bits)", () => {
  const s = generateSecret();
  eq(s.length, 32, "length");
  if (!/^[A-Z2-7]+$/.test(s)) throw new Error(`not base32: ${s}`);
});
t("two secrets differ", () => {
  if (generateSecret() === generateSecret()) throw new Error("not random");
});

console.log("\n=== verification ===");
const S = generateSecret();
const NOW = 1_700_000_000_000;
t("accepts the current code", () => {
  const code = generate(S, { atMs: NOW });
  if (verify(S, code, { atMs: NOW }) === null) throw new Error("rejected a valid code");
});
t("returns the matching counter, not just true", () => {
  const code = generate(S, { atMs: NOW });
  eq(verify(S, code, { atMs: NOW }), counterFor(NOW), "counter");
});
t("rejects a wrong code", () => {
  if (verify(S, "000000", { atMs: NOW }) !== null) throw new Error("accepted a wrong code");
});
t("accepts the previous step (clock drift, window=1)", () => {
  const code = generate(S, { atMs: NOW - 30_000 });
  if (verify(S, code, { atMs: NOW, window: 1 }) === null) throw new Error("rejected drift within window");
});
t("rejects two steps back when window=1", () => {
  const code = generate(S, { atMs: NOW - 90_000 });
  if (verify(S, code, { atMs: NOW, window: 1 }) !== null) throw new Error("accepted a code outside the window");
});
t("counter for an old code is LOWER (enables replay rejection)", () => {
  const old = verify(S, generate(S, { atMs: NOW - 30_000 }), { atMs: NOW, window: 1 });
  const cur = verify(S, generate(S, { atMs: NOW }),          { atMs: NOW, window: 1 });
  if (!(old < cur)) throw new Error(`expected ${old} < ${cur}`);
});
t("rejects malformed input without throwing", () => {
  for (const bad of ["", "abc", "12345", "1234567", null, undefined, "12 34 56", "٣٤٥٦٧٨"]) {
    if (verify(S, bad, { atMs: NOW }) !== null) throw new Error(`accepted ${JSON.stringify(bad)}`);
  }
});
t("a different secret does not validate", () => {
  const code = generate(S, { atMs: NOW });
  if (verify(generateSecret(), code, { atMs: NOW }) !== null) throw new Error("cross-secret match");
});

console.log("\n=== enrolment URI ===");
t("otpauth URI carries issuer in both label and query", () => {
  const uri = toURI({ secret: S, accountName: "a@b.c" });
  for (const part of ["otpauth://totp/", "Centsible:a%40b.c", `secret=${S}`, "issuer=Centsible", "digits=6", "period=30"]) {
    if (!uri.includes(part)) throw new Error(`missing ${part} in ${uri}`);
  }
});

console.log(`\n  PASSED: ${pass}   FAILED: ${fail}`);
process.exit(fail ? 1 : 0);
