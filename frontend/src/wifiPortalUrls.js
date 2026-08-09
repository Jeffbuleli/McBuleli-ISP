import { normalizeSlug, publicUrlForSlug } from "./tenantSlug.js";

/**
 * URL du portail Wi‑Fi invité McBuleli.
 * Prefers tenant host https://slug.isp.mcbuleli.org/buy/packages when slug is known.
 * Les variables $(ip), $(identity), $(mac-esc) sont interprétées par MikroTik Hotspot.
 */
export function wifiGuestBaseUrl(origin, ispId, subdomain) {
  const slug = normalizeSlug(subdomain);
  const o = String(origin || "").replace(/\/$/, "");
  const id = String(ispId || "").trim();
  const local = /localhost|127\.0\.0\.1/.test(o);

  if (slug && !local) {
    return `${publicUrlForSlug(slug, o)}/buy/packages`;
  }
  if (!o || !id) return "";
  return `${o}/buy/packages?ispId=${encodeURIComponent(id)}`;
}

/** Modèle à coller dans le routeur : même forme que ?ip=…&router=…&mac=… */
export function wifiHotspotLoginTemplate(origin, ispId, subdomain) {
  const base = wifiGuestBaseUrl(origin, ispId, subdomain);
  if (!base) return "";
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}ip=$(ip)&router=$(identity)&mac=$(mac-esc)`;
}

/** Exemple lisible avec valeurs fictives (documentation / test manuel). */
export function wifiHotspotExampleUrl(origin, ispId, subdomain) {
  const base = wifiGuestBaseUrl(origin, ispId, subdomain);
  if (!base) return "";
  const join = base.includes("?") ? "&" : "?";
  const macEnc = encodeURIComponent("36:6E:F7:12:B5:3F");
  return `${base}${join}ip=172.31.255.249&router=52164&mac=${macEnc}`;
}
