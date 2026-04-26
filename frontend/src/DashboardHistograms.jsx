/**
 * Lightweight histograms (no chart library). Uses flex bars + optional dailyUsage from /network/stats.
 */

function maxOf(arr, pick) {
  let m = 0;
  for (const row of arr) {
    const v = Number(pick(row) || 0);
    if (v > m) m = v;
  }
  return m || 1;
}

function BarGroup({ title, subtitle, labels, values, format = (v) => String(v) }) {
  const max = maxOf(values.map((v) => ({ v })), (x) => x.v);
  return (
    <div className="dash-hist-group">
      <div className="dash-hist-group-head">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      <div className="dash-hist-bars" role="img" aria-label={title}>
        {values.map((v, i) => {
          const pct = Math.round((Number(v || 0) / max) * 100);
          return (
            <div key={i} className="dash-hist-bar-wrap">
              <div className="dash-hist-bar-track">
                <div className="dash-hist-bar-fill" style={{ width: `${pct}%` }} />
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

function formatShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(5, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function DashboardHistograms({
  t,
  globalSummary,
  tenantDashboard,
  networkStats,
  users,
  invoices,
  telemetrySnapshots
}) {
  const daily = Array.isArray(networkStats?.dailyUsage) ? networkStats.dailyUsage : [];

  const dLabels = daily.slice(-14).map((r) => formatShortDate(r.date));
  const dDevices = daily.slice(-14).map((r) => r.connectedDevices ?? 0);
  const dBw = daily.slice(-14).map((r) => r.bandwidthGb ?? 0);

  const tel = [...(telemetrySnapshots || [])]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-12);
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
  const invDays = Object.keys(invByDay).sort();
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
          "Vue synthétique : réseau, finances et équipe. Le détail complet reste dans les sections du menu.",
          "At-a-glance network, revenue, and team view; full detail lives under each menu section."
        )}
      </p>
      <div className="dash-hist-grid">
        {gVals ? (
          <BarGroup
            title={t("Plateforme (tous FAI)", "Platform (all ISPs)")}
            subtitle={t("Vue créateur système", "System owner view")}
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
        {daily.length ? (
          <BarGroup
            title={t("Sessions réseau (quotidien)", "Network sessions (daily)")}
            subtitle={networkStats?.period
              ? `${networkStats.period.from} → ${networkStats.period.to}`
              : ""}
            labels={dLabels}
            values={dDevices}
          />
        ) : telVals.length ? (
          <BarGroup
            title={t("Appareils connectés (télémétrie)", "Connected devices (telemetry)")}
            subtitle={t("Derniers prélèvements MikroTik", "Latest MikroTik snapshots")}
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
            labels={[t("PPPoE", "PPPoE"), t("Hotspot", "Hotspot"), t("Sessions", "Sessions")]}
            values={[
              networkStats?.pppoeUsers ?? tenantDashboard?.networkSessions ?? 0,
              networkStats?.hotspotUsers ?? 0,
              networkStats?.connectedDevices ?? 0
            ]}
          />
        )}
        {daily.length ? (
          <BarGroup
            title={t("Volume trafic agrégé (Go / jour)", "Aggregated traffic (GB / day)")}
            labels={dLabels}
            values={dBw}
            format={(v) => `${Number(v).toFixed(2)} Go`}
          />
        ) : null}
        <BarGroup
          title={t("Structure commerciale (espace courant)", "Commercial snapshot (current workspace)")}
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
            labels={invLabels}
            values={invVals}
            format={(v) => `${Number(v).toFixed(2)} $`}
          />
        ) : null}
        {roleKeys.length ? (
          <BarGroup
            title={t("Équipe & rôles", "Team & roles")}
            labels={roleKeys}
            values={roleVals}
          />
        ) : null}
      </div>
    </section>
  );
}
