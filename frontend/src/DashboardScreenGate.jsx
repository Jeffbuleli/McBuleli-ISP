import { useEffect, useState } from "react";

function normalizeHash(h) {
  if (h == null) return "";
  const s = String(h).trim();
  if (!s) return "";
  return s.startsWith("#") ? s : `#${s}`;
}

/** When the URL has no hash, pick the section that matches the active mobile screen. */
export function defaultHashForScreen(screen, isFieldAgent = false) {
  switch (screen) {
    case "users":
      return "#field-clients";
    case "billing":
      return "#billing-ops";
    case "settings":
      return "#workspace-settings";
    case "network":
      return "#network-ops";
    case "dashboard":
      return "#dashboard-overview";
    default:
      return isFieldAgent ? "#field-clients" : "#dashboard-overview";
  }
}

/**
 * Renders children only for the matching dashboard section.
 * - `hash` / `hashes`: show only when location hash matches (desktop + mobile).
 * - `id` / `ids`: on mobile, also require the active screen path.
 * - `always`: always render (e.g. ISP picker).
 */
export default function DashboardScreenGate({
  mobile,
  active,
  id,
  ids,
  always,
  hash,
  hashes,
  isFieldAgent = false,
  children
}) {
  const [locHash, setLocHash] = useState(() =>
    typeof window !== "undefined" ? window.location.hash || "" : ""
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setLocHash(window.location.hash || "");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  if (always) return children;

  if (mobile && (id || ids)) {
    const ok = Array.isArray(ids) ? ids.includes(active) : active === id;
    if (!ok) return null;
  }

  const wanted = hashes ? hashes.map(normalizeHash) : hash != null ? [normalizeHash(hash)] : null;
  if (wanted && wanted.length) {
    let current = normalizeHash(locHash);
    if (!current) {
      current = mobile
        ? defaultHashForScreen(active, isFieldAgent)
        : isFieldAgent
          ? "#field-clients"
          : "#dashboard-overview";
    }
    if (!wanted.includes(current)) return null;
  } else if (!mobile) {
    // Untagged desktop sections stay visible (legacy). Prefer tagging with hash=.
    return children;
  }

  return children;
}
