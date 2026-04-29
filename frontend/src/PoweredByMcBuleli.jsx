import { mcbuleliLogoUrl } from "./brandAssets.js";

/**
 * Ligne compacte : petit logo McBuleli + « Propulsé par » / « Powered by » + nom en gras.
 */
export default function PoweredByMcBuleli({ poweredByLabel, className = "", logoSize = 20 }) {
  const s = Math.round(Number(logoSize) || 20);
  return (
    <div className={`mcbuleli-powered-line ${className}`.trim()}>
      <img
        src={mcbuleliLogoUrl}
        alt=""
        width={s}
        height={s}
        className="mcbuleli-powered-line__logo"
        decoding="async"
      />
      <p className="mcbuleli-powered-line__text">
        <span className="mcbuleli-powered-line__prefix">{poweredByLabel}</span>{" "}
        <strong className="mcbuleli-powered-line__brand">McBuleli</strong>
      </p>
    </div>
  );
}
