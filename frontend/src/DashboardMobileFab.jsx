import { Zap } from "lucide-react";

export default function DashboardMobileFab({ t, userRole, navigateMobileScreen }) {
  const target =
    userRole === "system_owner"
      ? "settings"
      : userRole === "field_agent"
        ? "dashboard"
        : "billing";
  const label =
    userRole === "system_owner"
      ? t("Réglages plateforme", "Platform settings")
      : userRole === "field_agent"
        ? t("Vue terrain", "Field view")
        : t("Facturation", "Billing");

  return (
    <button
      type="button"
      className="dashboard-mobile-fab"
      onClick={() => navigateMobileScreen?.(target)}
      title={label}
      aria-label={label}
    >
      <Zap size={24} strokeWidth={2} aria-hidden />
    </button>
  );
}
