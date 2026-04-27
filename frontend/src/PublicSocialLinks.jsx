import { IconXSocial } from "./icons.jsx";

const MCBULELI_X_URL = "https://x.com/McBuleli";

/**
 * Lien réseau public (toolbar à côté des langues sur le site marketing).
 */
export default function PublicSocialLinks({ idPrefix = "social", titleFr, titleEn, isEn }) {
  const t = isEn
    ? titleEn || "McBuleli on X (opens in a new tab)"
    : titleFr || "McBuleli sur X (nouvel onglet)";
  return (
    <a
      id={`${idPrefix}-x`}
      className="btn-icon-toolbar btn-icon-toolbar--social"
      href={MCBULELI_X_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t}
      aria-label={t}
    >
      <IconXSocial width={20} height={20} />
    </a>
  );
}
