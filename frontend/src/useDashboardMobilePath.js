import { useCallback, useEffect, useState } from "react";
import { mobileScreenToPath, pathnameToMobileScreen } from "./dashboardMobilePath.js";

/**
 * Keeps URL path in sync with mobile screen (/dashboard … /settings) when the mobile shell is active.
 */
export function useDashboardMobilePath(isMobileShell) {
  const [screen, setScreen] = useState(() => {
    if (typeof window === "undefined" || !isMobileShell) return "dashboard";
    return pathnameToMobileScreen(window.location.pathname);
  });

  useEffect(() => {
    if (!isMobileShell) return;
    const sync = () => setScreen(pathnameToMobileScreen(window.location.pathname));
    window.addEventListener("popstate", sync);
    sync();
    return () => window.removeEventListener("popstate", sync);
  }, [isMobileShell]);

  useEffect(() => {
    if (!isMobileShell || typeof window === "undefined") return;
    const p = window.location.pathname.replace(/\/$/, "") || "/";
    if (p === "/" || p === "") {
      window.history.replaceState(null, "", "/dashboard");
      setScreen("dashboard");
    }
  }, [isMobileShell]);

  const navigateMobileScreen = useCallback(
    (next) => {
      if (!isMobileShell || typeof window === "undefined") return;
      const path = mobileScreenToPath(next);
      if (window.location.pathname !== path) {
        window.history.pushState(null, "", path);
      }
      setScreen(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [isMobileShell]
  );

  return { mobileScreen: screen, navigateMobileScreen };
}
