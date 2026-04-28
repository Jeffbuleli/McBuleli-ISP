import { LayoutDashboard, Wifi, Wallet, Users, Settings } from "lucide-react";
import { useSyncExternalStore } from "react";
import { pathnameToMobileScreen } from "./dashboardMobilePath.js";

function subscribePath(cb) {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
}

function getPathSnapshot() {
  return typeof window !== "undefined" ? window.location.pathname : "";
}

function getPathServer() {
  return "";
}

const ICONS = {
  dashboard: LayoutDashboard,
  network: Wifi,
  billing: Wallet,
  users: Users,
  settings: Settings
};

export default function DashboardBottomNav({ t, navigateMobileScreen, isFieldAgent }) {
  const pathname = useSyncExternalStore(subscribePath, getPathSnapshot, getPathServer);
  const active = pathnameToMobileScreen(pathname);
  const go = (id) => {
    if (typeof navigateMobileScreen === "function") navigateMobileScreen(id);
  };

  const tabs = [
    { id: "dashboard", label: t("Tableau", "Dashboard"), Icon: ICONS.dashboard },
    { id: "network", label: t("Réseau", "Network"), Icon: ICONS.network },
    { id: "billing", label: t("Facturation", "Billing"), Icon: ICONS.billing },
    {
      id: "users",
      label: isFieldAgent ? t("Clients", "Clients") : t("Équipe", "Users"),
      Icon: ICONS.users
    },
    { id: "settings", label: t("Réglages", "Settings"), Icon: ICONS.settings }
  ];

  return (
    <nav
      className="dashboard-bottom-nav"
      role="navigation"
      aria-label={t("Navigation principale", "Primary navigation")}
    >
      <div className="dashboard-bottom-nav__inner">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              className={`dashboard-bottom-nav__item${isActive ? " dashboard-bottom-nav__item--active" : ""}`}
              onClick={() => go(id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="dashboard-bottom-nav__icon" aria-hidden>
                <Icon size={22} strokeWidth={2} />
              </span>
              <span className="dashboard-bottom-nav__label">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
