/**
 * Lightweight histograms (no chart library). Flex bars + optional dailyUsage from /network/stats.
 * Color tiers: temporal series compare recent points (today vs yesterday vs day-before);
 * snapshot charts compare each bar against the strongest bar in that chart.
 */

import { formatStaffRole } from "./staffRoleLabels.js";
import { formatGb, formatUsd } from "./dashboardFormat.js";

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
  networkStats,
  users,
  telemetrySnapshots
}) {
  const loc = isEn ? "en-US" : "fr-FR";
  const daily = Array.isArray(networkStats?.dailyUsage) ? networkStats.dailyUsage : [];
  /** Au plus 7 jours affichés : évite les histogrammes illisibles si la période stats couvre un mois ou plus. */
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
  const roleKeys = Object.keys(roleBuckets);
  const roleVals = roleKeys.map((k) => roleBuckets[k]);

  const payDaily = Array.isArray(networkStats?.paymentsDaily) ? networkStats.paymentsDaily : [];
  const payWindow = payDaily.slice(-7);
  const payLabels = payWindow.map((r) => formatShortDate(r.date));
  const payVals = payWindow.map((r) => Number(r.amountUsd) || 0);

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
          "Histogrammes relatifs : chaque graphique normalise ses barres au maximum affiché dans ce graphique uniquement — ce n’est pas un jugement absolu de santé métier. Séries journalières limitées aux 7 derniers points ; encaissements = paiements confirmés par jour (date de paiement).",
          "Relative histograms: each chart scales bars to that chart’s own maximum — not an absolute business-health verdict. Daily series show at most the last seven points; collections chart uses confirmed payments grouped by payment date."
        )}
      </p>
      {networkStats?.quality?.coverageRatio != null && networkStats?.quality?.expectedDays > 2 ? (
        <p className="dash-hist-meta app-meta">
          {t(
            `Couverture des agrégats réseau sur la période : ${Math.round(Number(networkStats.quality.coverageRatio) * 100)} % (${networkStats.quality.dailyRowsObserved}/${networkStats.quality.expectedDays} jours observés).`,
            `Daily rollup coverage over this window: ${Math.round(Number(networkStats.quality.coverageRatio) * 100)} % (${networkStats.quality.dailyRowsObserved}/${networkStats.quality.expectedDays} days observed).`
          )}
        </p>
      ) : null}
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
            format={(v, i) => (i === 3 ? formatUsd(v, loc) : String(Math.round(v)))}
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
            title={t("Réseau (agrégats de période)", "Network (period aggregates)")}
            subtitle={t(
              "PPPoE/Hotspot = sommes des relevés journaliers ; Appareils = pic journalier max — ne pas additionner ces trois séries comme une seule métrique.",
              "PPPoE/Hotspot = sums of daily rollups; Devices = maximum daily peak — do not sum these three into one headline metric."
            )}
            tierMode="share"
            labels={[t("PPPoE Σ jour", "PPPoE Σ days"), t("Hotspot Σ jour", "Hotspot Σ days"), t("Appareils pic", "Devices peak")]}
            values={[networkStats?.pppoeUsers ?? 0, networkStats?.hotspotUsers ?? 0, networkStats?.connectedDevices ?? 0]}
          />
        )}
        {dailyWindow.length ? (
          <BarGroup
            title={t("Volume trafic agrégé (GB / jour)", "Aggregated traffic (GB / day)")}
            tierMode="temporal"
            labels={dLabels}
            values={dBw}
            format={(v) => formatGb(v, 2, loc)}
          />
        ) : null}
        {payVals.length ? (
          <BarGroup
            title={t("Encaissements confirmés par jour", "Confirmed collections per day")}
            subtitle={t(
              "Somme des paiements confirmés par date de paiement.",
              "Sum of confirmed payments grouped by payment date."
            )}
            tierMode="temporal"
            labels={payLabels}
            values={payVals}
            format={(v) => formatUsd(v, loc)}
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
          "Échelle intra-graphique uniquement : les couleurs classent les barres les unes par rapport aux autres dans CE graphique (proximité du max affiché et dynamique courte vs veille). Ne pas les interpréter comme seuils SLA ou scores absolus sans définition métier explicite.",
          "Within-chart scaling only: colors rank bars relative to each other inside THIS chart (nearness to that chart’s displayed peak and short momentum vs yesterday). Do not read them as SLA thresholds or absolute scores unless your business defines them explicitly."
        )}
      </p>
    </section>
  );
}
