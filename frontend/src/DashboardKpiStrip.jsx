/**
 * Compact KPI strip — Cyber Alert StatCard pattern (number + SVG + thin bar).
 */
import {
  IconAntenna,
  IconPeople,
  IconReceipt,
  IconSignalBars,
  IconWallet
} from "./icons.jsx";

function KpiCard({ label, value, Icon, tone = "info" }) {
  return (
    <article className={`dash-kpi-card dash-kpi-card--${tone}`}>
      <div className="dash-kpi-card__top">
        <span className="dash-kpi-card__label">{label}</span>
        {Icon ? (
          <span className="dash-kpi-card__icon" aria-hidden="true">
            <Icon width={18} height={18} />
          </span>
        ) : null}
      </div>
      <p className="dash-kpi-card__value">{value}</p>
      <div className="dash-kpi-card__track" aria-hidden="true">
        <div className="dash-kpi-card__fill" />
      </div>
    </article>
  );
}

export default function DashboardKpiStrip({ items }) {
  if (!items?.length) return null;
  return (
    <section className="dash-kpi-strip" id="dashboard-overview" aria-label="KPI">
      {items.map((item) => (
        <KpiCard key={item.key || item.label} {...item} />
      ))}
    </section>
  );
}

export const DASH_KPI_ICONS = {
  people: IconPeople,
  antenna: IconAntenna,
  receipt: IconReceipt,
  wallet: IconWallet,
  signal: IconSignalBars
};
