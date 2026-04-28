import { useCallback, useMemo, useState } from "react";
import { api } from "./api.js";
import RichAnnouncementEditor, {
  ANNOUNCE_BODY_PLAIN_MAX,
  ANNOUNCE_TITLE_MAX
} from "./RichAnnouncementEditor.jsx";

const AUDIENCES = [
  { value: "staff", fr: "Équipe (tableau de bord)", en: "Staff (dashboard)" },
  { value: "portal", fr: "Clients (portail)", en: "Customers (portal)" },
  { value: "both", fr: "Équipe + clients", en: "Staff + customers" }
];

export default function IspAnnouncementsPanel({
  ispId,
  items,
  t,
  isEn,
  onRefresh
}) {
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [plainLen, setPlainLen] = useState(0);
  const [audience, setAudience] = useState("staff");
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const audLabels = useMemo(() => {
    const m = {};
    for (const a of AUDIENCES) {
      m[a.value] = isEn ? a.en : a.fr;
    }
    return m;
  }, [isEn]);

  const resetForm = useCallback(() => {
    setTitle("");
    setBodyHtml("<p></p>");
    setPlainLen(0);
    setAudience("staff");
    setSortOrder(0);
    setEditingId(null);
    setError("");
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const tit = String(title || "").trim();
    if (!tit) {
      setError(t("Titre requis.", "Title is required."));
      return;
    }
    if (tit.length > ANNOUNCE_TITLE_MAX) {
      setError(t("Titre trop long.", "Title too long."));
      return;
    }
    if (plainLen > ANNOUNCE_BODY_PLAIN_MAX) {
      setError(
        t(
          `Texte trop long (max. ${ANNOUNCE_BODY_PLAIN_MAX} caractères).`,
          `Text too long (max ${ANNOUNCE_BODY_PLAIN_MAX} characters).`
        )
      );
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.patchAnnouncement(ispId, editingId, {
          title: tit,
          bodyHtml,
          audience,
          sortOrder: Number(sortOrder) || 0,
          isActive: true
        });
      } else {
        await api.createAnnouncement(ispId, {
          title: tit,
          bodyHtml,
          audience,
          sortOrder: Number(sortOrder) || 0,
          isActive: true
        });
      }
      resetForm();
      await onRefresh();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm(t("Supprimer cette annonce ?", "Delete this announcement?"))) return;
    setSaving(true);
    try {
      await api.deleteAnnouncement(ispId, id);
      if (editingId === id) resetForm();
      await onRefresh();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(row) {
    setSaving(true);
    try {
      await api.patchAnnouncement(ispId, row.id, { isActive: !row.isActive });
      await onRefresh();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditingId(row.id);
    setTitle(row.title || "");
    setBodyHtml(row.bodyHtml || "<p></p>");
    setAudience(row.audience || "staff");
    setSortOrder(row.sortOrder ?? 0);
    setError("");
  }

  return (
    <section className="panel isp-announcements-panel" id="isp-announcements">
      <h2>{t("Annonces & messages", "Announcements & messages")}</h2>
      <p className="app-meta">
        {t(
          `Publiez jusqu’à plusieurs messages pour votre équipe et/ou vos abonnés (portail). Titre max. ${ANNOUNCE_TITLE_MAX} caractères ; corps max. ${ANNOUNCE_BODY_PLAIN_MAX} caractères (texte visible). Les messages « équipe » actifs s’affichent dans le panneau ouvert par la cloche de notification.`,
          `Publish messages for your team and/or subscribers (portal). Title max ${ANNOUNCE_TITLE_MAX} chars; body max ${ANNOUNCE_BODY_PLAIN_MAX} plain-text chars. Active staff messages appear in the panel opened from the notification bell.`
        )}
      </p>
      {error ? <p className="error">{error}</p> : null}
      <form className="isp-announcements-form" onSubmit={onSubmit}>
        <label>
          {t("Titre", "Title")}
          <input
            maxLength={ANNOUNCE_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("Objet de l’annonce", "Announcement subject")}
          />
        </label>
        <label>
          {t("Audience", "Audience")}
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {audLabels[a.value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Ordre (plus petit = en premier)", "Order (lower = first)")}
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
          />
        </label>
        <div>
          <span className="app-meta">
            {t("Message", "Message")} — {plainLen}/{ANNOUNCE_BODY_PLAIN_MAX}
          </span>
          <RichAnnouncementEditor
            valueHtml={bodyHtml}
            onChange={(html, pl) => {
              setBodyHtml(html);
              setPlainLen(pl);
            }}
            placeholder={t("Rédigez votre message…", "Write your message…")}
            t={t}
          />
        </div>
        <div className="isp-announcements-form__actions">
          <button type="submit" disabled={saving}>
            {editingId ? t("Mettre à jour", "Update") : t("Publier", "Publish")}
          </button>
          {editingId ? (
            <button type="button" className="btn-secondary-outline" onClick={resetForm} disabled={saving}>
              {t("Annuler l’édition", "Cancel edit")}
            </button>
          ) : null}
        </div>
      </form>
      <div className="isp-announcements-list">
        <h3>{t("Annonces existantes", "Existing announcements")}</h3>
        {!items?.length ? (
          <p className="app-meta">{t("Aucune annonce.", "No announcements yet.")}</p>
        ) : (
          <ul className="isp-announcements-list__ul">
            {items.map((row) => (
              <li key={row.id} className="isp-announcements-list__li">
                <div>
                  <strong>{row.title}</strong>{" "}
                  <span className="app-meta">
                    ({audLabels[row.audience] || row.audience}) · {row.isActive ? "●" : "○"}
                  </span>
                </div>
                <div className="isp-announcements-list__actions">
                  <button type="button" onClick={() => startEdit(row)} disabled={saving}>
                    {t("Modifier", "Edit")}
                  </button>
                  <button type="button" onClick={() => onToggleActive(row)} disabled={saving}>
                    {row.isActive ? t("Désactiver", "Deactivate") : t("Activer", "Activate")}
                  </button>
                  <button type="button" onClick={() => onDelete(row.id)} disabled={saving}>
                    {t("Supprimer", "Delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
