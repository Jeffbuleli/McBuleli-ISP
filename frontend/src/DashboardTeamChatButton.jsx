import { IconChatBubble } from "./icons.jsx";

/**
 * Header toolbar: opens team chat overlay. Unread badge caps at "10+".
 */
export default function DashboardTeamChatButton({ unreadCount, t, variant, onClick }) {
  const n = typeof unreadCount === "number" ? unreadCount : 0;
  const label = t("Chat équipe interne", "Internal team chat");

  const badgeText = n >= 10 ? "10+" : n > 0 ? String(n) : null;

  const buttonClass =
    variant === "mobile"
      ? "dashboard-mobile-icon-btn dashboard-mobile-icon-btn--toolbar"
      : "btn-icon-toolbar";
  const iconSize = variant === "mobile" ? 18 : 22;

  return (
    <div className="dashboard-team-chat-bell">
      <button
        type="button"
        className={buttonClass}
        aria-label={label}
        title={label}
        onClick={() => onClick?.()}
      >
        <IconChatBubble width={iconSize} height={iconSize} aria-hidden />
        {badgeText ? (
          <span
            className={
              variant === "mobile" ? "dashboard-mobile-badge" : "dashboard-team-chat-bell-badge"
            }
          >
            {badgeText}
          </span>
        ) : null}
      </button>
    </div>
  );
}
