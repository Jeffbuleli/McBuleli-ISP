/**
 * URL du portail Wi‑Fi invité McBuleli.
 * Les variables $(ip), $(identity), $(mac-esc) sont interprétées par MikroTik Hotspot
 * dans le champ « URL de connexion externe » (ne pas encoder ces segments).
 */
export function wifiGuestBaseUrl(origin, ispId) {
  const o = String(origin || "").replace(/\/$/, "");
  const id = String(ispId || "").trim();
  if (!o || !id) return "";
  return `${o}/buy/packages?ispId=${encodeURIComponent(id)}`;
}

/** Modèle à coller dans le routeur : même forme que ?ip=…&router=…&mac=… (ex. Centipid). */
export function wifiHotspotLoginTemplate(origin, ispId) {
  const base = wifiGuestBaseUrl(origin, ispId);
  if (!base) return "";
  return `${base}&ip=$(ip)&router=$(identity)&mac=$(mac-esc)`;
}

/** Exemple lisible avec valeurs fictives (documentation / test manuel). */
export function wifiHotspotExampleUrl(origin, ispId) {
  const base = wifiGuestBaseUrl(origin, ispId);
  if (!base) return "";
  const macEnc = encodeURIComponent("36:6E:F7:12:B5:3F");
  return `${base}&ip=172.31.255.249&router=52164&mac=${macEnc}`;
}
