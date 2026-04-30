import { IconXSocial } from "./icons.jsx";

const MCBULELI_X_URL = "https://x.com/McBuleli";

/**
 * Lien réseau public (toolbar à côté des langues sur le site marketing).
 */
export default function PublicSocialLinks({ idPrefix = "social", titleFr, titleEn, isEn, compact = false }) {
  const t = isEn
    ? titleEn || "McBuleli on X (opens in a new tab)"
    : titleFr || "McBuleli sur X (nouvel onglet)";
  const s = compact ? 18 : 20;
  return (
    <a
      id={`${idPrefix}-x`}
      className={`btn-icon-toolbar btn-icon-toolbar--social${compact ? " btn-icon-toolbar--compact" : ""}`.trim()}
      href={MCBULELI_X_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t}
      aria-label={t}
    >
      <IconXSocial width={s} height={s} />
    </a>
  );
}
