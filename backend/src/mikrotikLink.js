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

function escapeHtmlAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build portal + captive login URL for an ISP.
 * Uses MikroTik hotspot HTML variables: $(ip) $(identity) $(mac-esc)
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
 * Hotspot login.html served to MikroTik (variables expanded by the router).
 */
function buildHotspotLoginHtml(hotspotLogin) {
  const href = escapeHtmlAttr(hotspotLogin);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta http-equiv="refresh" content="0;url=${href}"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>McBuleli Wi-Fi</title>
<script>location.replace("${href}");</script>
<style>
body{font-family:system-ui,sans-serif;background:#0f1412;color:#e8f2ec;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
a{color:#63b38f}
</style>
</head>
<body>
<p>McBuleli Wi-Fi - <a href="${href}">Continuer</a></p>
</body>
</html>
`;
}

/**
 * One-shot RouterOS script to paste in Terminal.
 */
function buildLinkScript({ token, apiOrigin, deviceName }) {
  const origin = String(apiOrigin || platformPublicOrigin()).replace(/\/$/, "");
  const regUrl = `${origin}/api/public/mikrotik/register`;
  const name = escapeRosString(deviceName || "McBuleli");
  const tok = escapeRosString(token);
  const reg = escapeRosString(regUrl);
  const bootBase = escapeRosString(`${origin}/api/public/mikrotik/bootstrap.rsc?token=`);

  return `# McBuleli - Link MikroTik
# Coller dans Terminal (Winbox / SSH). Routeur doit avoir Internet.
:put "McBuleli: liaison ${name}..."
:local regUrl "${reg}"
:local token "${tok}"
:local bootBase "${bootBase}"
:local identity [/system identity get name]
:local postData ("token=" . $token . "&identity=" . $identity)
:local bootUrl ($bootBase . $token)
:do { /file remove [find where name="mcbuleli-reg.txt"] } on-error={}
:do { /file remove [find where name="mcbuleli.rsc"] } on-error={}
/tool fetch http-method=post url=$regUrl http-data=$postData http-header-field="content-type: application/x-www-form-urlencoded" dst-path=mcbuleli-reg.txt keep-result=yes
:delay 2s
/tool fetch url=$bootUrl dst-path=mcbuleli.rsc keep-result=yes
:delay 2s
/import file-name=mcbuleli.rsc
:put "McBuleli: termine."
`;
}

/**
 * Bootstrap .rsc: walled garden + fetch login.html + set hotspot profiles.
 */
function buildBootstrapRsc({ hotspotLogin, platformHost, loginHtmlUrl }) {
  const login = escapeRosString(hotspotLogin);
  const host = escapeRosString(platformHost || "isp.mcbuleli.org");
  const htmlUrl = escapeRosString(loginHtmlUrl || "");

  return `# McBuleli bootstrap - Hotspot auto-config
/ip hotspot walled-garden ip remove [find where comment~"McBuleli"]
:do { /ip hotspot walled-garden ip add dst-host="${host}" action=allow comment="McBuleli" disabled=no } on-error={}
:do { /ip hotspot walled-garden ip add dst-host="*.${host}" action=allow comment="McBuleli" disabled=no } on-error={}
:do { /ip hotspot walled-garden remove [find where comment~"McBuleli"] } on-error={}
:do { /ip hotspot walled-garden add dst-host="${host}" comment="McBuleli" disabled=no } on-error={}
:do { /ip hotspot walled-garden add dst-host="*.${host}" comment="McBuleli" disabled=no } on-error={}

:do { /file remove [find where name="hotspot/login.html"] } on-error={}
:do { /file remove [find where name="flash/hotspot/login.html"] } on-error={}
/tool fetch url="${htmlUrl}" dst-path=hotspot/login.html keep-result=yes
:delay 2s

:foreach p in=[/ip hotspot profile find] do={
  :do {
    /ip hotspot profile set $p html-directory=hotspot login-by=http-chap,http-pap,https,cookie,mac-cookie
  } on-error={}
}

:put "McBuleli Hotspot auto-config OK"
:put "${login}"
`;
}

export {
  hashLinkToken,
  newLinkToken,
  buildPortalUrls,
  buildHotspotLoginHtml,
  buildLinkScript,
  buildBootstrapRsc
};
