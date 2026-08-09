/**
 * Partner tenant slugs for *.isp.mcbuleli.org
 * Stored value is the label only: "jeff" → https://jeff.isp.mcbuleli.org
 */

const RESERVED = new Set([
  "www",
  "api",
  "admin",
  "app",
  "apps",
  "portal",
  "buy",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "static",
  "assets",
  "status",
  "health",
  "test",
  "staging",
  "dev",
  "login",
  "signup",
  "register",
  "support",
  "help",
  "docs",
  "blog",
  "shop",
  "store",
  "wifi",
  "hotspot",
  "radius",
  "ns1",
  "ns2",
  "mx",
  "root",
  "null",
  "undefined",
  "mcbuleli",
  "owner",
  "system",
  "isp"
]);

const MIN_LEN = 3;
const MAX_LEN = 30;
const DEFAULT_BASE = "isp.mcbuleli.org";
const DEFAULT_ORIGIN = "https://isp.mcbuleli.org";

function platformBaseHost() {
  const raw = String(
    process.env.PLATFORM_PUBLIC_BASE_URL || process.env.PLATFORM_PUBLIC_APP_URL || DEFAULT_ORIGIN
  ).trim();
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return DEFAULT_BASE;
  }
}

function platformPublicOrigin() {
  const raw = String(
    process.env.PLATFORM_PUBLIC_BASE_URL || process.env.PLATFORM_PUBLIC_APP_URL || DEFAULT_ORIGIN
  ).trim();
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${u.protocol}//${u.host}`.replace(/\/$/, "");
  } catch {
    return DEFAULT_ORIGIN;
  }
}

function stripDiacritics(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Human name → base slug (a-z0-9-). */
function slugifyName(name) {
  let s = stripDiacritics(name).toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).replace(/-+$/g, "");
  if (!s || s.length < MIN_LEN) s = "partner";
  if (RESERVED.has(s)) s = `${s}-net`;
  return s;
}

/**
 * Normalize user/API input to a stored slug label.
 * Accepts "Cafe Du Fleuve", "cafe-du-fleuve", "https://cafe-du-fleuve.isp.mcbuleli.org/…".
 */
function normalizeSlug(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  const base = platformBaseHost();
  if (s.endsWith(`.${base}`)) s = s.slice(0, -(base.length + 1));
  if (s.includes(".")) s = s.split(".")[0];
  s = stripDiacritics(s);
  s = s.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).replace(/-+$/g, "");
  return s;
}

function isValidSlug(slug) {
  const s = String(slug || "");
  if (s.length < MIN_LEN || s.length > MAX_LEN) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) return false;
  if (s.includes("--")) return false;
  if (RESERVED.has(s)) return false;
  return true;
}

function publicUrlForSlug(slug) {
  const s = normalizeSlug(slug);
  if (!s) return platformPublicOrigin();
  const base = platformBaseHost();
  try {
    const proto = new URL(platformPublicOrigin()).protocol;
    return `${proto}//${s}.${base}`;
  } catch {
    return `https://${s}.${base}`;
  }
}

/** Extract tenant label from Host, or null for platform apex. */
function slugFromHost(host) {
  const h = String(host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (!h || h === "localhost" || h === "127.0.0.1") return null;
  const base = platformBaseHost();
  if (h === base || h === `www.${base}`) return null;
  if (h.endsWith(`.${base}`)) {
    const label = h.slice(0, -(base.length + 1));
    if (!label || label.includes(".")) return null;
    return label;
  }
  return null;
}

async function slugTaken(queryFn, slug, excludeIspId = null) {
  const sql = excludeIspId
    ? `SELECT id FROM isps
       WHERE id <> $2
         AND (
           LOWER(subdomain) = LOWER($1)
           OR LOWER(SPLIT_PART(subdomain, '.', 1)) = LOWER($1)
         )
       LIMIT 1`
    : `SELECT id FROM isps
       WHERE LOWER(subdomain) = LOWER($1)
          OR LOWER(SPLIT_PART(subdomain, '.', 1)) = LOWER($1)
       LIMIT 1`;
  const params = excludeIspId ? [slug, excludeIspId] : [slug];
  const clash = await queryFn(sql, params);
  return Boolean(clash.rows[0]);
}

/**
 * Allocate a unique slug. Tries base, then base-2, base-3…
 * @param {(sql: string, params?: unknown[]) => Promise<{ rows: { id?: string }[] }>} queryFn
 */
async function allocateUniqueSlug(queryFn, desired, { excludeIspId = null } = {}) {
  const asSlug = normalizeSlug(desired);
  let base = asSlug && isValidSlug(asSlug) ? asSlug : slugifyName(desired || "partner");
  if (!isValidSlug(base)) base = "partner";

  for (let n = 0; n < 50; n += 1) {
    let candidate;
    if (n === 0) {
      candidate = base;
    } else {
      const suffix = `-${n + 1}`;
      candidate = `${base.slice(0, Math.max(MIN_LEN, MAX_LEN - suffix.length))}${suffix}`;
    }
    candidate = candidate.replace(/-+$/g, "");
    if (!isValidSlug(candidate)) continue;
    if (!(await slugTaken(queryFn, candidate, excludeIspId))) return candidate;
  }

  return `p-${Date.now().toString(36)}`.slice(0, MAX_LEN);
}

export {
  RESERVED,
  MIN_LEN,
  MAX_LEN,
  platformBaseHost,
  platformPublicOrigin,
  slugifyName,
  normalizeSlug,
  isValidSlug,
  publicUrlForSlug,
  slugFromHost,
  slugTaken,
  allocateUniqueSlug
};
