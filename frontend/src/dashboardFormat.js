/** Locale-aware formatting for analytic dashboards (USD, GB, deltas). */

export function formatUsd(amount, locale = undefined) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n);
}

export function formatGb(value, fractionDigits = 2, locale = undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(n)} GB`;
}

export function formatCount(value, locale = undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(n));
}

export function formatSignedPct(deltaPct, locale = undefined) {
  if (deltaPct === null || deltaPct === undefined || Number.isNaN(deltaPct)) return "—";
  const n = Number(deltaPct);
  const abs = Math.abs(n).toLocaleString(locale, { maximumFractionDigits: 1 });
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `−${abs}%`;
  return `0%`;
}

export function formatIsoRange(from, to) {
  if (!from || !to) return "";
  return `${from} → ${to}`;
}
