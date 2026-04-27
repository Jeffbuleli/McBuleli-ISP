function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(str, max) {
  const s = String(str || "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Annonces compactes sous la barre d’entête (remplace l’ancien emplacement du sous-menu). */
export default function DashboardHeaderAnnouncements({ items, t, isFieldAgent }) {
  if (isFieldAgent || !Array.isArray(items) || !items.length) return null;
  const list = items.slice(0, 2);
  const extra = items.length - list.length;

  return (
    <div className="dashboard-header-announcements" role="region" aria-label={t("Annonces", "Announcements")}>
      <span className="dashboard-header-announcements__label">{t("Annonces", "Announcements")}</span>
      <div className="dashboard-header-announcements__chips">
        {list.map((a) => {
          const snippet = truncate(stripHtml(a.bodyHtml), 44);
          return (
            <a key={a.id} href="#isp-announcements" className="dashboard-header-announcements__chip">
              <span className="dashboard-header-announcements__chip-title">{truncate(a.title || "—", 34)}</span>
              {snippet ? (
                <span className="dashboard-header-announcements__chip-snippet">{snippet}</span>
              ) : null}
            </a>
          );
        })}
      </div>
      {extra > 0 ? (
        <a href="#isp-announcements" className="dashboard-header-announcements__more">
          +{extra}
        </a>
      ) : null}
    </div>
  );
}
