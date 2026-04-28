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

/** Map sidebar hash targets to PWA path screens (mobile tabs). */
export const NAV_HASH_TO_MOBILE_SCREEN = {
  "#dashboard-overview": "dashboard",
  "#platform-banners": "dashboard",
  "#platform-home-marketing": "dashboard",
  "#system-tenants": "dashboard",
  "#isp-announcements": "users",
  "#workspace-settings": "settings",
  "#network-ops": "network",
  "#mcbuleli-billing": "billing",
  "#billing-ops": "billing",
  "#team-settings": "users",
  "#security-settings": "settings",
  "#field-clients": "users"
};

export function mobileScreenForNavHash(href) {
  const h = href.startsWith("#") ? href : `#${href}`;
  return NAV_HASH_TO_MOBILE_SCREEN[h] || "dashboard";
}

/**
 * Same category tree as the desktop sidebar (single source of truth for PWA “all menus” sheet).
 */
export function buildDashboardNavCategories(t, user, isFieldAgent) {
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

  if (isFieldAgent) {
    return [
      {
        id: "field",
        label: t("Terrain", "Field"),
        Icon: IconSmartphone,
        items: [{ href: "#field-clients", label: t("Clients et portail", "Clients & portal") }]
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

  const billingItems = [
    ...(user.role === "system_owner"
      ? []
      : [{ href: "#mcbuleli-billing", label: t("Abonnement McBuleli", "McBuleli subscription") }]),
    { href: "#billing-ops", label: t("Opérations de facturation", "Billing operations") }
  ];
  cats.push({
    id: "billing",
    label: t("Facturation", "Billing"),
    Icon: IconWallet,
    items: billingItems
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
      items: [
        { href: "#security-settings", label: t("MFA & retraits", "MFA & withdrawals") },
        ...(user.role === "system_owner"
          ? [{ href: "#audit", label: t("Journal d'audit récent", "Recent audit log") }]
          : [])
      ]
    });
  }

  return cats;
}
