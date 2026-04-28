import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, publicAssetUrl } from "./api";
import { IconX } from "./icons.jsx";
import { formatStaffRole } from "./staffRoleLabels.js";

const URL_RE = /(https?:\/\/[^\s]+)/gi;

function linkifyLine(text) {
  const s = String(text || "");
  const parts = s.split(URL_RE);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      let href = part;
      try {
        href = decodeURIComponent(part);
      } catch {
        /* keep */
      }
      return (
        <a key={`u${i}`} href={href} target="_blank" rel="noopener noreferrer" className="dashboard-team-chat-link">
          {part}
        </a>
      );
    }
    return part;
  });
}

function initialsFromUsername(name) {
  const t = String(name || "u").trim().slice(0, 2);
  return t.toUpperCase();
}

/** Default auto username from backend: u + 32 hex (no dashes) */
function isDefaultChatUsername(u) {
  return /^u[0-9a-f]{32}$/i.test(String(u || "").trim());
}

export default function TeamChatPanel({
  open,
  onClose,
  ispId,
  user,
  t,
  isEn,
  isMobileShell,
  onMarkReadComplete,
  onChatProfileSaved
}) {
  const rootRef = useRef(null);
  const listEndRef = useRef(null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  /** Compact chat handle editor when still on default backend username */
  const [handleDraft, setHandleDraft] = useState("");
  const [handleBusy, setHandleBusy] = useState(false);
  const showHandleBanner = user && isDefaultChatUsername(user.chatUsername);

  const reload = useCallback(async () => {
    if (!open || !ispId) return;
    setLoading(true);
    setErr("");
    try {
      const data = await api.getTeamChatMessages(ispId, { limit: 60 });
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setErr(String(e.message || ""));
    } finally {
      setLoading(false);
    }
  }, [ispId, open]);

  /** Mark workspace messages read when opening chat */
  const markRead = useCallback(async () => {
    if (!ispId) return;
    try {
      await api.postTeamChatRead(ispId);
      onMarkReadComplete?.();
    } catch (_e) {
      /* non-fatal */
    }
  }, [ispId, onMarkReadComplete]);

  useEffect(() => {
    if (open && showHandleBanner) setHandleDraft("");
  }, [open, showHandleBanner]);

  useEffect(() => {
    if (!open || !ispId) return undefined;
    void markRead();
    void reload();

    let iv = null;
    if (typeof window !== "undefined") {
      iv = window.setInterval(() => {
        void reload();
      }, 5000);
    }
    return () => {
      if (iv) window.clearInterval(iv);
    };
  }, [open, ispId, markRead, reload]);

  useLayoutEffect(() => {
    if (open && listEndRef.current) {
      listEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (typeof e.target?.closest === "function" && e.target.closest(".dashboard-team-chat-bell")) return;
      onClose?.();
    }
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("pointerdown", onDoc, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  async function onSend() {
    const text = String(draft || "").trim();
    if (!text || !ispId || sending) return;
    setSending(true);
    setErr("");
    try {
      const msg = await api.postTeamChatMessage(ispId, { content: text });
      setDraft("");
      setItems((prev) => [...prev, msg]);
      void markRead();
    } catch (e) {
      setErr(String(e.message || ""));
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!items.length || loadingMore || !ispId) return;
    const first = items[0];
    if (!first?.id) return;
    setLoadingMore(true);
    try {
      const data = await api.getTeamChatMessages(ispId, { limit: 40, before: first.id });
      const next = Array.isArray(data.items) ? data.items : [];
      if (next.length === 0) return;
      setItems((prev) => [...next, ...prev]);
    } catch (_e) {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }

  async function saveHandle(ev) {
    ev?.preventDefault?.();
    const h = String(handleDraft || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(h) || handleBusy) return;
    setHandleBusy(true);
    try {
      const out = await api.patchChatProfile({ chatUsername: h });
      onChatProfileSaved?.({
        chatUsername: out.chatUsername,
        chatAvatarUrl: out.chatAvatarUrl
      });
    } catch (_e) {
      setErr(isEn ? "Could not update chat username." : "Impossible de mettre à jour le pseudonyme.");
    } finally {
      setHandleBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      className={`dashboard-team-chat-popover${isMobileShell ? " dashboard-team-chat-popover--mobile" : ""}`}
      role="dialog"
      aria-label={t("Chat équipe", "Team chat")}
    >
      <div className="dashboard-team-chat-popover__head">
        <h2 className="dashboard-team-chat-popover__title">{t("Chat équipe", "Team chat")}</h2>
        <button
          type="button"
          className="btn-icon-toolbar"
          onClick={() => onClose?.()}
          aria-label={t("Fermer", "Close")}
        >
          <IconX width={20} height={20} />
        </button>
      </div>

      {showHandleBanner ? (
        <form className="dashboard-team-chat-handle" onSubmit={saveHandle}>
          <p className="dashboard-team-chat-handle__hint">
            {t(
              "Choisissez un pseudonyme visible par l’équipe (lettres minuscules, chiffres, _ ).",
              "Choose a visible chat handle (lowercase letters, digits, underscore)."
            )}
          </p>
          <div className="dashboard-team-chat-handle__row">
            <input
              className="dashboard-team-chat-handle__input"
              value={handleDraft}
              onChange={(e) => setHandleDraft(e.target.value)}
              maxLength={30}
              autoComplete="off"
              placeholder="team_ops"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={handleBusy}>
              {t("Enregistrer", "Save")}
            </button>
          </div>
        </form>
      ) : null}

      {err ? (
        <div role="alert" className="dashboard-team-chat-error">
          {err}
        </div>
      ) : null}

      <div className="dashboard-team-chat-popover__body">
        {loading ? (
          <p className="dashboard-team-chat-muted">{t("Chargement…", "Loading…")}</p>
        ) : (
          <ul className="dashboard-team-chat-list">
            <li className="dashboard-team-chat-loadmore">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadOlder()} disabled={loadingMore}>
                {loadingMore
                  ? t("Chargement…", "Loading…")
                  : t("Messages précédents", "Earlier messages")}
              </button>
            </li>
            {items.map((m, idx) => {
              const prev = items[idx - 1];
              const isMe = m.senderId === user?.id;
              const groupSame = prev?.senderId === m.senderId;
              const created = m.createdAt ? new Date(m.createdAt) : null;
              const ts =
                created && !Number.isNaN(created.getTime())
                  ? created.toLocaleString(isEn ? "en-US" : "fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short"
                    })
                  : "—";

              const avSrc = publicAssetUrl(m.sender?.chatAvatarUrl || "");

              const roleLabel = formatStaffRole(m.sender?.role, isEn);

              return (
                <li
                  key={m.id}
                  className={`dashboard-team-chat-msg${isMe ? " dashboard-team-chat-msg--me" : ""}${
                    groupSame ? " dashboard-team-chat-msg--grouped" : ""
                  }`}
                >
                  {!isMe && (
                    <div className="dashboard-team-chat-msg__avatarWrap" aria-hidden={groupSame}>
                      {!groupSame ? (
                        avSrc ? (
                          <img src={avSrc} alt="" className="dashboard-team-chat-msg__avatar" />
                        ) : (
                          <span className="dashboard-team-chat-msg__avatarFallback">
                            {initialsFromUsername(m.sender?.chatUsername)}
                          </span>
                        )
                      ) : (
                        <span className="dashboard-team-chat-msg__avatarPlaceholder" />
                      )}
                    </div>
                  )}
                  <div className="dashboard-team-chat-msg__bubble">
                    {!isMe && !groupSame ? (
                      <div className="dashboard-team-chat-msg__meta">
                        <span className="dashboard-team-chat-msg__name">{m.sender?.chatUsername || "—"}</span>
                        {m.sender?.role ? (
                          <span className="dashboard-team-chat-msg__role"> · {roleLabel}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="dashboard-team-chat-msg__text">{linkifyLine(m.content)}</div>
                    <div className="dashboard-team-chat-msg__foot">
                      <span className="dashboard-team-chat-msg__time">{ts}</span>
                      {isMe && typeof m.seenByCount === "number" && m.seenByCount > 0 ? (
                        <span className="dashboard-team-chat-msg__seen">
                          {t(
                            `Lu par ${m.seenByCount} personne(s)`,
                            `Seen by ${m.seenByCount} user(s)`
                          )}
                        </span>
                      ) : isMe ? (
                        <span className="dashboard-team-chat-msg__seen" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={listEndRef} />
      </div>

      <div className="dashboard-team-chat-popover__composer">
        <textarea
          className="dashboard-team-chat-input"
          rows={isMobileShell ? 2 : 2}
          maxLength={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("Écrire un message…", "Write a message…")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary dashboard-team-chat-send"
          disabled={sending || !String(draft).trim()}
          onClick={() => void onSend()}
        >
          {t("Envoyer", "Send")}
        </button>
      </div>
    </div>
  );
}
