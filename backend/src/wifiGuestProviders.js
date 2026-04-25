/**
 * UI keys → Pawapay "provider" enum for DRC mobile money.
 * Confirm values against https://docs.pawapay.io/v2/docs/providers or your sandbox active configuration.
 */
export const WIFI_GUEST_NETWORK_OPTIONS = [
  { key: "orange", label: "Orange Money", pawapayProvider: "ORANGE_MOMO_COD" },
  { key: "airtel", label: "Airtel Money", pawapayProvider: "AIRTEL_MOMO_COD" },
  { key: "mpesa", label: "M-Pesa (Vodacom)", pawapayProvider: "VODACOM_MOMO_COD" }
];

export const PAWAPAY_NETWORK_OPTIONS = WIFI_GUEST_NETWORK_OPTIONS;

export function resolveWifiGuestPawapayProvider(networkKey) {
  const k = String(networkKey || "").toLowerCase();
  const row = WIFI_GUEST_NETWORK_OPTIONS.find((o) => o.key === k);
  return row?.pawapayProvider || null;
}
