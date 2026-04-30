import {
  IconAntenna,
  IconHome,
  IconMail,
  IconPeople,
  IconPresentation,
  IconReceipt,
  IconSliders,
  IconSmartphone,
  IconUserCheck,
  IconWallet
} from "./icons.jsx";

/**
 * Extensible module registry.
 *
 * - Add new modules without changing layout/navigation code.
 * - Each module defines its nav grouping, hash route, mobile tab, and visibility rules.
 */
export function buildModuleRegistry(t, user, { isFieldAgent } = {}) {
  const role = user?.role || "";
  const isSystemOwner = role === "system_owner";
  const canSeeSecurity = role === "system_owner" || role === "super_admin" || role === "company_manager" || role === "isp_admin";

  if (isFieldAgent) {
    return [
      {
        key: "field.clients",
        nav: { category: "field", categoryLabel: t("Terrain", "Field"), categoryIcon: IconSmartphone },
        href: "#field-clients",
        label: t("Clients et portail", "Clients & portal"),
        mobileScreen: "users"
      },
      {
        key: "settings.workspace",
        nav: { category: "settings", categoryLabel: t("Paramètres", "Settings"), categoryIcon: IconSliders },
        href: "#workspace-settings",
        label: t("Paramètres", "Settings"),
        mobileScreen: "settings"
      }
    ];
  }

  /** @type {Array<{key:string, nav:{category:string, categoryLabel:string, categoryIcon:any}, href:string, label:string, mobileScreen:string, hidden?:boolean}>} */
  const modules = [];

  modules.push({
    key: "dashboard.overview",
    nav: { category: "dashboard", categoryLabel: t("Dashboard", "Dashboard"), categoryIcon: IconHome },
    href: "#dashboard-overview",
    label: t("Indicateurs", "KPIs & summary"),
    mobileScreen: "dashboard"
  });

  if (isSystemOwner) {
    modules.push(
      {
        key: "platform.banners",
        nav: { category: "platform", categoryLabel: t("Plateforme", "Platform"), categoryIcon: IconPresentation },
        href: "#platform-banners",
        label: t("Bannières publiques", "Public banners"),
        mobileScreen: "dashboard"
      },
      {
        key: "platform.home",
        nav: { category: "platform", categoryLabel: t("Plateforme", "Platform"), categoryIcon: IconPresentation },
        href: "#platform-home-marketing",
        label: t("Accueil public", "Public home"),
        mobileScreen: "dashboard"
      },
      {
        key: "platform.tenants",
        nav: { category: "platform", categoryLabel: t("Plateforme", "Platform"), categoryIcon: IconPresentation },
        href: "#system-tenants",
        label: t("Espaces entreprises", "Tenant workspaces"),
        mobileScreen: "dashboard"
      }
    );
  }

  // User management (future-proof): use existing anchors today; expand later without changing nav.
  modules.push(
    {
      key: "users.management",
      nav: { category: "users", categoryLabel: t("Utilisateurs", "Users"), categoryIcon: IconPeople },
      href: "#field-clients",
      label: t("Clients", "Clients"),
      mobileScreen: "users"
    },
    {
      key: "users.team",
      nav: { category: "users", categoryLabel: t("Utilisateurs", "Users"), categoryIcon: IconPeople },
      href: "#team-settings",
      label: t("Équipe & rôles", "Team & roles"),
      mobileScreen: "users"
    }
  );

  modules.push({
    key: "network.ops",
    nav: { category: "network", categoryLabel: t("Réseau", "Network"), categoryIcon: IconAntenna },
    href: "#network-ops",
    label: t("MikroTik & télémétrie", "MikroTik & telemetry"),
    mobileScreen: "network"
  });

  modules.push({
    key: "finance.billing",
    nav: { category: "finance", categoryLabel: t("Finance", "Finance"), categoryIcon: IconWallet },
    href: "#billing-ops",
    label: t("Facturation & paiements", "Billing & payments"),
    mobileScreen: "billing"
  });

  if (role !== "system_owner") {
    modules.push({
      key: "finance.subscription",
      nav: { category: "finance", categoryLabel: t("Finance", "Finance"), categoryIcon: IconWallet },
      href: "#mcbuleli-billing",
      label: t("Abonnement McBuleli", "McBuleli subscription"),
      mobileScreen: "billing"
    });
  }

  // Reports / analytics (placeholder route today, can map to future page later)
  modules.push({
    key: "reports.analytics",
    nav: { category: "reports", categoryLabel: t("Rapports", "Reports"), categoryIcon: IconReceipt },
    href: "#reports",
    label: t("Analyses", "Analytics"),
    mobileScreen: "dashboard"
  });

  modules.push({
    key: "communication.chat",
    nav: { category: "communication", categoryLabel: t("Communication", "Communication"), categoryIcon: IconMail },
    href: "#team-chat",
    label: t("Chat équipe", "Team chat"),
    mobileScreen: "dashboard"
  });

  modules.push({
    key: "settings.workspace",
    nav: { category: "settings", categoryLabel: t("Paramètres", "Settings"), categoryIcon: IconSliders },
    href: "#workspace-settings",
    label: t("Paramètres", "Settings"),
    mobileScreen: "settings"
  });

  if (canSeeSecurity) {
    modules.push({
      key: "settings.security",
      nav: { category: "settings", categoryLabel: t("Paramètres", "Settings"), categoryIcon: IconSliders },
      href: "#security-settings",
      label: t("Sécurité & API", "Security & API"),
      mobileScreen: "settings"
    });
  }

  if (isSystemOwner) {
    modules.push({
      key: "settings.audit",
      nav: { category: "settings", categoryLabel: t("Paramètres", "Settings"), categoryIcon: IconUserCheck },
      href: "#audit",
      label: t("Journal d'audit", "Audit log"),
      mobileScreen: "settings"
    });
  }

  return modules.filter((m) => !m.hidden);
}

export function modulesToNavCategories(modules) {
  const order = [];
  const byCat = new Map();
  for (const m of modules) {
    const cid = m.nav.category;
    if (!byCat.has(cid)) {
      byCat.set(cid, { id: cid, label: m.nav.categoryLabel, Icon: m.nav.categoryIcon, items: [] });
      order.push(cid);
    }
    byCat.get(cid).items.push({ href: m.href, label: m.label });
  }
  return order.map((cid) => byCat.get(cid));
}

export function modulesToMobileHashMap(modules) {
  const out = {};
  for (const m of modules) out[m.href] = m.mobileScreen;
  return out;
}

