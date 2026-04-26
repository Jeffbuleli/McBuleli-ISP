import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(secret) {
  const clean = String(secret || "")
    .replace(/=+$/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function totpAuthUrl({ secret, accountName, issuer = "McBuleli" }) {
  const label = `${issuer}:${accountName || "user"}`;
  const qs = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD_SECONDS)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${qs.toString()}`;
}

export function generateTotpCode(secret, timeMs = Date.now()) {
  const counter = Math.floor(timeMs / 1000 / DEFAULT_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DEFAULT_DIGITS).padStart(DEFAULT_DIGITS, "0");
}

export function verifyTotpCode({ secret, code, window = 1 }) {
  const clean = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean) || !secret) return false;
  for (let step = -window; step <= window; step += 1) {
    const at = Date.now() + step * DEFAULT_PERIOD_SECONDS * 1000;
    if (generateTotpCode(secret, at) === clean) return true;
  }
  return false;
}
