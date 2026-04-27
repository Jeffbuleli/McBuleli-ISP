import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import RichAnnouncementEditor, {
  PUBLIC_PAGE_BODY_PLAIN_MAX,
  PUBLIC_PAGE_TITLE_MAX
} from "./RichAnnouncementEditor.jsx";

function plainTextLength(html) {
  if (typeof document === "undefined") return String(html || "").replace(/<[^>]*>/g, " ").trim().length;
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/\s+/g, " ").trim().length;
}

const SLOT_DEFS = [
  {
    key: "hero_top",
    fr: "Entre le nom McBuleli et la navigation (compact)",
    en: "Between McBuleli brand and navigation (compact)"
  },
  {
    key: "after_why",
    fr: "Après « Pourquoi choisir McBuleli… » (grande bannière)",
    en: 'After "Why choose McBuleli…" (large banner)'
  },
  {
    key: "after_services",
    fr: "Après la grille « Nos services »",
    en: 'After the "Our services" grid'
  },
  {
    key: "footer_strip",
    fr: "Bandeau long en bas de page (annonce)",
    en: "Long strip at bottom (announcement)"
  }
];

function slotLabel(key, isEn) {
  const d = SLOT_DEFS.find((s) => s.key === key);
  if (!d) return key;
  return isEn ? d.en : d.fr;
}

export default function PlatformPublicPagePanel({ t, isEn }) {
  const [slots, setSlots] = useState([]);
  const [edits, setEdits] = useState({});
  const [plainLens, setPlainLens] = useState({});
  const [openKey, setOpenKey] = useState("hero_top");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const mergeEdits = useCallback((list) => {
    const e = {};
    const pl = {};
    for (const s of list) {
      const bodyHtml = s.bodyHtml && String(s.bodyHtml).trim() ? s.bodyHtml : "<p></p>";
      e[s.slotKey] = {
        title: s.title ?? "",
        bodyHtml,
        linkUrl: s.linkUrl ?? "",
        isActive: s.isActive !== false
      };
      pl[s.slotKey] = plainTextLength(bodyHtml);
    }
    setEdits(e);
    setPlainLens(pl);
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.getSystemOwnerPublicPageSlots();
      const list = data.slots || [];
      setSlots(list);
      mergeEdits(list);
    } catch (err) {
      setError(err.message || "Error");
    }
  }, [mergeEdits]);

  useEffect(() => {
    load();
  }, [load]);

  const byKey = useMemo(() => {
    const m = {};
    for (const s of slots) m[s.slotKey] = s;
    return m;
  }, [slots]);

  async function onSaveMeta(slotKey) {
    const ed = edits[slotKey];
    if (!ed) return;
    const tit = String(ed.title || "").trim();
    if (tit.length > PUBLIC_PAGE_TITLE_MAX) {
      setError(t("Titre trop long.", "Title too long."));
      return;
    }
    const pl = plainLens[slotKey] ?? 0;
    if (pl > PUBLIC_PAGE_BODY_PLAIN_MAX) {
      setError(
        t(
          `Texte trop long (max. ${PUBLIC_PAGE_BODY_PLAIN_MAX}).`,
          `Text too long (max ${PUBLIC_PAGE_BODY_PLAIN_MAX}).`
        )
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.patchSystemOwnerPublicPageSlot(slotKey, {
        title: tit,
        bodyHtml: ed.bodyHtml,
        linkUrl: ed.linkUrl.trim() || null,
        isActive: ed.isActive
      });
      await load();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadImage(slotKey, e) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    setSaving(true);
    setError("");
    try {
      await api.uploadSystemOwnerPublicPageSlotImage(slotKey, f);
      input.value = "";
      await load();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteImage(slotKey) {
    if (!window.confirm(t("Supprimer l'image de ce bloc ?", "Remove this block's image?"))) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteSystemOwnerPublicPageSlotImage(slotKey);
      await load();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" id="platform-public-home">
      <h2>{t("Contenu page d'accueil publique", "Public home page content")}</h2>
      <p className="app-meta" style={{ maxWidth: "56rem", marginBottom: 12 }}>
        {t(
          "Quatre emplacements visibles sur mcbuleli.com (ou votre domaine marketing). Même éditeur riche que les annonces FAI. Images PNG, JPEG, WebP ou GIF.",
          "Four slots on the public marketing home. Same rich editor as ISP announcements. Images: PNG, JPEG, WebP or GIF."
        )}
      </p>
      {error ? <p className="error">{error}</p> : null}

      <div className="platform-public-slots">
        {SLOT_DEFS.map(({ key }) => {
          const row = byKey[key];
          const ed = edits[key] || { title: "", bodyHtml: "<p></p>", linkUrl: "", isActive: true };
          const expanded = openKey === key;
          return (
            <div key={key} className="platform-public-slot panel" style={{ margin: 0 }}>
              <button
                type="button"
                className="platform-public-slot__head"
                onClick={() => setOpenKey(expanded ? "" : key)}
                aria-expanded={expanded}
              >
                <strong>{slotLabel(key, isEn)}</strong>
                <span className="app-meta">{key}</span>
              </button>
              {expanded ? (
                <div className="platform-public-slot__body">
                  {row?.imageUrl ? (
                    <p style={{ margin: "8px 0" }}>
                      <img
                        src={row.imageUrl}
                        alt=""
                        style={{ maxWidth: "100%", maxHeight: 140, objectFit: "contain" }}
                      />
                    </p>
                  ) : (
                    <p className="app-meta">{t("Aucune image", "No image yet")}</p>
                  )}
                  <label style={{ display: "block", marginBottom: 8 }}>
                    {t("Fichier image", "Image file")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={saving}
                      onChange={(e) => onUploadImage(key, e)}
                      style={{ display: "block", marginTop: 6 }}
                    />
                  </label>
                  {row?.imageUrl ? (
                    <p>
                      <button type="button" className="btn-secondary-outline" disabled={saving} onClick={() => onDeleteImage(key)}>
                        {t("Supprimer l'image", "Remove image")}
                      </button>
                    </p>
                  ) : null}
                  <label style={{ display: "block", marginBottom: 6 }}>
                    {t("Titre (optionnel)", "Title (optional)")}
                    <input
                      value={ed.title}
                      maxLength={PUBLIC_PAGE_TITLE_MAX}
                      disabled={saving}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [key]: { ...ed, title: e.target.value }
                        }))
                      }
                      style={{ display: "block", marginTop: 6, width: "100%", maxWidth: 480 }}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 6 }}>
                    {t("Lien optionnel (https://…)", "Optional link (https://…)")}
                    <input
                      placeholder="https://"
                      value={ed.linkUrl}
                      disabled={saving}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [key]: { ...ed, linkUrl: e.target.value }
                        }))
                      }
                      style={{ display: "block", marginTop: 6, width: "100%", maxWidth: 480 }}
                    />
                  </label>
                  <RichAnnouncementEditor
                    valueHtml={ed.bodyHtml}
                    onChange={(html, len) => {
                      setEdits((prev) => ({
                        ...prev,
                        [key]: { ...ed, bodyHtml: html }
                      }));
                      setPlainLens((prev) => ({ ...prev, [key]: len }));
                    }}
                    t={t}
                  />
                  <p className="app-meta">
                    {(plainLens[key] ?? 0) > PUBLIC_PAGE_BODY_PLAIN_MAX ? (
                      <span className="error">
                        {t("Texte trop long.", "Text too long.")}{" "}
                      </span>
                    ) : null}
                    {plainLens[key] ?? 0} / {PUBLIC_PAGE_BODY_PLAIN_MAX}
                  </p>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={ed.isActive}
                      disabled={saving}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [key]: { ...ed, isActive: e.target.checked }
                        }))
                      }
                    />
                    {t("Afficher sur le site public", "Show on public site")}
                  </label>
                  <p style={{ marginTop: 12 }}>
                    <button type="button" disabled={saving} onClick={() => onSaveMeta(key)}>
                      {saving ? "…" : t("Enregistrer texte & lien", "Save text & link")}
                    </button>
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
