import { IconMail } from "./icons.jsx";

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
export default function DashboardHeaderAnnouncements({ items, t, isFieldAgent, onOpenAnnouncements }) {
  if (isFieldAgent || !Array.isArray(items) || !items.length) return null;
  const list = items.slice(0, 2);
  const extra = items.length - list.length;
  const AnnLink = onOpenAnnouncements ? "button" : "a";
  const annProps = onOpenAnnouncements
    ? { type: "button", onClick: onOpenAnnouncements }
    : { href: "#isp-announcements" };

  return (
    <div className="dashboard-header-announcements" role="region" aria-label={t("Annonces", "Announcements")}>
      <div className="dashboard-header-announcements__head">
        <span className="dashboard-header-announcements__icon-wrap" aria-hidden>
          <IconMail width={18} height={18} />
        </span>
        <span className="dashboard-header-announcements__label">{t("Annonces", "Announcements")}</span>
      </div>
      <div className="dashboard-header-announcements__chips">
        {list.map((a) => {
          const snippet = truncate(stripHtml(a.bodyHtml), 44);
          return (
            <AnnLink key={a.id} className="dashboard-header-announcements__chip" {...annProps}>
              <span className="dashboard-header-announcements__chip-title">{truncate(a.title || "—", 34)}</span>
              {snippet ? (
                <span className="dashboard-header-announcements__chip-snippet">{snippet}</span>
              ) : null}
            </AnnLink>
          );
        })}
      </div>
      {extra > 0 ? (
        <AnnLink className="dashboard-header-announcements__more" {...annProps}>
          +{extra}
        </AnnLink>
      ) : null}
    </div>
  );
}
