import { formatSignedPct } from "./dashboardFormat.js";

/**
 * KPI tile with timeframe, optional delta vs previous period, glossary hint via native tooltip.
 */
export default function AnalyticMetricCard({
  t,
  title,
  value,
  timeframe,
  definitionTitle,
  comparison,
  deltaHint = "neutral",
  qualityFlag,
  locale
}) {
  const pct =
    comparison && comparison.deltaPct !== null && comparison.deltaPct !== undefined
      ? formatSignedPct(comparison.deltaPct, locale)
      : null;

  let deltaCaption = "";
  if (pct && pct !== "—") {
    const base = `${t("Δ vs période précédente : ", "Δ vs previous window: ")}${pct}`;
    if (deltaHint === "up_good") deltaCaption = `${base} (${t("hausse favorable", "increase favorable")})`;
    else if (deltaHint === "down_good") deltaCaption = `${base} (${t("baisse favorable", "decrease favorable")})`;
    else deltaCaption = base;
  }

  const naCaption = t(
    "Δ vs période précédente : — (baseline nulle ou non comparable)",
    "Δ vs previous window: — (zero baseline or not comparable)"
  );

  return (
    <article className="analytic-metric-card" title={definitionTitle || ""}>
      <div className="analytic-metric-card__head">
        <h3 className="analytic-metric-card__title">{title}</h3>
        {timeframe ? <span className="analytic-metric-card__time">{timeframe}</span> : null}
      </div>
      <p className="analytic-metric-card__value">{value}</p>
      {comparison && pct && pct !== "—" ? (
        <p className={`analytic-metric-card__delta analytic-metric-card__delta--${deltaHint}`}>{deltaCaption}</p>
      ) : comparison ? (
        <p className="analytic-metric-card__delta analytic-metric-card__delta--neutral">{naCaption}</p>
      ) : null}
      {qualityFlag ? (
        <p className="analytic-metric-card__quality" role="status">
          {qualityFlag}
        </p>
      ) : null}
    </article>
  );
}
