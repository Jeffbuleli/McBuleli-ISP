import crypto from "crypto";

const RAW_KEY =
  process.env.NETWORK_NODE_SECRET_KEY ||
  process.env.JWT_SECRET ||
  "change_me_change_me_change_me_change_me";

const KEY = crypto.createHash("sha256").update(String(RAW_KEY)).digest();

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
