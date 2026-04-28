import { mobileScreenForNavHash } from "./dashboardNavCategories.js";

/**
 * Full dashboard section list for PWA (matches desktop sidebar categories).
 */
export default function DashboardMobileSheetMenu({
  open,
  onClose,
  categories,
  navigateMobileScreen,
  t
}) {
  if (!open) return null;

  function go(href) {
    const screen = mobileScreenForNavHash(href);
    navigateMobileScreen(screen);
    onClose();
    const hash = href.startsWith("#") ? href : `#${href}`;
    window.requestAnimationFrame(() => {
      if (window.location.hash !== hash) {
        window.location.hash = hash;
      }
      window.setTimeout(() => {
        try {
          document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch {
          /* ignore */
        }
      }, 220);
    });
  }

  return (
    <div
      className="dashboard-mobile-menu-scrim"
      role="presentation"
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className="dashboard-mobile-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("Toutes les sections", "All sections")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dashboard-mobile-menu-head">
          <h2 className="dashboard-mobile-menu-title">{t("Navigation", "Navigation")}</h2>
          <button type="button" className="dashboard-mobile-menu-close" onClick={onClose}>
            {t("Fermer", "Close")}
          </button>
        </div>
        <div className="dashboard-mobile-menu-body">
          {categories.map((cat) => {
            const Icon = cat.Icon;
            return (
              <section key={cat.id} className="dashboard-mobile-menu-block">
                <div className="dashboard-mobile-menu-cat">
                  <span className="dashboard-mobile-menu-cat-icon" aria-hidden>
                    <Icon width={18} height={18} />
                  </span>
                  <span className="dashboard-mobile-menu-cat-label">{cat.label}</span>
                </div>
                <ul className="dashboard-mobile-menu-items">
                  {cat.items.map((item) => (
                    <li key={item.href}>
                      <button type="button" className="dashboard-mobile-menu-link" onClick={() => go(item.href)}>
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
