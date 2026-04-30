import { buildModuleRegistry, modulesToMobileHashMap, modulesToNavCategories } from "./moduleRegistry.js";

export function mobileScreenForNavHash(href) {
  const h = href.startsWith("#") ? href : `#${href}`;
  // Fallback mapping for legacy hashes stays compatible if registry doesn't include it.
  if (typeof window !== "undefined" && window.__MB_MOBILE_HASH_MAP && window.__MB_MOBILE_HASH_MAP[h]) {
    return window.__MB_MOBILE_HASH_MAP[h];
  }
  return "dashboard";
}

/**
 * Same category tree as the desktop sidebar (single source of truth for PWA “all menus” sheet).
 */
export function buildDashboardNavCategories(t, user, isFieldAgent) {
  const modules = buildModuleRegistry(t, user, { isFieldAgent });
  const cats = modulesToNavCategories(modules);
  // Store mobile hash mapping for the session (used by `mobileScreenForNavHash`).
  if (typeof window !== "undefined") {
    window.__MB_MOBILE_HASH_MAP = modulesToMobileHashMap(modules);
  }
  return cats;
}
