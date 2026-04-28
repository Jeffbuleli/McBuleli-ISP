/** Pathname ↔ mobile dashboard screen (installable PWA, < 900px width). */

const PATH_TO_SCREEN = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/network": "network",
  "/billing": "billing",
  "/users": "users",
  "/settings": "settings"
};

const SCREEN_TO_PATH = {
  dashboard: "/dashboard",
  network: "/network",
  billing: "/billing",
  users: "/users",
  settings: "/settings"
};

export function pathnameToMobileScreen(pathname) {
  const raw = pathname || "/";
  const p = raw.replace(/\/$/, "") || "/";
  return PATH_TO_SCREEN[p] || "dashboard";
}

export function mobileScreenToPath(screen) {
  return SCREEN_TO_PATH[screen] || "/dashboard";
}
