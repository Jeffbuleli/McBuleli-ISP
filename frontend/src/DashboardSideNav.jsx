import { useEffect, useMemo, useState } from "react";
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

function categoryIdForItemHref(categories, href) {
  const c = categories.find((cat) => cat.items.some((it) => it.href === href));
  return c ? c.id : null;
}

export default function DashboardSideNav({
  t,
  user,
  isFieldAgent,
  navSearch,
  setNavSearch,
  compact = false
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

  const defaultHash = isFieldAgent ? "#field-clients" : "#dashboard-overview";
  const defaultExpand = isFieldAgent ? "field" : "overview";

  const knownHashes = useMemo(() => new Set(categories.flatMap((c) => c.items.map((i) => i.href))), [categories]);

  const [activeHash, setActiveHash] = useState(defaultHash);
  const [expandedCategory, setExpandedCategory] = useState(defaultExpand);

  useEffect(() => {
    const applyHash = () => {
      const raw = typeof window !== "undefined" ? window.location.hash : "";
      if (raw && knownHashes.has(raw)) {
        setActiveHash(raw);
        const cid = categoryIdForItemHref(categories, raw);
        if (cid) setExpandedCategory(cid);
      } else {
        setActiveHash(defaultHash);
        setExpandedCategory(defaultExpand);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [categories, knownHashes, defaultHash, defaultExpand]);

  const filteredCategories = useMemo(() => {
    if (!q) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((it) => it.label.toLowerCase().includes(q))
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, q]);

  function renderItemLinks(cat, flyout) {
    return cat.items.map((item) => (
      <li key={item.href}>
        <a
          href={item.href}
          className={`dashboard-nav-category-link${
            activeHash === item.href ? " dashboard-nav-category-link--active" : ""
          }${flyout ? " dashboard-nav-category-link--flyout" : ""}`}
          aria-current={activeHash === item.href ? "page" : undefined}
          onClick={() => {
            setActiveHash(item.href);
            setExpandedCategory(cat.id);
          }}
        >
          {item.label}
        </a>
      </li>
    ));
  }

  return (
    <aside
      className={`dashboard-sidenav${compact ? " dashboard-sidenav--compact" : ""}`}
      aria-label={t("Navigation du tableau de bord", "Dashboard navigation")}
    >
      <div className={compact ? "dashboard-sidenav-inner dashboard-sidenav-inner--compact-scroll" : "dashboard-sidenav-inner"}>
        {!compact ? (
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
        ) : null}

        <nav className="dashboard-sidenav-categories" aria-label={t("Sections", "Sections")}>
          {filteredCategories.map((cat) => {
            const Icon = cat.Icon;
            const open = expandedCategory === cat.id;
            return (
              <div
                key={cat.id}
                className={`dashboard-nav-category${open ? " dashboard-nav-category--open" : ""}${
                  compact && open ? " dashboard-nav-category--flyout-root" : ""
                }`}
              >
                <button
                  type="button"
                  className="dashboard-nav-category-head"
                  aria-expanded={open}
                  title={compact ? cat.label : undefined}
                  onClick={() => {
                    if (open) {
                      const containsActive = cat.items.some((it) => it.href === activeHash);
                      if (containsActive) return;
                      setExpandedCategory("");
                    } else {
                      const inThis = cat.items.some((it) => it.href === activeHash);
                      setExpandedCategory(cat.id);
                      if (!inThis && cat.items[0]) {
                        const h = cat.items[0].href;
                        setActiveHash(h);
                        if (typeof window !== "undefined" && window.location.hash !== h) {
                          window.location.hash = h;
                        }
                      }
                    }
                  }}
                >
                  <span className="dashboard-nav-category-icon" aria-hidden>
                    <Icon width={20} height={20} />
                  </span>
                  <span className="dashboard-nav-category-label">{cat.label}</span>
                  <span className="dashboard-nav-category-chevron" aria-hidden>
                    {open ? "−" : "+"}
                  </span>
                </button>
                {open && !compact ? (
                  <ul className="dashboard-nav-category-items">{renderItemLinks(cat, false)}</ul>
                ) : null}
                {open && compact ? (
                  <div className="dashboard-nav-flyout">
                    <p className="dashboard-nav-flyout-heading">{cat.label}</p>
                    <ul className="dashboard-nav-category-items dashboard-nav-category-items--flyout">
                      {renderItemLinks(cat, true)}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
