import { useMemo } from "react";
import {
  IconAntenna,
  IconHome,
  IconMail,
  IconPeople,
  IconPresentation,
  IconSliders,
  IconSmartphone,
  IconUserCheck,
  IconWallet
} from "./icons.jsx";

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function DashboardSideNav({
  t,
  user,
  isFieldAgent,
  expandedCategory,
  setExpandedCategory,
  ispAnnouncements,
  navSearch,
  setNavSearch
}) {
  const q = (navSearch || "").trim().toLowerCase();

  const canSeeAnnouncements =
    !isFieldAgent &&
    (user.role === "system_owner" ||
      user.role === "super_admin" ||
      user.role === "company_manager" ||
      user.role === "isp_admin");

  const canSeeSecurity =
    user.role === "system_owner" ||
    user.role === "super_admin" ||
    user.role === "company_manager" ||
    user.role === "isp_admin";

  const categories = useMemo(() => {
    if (isFieldAgent) {
      return [
        {
          id: "field",
          label: t("Terrain", "Field"),
          Icon: IconSmartphone,
          items: [
            {
              href: "#field-clients",
              label: t("Clients et portail", "Clients & portal")
            }
          ]
        }
      ];
    }

    const cats = [];

    cats.push({
      id: "overview",
      label: t("Vue d'ensemble", "Overview"),
      Icon: IconHome,
      items: [{ href: "#dashboard-overview", label: t("Indicateurs", "KPIs & summary") }]
    });

    if (user.role === "system_owner") {
      cats.push({
        id: "platform",
        label: t("Plateforme", "Platform"),
        Icon: IconPresentation,
        items: [
          { href: "#platform-banners", label: t("Bannières publiques", "Public banners") },
          { href: "#platform-home-marketing", label: t("Accueil public", "Public home") },
          { href: "#system-tenants", label: t("Espaces entreprises", "Tenant workspaces") }
        ]
      });
    }

    if (canSeeAnnouncements) {
      cats.push({
        id: "communication",
        label: t("Communication", "Communication"),
        Icon: IconMail,
        items: [{ href: "#isp-announcements", label: t("Annonces", "Announcements") }]
      });
    }

    cats.push({
      id: "workspace",
      label: t("Espace & marque", "Workspace & brand"),
      Icon: IconSliders,
      items: [{ href: "#workspace-settings", label: t("Paramètres entreprise", "Company settings") }]
    });

    cats.push({
      id: "network",
      label: t("Réseau", "Network"),
      Icon: IconAntenna,
      items: [{ href: "#network-ops", label: t("MikroTik & télémétrie", "MikroTik & telemetry") }]
    });

    cats.push({
      id: "billing",
      label: t("Facturation", "Billing"),
      Icon: IconWallet,
      items: [
        { href: "#mcbuleli-billing", label: t("Abonnement McBuleli", "McBuleli subscription") },
        { href: "#billing-ops", label: t("Opérations de facturation", "Billing operations") }
      ]
    });

    cats.push({
      id: "team",
      label: t("Équipe", "Team"),
      Icon: IconPeople,
      items: [{ href: "#team-settings", label: t("Utilisateurs et rôles", "Users & roles") }]
    });

    if (canSeeSecurity) {
      cats.push({
        id: "security",
        label: t("Sécurité", "Security"),
        Icon: IconUserCheck,
        items: [{ href: "#security-settings", label: t("MFA & retraits", "MFA & withdrawals") }]
      });
    }

    return cats;
  }, [user.role, isFieldAgent, canSeeAnnouncements, canSeeSecurity, t]);

  const filteredCategories = useMemo(() => {
    if (!q) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((it) => it.label.toLowerCase().includes(q))
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, q]);

  const announcementPreview = Array.isArray(ispAnnouncements) ? ispAnnouncements.slice(0, 3) : [];

  return (
    <aside className="dashboard-sidenav" aria-label={t("Navigation du tableau de bord", "Dashboard navigation")}>
      <div className="dashboard-sidenav-search">
        <label className="visually-hidden" htmlFor="dashboard-nav-search">
          {t("Rechercher dans le menu", "Search menu")}
        </label>
        <input
          id="dashboard-nav-search"
          type="search"
          className="dashboard-sidenav-search-input"
          placeholder={t("Rechercher…", "Search…")}
          value={navSearch}
          onChange={(e) => setNavSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      {announcementPreview.length > 0 ? (
        <div className="dashboard-sidenav-announcements">
          <h3 className="dashboard-sidenav-announcements-title">{t("Annonces", "Announcements")}</h3>
          <ul className="dashboard-sidenav-announce-list">
            {announcementPreview.map((a) => (
              <li key={a.id}>
                <a href="#isp-announcements" className="dashboard-sidenav-announce-link">
                  <span className="dashboard-sidenav-announce-title">{a.title || "—"}</span>
                  <span className="dashboard-sidenav-announce-snippet">
                    {stripHtml(a.bodyHtml).slice(0, 96)}
                    {stripHtml(a.bodyHtml).length > 96 ? "…" : ""}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <nav className="dashboard-sidenav-categories" aria-label={t("Sections", "Sections")}>
        {filteredCategories.map((cat) => {
          const Icon = cat.Icon;
          const open = expandedCategory === cat.id;
          return (
            <div key={cat.id} className={`dashboard-nav-category${open ? " dashboard-nav-category--open" : ""}`}>
              <button
                type="button"
                className="dashboard-nav-category-head"
                aria-expanded={open}
                onClick={() => setExpandedCategory(open ? "" : cat.id)}
              >
                <span className="dashboard-nav-category-icon" aria-hidden>
                  <Icon width={20} height={20} />
                </span>
                <span className="dashboard-nav-category-label">{cat.label}</span>
                <span className="dashboard-nav-category-chevron" aria-hidden>
                  {open ? "−" : "+"}
                </span>
              </button>
              {open ? (
                <ul className="dashboard-nav-category-items">
                  {cat.items.map((item) => (
                    <li key={item.href}>
                      <a href={item.href} className="dashboard-nav-category-link">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
