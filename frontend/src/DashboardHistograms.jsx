/**
 * Simple Cyber Alert–style histograms: vertical bars, short labels, no tip walls / emojis.
 */
import { formatStaffRole } from "./staffRoleLabels.js";
import { formatGb, formatUsd } from "./dashboardFormat.js";

function maxOf(values) {
  let m = 0;
  for (const v of values) {
    const n = Number(v || 0);
    if (n > m) m = n;
  }
  return m || 1;
}

function formatShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(5, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Vertical column histogram (Cyber Alert SeverityBars pattern). */
function ColumnChart({ title, totalLabel, labels, values, format = (v) => String(Math.round(Number(v) || 0)) }) {
  const nums = Array.isArray(values) ? values.map((v) => Number(v) || 0) : [];
  if (!nums.length) return null;
  const max = maxOf(nums);
  return (
    <article className="dash-col-chart" aria-label={title}>
      <header className="dash-col-chart__head">
        <p className="dash-col-chart__title">{title}</p>
        {totalLabel ? <span className="dash-col-chart__total">{totalLabel}</span> : null}
      </header>
      <div className="dash-col-chart__row" role="img" aria-label={title}>
        {nums.map((v, i) => {
          const h = v <= 0 ? 8 : Math.max(14, Math.round((v / max) * 100));
          return (
            <div key={`${labels[i] || i}-${i}`} className="dash-col-chart__col">
              <span className="dash-col-chart__value">{format(v, i)}</span>
              <div className="dash-col-chart__well">
                <div className="dash-col-chart__bar" style={{ height: `${h}%` }} />
              </div>
              <span className="dash-col-chart__label" title={labels[i]}>
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export default function DashboardHistograms({
  t,
  isEn,
  globalSummary,
  networkStats,
  cashbox,
  users,
  telemetrySnapshots
}) {
  const loc = isEn ? "en-US" : "fr-FR";
  const daily = Array.isArray(networkStats?.dailyUsage) ? networkStats.dailyUsage : [];
  const dailyWindow = daily.slice(-7);
  const dLabels = dailyWindow.map((r) => formatShortDate(r.date));
  const dDevices = dailyWindow.map((r) => r.connectedDevices ?? 0);
  const dBw = dailyWindow.map((r) => r.bandwidthGb ?? 0);

  const tel = [...(telemetrySnapshots || [])]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-7);
  const telLabels = tel.map((r) => formatShortDate(r.createdAt));
  const telVals = tel.map((r) => {
    if (r.connectedDevices != null) return r.connectedDevices;
    return (r.pppoeActive || 0) + (r.hotspotActive || 0);
  });

  const roleBuckets = {};
  for (const u of users || []) {
    const k = u.role || "user";
    roleBuckets[k] = (roleBuckets[k] || 0) + 1;
  }
  const roleKeys = Object.keys(roleBuckets).slice(0, 6);
  const roleVals = roleKeys.map((k) => roleBuckets[k]);
  const roleLabels = roleKeys.map((k) => formatStaffRole(k, isEn));

  const payDaily = Array.isArray(networkStats?.paymentsDaily) ? networkStats.paymentsDaily : [];
  const payWindow = payDaily.slice(-7);
  const payLabels = payWindow.map((r) => formatShortDate(r.date));
  const payVals = payWindow.map((r) => Number(r.amountUsd) || 0);

  const methodPairs = [
    [t("Cash", "Cash"), Number(cashbox?.cashUsd) || 0],
    [t("Mobile", "Mobile"), Number(cashbox?.mobileMoneyUsd) || 0],
    [t("TID", "TID"), Number(cashbox?.tidUsd) || 0],
    [t("Binance", "Binance"), Number(cashbox?.binancePayUsd) || 0],
    [t("Banque", "Bank"), Number(cashbox?.bankTransferUsd) || 0],
    [t("Crypto", "Crypto"), Number(cashbox?.cryptoWalletUsd) || 0],
    [t("Visa", "Visa"), Number(cashbox?.visaCardUsd) || 0]
  ].filter(([, v]) => v > 0);

  const charts = [];

  if (globalSummary) {
    charts.push(
      <ColumnChart
        key="platform"
        title={t("Plateforme", "Platform")}
        totalLabel={t("Vue globale", "Global")}
        labels={[
          t("FAI", "ISPs"),
          t("Clients", "Customers"),
          t("Actifs", "Active"),
          t("CA", "Rev.")
        ]}
        values={[
          globalSummary.totalIsps ?? 0,
          globalSummary.totalCustomers ?? 0,
          globalSummary.totalActiveSubscriptions ?? 0,
          Math.round((globalSummary.totalRevenueUsd ?? 0) * 100) / 100
        ]}
        format={(v, i) => (i === 3 ? formatUsd(v, loc) : String(Math.round(v)))}
      />
    );
  }

  if (dailyWindow.length) {
    charts.push(
      <ColumnChart
        key="sessions"
        title={t("Sessions", "Sessions")}
        totalLabel={t("7 jours", "7 days")}
        labels={dLabels}
        values={dDevices}
      />
    );
    charts.push(
      <ColumnChart
        key="traffic"
        title={t("Trafic", "Traffic")}
        totalLabel="GB"
        labels={dLabels}
        values={dBw}
        format={(v) => formatGb(v, 1, loc)}
      />
    );
  } else if (telVals.length) {
    charts.push(
      <ColumnChart
        key="telemetry"
        title={t("Appareils", "Devices")}
        totalLabel={t("Télémétrie", "Telemetry")}
        labels={telLabels}
        values={telVals}
      />
    );
  }

  if (payVals.length) {
    charts.push(
      <ColumnChart
        key="collections"
        title={t("Encaissements", "Collections")}
        totalLabel="USD"
        labels={payLabels}
        values={payVals}
        format={(v) => formatUsd(v, loc)}
      />
    );
  }

  if (methodPairs.length) {
    charts.push(
      <ColumnChart
        key="methods"
        title={t("Par méthode", "By method")}
        totalLabel={t("Mois", "Month")}
        labels={methodPairs.map(([l]) => l)}
        values={methodPairs.map(([, v]) => v)}
        format={(v) => formatUsd(v, loc)}
      />
    );
  }

  if (roleKeys.length) {
    charts.push(
      <ColumnChart
        key="team"
        title={t("Équipe", "Team")}
        labels={roleLabels}
        values={roleVals}
      />
    );
  }

  if (!charts.length) {
    return (
      <section className="panel dash-overview-empty" id="dashboard-overview">
        <p className="app-meta">{t("Pas encore de données à afficher.", "No chart data yet.")}</p>
      </section>
    );
  }

  return (
    <section className="dash-hist-panel dash-hist-panel--simple" aria-label={t("Graphiques", "Charts")}>
      <div className="dash-col-chart-grid">{charts}</div>
    </section>
  );
}
