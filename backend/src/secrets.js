import crypto from "crypto";

const nodeEnv = process.env.NODE_ENV || "development";
const explicitKey = process.env.NETWORK_NODE_SECRET_KEY
  ? String(process.env.NETWORK_NODE_SECRET_KEY).trim()
  : "";

const WEAK_PRODUCTION_KEYS = new Set([
  "change_me_long_random_secret",
  "change_me_change_me_change_me_change_me"
]);

function resolveRawKey() {
  if (nodeEnv === "production") {
    if (!explicitKey || explicitKey.length < 32) {
      throw new Error(
        "NETWORK_NODE_SECRET_KEY must be set to a random string of at least 32 characters when NODE_ENV=production (encrypts MikroTik and node credentials)."
      );
    }
    if (WEAK_PRODUCTION_KEYS.has(explicitKey)) {
      throw new Error(
        "NETWORK_NODE_SECRET_KEY must not use a documented placeholder value in production. Generate a new random secret and rotate stored node passwords if the old key was ever deployed."
      );
    }
    return explicitKey;
  }
  if (explicitKey && explicitKey.length >= 16) {
    return explicitKey;
  }
  if (explicitKey && explicitKey.length < 16) {
    // eslint-disable-next-line no-console
    console.warn(
      "[secrets] NETWORK_NODE_SECRET_KEY is shorter than 16 characters; use at least 32 for production."
    );
    return explicitKey;
  }
  const fallback = process.env.JWT_SECRET || "change_me_change_me_change_me_change_me";
  if (!explicitKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[secrets] NETWORK_NODE_SECRET_KEY is not set; using JWT_SECRET or dev default. Set a dedicated secret before production."
    );
  }
  return fallback;
}

const RAW_KEY = resolveRawKey();
const KEY = crypto.createHash("sha256").update(String(RAW_KEY)).digest();

/**
 * Call after dotenv is loaded. Re-validates in case NODE_ENV was set late (optional safety).
 */
export function assertNetworkNodeSecretKeyForProduction() {
  resolveRawKey();
}

export function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(cipherText) {
  if (!cipherText) return "";
  const [ivB64, tagB64, dataB64] = String(cipherText).split(":");
  if (!ivB64 || !tagB64 || !dataB64) return String(cipherText);
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
