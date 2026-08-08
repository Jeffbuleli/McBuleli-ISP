import { IconHome } from "./icons.jsx";

/**
 * Raccourci vers l’accueil public McBuleli (icône seule).
 */
export default function HomeShortcut({ title, className = "", idPrefix = "home" }) {
  const t = title || "Accueil";
  return (
    <a
      id={`${idPrefix}-home-shortcut`}
      className={`btn-icon-toolbar app-home-shortcut ${className}`.trim()}
      href="/?site=public"
      title={t}
      aria-label={t}
    >
      <IconHome width={24} height={24} className="home-shortcut__icon" />
    </a>
  );
}
