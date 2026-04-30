/**
 * On mobile dashboard shell: render children only when the active screen matches.
 * On desktop: always render (full scrollable layout).
 */
export default function DashboardScreenGate({ mobile, active, id, ids, always, children }) {
  if (!mobile) return children;
  if (always) return children;
  const ok = Array.isArray(ids) ? ids.includes(active) : active === id;
  if (!ok) return null;
  return children;
}
