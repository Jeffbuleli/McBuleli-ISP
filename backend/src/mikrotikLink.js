import crypto from "crypto";
import { normalizeSlug, publicUrlForSlug, platformPublicOrigin } from "./tenantSlug.js";

function hashLinkToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function newLinkToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function escapeRosString(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/**
 * Build portal + captive login URL for an ISP.
 */
function buildPortalUrls({ subdomain, ispId, origin }) {
  const slug = normalizeSlug(subdomain);
  const base = slug ? publicUrlForSlug(slug) : origin || platformPublicOrigin();
  const portalBase = `${base.replace(/\/$/, "")}/buy/packages`;
  const withIsp = ispId ? `${portalBase}?ispId=${encodeURIComponent(ispId)}` : portalBase;
  const hotspotLogin = `${withIsp}${withIsp.includes("?") ? "&" : "?"}ip=$(ip)&router=$(identity)&mac=$(mac-esc)`;
  return { portalBase: withIsp, hotspotLogin, origin: base };
}

/**
 * One-shot RouterOS script to paste in Terminal.
 * Registers outbound, then imports bootstrap.rsc for walled-garden.
 */
function buildLinkScript({ token, apiOrigin, deviceName }) {
  const origin = String(apiOrigin || platformPublicOrigin()).replace(/\/$/, "");
  const regUrl = `${origin}/api/public/mikrotik/register`;
  const bootUrl = `${origin}/api/public/mikrotik/bootstrap.rsc?token=${encodeURIComponent(token)}`;
  const name = escapeRosString(deviceName || "McBuleli");
  const tok = escapeRosString(token);

  return `# McBuleli - Link MikroTik
# Coller dans Terminal (Winbox / SSH). Routeur doit avoir Internet.
:put "McBuleli: liaison ${name}..."
:local token "${tok}"
:local identity [/system identity get name]
/tool fetch http-method=post url="${regUrl}" http-data=("token=" . $token . "&identity=" . $identity) http-header-field="content-type: application/x-www-form-urlencoded" dst-path=mcbuleli-reg.txt keep-result=yes
:delay 2s
/tool fetch url="${bootUrl}" dst-path=mcbuleli.rsc keep-result=yes
:delay 2s
/import file-name=mcbuleli.rsc
:put "McBuleli: termine."
`;
}

/**
 * Bootstrap .rsc applied after register (walled garden + reminder URL).
 */
function buildBootstrapRsc({ hotspotLogin, platformHost }) {
  const login = escapeRosString(hotspotLogin);
  const host = escapeRosString(platformHost || "isp.mcbuleli.org");
  return `# McBuleli bootstrap
/ip hotspot walled-garden ip remove [find where comment~"McBuleli"]
:do { /ip hotspot walled-garden ip add dst-host="${host}" action=allow comment="McBuleli" disabled=no } on-error={}
:do { /ip hotspot walled-garden ip add dst-host="*.${host}" action=allow comment="McBuleli" disabled=no } on-error={}
:put "McBuleli Hotspot login URL:"
:put "${login}"
:put "Coller cette URL dans Hotspot Profile -> Login (URL externe) si besoin."
`;
}

export { hashLinkToken, newLinkToken, buildPortalUrls, buildLinkScript, buildBootstrapRsc };
