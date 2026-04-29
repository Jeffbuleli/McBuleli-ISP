import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, publicAssetUrl } from "./api";
import { IconSend, IconX } from "./icons.jsx";
import { formatStaffRole } from "./staffRoleLabels.js";
import { sanitizeApiErrorForAudience } from "./httpErrorCopy.js";
import { isTeamChatPingSoundEnabled, setTeamChatPingSoundEnabled } from "./teamChatAlerts.js";

const URL_RE = /(https?:\/\/[^\s]+)/gi;

/** @ mention en cours de saisie : uniquement si @ est en début ou après un espace / retour (évite user@domaine). */
function getActiveMentionToken(text, caret) {
  if (caret == null || caret < 1) return null;
  const before = String(text || "").slice(0, caret);
  const m = before.match(/@([a-z0-9_]*)$/i);
  if (!m) return null;
  const tokenLen = m[0].length;
  const atIdx = caret - tokenLen;
  if (atIdx > 0) {
    const ch = text.charCodeAt(atIdx - 1);
    if (!(ch === 32 || ch === 9 || ch === 10 || ch === 13)) return null;
  }
  return { query: (m[1] || "").toLowerCase(), atIdx, tokenLen };
}

/** Met en évidence URLs + `@pseudo` dans le corps du message */
function chatMessageRichText(full) {
  const str = String(full || "");
  const urlParts = str.split(URL_RE);
  let keySeed = 0;
  function nextKey() {
    keySeed += 1;
    return keySeed;
  }
  function pushMentionsInPlain(seg, bucket) {
    const re = /(^|[\s])@([a-z0-9_]+)/gim;
    let last = 0;
    let m;
    while ((m = re.exec(seg)) !== null) {
      if (m.index > last) bucket.push(seg.slice(last, m.index));
      const lead = m[1];
      const handle = m[2];
      if (lead) bucket.push(lead);
      bucket.push(
        <span key={`mention-${nextKey()}`} className="dashboard-team-chat-mention">
          @{handle}
        </span>
      );
      last = m.index + m[0].length;
    }
    if (last < seg.length) bucket.push(seg.slice(last));
  }
  const out = [];
  for (let pi = 0; pi < urlParts.length; pi++) {
    const part = urlParts[pi];
    if (pi % 2 === 1) {
      let href = part;
      try {
        href = decodeURIComponent(part);
      } catch {
        /* keep */
      }
      out.push(
        <a key={`url-${nextKey()}`} href={href} target="_blank" rel="noopener noreferrer" className="dashboard-team-chat-link">
          {part}
        </a>
      );
    } else {
      pushMentionsInPlain(part, out);
    }
  }
  return out.length ? out : "";
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
  /** Caret dans le champ message (liste @) */
  const [caretPos, setCaretPos] = useState(0);
  const [mentionMembers, setMentionMembers] = useState([]);
  const [mentionHl, setMentionHl] = useState(0);
  const textareaRef = useRef(null);

  /** Compact chat handle editor when still on default backend username */
  const [handleDraft, setHandleDraft] = useState("");
  const [handleBusy, setHandleBusy] = useState(false);
  /** Desktop: position panel under measured sticky header (see updateDesktopDock). */
  const [desktopDock, setDesktopDock] = useState(null);
  const showHandleBanner = user && isDefaultChatUsername(user.chatUsername);

  /** After first successful load, failed polls no longer plaster a red banner */
  const loadOkRef = useRef(false);

  const reload = useCallback(async () => {
    if (!open || !ispId) return;
    const silent = loadOkRef.current;
    if (!silent) setLoading(true);
    try {
      const data = await api.getTeamChatMessages(ispId, { limit: 60 });
      setErr("");
      setItems(Array.isArray(data.items) ? data.items : []);
      loadOkRef.current = true;
    } catch (e) {
      const raw = String(e?.message || "");
      if (!loadOkRef.current) {
        setErr(sanitizeApiErrorForAudience(raw, user, isEn));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ispId, open, isEn, user]);

  const [soundAlerts, setSoundAlerts] = useState(() =>
    typeof window !== "undefined" ? isTeamChatPingSoundEnabled() : true
  );

  /** Une fois ouvert en session : demander la permission système pour les alertes (geste utilisateur). */
  const notifSessionRef = useRef(false);
  useEffect(() => {
    if (!open || notifSessionRef.current) return;
    if (typeof Notification === "undefined") return;
    const k = "mcb_team_chat_notif_prompt_done";
    if (window.sessionStorage.getItem(k) === "1") {
      notifSessionRef.current = true;
      return;
    }
    notifSessionRef.current = true;
    window.sessionStorage.setItem(k, "1");
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [open]);

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

  useEffect(() => {
    if (!open || !ispId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getTeamChatMembers(ispId);
        if (!cancelled) setMentionMembers(Array.isArray(data?.members) ? data.members : []);
      } catch {
        if (!cancelled) setMentionMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ispId]);

  const mentionToken = useMemo(() => getActiveMentionToken(draft, caretPos), [draft, caretPos]);

  const mentionFiltered = useMemo(() => {
    const base = mentionMembers.filter((row) =>
      Boolean(String(row.chatUsername || "").trim())
    );
    const q = mentionToken?.query ?? "";
    if (!q) return base.slice(0, 40);
    return base
      .filter((row) =>
        String(row.chatUsername || "")
          .toLowerCase()
          .startsWith(q)
      )
      .slice(0, 40);
  }, [mentionMembers, mentionToken]);

  useEffect(() => {
    const n = mentionFiltered.length;
    if (!n) {
      setMentionHl(0);
      return;
    }
    setMentionHl((h) => Math.min(h, n - 1));
  }, [mentionFiltered]);

  function applyMentionUsername(username) {
    const ta = textareaRef.current;
    const cur = draft;
    const caret = ta?.selectionStart ?? caretPos;
    const tok =
      caret != null ? getActiveMentionToken(cur, caret) : null;
    if (!tok || !username) return;
    const after = cur.slice(caret ?? 0);
    const insertion = `@${username} `;
    const next = `${cur.slice(0, tok.atIdx)}${insertion}${after}`;
    setDraft(next);
    const jump = tok.atIdx + insertion.length;
    queueMicrotask(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(jump, jump);
      }
      setCaretPos(jump);
    });
  }

  const updateDesktopDock = useCallback(() => {
    if (typeof window === "undefined" || isMobileShell) return;
    const stack = document.querySelector(".dashboard-sticky-stack");
    if (!stack) {
      const top = 120;
      setDesktopDock({
        top,
        maxHeight: Math.min(560, Math.max(260, window.innerHeight - top - 18))
      });
      return;
    }
    const r = stack.getBoundingClientRect();
    const top = Math.max(8, Math.round(r.bottom) + 8);
    const maxHeight = Math.min(560, Math.max(260, window.innerHeight - top - 16));
    setDesktopDock({ top, maxHeight });
  }, [isMobileShell]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || isMobileShell) {
      setDesktopDock(null);
      return undefined;
    }
    updateDesktopDock();
    const stack = document.querySelector(".dashboard-sticky-stack");
    const ro =
      typeof ResizeObserver !== "undefined" && stack ? new ResizeObserver(() => updateDesktopDock()) : null;
    if (stack && ro) ro.observe(stack);
    window.addEventListener("resize", updateDesktopDock);
    window.addEventListener("scroll", updateDesktopDock, true);
    const tick = window.setInterval(updateDesktopDock, 600);
    return () => {
      if (stack && ro) ro.disconnect();
      window.removeEventListener("resize", updateDesktopDock);
      window.removeEventListener("scroll", updateDesktopDock, true);
      window.clearInterval(tick);
    };
  }, [open, isMobileShell, updateDesktopDock]);

  /** Scroll once messages first appear — silent polls no longer toggle `loading`. */
  useLayoutEffect(() => {
    if (!open || loading) return;
    scrollToBottom();
  }, [open, loading, scrollToBottom]);

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
      setCaretPos(0);
      setItems((prev) => [...prev, msg]);
      queueMicrotask(() => scrollToBottom());
      void markRead();
    } catch (e) {
      setErr(sanitizeApiErrorForAudience(String(e?.message || ""), user, isEn));
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

  const desktopPopoverStyle =
    !isMobileShell && desktopDock
      ? { top: desktopDock.top, maxHeight: desktopDock.maxHeight }
      : undefined;

  return (
    <>
      {isMobileShell ? (
        // Voile sous le plein écran — la fermeture au tap « dehors » est gérée par l’écouteur document (même logique partout).
        <div className="dashboard-team-chat-backdrop" aria-hidden />
      ) : null}
    <div
      ref={rootRef}
      className={`dashboard-team-chat-popover${isMobileShell ? " dashboard-team-chat-popover--mobile" : ""}`}
      role="dialog"
      aria-labelledby="team-chat-heading"
      style={desktopPopoverStyle}
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
                    <div className="dashboard-team-chat-msg__text">{chatMessageRichText(m.content)}</div>
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
        <label className="dashboard-team-chat-sound-toggle">
          <input
            type="checkbox"
            checked={soundAlerts}
            onChange={(e) => {
              const on = e.target.checked;
              setTeamChatPingSoundEnabled(on);
              setSoundAlerts(on);
            }}
          />
          <span>
            {t(
              "Son + vibration quand un message arrive (app en arrière-plan ou chat fermé)",
              "Sound + vibration for new messages when the app is in the background or chat is closed"
            )}
          </span>
        </label>
        <div className="dashboard-team-chat-composer-wrap">
          {mentionToken ? (
            <div className="dashboard-team-chat-mention-pop" role="listbox" aria-label={t("Mentionner…", "Mention…")}>
              {!mentionFiltered.length ? (
                <div className="dashboard-team-chat-mention-empty">{t("Aucun collègue", "No teammate")}</div>
              ) : (
                mentionFiltered.map((row, ii) => {
                  const hl = ii === mentionHl;
                  const un =
                    typeof row.chatUsername === "string" ? row.chatUsername : "";
                  const label = row.fullName && String(row.fullName).trim() ? row.fullName : un;
                  return (
                    <button
                      key={row.userId || un || ii}
                      type="button"
                      role="option"
                      aria-selected={hl}
                      className={`dashboard-team-chat-mention-row${hl ? " dashboard-team-chat-mention-row--active" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMentionUsername(un);
                      }}
                    >
                      <span className="dashboard-team-chat-mention-handle">@{un}</span>
                      {label && label !== un ? (
                        <span className="dashboard-team-chat-mention-name">{label}</span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        <div className="dashboard-team-chat-composer-row">
        <textarea
          ref={textareaRef}
          className="dashboard-team-chat-input"
          rows={isMobileShell ? 3 : 2}
          maxLength={500}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            const p = e.target.selectionStart;
            setDraft(v);
            setCaretPos(Number.isFinite(p) ? p : v.length);
          }}
          onSelect={(e) => {
            const p = e.target.selectionStart;
            if (Number.isFinite(p)) setCaretPos(p);
          }}
          onClick={(e) => {
            const p = e.target.selectionStart;
            if (Number.isFinite(p)) setCaretPos(p);
          }}
          onKeyUp={(e) => {
            const p = e.target.selectionStart;
            if (Number.isFinite(p)) setCaretPos(p);
          }}
          placeholder={t("Votre message… (@ pour mentionner)", "Your message… (@ to mention)")}
          aria-label={t("Message", "Message")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              const caret = textareaRef.current?.selectionStart ?? caretPos;
              const tok = getActiveMentionToken(draft, caret);
              if (tok) {
                e.preventDefault();
                e.stopPropagation();
                const afterTok = caret;
                const next = draft.slice(0, tok.atIdx) + draft.slice(afterTok);
                setDraft(next);
                queueMicrotask(() => {
                  const ta = textareaRef.current;
                  if (ta) {
                    ta.focus();
                    ta.setSelectionRange(tok.atIdx, tok.atIdx);
                  }
                  setCaretPos(tok.atIdx);
                });
                return;
              }
            }
            if (mentionFiltered.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              const tokNow = getActiveMentionToken(
                draft,
                textareaRef.current?.selectionStart ?? caretPos
              );
              if (!tokNow) return;
              e.preventDefault();
              if (e.key === "ArrowDown") {
                setMentionHl((h) =>
                  Math.min(mentionFiltered.length - 1, h + 1)
                );
              } else {
                setMentionHl((h) => Math.max(0, h - 1));
              }
              return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
              const tokNow = getActiveMentionToken(
                draft,
                textareaRef.current?.selectionStart ?? caretPos
              );
              const pick =
                mentionFiltered[tokNow && mentionFiltered.length ? mentionHl : -1]?.chatUsername;
              if (
                tokNow &&
                mentionFiltered.length &&
                typeof pick === "string" &&
                pick.length &&
                (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))
              ) {
                e.preventDefault();
                applyMentionUsername(pick);
                return;
              }
            }
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
      </div>
    </div>
    </>
  );
}
