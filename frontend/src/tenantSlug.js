/** Client slug preview - mirrors backend tenantSlug (*.isp.mcbuleli.org). */

const MIN_LEN = 3;
const MAX_LEN = 30;
const DEFAULT_BASE = "isp.mcbuleli.org";

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

function stripDiacritics(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function platformBaseHostFromOrigin(origin) {
  try {
    const o = String(
      origin || (typeof window !== "undefined" ? window.location.origin : "") || `https://${DEFAULT_BASE}`
    );
    const host = new URL(o.includes("://") ? o : `https://${o}`).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "localhost" || host === "127.0.0.1") return DEFAULT_BASE;
    if (host.endsWith(`.${DEFAULT_BASE}`) || host === DEFAULT_BASE) return DEFAULT_BASE;
    // Production ISP host, or legacy mcbuleli.live during cutover
    if (host === "mcbuleli.live" || host.endsWith(".mcbuleli.live")) return DEFAULT_BASE;
    return host.includes(".") ? host : DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

export function slugifyName(name) {
  let s = stripDiacritics(name).toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).replace(/-+$/g, "");
  if (!s || s.length < MIN_LEN) s = "partner";
  if (RESERVED.has(s)) s = `${s}-net`;
  return s;
}

export function normalizeSlug(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  const base = platformBaseHostFromOrigin();
  if (s.endsWith(`.${base}`)) s = s.slice(0, -(base.length + 1));
  if (s.includes(".")) s = s.split(".")[0];
  s = stripDiacritics(s);
  s = s.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN).replace(/-+$/g, "");
  return s;
}

export function isValidSlug(slug) {
  const s = String(slug || "");
  if (s.length < MIN_LEN || s.length > MAX_LEN) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)) return false;
  if (s.includes("--")) return false;
  if (RESERVED.has(s)) return false;
  return true;
}

export function publicUrlForSlug(slug, origin) {
  const s = normalizeSlug(slug);
  const base = platformBaseHostFromOrigin(origin);
  const proto = (() => {
    try {
      return new URL(
        String(origin || (typeof window !== "undefined" ? window.location.origin : `https://${DEFAULT_BASE}`))
      ).protocol;
    } catch {
      return "https:";
    }
  })();
  if (!s) return `${proto}//${base}`;
  return `${proto}//${s}.${base}`;
}
