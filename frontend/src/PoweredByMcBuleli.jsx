import { mcbuleliLogoUrl } from "./brandAssets.js";

const MCBULELI_X_URL = "https://x.com/McBuleli";

/**
 * Same pattern as mcbuleli.org: Powered by (logo) McBuleli → https://x.com/McBuleli
 * `poweredByLabel` is ignored (always English "Powered by").
 */
export default function PoweredByMcBuleli({
  poweredByLabel: _poweredByLabel,
  className = "",
  logoSize = 24
}) {
  const s = Math.max(16, Math.round(Number(logoSize) || 24));
  return (
    <div className={`mcbuleli-powered-line ${className}`.trim()}>
      <span className="mcbuleli-powered-line__prefix">Powered by</span>
      <span
        className="mcbuleli-powered-line__mark"
        aria-hidden="true"
        style={{ width: s, height: s }}
      >
        <img
          src={mcbuleliLogoUrl}
          alt=""
          width={s}
          height={s}
          className="mcbuleli-powered-line__logo"
          decoding="async"
          style={{ width: s, height: s }}
        />
      </span>
      <a
        className="mcbuleli-powered-line__brand"
        href={MCBULELI_X_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        McBuleli
      </a>
    </div>
  );
}
