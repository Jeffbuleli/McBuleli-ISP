import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, publicAssetUrl } from "./api";
import { IconSend, IconX } from "./icons.jsx";
import { formatStaffRole } from "./staffRoleLabels.js";
import { friendlyTransientError } from "./httpErrorCopy.js";

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

  /** After first successful load, failed polls no longer plaster a red banner */
  const loadOkRef = useRef(false);

  const reload = useCallback(async () => {
    if (!open || !ispId) return;
    setLoading(true);
    try {
      const data = await api.getTeamChatMessages(ispId, { limit: 60 });
      setErr("");
      setItems(Array.isArray(data.items) ? data.items : []);
      loadOkRef.current = true;
    } catch (e) {
      const raw = String(e?.message || "");
      if (!loadOkRef.current) {
        setErr(friendlyTransientError(raw, isEn));
      }
    } finally {
      setLoading(false);
    }
  }, [ispId, open, isEn]);

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
    loadOkRef.current = false;
    setErr("");
  }, [ispId]);

  useEffect(() => {
    if (!open) loadOkRef.current = false;
  }, [open]);

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
      setErr(friendlyTransientError(String(e?.message || ""), isEn));
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
      setErr(
        isEn
          ? "We couldn’t save that name. Letters, numbers and _ only (3–30)."
          : "Impossible d’enregistrer ce nom. Lettres minuscules, chiffres et _ (3 à 30 car.)."
      );
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
      aria-labelledby="team-chat-heading"
    >
      <div className="dashboard-team-chat-popover__head">
        <div className="dashboard-team-chat-popover__head-text">
          <h2 id="team-chat-heading" className="dashboard-team-chat-popover__title">
            {t("Discussion équipe", "Team chat")}
          </h2>
          <p className="dashboard-team-chat-popover__subtitle">
            {t(
              "Réservé à votre équipe sur cet espace — rien ne sort vers l’extérieur.",
              "Staff-only on this workspace — nothing leaves your team."
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn-icon-toolbar dashboard-team-chat-popover__close"
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
              "Comment doit-on vous appeler ici ? (lettres sans accent, chiffres ou _ , entre 3 et 30 car.)",
              "How should teammates see you here? Use letters, digits or _ (3–30 characters)."
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
          <span className="dashboard-team-chat-error__text">{err}</span>
          <button
            type="button"
            className="dashboard-team-chat-error__dismiss"
            onClick={() => setErr("")}
            aria-label={t("Masquer", "Dismiss")}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="dashboard-team-chat-popover__body">
        {loading ? (
          <p className="dashboard-team-chat-muted">{t("Chargement…", "Loading…")}</p>
        ) : (
          <ul className="dashboard-team-chat-list">
            <li className="dashboard-team-chat-loadmore">
              <button
                type="button"
                className="dashboard-team-chat-loadmore-btn"
                onClick={() => void loadOlder()}
                disabled={loadingMore}
              >
                {loadingMore ? t("Chargement…", "Loading…") : t("Voir plus haut", "Load older")}
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
                          {m.seenByCount === 1
                            ? t("Vu par 1 collègue", "Seen by 1 teammate")
                            : t(`Vu par ${m.seenByCount} collègues`, `Seen by ${m.seenByCount} teammates`)}
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
          rows={isMobileShell ? 3 : 2}
          maxLength={500}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("Votre message…", "Your message…")}
          aria-label={t("Message", "Message")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
        <button
          type="button"
          className="dashboard-team-chat-sendBtn"
          disabled={sending || !String(draft).trim()}
          onClick={() => void onSend()}
          title={t("Envoyer", "Send")}
          aria-label={t("Envoyer le message", "Send message")}
        >
          <IconSend width={22} height={22} />
        </button>
      </div>
    </div>
  );
}
