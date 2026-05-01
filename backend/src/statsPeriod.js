/** UTC calendar arithmetic for inclusive dashboard periods (YYYY-MM-DD). */

export function parseIsoDateUtc(isoDate) {
  const parts = String(isoDate || "").split("-").map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDateUtc(d) {
  return d.toISOString().slice(0, 10);
}

/** Number of calendar days included from `from` through `to` (inclusive). */
export function inclusiveDaysBetween(fromIso, toIso) {
  const a = parseIsoDateUtc(fromIso);
  const b = parseIsoDateUtc(toIso);
  if (!a || !b) return 1;
  const ms = b.getTime() - a.getTime();
  const days = Math.floor(ms / 86400000) + 1;
  return Math.max(1, days);
}

/**
 * Previous interval with the same inclusive length immediately before `from`.
 */
export function previousInclusivePeriod(fromIso, toIso) {
  const n = inclusiveDaysBetween(fromIso, toIso);
  const from = parseIsoDateUtc(fromIso);
  if (!from) return null;
  const prevTo = new Date(from);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (n - 1));
  return {
    from: formatIsoDateUtc(prevFrom),
    to: formatIsoDateUtc(prevTo),
    daysInclusive: n
  };
}
