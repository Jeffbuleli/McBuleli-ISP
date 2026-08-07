import {
  IconAntenna,
  IconHome,
  IconPeople,
  IconReceipt,
  IconSettings,
  IconSliders,
  IconSmartphone,
  IconUserCheck,
  IconWallet
} from "./icons.jsx";

/**
 * ISP operator nav — each former Clients / Facturation / Réglages submenu
 * is a top-level entry (no nested accordion for those).
 * Platform CMS only for system_owner.
 */
export function buildModuleRegistry(t, user, { isFieldAgent } = {}) {
  const role = user?.role || "";
  const isSystemOwner = role === "system_owner";
  const canSeeSecurity =
    role === "system_owner" ||
    role === "super_admin" ||
    role === "company_manager" ||
    role === "isp_admin";

  if (isFieldAgent) {
    return [
      {
        key: "field.clients",
        nav: { category: "clients", categoryLabel: t("Clients", "Clients"), categoryIcon: IconSmartphone },
        href: "#field-clients",
        label: t("Clients", "Clients"),
        mobileScreen: "users"
      },
      {
        key: "settings.workspace",
        nav: { category: "settings", categoryLabel: t("Reglages", "Settings"), categoryIcon: IconSliders },
        href: "#workspace-settings",
        label: t("Reglages", "Settings"),
        mobileScreen: "settings"
      }
    ];
  }

  /** @type {Array<{key:string, nav:{category:string, categoryLabel:string, categoryIcon:any}, href:string, label:string, mobileScreen:string, hidden?:boolean}>} */
  const modules = [];

  modules.push({
    key: "dashboard.overview",
    nav: { category: "home", categoryLabel: t("Accueil", "Home"), categoryIcon: IconHome },
    href: "#dashboard-overview",
    label: t("Tableau de bord", "Dashboard"),
    mobileScreen: "dashboard"
  });

  modules.push(
    {
      key: "clients.list",
      nav: { category: "clients", categoryLabel: t("Clients", "Clients"), categoryIcon: IconPeople },
      href: "#field-clients",
      label: t("Clients", "Clients"),
      mobileScreen: "users"
    },
    {
      key: "clients.team",
      nav: { category: "team", categoryLabel: t("Equipe", "Team"), categoryIcon: IconUserCheck },
      href: "#team-settings",
      label: t("Equipe", "Team"),
      mobileScreen: "users"
    }
  );

  modules.push({
    key: "network.ops",
    nav: { category: "network", categoryLabel: t("Reseau", "Network"), categoryIcon: IconAntenna },
    href: "#network-ops",
    label: t("MikroTik", "MikroTik"),
    mobileScreen: "network"
  });

  modules.push({
    key: "finance.billing",
    nav: { category: "billing", categoryLabel: t("Facturation", "Billing"), categoryIcon: IconWallet },
    href: "#billing-ops",
    label: t("Facturation", "Billing"),
    mobileScreen: "billing"
  });

  if (role !== "system_owner") {
    modules.push({
      key: "finance.subscription",
      nav: { category: "saas", categoryLabel: t("Abonnement SaaS", "SaaS plan"), categoryIcon: IconReceipt },
      href: "#mcbuleli-billing",
      label: t("Abonnement SaaS", "SaaS plan"),
      mobileScreen: "billing"
    });
  }

  modules.push({
    key: "settings.workspace",
    nav: { category: "settings", categoryLabel: t("Reglages", "Settings"), categoryIcon: IconSliders },
    href: "#workspace-settings",
    label: t("Reglages", "Settings"),
    mobileScreen: "settings"
  });

  if (canSeeSecurity) {
    modules.push({
      key: "settings.security",
      nav: { category: "security", categoryLabel: t("Securite", "Security"), categoryIcon: IconSettings },
      href: "#security-settings",
      label: t("Securite", "Security"),
      mobileScreen: "settings"
    });
  }

  if (isSystemOwner) {
    modules.push(
      {
        key: "platform.banners",
        nav: { category: "platform", categoryLabel: t("Plateforme", "Platform"), categoryIcon: IconReceipt },
        href: "#platform-banners",
        label: t("Bannieres", "Banners"),
        mobileScreen: "dashboard"
      },
      {
        key: "platform.home",
        nav: { category: "platform", categoryLabel: t("Plateforme", "Platform"), categoryIcon: IconReceipt },
        href: "#platform-home-marketing",
        label: t("Accueil public", "Public home"),
        mobileScreen: "dashboard"
      },
      {
        key: "platform.tenants",
        nav: { category: "platform", categoryLabel: t("Plateforme", "Platform"), categoryIcon: IconReceipt },
        href: "#system-tenants",
        label: t("Tenants", "Tenants"),
        mobileScreen: "dashboard"
      },
      {
        key: "settings.audit",
        nav: { category: "audit", categoryLabel: t("Audit", "Audit"), categoryIcon: IconReceipt },
        href: "#audit",
        label: t("Audit", "Audit"),
        mobileScreen: "settings"
      }
    );
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
