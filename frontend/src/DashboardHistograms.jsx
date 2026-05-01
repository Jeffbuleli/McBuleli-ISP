/**
 * Lightweight histograms (no chart library). Flex bars + optional dailyUsage from /network/stats.
 * Color tiers: temporal series compare recent points (today vs yesterday vs day-before);
 * snapshot charts compare each bar against the strongest bar in that chart.
 */

import { formatStaffRole } from "./staffRoleLabels.js";

function maxOf(arr, pick) {
  let m = 0;
  for (const row of arr) {
    const v = Number(pick(row) || 0);
    if (v > m) m = v;
  }
  return m || 1;
}

/** Within a single histogram: strongest bar vs rest (roles, KPI snapshot). */
function tierLevel(value, max) {
  if (max <= 0) return "mid";
  const r = value / max;
  if (r >= 0.66) return "high";
  if (r >= 0.33) return "mid";
  return "low";
}

/**
 * Time-ordered bars: mixes proximity to recent window peak with momentum vs yesterday
 * (previous index) and the day before when available — so « aujourd’hui vs hier / avant-hier » reads visually.
 */
function temporalTier(values, index) {
  const nums = (values || []).map((v) => Number(v ?? 0));
  if (!nums.length) return "mid";
  const vmax = Math.max(1e-9, ...nums);
  const cur = nums[index];
  const yEst = index > 0 ? nums[index - 1] : cur;
  const y2 = index > 1 ? nums[index - 2] : yEst;

  const shareOfPeak = cur / vmax;
  const vsYesterday = yEst > 1e-9 ? cur / yEst : cur > 0 ? 12 : 0;
  const vsOlder = y2 > 1e-9 ? cur / y2 : vsYesterday;

  if (shareOfPeak >= 0.88 || vsYesterday >= 1.06 || (shareOfPeak >= 0.72 && vsYesterday >= 1.02))
    return "high";
  if (shareOfPeak <= 0.3 || vsYesterday <= 0.78 || (vsYesterday <= 0.92 && vsOlder <= 0.88 && shareOfPeak < 0.55))
    return "low";
  return "mid";
}

function BarGroup({ title, subtitle, labels, values, format = (v) => String(v), tierMode = "none" }) {
  const nums = Array.isArray(values) ? values : [];
  const max = maxOf(nums.map((v) => ({ v })), (x) => x.v);
  return (
    <div className="dash-hist-group">
      <div className="dash-hist-group-head">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      <div className="dash-hist-bars" role="img" aria-label={title}>
        {nums.map((v, i) => {
          const pct = Math.round((Number(v || 0) / max) * 100);
          let tier = "mid";
          if (tierMode === "share") tier = tierLevel(Number(v || 0), max);
          else if (tierMode === "temporal") tier = temporalTier(nums, i);
          const fillClass =
            tierMode === "none"
              ? "dash-hist-bar-fill dash-hist-bar-fill--default"
              : `dash-hist-bar-fill dash-hist-bar-fill--tier dash-hist-bar-fill--tier-${tier}`;

          return (
            <div key={i} className="dash-hist-bar-wrap">
              <div className="dash-hist-bar-track">
                <div className={fillClass} style={{ width: `${pct}%` }} />
              </div>
              <span className="dash-hist-bar-meta">
                <abbr title={labels[i]}>{labels[i]}</abbr>
                <span>{format(v, i)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamRolesBarGroup({ title, subtitle, roleKeys, values, isEn, t }) {
  const nums = Array.isArray(values) ? values : [];
  const max = maxOf(nums.map((v) => ({ v })), (x) => x.v);
  const labels = roleKeys.map((k) => formatStaffRole(k, isEn));
  return (
    <div className="dash-hist-group dash-hist-group--roles">
      <div className="dash-hist-group-head">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      <div className="dash-hist-bars" role="img" aria-label={title}>
        {nums.map((v, i) => {
          const pct = Math.round((Number(v || 0) / max) * 100);
          const tier = tierLevel(Number(v || 0), max);
          return (
            <div key={roleKeys[i] || i} className="dash-hist-bar-wrap">
              <div className="dash-hist-bar-track">
                <div
                  className={`dash-hist-bar-fill dash-hist-bar-fill--tier dash-hist-bar-fill--tier-${tier}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="dash-hist-bar-meta">
                <abbr title={roleKeys[i]}>{labels[i]}</abbr>
                <span>{String(v)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(5, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DashboardHistograms({
  t,
  isEn,
  globalSummary,
  tenantDashboard,
  networkStats,
  users,
  invoices,
  telemetrySnapshots
}) {
  const daily = Array.isArray(networkStats?.dailyUsage) ? networkStats.dailyUsage : [];
  /** Au plus 7 jours affichés : évite les histogrammes illisibles si la période stats couvre un mois ou plus. */
  const dailyWindow = daily.slice(-7);
  const dLabels = dailyWindow.map((r) => formatShortDate(r.date));
  const dDevices = dailyWindow.map((r) => r.connectedDevices ?? 0);
  const dBw = dailyWindow.map((r) => r.bandwidthGb ?? 0);

  const tel = [...(telemetrySnapshots || [])]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-7);
  const telLabels = tel.map((r, i) => `${i + 1}`);
  const telVals = tel.map((r) => {
    if (r.connectedDevices != null) return r.connectedDevices;
    return (r.pppoeActive || 0) + (r.hotspotActive || 0);
  });

  const roleBuckets = {};
  for (const u of users || []) {
    const k = u.role || "user";
    roleBuckets[k] = (roleBuckets[k] || 0) + 1;
  }
  const roleKeys = Object.keys(roleBuckets);
  const roleVals = roleKeys.map((k) => roleBuckets[k]);

  const inv = [...(invoices || [])]
    .filter((x) => x.status === "paid")
    .sort((a, b) => new Date(a.createdAt || a.dueDate) - new Date(b.createdAt || b.dueDate))
    .slice(-10);
  const invByDay = {};
  for (const row of inv) {
    const day = String(row.createdAt || row.dueDate || "").slice(0, 10);
    if (!day) continue;
    invByDay[day] = (invByDay[day] || 0) + Number(row.amountUsd || 0);
  }
  const invDays = Object.keys(invByDay).sort().slice(-7);
  const invLabels = invDays.map(formatShortDate);
  const invVals = invDays.map((d) => invByDay[d]);

  const gVals = globalSummary
    ? [
        globalSummary.totalIsps ?? 0,
        globalSummary.totalCustomers ?? 0,
        globalSummary.totalActiveSubscriptions ?? 0,
        Math.round((globalSummary.totalRevenueUsd ?? 0) * 100) / 100
      ]
    : null;

  return (
    <section className="panel dash-hist-panel" aria-label={t("Tableaux de bord", "Dashboard charts")}>
      <h2>{t("Performance & activité", "Performance & activity")}</h2>
      <p className="dash-hist-lead">
        {t(
          "Vue synthétique : réseau, finances et équipe. Les séries jour par jour et la télémétrie montrent au plus 7 points (fin de la période sélectionnée dans les filtres stats). Le détail complet reste dans les sections du menu.",
          "At-a-glance network, revenue, and team view. Day-by-day series and telemetry show at most 7 points (the end of your selected stats period). Full detail lives under each menu section."
        )}
      </p>
      <div className="dash-hist-grid">
        {gVals ? (
          <BarGroup
            title={t("Plateforme (tous FAI)", "Platform (all ISPs)")}
            subtitle={t("Vue créateur système", "System owner view")}
            tierMode="share"
            labels={[
              t("FAI", "ISPs"),
              t("Clients", "Customers"),
              t("Abonnements actifs", "Active subs"),
              t("CA payé (USD)", "Paid revenue (USD)")
            ]}
            values={gVals}
            format={(v, i) => (i === 3 ? Number(v).toFixed(2) : String(Math.round(v)))}
          />
        ) : null}
        {dailyWindow.length ? (
          <BarGroup
            title={t("Sessions réseau (quotidien)", "Network sessions (daily)")}
            subtitle={
              dailyWindow.length && dailyWindow[0]?.date && dailyWindow[dailyWindow.length - 1]?.date
                ? `${String(dailyWindow[0].date).slice(0, 10)} → ${String(dailyWindow[dailyWindow.length - 1].date).slice(0, 10)}`
                : networkStats?.period
                  ? `${networkStats.period.from} → ${networkStats.period.to}`
                  : ""
            }
            tierMode="temporal"
            labels={dLabels}
            values={dDevices}
          />
        ) : telVals.length ? (
          <BarGroup
            title={t("Appareils connectés (télémétrie)", "Connected devices (telemetry)")}
            subtitle={t("Derniers prélèvements MikroTik", "Latest MikroTik snapshots")}
            tierMode="temporal"
            labels={telLabels}
            values={telVals}
          />
        ) : (
          <BarGroup
            title={t("Réseau", "Network")}
            subtitle={t(
              "Collectez la télémétrie ou attendez l’agrégation quotidienne.",
              "Collect telemetry or wait for daily rollups."
            )}
            tierMode="share"
            labels={[t("PPPoE", "PPPoE"), t("Hotspot", "Hotspot"), t("Sessions", "Sessions")]}
            values={[
              networkStats?.pppoeUsers ?? tenantDashboard?.networkSessions ?? 0,
              networkStats?.hotspotUsers ?? 0,
              networkStats?.connectedDevices ?? 0
            ]}
          />
        )}
        {dailyWindow.length ? (
          <BarGroup
            title={t("Volume trafic agrégé (Go / jour)", "Aggregated traffic (GB / day)")}
            tierMode="temporal"
            labels={dLabels}
            values={dBw}
            format={(v) => `${Number(v).toFixed(2)} Go`}
          />
        ) : null}
        <BarGroup
          title={t("Structure commerciale (espace courant)", "Commercial snapshot (current workspace)")}
          tierMode="share"
          labels={[
            t("Clients", "Customers"),
            t("Abonnements actifs", "Active subs"),
            t("Factures impayées", "Unpaid inv.")
          ]}
          values={[
            tenantDashboard?.totalCustomers ?? 0,
            tenantDashboard?.activeSubscriptions ?? 0,
            tenantDashboard?.unpaidInvoices ?? 0
          ]}
        />
        {invVals.length ? (
          <BarGroup
            title={t("Encaissements (factures payées)", "Collections (paid invoices)")}
            subtitle={t("Montants groupés par date", "Amounts grouped by date")}
            tierMode="temporal"
            labels={invLabels}
            values={invVals}
            format={(v) => `${Number(v).toFixed(2)} $`}
          />
        ) : null}
        {roleKeys.length ? (
          <TeamRolesBarGroup
            title={t("Équipe & rôles", "Team & roles")}
            subtitle={t(
              "Répartition des comptes par rôle (instantané).",
              "Headcount share by role (live snapshot)."
            )}
            roleKeys={roleKeys}
            values={roleVals}
            isEn={Boolean(isEn)}
            t={t}
          />
        ) : null}
      </div>
      <p className="dash-hist-tier-legend dash-hist-tier-legend--global">
        {t(
          "Légende des couleurs (tous ces histogrammes) : vert — niveau fort (proche du maximum de la période ou en hausse nette récente ; comparez aussi les derniers à la veille), orange — niveau moyen, rouge — niveau fragile ou à surveiller (loin du pic récent ou en baisse par rapport aux jours précédents). Sur une série jour par jour (flèche « récent »), le dernier point se lit contre les deux précédents.",
          "Color legend for every chart above: green — strong performance (near the peak of what’s shown here, or sharply up lately; compare recent bars vs the day before); orange — in the middle; red — weaker or slipping vs recent days. Day-by-day series: read the rightmost bars against yesterday and the day before."
        )}
      </p>
    </section>
  );
}
