import { IconHome } from "./icons.jsx";

/**
 * Raccourci vers l’accueil public McBuleli (même esprit que le sélecteur de langue).
 */
export default function HomeShortcut({ title, className = "", idPrefix = "home" }) {
  const t = title || "Accueil";
  return (
    <a
      id={`${idPrefix}-home-shortcut`}
      className={`btn-icon-toolbar ${className}`.trim()}
      href="/?site=public"
      title={t}
      aria-label={t}
    >
      <IconHome width={22} height={22} />
    </a>
  );
}
