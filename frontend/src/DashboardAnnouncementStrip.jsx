/**
 * Jusqu’à 3 annonces FAI (HTML assaini côté serveur) sous le bandeau du tableau de bord.
 */
export default function DashboardAnnouncementStrip({ items, t, variant = "default" }) {
  const list = Array.isArray(items) ? (variant === "wide" ? items : items.slice(0, 3)) : [];
  if (!list.length) return null;
  return (
    <section
      className={`dashboard-announcement-strip${variant === "wide" ? " dashboard-announcement-strip--wide" : ""}`}
      aria-label={t("Annonces", "Announcements")}
    >
      <div
        className={`dashboard-announcement-strip__grid${
          variant === "wide" ? " dashboard-announcement-strip__grid--wide" : ""
        }`}
      >
        {list.map((a) => (
          <article key={a.id} className="dashboard-announcement-card">
            <h3 className="dashboard-announcement-card__title">{a.title}</h3>
            <div
              className="dashboard-announcement-card__body"
              dangerouslySetInnerHTML={{ __html: a.bodyHtml || "" }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
