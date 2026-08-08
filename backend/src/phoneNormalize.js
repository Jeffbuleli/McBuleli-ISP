/**
 * Normalize a DRC Mobile Money MSISDN for deposit APIs (expect 243…).
 * Examples: 0812345678 → 243812345678 ; +243 81 234 5678 → 243812345678
 */
export function normalizeDrCongoMsisdn(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  // 2430XXXXXXXX → 243XXXXXXXX (user typed country code + local 0)
  if (d.startsWith("2430") && d.length >= 13) {
    d = `243${d.slice(4)}`;
  }
  if (d.startsWith("243")) return d;
  if (d.startsWith("0")) return `243${d.slice(1)}`;
  // Local without leading 0: 81xxxxxxx / 99xxxxxxx (9 digits)
  if (/^[89]\d{8}$/.test(d)) return `243${d}`;
  return d;
}

export function isLikelyDrCongoMsisdn(msisdn) {
  const d = normalizeDrCongoMsisdn(msisdn);
  return /^243[89]\d{8}$/.test(d);
}
