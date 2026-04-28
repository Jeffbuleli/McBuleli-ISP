/**
 * Bottom sheet listing the same links as the desktop public nav (PWA / narrow viewports).
 */
export default function PublicMobileNavMenu({ open, onClose, title, closeLabel, items }) {
  if (!open) return null;

  return (
    <div className="dashboard-mobile-menu-scrim" role="presentation" onClick={onClose} aria-hidden={!open}>
      <div
        id="public-mobile-nav"
        className="dashboard-mobile-menu-panel public-mobile-nav-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dashboard-mobile-menu-head">
          <h2 className="dashboard-mobile-menu-title">{title}</h2>
          <button type="button" className="dashboard-mobile-menu-close" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        <div className="dashboard-mobile-menu-body">
          <ul className="dashboard-mobile-menu-items public-mobile-nav-sheet__list">
            {items.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="dashboard-mobile-menu-link" onClick={onClose}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
