import { useEffect, useMemo, useState } from "react";
import { buildDashboardNavCategories } from "./dashboardNavCategories.js";
import DashboardStaffProfileAvatar from "./DashboardStaffProfileAvatar.jsx";
import DashboardTeamChatButton from "./DashboardTeamChatButton.jsx";
import DashboardCommandPalette from "./DashboardCommandPalette.jsx";
import {
  IconHome,
  IconSettings,
  IconSignOut,
  IconMenuHamburger,
  IconX
} from "./icons.jsx";

export default function DashboardTopBar({
  t,
  user,
  isFieldAgent,
  dashboardChatIspId,
  teamChatUnread,
  onToggleChat,
  onOpenSettings,
  onGoHome,
  onLogout,
  onToggleSidebar,
  sidebarOpen,
  isMobileShell,
  onChatProfileSaved
}) {
  const categories = useMemo(
    () => buildDashboardNavCategories(t, user, isFieldAgent),
    [t, user, isFieldAgent]
  );

  const [cmdkOpen, setCmdkOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key || "").toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="mb-topbar" role="banner">
        <div className="mb-topbar__left">
          <button
            type="button"
            className="mb-topbar__iconbtn"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? t("Fermer le menu", "Close menu") : t("Ouvrir le menu", "Open menu")}
            title={sidebarOpen ? t("Fermer le menu", "Close menu") : t("Ouvrir le menu", "Open menu")}
          >
            {sidebarOpen ? <IconX width={20} height={20} aria-hidden /> : <IconMenuHamburger width={20} height={20} aria-hidden />}
          </button>

          <DashboardStaffProfileAvatar
            userId={user?.id || user?.email}
            fullName={user?.fullName}
            chatAvatarUrl={user?.chatAvatarUrl}
            t={t}
            onChatProfileSaved={onChatProfileSaved}
          />
        </div>

        <div className="mb-topbar__center">
          <button
            type="button"
            className="mb-topbar__search"
            onClick={() => setCmdkOpen(true)}
            aria-label={t("Rechercher", "Search")}
          >
            <span className="mb-topbar__search-placeholder">{t("Rechercher…", "Search…")}</span>
            {!isMobileShell ? (
              <span className="mb-topbar__search-kbd" aria-hidden>
                Ctrl&nbsp;K
              </span>
            ) : null}
          </button>
        </div>

        <div className="mb-topbar__right" role="toolbar" aria-label={t("Actions", "Actions")}>
          {dashboardChatIspId ? (
            <DashboardTeamChatButton unreadCount={teamChatUnread} t={t} variant={isMobileShell ? "mobile" : "desktop"} onClick={onToggleChat} />
          ) : null}

          <button
            type="button"
            className="mb-topbar__iconbtn"
            onClick={onOpenSettings}
            aria-label={t("Paramètres", "Settings")}
            title={t("Paramètres", "Settings")}
          >
            <IconSettings width={20} height={20} aria-hidden />
          </button>

          <button
            type="button"
            className="mb-topbar__iconbtn"
            onClick={onGoHome}
            aria-label={t("Accueil", "Home")}
            title={t("Accueil", "Home")}
          >
            <IconHome width={20} height={20} aria-hidden />
          </button>

          {typeof onLogout === "function" ? (
            <button
              type="button"
              className="mb-topbar__iconbtn"
              onClick={onLogout}
              aria-label={t("Déconnexion", "Logout")}
              title={t("Déconnexion", "Logout")}
            >
              <IconSignOut width={20} height={20} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <DashboardCommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} t={t} categories={categories} />
    </>
  );
}

