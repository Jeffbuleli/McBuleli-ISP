import { useEffect, useRef } from "react";
import { IconBell, IconMail } from "./icons.jsx";

const TITLE_MAX = 52;
const SNIPPET_MAX = 140;

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

export default function DashboardAnnouncementsBell({
  items,
  t,
  open,
  onOpenChange,
  variant,
  canManage,
  onManageAnnouncements
}) {
  const rootRef = useRef(null);
  const list = Array.isArray(items) ? items : [];
  const count = list.length;

  const buttonClass =
    variant === "mobile"
      ? "dashboard-mobile-icon-btn dashboard-mobile-icon-btn--toolbar"
      : "btn-icon-toolbar";
  const iconSize = variant === "mobile" ? 18 : 22;

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (rootRef.current?.contains(e.target)) return;
      onOpenChange(false);
    }
    function onKey(e) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="dashboard-announcements-bell" ref={rootRef}>
      <button
        type="button"
        className={buttonClass}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("Messages de l'entreprise", "Company messages")}
        title={t("Messages de l'entreprise", "Company messages")}
        onClick={() => onOpenChange(!open)}
      >
        <IconBell width={iconSize} height={iconSize} />
        {count > 0 ? (
          <span
            className={
              variant === "mobile"
                ? "dashboard-mobile-badge"
                : "dashboard-announcements-bell-badge"
            }
          >
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="dashboard-announcements-popover"
          role="dialog"
          aria-label={t("Messages de l'entreprise", "Company messages")}
        >
          <div className="dashboard-announcements-popover__body">
            {list.length === 0 ? (
              <p className="dashboard-announcements-popover__empty">
                {t("Aucun message pour le moment.", "No messages right now.")}
              </p>
            ) : (
              <ul className="dashboard-announcements-popover__list">
                {list.map((a) => {
                  const snippetRaw = stripHtml(a.bodyHtml);
                  const snippet = snippetRaw
                    ? truncate(snippetRaw, SNIPPET_MAX)
                    : "";
                  return (
                    <li key={a.id} className="dashboard-announcements-popover__item">
                      <span className="dashboard-announcements-popover__item-icon" aria-hidden>
                        <IconMail width={16} height={16} />
                      </span>
                      <div className="dashboard-announcements-popover__item-text">
                        <div className="dashboard-announcements-popover__title">
                          {truncate(a.title || "—", TITLE_MAX)}
                        </div>
                        {snippet ? (
                          <div className="dashboard-announcements-popover__snippet">{snippet}</div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {canManage ? (
            <div className="dashboard-announcements-popover__foot">
              <button type="button" className="dashboard-announcements-popover__manage" onClick={onManageAnnouncements}>
                {t("Gérer les messages", "Manage messages")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
