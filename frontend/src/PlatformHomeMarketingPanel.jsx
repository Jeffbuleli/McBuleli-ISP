import { useCallback, useEffect, useRef, useState } from "react";
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

export default function PlatformHomeMarketingPanel({ t, isEn }) {
  const [promoSlots, setPromoSlots] = useState([]);
  const [promoEdits, setPromoEdits] = useState({});
  const [footerItems, setFooterItems] = useState([]);
  const [faqAdItems, setFaqAdItems] = useState([]);
  const [faqAdEditById, setFaqAdEditById] = useState({});
  const [faqNew, setFaqNew] = useState({
    internalLabel: "",
    sortOrder: 0,
    linkUrl: "",
    altTextFr: "",
    altTextEn: "",
    captionFr: "",
    captionEn: "",
    isActive: true
  });
  const [footerForm, setFooterForm] = useState({
    title: "",
    bodyHtml: "<p></p>",
    linkUrl: "",
    sortOrder: 0,
    plainLen: 0,
    layout: "wide",
    placement: "after_why"
  });
  const [editingFooterId, setEditingFooterId] = useState(null);
  const [editingFooter, setEditingFooter] = useState(null);
  const [founder, setFounder] = useState({ caption: "", imageUrl: null });
  const [founderCaptionEdit, setFounderCaptionEdit] = useState("");
  const [founderLoadError, setFounderLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const footerCreateImageInputRef = useRef(null);
  const faqNewImageInputRef = useRef(null);
  const [authCopyFr, setAuthCopyFr] = useState("");
  const [authCopyEn, setAuthCopyEn] = useState("");
  const [authCopyUpdatedAt, setAuthCopyUpdatedAt] = useState(null);

  const loadPromos = useCallback(async () => {
    const data = await api.getSystemOwnerHomePromos();
    const slots = data.slots || [];
    setPromoSlots(slots);
    const e = {};
    for (const s of slots) {
      e[s.slotIndex] = {
        linkUrl: s.linkUrl ?? "",
        altTextFr: s.altTextFr ?? "",
        altTextEn: s.altTextEn ?? "",
        captionFr: s.captionFr ?? "",
        captionEn: s.captionEn ?? "",
        orientation: s.orientation === "square" ? "square" : "landscape",
        isActive: s.isActive !== false
      };
    }
    setPromoEdits(e);
  }, []);

  const loadFooter = useCallback(async () => {
    const data = await api.getSystemOwnerFooterBlocks();
    setFooterItems(data.items || []);
  }, []);

  const loadFaqAds = useCallback(async () => {
    const data = await api.getSystemOwnerFaqAds();
    setFaqAdItems(data.items || []);
  }, []);

  const loadFounder = useCallback(async () => {
    const data = await api.getSystemOwnerFounderShowcase();
    setFounder({
      caption: data.caption ?? "",
      imageUrl: data.imageUrl ?? null
    });
    setFounderCaptionEdit(data.caption ?? "");
  }, []);

  const loadAuthCopy = useCallback(async () => {
    const data = await api.getSystemOwnerAuthCopy();
    setAuthCopyFr(data.forgotPasswordBodyFr ?? "");
    setAuthCopyEn(data.forgotPasswordBodyEn ?? "");
    setAuthCopyUpdatedAt(data.updatedAt ?? null);
  }, []);

  useEffect(() => {
    setFaqAdEditById((prev) => {
      const next = { ...prev };
      for (const it of faqAdItems) {
        if (next[it.id] == null) {
          next[it.id] = {
            internalLabel: it.internalLabel || "",
            sortOrder: Number(it.sortOrder) || 0,
            linkUrl: it.linkUrl || "",
            altTextFr: it.altTextFr || "",
            altTextEn: it.altTextEn || "",
            captionFr: it.captionFr || "",
            captionEn: it.captionEn || "",
            isActive: it.isActive !== false
          };
        }
      }
      const ids = new Set(faqAdItems.map((x) => x.id));
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
  }, [faqAdItems]);

  const loadAll = useCallback(async () => {
    setError("");
    setFounderLoadError("");
    try {
      await Promise.all([loadPromos(), loadFooter(), loadFaqAds()]);
    } catch (err) {
      setError(err.message || "Error");
    }
    try {
      await loadAuthCopy();
    } catch (_e) {
      /* optional block — avoid blocking promos/footer if auth-copy fails */
    }
    try {
      await loadFounder();
    } catch (err) {
      setFounderLoadError(err.message || "Error");
    }
  }, [loadPromos, loadFooter, loadFaqAds, loadFounder, loadAuthCopy]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function onPromoUpload(slot, e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSaving(true);
    setError("");
    try {
      await api.uploadSystemOwnerHomePromoImage(slot, f);
      e.target.value = "";
      await loadPromos();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onPromoClearImage(slot) {
    if (!window.confirm(t("Supprimer l'image de cette case ?", "Remove this slot's image?"))) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteSystemOwnerHomePromoImage(slot);
      await loadPromos();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onFounderSaveCaption() {
    setSaving(true);
    setError("");
    try {
      const updated = await api.patchSystemOwnerFounderShowcase({ caption: founderCaptionEdit });
      setFounder({ caption: updated.caption ?? "", imageUrl: updated.imageUrl ?? founder.imageUrl });
      setFounderCaptionEdit(updated.caption ?? "");
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onFounderUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.uploadSystemOwnerFounderShowcaseImage(f, founderCaptionEdit);
      e.target.value = "";
      setFounder({ caption: updated.caption ?? founder.caption, imageUrl: updated.imageUrl ?? null });
      setFounderCaptionEdit(updated.caption ?? founderCaptionEdit);
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onFounderClearImage() {
    if (!window.confirm(t("Supprimer la photo du pied de page ?", "Remove the footer portrait photo?"))) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.deleteSystemOwnerFounderShowcaseImage();
      setFounder({ caption: updated.caption ?? founder.caption, imageUrl: null });
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onPromoSaveMeta(slot) {
    const ed = promoEdits[slot];
    if (!ed) return;
    setSaving(true);
    setError("");
    try {
      await api.patchSystemOwnerHomePromo(slot, {
        linkUrl: ed.linkUrl.trim() || null,
        altTextFr: ed.altTextFr.trim() || null,
        altTextEn: ed.altTextEn.trim() || null,
        captionFr: ed.captionFr.trim() || null,
        captionEn: ed.captionEn.trim() || null,
        orientation: ed.orientation,
        isActive: ed.isActive
      });
      await loadPromos();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateFooter(e) {
    e.preventDefault();
    const tit = String(footerForm.title || "").trim();
    if (tit.length > PUBLIC_PAGE_TITLE_MAX) {
      setError(t("Titre trop long.", "Title too long."));
      return;
    }
    if (footerForm.plainLen > PUBLIC_PAGE_BODY_PLAIN_MAX) {
      setError(t("Texte trop long.", "Text too long."));
      return;
    }
    setSaving(true);
    setError("");
    const imageFile = footerCreateImageInputRef.current?.files?.[0] || null;
    try {
      const created = await api.createSystemOwnerFooterBlock({
        title: tit,
        bodyHtml: footerForm.bodyHtml,
        linkUrl: footerForm.linkUrl.trim() || null,
        sortOrder: Number(footerForm.sortOrder) || 0,
        layout: footerForm.layout,
        placement: footerForm.placement,
        isActive: true
      });
      if (imageFile && created?.id) {
        await api.uploadSystemOwnerFooterBlockImage(created.id, imageFile);
      }
      setFooterForm({
        title: "",
        bodyHtml: "<p></p>",
        linkUrl: "",
        sortOrder: 0,
        plainLen: 0,
        layout: "wide",
        placement: "after_why"
      });
      if (footerCreateImageInputRef.current) footerCreateImageInputRef.current.value = "";
      await loadFooter();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteFooter(id) {
    if (!window.confirm(t("Supprimer ce bloc ?", "Delete this block?"))) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteSystemOwnerFooterBlock(id);
      if (editingFooterId === id) {
        setEditingFooterId(null);
        setEditingFooter(null);
      }
      await loadFooter();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEditingFooter() {
    if (!editingFooterId || !editingFooter) return;
    const tit = String(editingFooter.title || "").trim();
    if (tit.length > PUBLIC_PAGE_TITLE_MAX) {
      setError(t("Titre trop long.", "Title too long."));
      return;
    }
    if (editingFooter.plainLen > PUBLIC_PAGE_BODY_PLAIN_MAX) {
      setError(t("Texte trop long.", "Text too long."));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.patchSystemOwnerFooterBlock(editingFooterId, {
        title: tit,
        bodyHtml: editingFooter.bodyHtml,
        linkUrl: editingFooter.linkUrl.trim() || null,
        sortOrder: Number(editingFooter.sortOrder) || 0,
        layout: editingFooter.layout,
        placement: editingFooter.placement,
        isActive: editingFooter.isActive
      });
      setEditingFooterId(null);
      setEditingFooter(null);
      await loadFooter();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onFooterUpload(id, e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSaving(true);
    setError("");
    try {
      await api.uploadSystemOwnerFooterBlockImage(id, f);
      e.target.value = "";
      await loadFooter();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onFooterClearImage(id) {
    setSaving(true);
    setError("");
    try {
      await api.deleteSystemOwnerFooterBlockImage(id);
      await loadFooter();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAuthCopy() {
    setSaving(true);
    setError("");
    try {
      await api.patchSystemOwnerAuthCopy({
        forgotPasswordBodyFr: authCopyFr,
        forgotPasswordBodyEn: authCopyEn
      });
      await loadAuthCopy();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveFaqAd(id) {
    const ed = faqAdEditById[id];
    if (!ed) return;
    setSaving(true);
    setError("");
    try {
      await api.patchSystemOwnerFaqAd(id, {
        internalLabel: ed.internalLabel,
        sortOrder: Number(ed.sortOrder) || 0,
        linkUrl: ed.linkUrl.trim() || null,
        altTextFr: ed.altTextFr.trim() || null,
        altTextEn: ed.altTextEn.trim() || null,
        captionFr: ed.captionFr.trim() || null,
        captionEn: ed.captionEn.trim() || null,
        isActive: ed.isActive
      });
      await loadFaqAds();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteFaqAd(id) {
    if (!window.confirm(t("Supprimer cette publicité ?", "Delete this ad?"))) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteSystemOwnerFaqAd(id);
      await loadFaqAds();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onFaqAdUpload(id, e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSaving(true);
    setError("");
    try {
      await api.uploadSystemOwnerFaqAdImage(id, f);
      e.target.value = "";
      await loadFaqAds();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function onFaqAdClearImage(id) {
    if (!window.confirm(t("Supprimer l'image ?", "Remove image?"))) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteSystemOwnerFaqAdImage(id);
      await loadFaqAds();
    } catch (err) {
      setError(err.message || "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" id="platform-home-marketing">
      <h2>{t("Page d'accueil publique (marketing)", "Public home page (marketing)")}</h2>
      <p className="app-meta" style={{ maxWidth: "56rem" }}>
        {t(
          "Trois visuels « Offres » (emplacements fixes 0–2) : chaque image est indépendante. Blocs d’annonce : carte classique ou bannière large (image de fond + texte), placés après « Pourquoi choisir… » ou en bas de page avant le pied de page. Réservé au propriétaire plateforme.",
          "Three “Offers” visuals (fixed slots 0–2): each image is independent. Announcement blocks: classic card or wide banner (background image + text), placed after “Why choose…” or at the bottom before the site footer. Platform owner only."
        )}
      </p>
      {error ? <p className="error">{error}</p> : null}

      <div className="panel" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>
          {t("Texte « Mot de passe oublié » (écran de connexion)", "Forgot-password message (sign-in screen)")}
        </h3>
        <p className="app-meta" style={{ marginTop: 0, maxWidth: "56rem" }}>
          {t(
            "Texte facultatif affiché sur le formulaire de réinitialisation (une variante par langue). Laisser vide pour n’afficher aucun encadré explicatif — le message de confirmation après envoi reste inchangé.",
            "Optional copy on the password-reset request form (one variant per language). Leave both empty to show no explanatory block — the post-submit confirmation is unchanged."
          )}
        </p>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span className="app-meta">{t("Français", "French")}</span>
          <textarea
            value={authCopyFr}
            onChange={(e) => setAuthCopyFr(e.target.value)}
            disabled={saving}
            maxLength={4000}
            rows={4}
            style={{ display: "block", marginTop: 6, width: "100%", maxWidth: "40rem", fontFamily: "inherit" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <span className="app-meta">{t("English", "English")}</span>
          <textarea
            value={authCopyEn}
            onChange={(e) => setAuthCopyEn(e.target.value)}
            disabled={saving}
            maxLength={4000}
            rows={4}
            style={{ display: "block", marginTop: 6, width: "100%", maxWidth: "40rem", fontFamily: "inherit" }}
          />
        </label>
        <p style={{ marginBottom: 0 }}>
          <button type="button" className="btn-primary" disabled={saving} onClick={onSaveAuthCopy}>
            {t("Enregistrer le texte de connexion", "Save sign-in copy")}
          </button>
        </p>
        {authCopyUpdatedAt ? (
          <p className="app-meta" style={{ marginTop: 12, marginBottom: 0 }}>
            {t("Dernière mise à jour :", "Last updated:")}{" "}
            {new Date(authCopyUpdatedAt).toLocaleString(isEn ? "en-GB" : "fr-FR")}
          </p>
        ) : null}
      </div>

      <h3 style={{ marginTop: 20 }}>
        {t("Signature sous le texte d’intro (pied de page)", "Signature under the footer intro line")}
      </h3>
      {founderLoadError ? <p className="error">{founderLoadError}</p> : null}
      <div className="panel" style={{ marginTop: 12 }}>
        <p className="app-meta" style={{ marginTop: 0 }}>
          {t(
            "Photo et ligne de texte (ex. « PDG — Jeff Buleli ») affichées sous le slogan McBuleli dans le pied de page public, alignées sur le bloc marque à gauche. Laisser vide pour ne rien afficher. En choisissant une photo, le texte du champ ci-dessous est enregistré en même temps (inutile de cliquer « Enregistrer le texte » avant).",
            "Portrait and one line (e.g. “CEO — Jeff Buleli”) under the McBuleli tagline in the public footer, aligned with the brand block on the left. Leave both empty to hide. When you upload a photo, the line above is saved at the same time—you don’t have to click “Save caption” first."
          )}
        </p>
        <label style={{ display: "block", marginBottom: 8 }}>
          {t("Texte affiché", "Displayed line")}
          <input
            type="text"
            maxLength={320}
            value={founderCaptionEdit}
            disabled={saving}
            placeholder={t("ex. PDG — Jeff Buleli", "e.g. CEO — Jeff Buleli")}
            onChange={(e) => setFounderCaptionEdit(e.target.value)}
            style={{ display: "block", marginTop: 6, width: "100%", maxWidth: "28rem" }}
          />
        </label>
        <p>
          <button type="button" className="btn-primary" disabled={saving} onClick={onFounderSaveCaption}>
            {t("Enregistrer le texte", "Save caption")}
          </button>
        </p>
        {founder.imageUrl ? (
          <p style={{ margin: "12px 0" }}>
            <img src={founder.imageUrl} alt="" style={{ maxWidth: 120, maxHeight: 120, objectFit: "cover", borderRadius: 12 }} />
          </p>
        ) : (
          <p className="app-meta">{t("Aucune photo pour l’instant", "No portrait uploaded yet")}</p>
        )}
        <label style={{ display: "block", marginBottom: 8 }}>
          {t("Photo (carré ou portrait recommandé)", "Photo (square or portrait works best)")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={saving}
            onChange={onFounderUpload}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        {founder.imageUrl ? (
          <p>
            <button type="button" className="btn-secondary-outline" disabled={saving} onClick={onFounderClearImage}>
              {t("Supprimer la photo", "Remove photo")}
            </button>
          </p>
        ) : null}
      </div>

      <h3 style={{ marginTop: 20 }}>{t("Les trois encarts (Offres / WhatsApp)", "The three offer tiles")}</h3>
      <p className="app-meta" style={{ marginTop: 6, maxWidth: "52rem" }}>
        {t(
          "Légende : texte sous l’image (comme sur la page publique). Texte alt : description pour l’accessibilité et les lecteurs d’écran ; sert aussi de légende si la légende est vide.",
          "Caption: text under the image (as on the public page). Alt text: description for accessibility and screen readers; also used as the caption if the caption field is empty."
        )}
      </p>
      <div className="grid">
        {[0, 1, 2].map((slot) => {
          const row = promoSlots.find((s) => s.slotIndex === slot);
          const ed = promoEdits[slot] || {
            linkUrl: "",
            altTextFr: "",
            altTextEn: "",
            captionFr: "",
            captionEn: "",
            orientation: slot === 0 ? "square" : "landscape",
            isActive: true
          };
          return (
            <div key={slot} className="panel" style={{ margin: 0 }}>
              <h4 style={{ marginTop: 0 }}>
                {t("Visuel", "Visual")} {slot + 1}
              </h4>
              {row?.imageUrl ? (
                <p style={{ margin: "8px 0" }}>
                  <img src={row.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 120, objectFit: "contain" }} />
                </p>
              ) : (
                <p className="app-meta">{t("Image par défaut du site si vide", "Site default image if empty")}</p>
              )}
              <label style={{ display: "block", marginBottom: 8 }}>
                {t("Fichier image", "Image file")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={saving}
                  onChange={(e) => onPromoUpload(slot, e)}
                  style={{ display: "block", marginTop: 6 }}
                />
              </label>
              {row?.imageUrl ? (
                <p>
                  <button type="button" className="btn-secondary-outline" disabled={saving} onClick={() => onPromoClearImage(slot)}>
                    {t("Supprimer l’image uploadée", "Remove uploaded image")}
                  </button>
                </p>
              ) : null}
              <input
                placeholder="https://…"
                value={ed.linkUrl}
                disabled={saving}
                onChange={(e) =>
                  setPromoEdits((prev) => ({
                    ...prev,
                    [slot]: { ...ed, linkUrl: e.target.value }
                  }))
                }
              />
              <input
                placeholder={t("Texte alt FR", "Alt text FR")}
                value={ed.altTextFr}
                disabled={saving}
                onChange={(e) =>
                  setPromoEdits((prev) => ({
                    ...prev,
                    [slot]: { ...ed, altTextFr: e.target.value }
                  }))
                }
                style={{ marginTop: 8 }}
              />
              <input
                placeholder={t("Texte alt EN", "Alt text EN")}
                value={ed.altTextEn}
                disabled={saving}
                onChange={(e) =>
                  setPromoEdits((prev) => ({
                    ...prev,
                    [slot]: { ...ed, altTextEn: e.target.value }
                  }))
                }
                style={{ marginTop: 8 }}
              />
              <input
                placeholder={t("Légende FR (sous l’image)", "Caption FR (under image)")}
                value={ed.captionFr}
                disabled={saving}
                maxLength={400}
                onChange={(e) =>
                  setPromoEdits((prev) => ({
                    ...prev,
                    [slot]: { ...ed, captionFr: e.target.value }
                  }))
                }
                style={{ marginTop: 8 }}
              />
              <input
                placeholder={t("Légende EN (sous l’image)", "Caption EN (under image)")}
                value={ed.captionEn}
                disabled={saving}
                maxLength={400}
                onChange={(e) =>
                  setPromoEdits((prev) => ({
                    ...prev,
                    [slot]: { ...ed, captionEn: e.target.value }
                  }))
                }
                style={{ marginTop: 8 }}
              />
              <label style={{ display: "block", marginTop: 8 }}>
                {t("Format carte", "Card shape")}
                <select
                  value={ed.orientation}
                  disabled={saving}
                  onChange={(e) =>
                    setPromoEdits((prev) => ({
                      ...prev,
                      [slot]: { ...ed, orientation: e.target.value }
                    }))
                  }
                  style={{ display: "block", marginTop: 6 }}
                >
                  <option value="square">{t("Carré (empl. 1)", "Square (slot 1)")}</option>
                  <option value="landscape">{t("Paysage", "Landscape")}</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={ed.isActive}
                  disabled={saving}
                  onChange={(e) =>
                    setPromoEdits((prev) => ({
                      ...prev,
                      [slot]: { ...ed, isActive: e.target.checked }
                    }))
                  }
                />
                {t("Afficher sur le site", "Show on public site")}
              </label>
              <button type="button" disabled={saving} style={{ marginTop: 10 }} onClick={() => onPromoSaveMeta(slot)}>
                {t("Enregistrer ce visuel", "Save this visual")}
              </button>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 28 }}>
        {t("Publicité à côté de la FAQ (page publique)", "FAQ sidebar ads (public home)")}
      </h3>
      <p className="app-meta" style={{ marginTop: 4, maxWidth: "52rem" }}>
        {t(
          "À droite de la FAQ sur grand écran ; sous la FAQ sur mobile. Seules les entrées actives avec une image s’affichent côté public. Optionnel : légende sous l’image (même style que les trois encarts) ; si vide, le texte alt est réutilisé comme légende.",
          "To the right of the FAQ on desktop; below the FAQ on mobile. Only active rows with an uploaded image are shown on the public site. Optional: caption under the image (same style as the three offer tiles); if empty, alt text is reused as the caption."
        )}
      </p>
      <form
        className="panel"
        style={{ marginBottom: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const created = await api.createSystemOwnerFaqAd({
              internalLabel: faqNew.internalLabel,
              sortOrder: Number(faqNew.sortOrder) || 0,
              linkUrl: faqNew.linkUrl.trim() || null,
              altTextFr: faqNew.altTextFr.trim() || null,
              altTextEn: faqNew.altTextEn.trim() || null,
              captionFr: faqNew.captionFr.trim() || null,
              captionEn: faqNew.captionEn.trim() || null,
              isActive: faqNew.isActive
            });
            const newFile = faqNewImageInputRef.current?.files?.[0];
            if (newFile && created?.id) {
              await api.uploadSystemOwnerFaqAdImage(created.id, newFile);
            }
            if (faqNewImageInputRef.current) faqNewImageInputRef.current.value = "";
            setFaqNew({
              internalLabel: "",
              sortOrder: 0,
              linkUrl: "",
              altTextFr: "",
              altTextEn: "",
              captionFr: "",
              captionEn: "",
              isActive: true
            });
            await loadFaqAds();
          } catch (err) {
            setError(err.message || "Error");
          } finally {
            setSaving(false);
          }
        }}
      >
        <h4 style={{ marginTop: 0 }}>{t("Nouvelle entrée", "New entry")}</h4>
        <input
          placeholder={t("Libellé interne (pour vous retrouver)", "Internal label (for your reference)")}
          value={faqNew.internalLabel}
          disabled={saving}
          maxLength={160}
          onChange={(e) => setFaqNew((f) => ({ ...f, internalLabel: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <input
          type="number"
          placeholder={t("Ordre d’affichage", "Sort order")}
          value={faqNew.sortOrder}
          disabled={saving}
          onChange={(e) => setFaqNew((f) => ({ ...f, sortOrder: e.target.value }))}
          style={{ display: "block", marginBottom: 8, maxWidth: 120 }}
        />
        <input
          placeholder="https://…"
          value={faqNew.linkUrl}
          disabled={saving}
          onChange={(e) => setFaqNew((f) => ({ ...f, linkUrl: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <input
          placeholder={t("Texte alt FR (accessibilité)", "Alt text FR")}
          value={faqNew.altTextFr}
          disabled={saving}
          onChange={(e) => setFaqNew((f) => ({ ...f, altTextFr: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <input
          placeholder={t("Texte alt EN", "Alt text EN")}
          value={faqNew.altTextEn}
          disabled={saving}
          onChange={(e) => setFaqNew((f) => ({ ...f, altTextEn: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <input
          placeholder={t("Légende FR (sous l’image, optionnel)", "Caption FR (under image, optional)")}
          value={faqNew.captionFr}
          disabled={saving}
          maxLength={400}
          onChange={(e) => setFaqNew((f) => ({ ...f, captionFr: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <input
          placeholder={t("Légende EN (sous l’image, optionnel)", "Caption EN (under image, optional)")}
          value={faqNew.captionEn}
          disabled={saving}
          maxLength={400}
          onChange={(e) => setFaqNew((f) => ({ ...f, captionEn: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={faqNew.isActive}
            disabled={saving}
            onChange={(e) => setFaqNew((f) => ({ ...f, isActive: e.target.checked }))}
          />
          {t("Actif", "Active")}
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          {t("Image (recommandé pour l’affichage public)", "Image (recommended for public display)")}
          <input
            ref={faqNewImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={saving}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        <p className="app-meta" style={{ margin: "0 0 10px", maxWidth: "40rem" }}>
          {t(
            "Le fichier est envoyé juste après la création de l’entrée (même clic sur Ajouter).",
            "The file uploads right after the entry is created (same click on Add)."
          )}
        </p>
        <button type="submit" disabled={saving}>
          {t("Ajouter", "Add")}
        </button>
      </form>

      {faqAdItems.map((item) => {
        const ed = faqAdEditById[item.id];
        if (!ed) return null;
        return (
          <div key={item.id} className="panel" style={{ marginBottom: 12 }}>
            <p style={{ marginTop: 0 }} className="app-meta">
              <strong>{item.internalLabel || item.id.slice(0, 8)}</strong>
              {item.imageUrl ? null : (
                <span> — {t("Image requise pour l’affichage public", "Image required for public display")}</span>
              )}
            </p>
            {item.imageUrl ? (
              <p style={{ margin: "8px 0" }}>
                <img src={item.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 140, objectFit: "contain" }} />
              </p>
            ) : null}
            <label style={{ display: "block", marginBottom: 6 }}>
              {t("Libellé interne", "Internal label")}
              <input
                value={ed.internalLabel}
                disabled={saving}
                maxLength={160}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, internalLabel: e.target.value }
                  }))
                }
                style={{ display: "block", marginTop: 4, width: "100%", maxWidth: 480 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 6 }}>
              {t("Ordre", "Order")}
              <input
                type="number"
                value={ed.sortOrder}
                disabled={saving}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, sortOrder: e.target.value }
                  }))
                }
                style={{ display: "block", marginTop: 4, maxWidth: 120 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 6 }}>
              URL
              <input
                value={ed.linkUrl}
                disabled={saving}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, linkUrl: e.target.value }
                  }))
                }
                style={{ display: "block", marginTop: 4, width: "100%", maxWidth: 480 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 6 }}>
              {t("Alt FR", "Alt FR")}
              <input
                value={ed.altTextFr}
                disabled={saving}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, altTextFr: e.target.value }
                  }))
                }
                style={{ display: "block", marginTop: 4, width: "100%", maxWidth: 480 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 6 }}>
              {t("Alt EN", "Alt EN")}
              <input
                value={ed.altTextEn}
                disabled={saving}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, altTextEn: e.target.value }
                  }))
                }
                style={{ display: "block", marginTop: 4, width: "100%", maxWidth: 480 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 6 }}>
              {t("Légende FR", "Caption FR")}
              <input
                value={ed.captionFr}
                disabled={saving}
                maxLength={400}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, captionFr: e.target.value }
                  }))
                }
                style={{ display: "block", marginTop: 4, width: "100%", maxWidth: 480 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 6 }}>
              {t("Légende EN", "Caption EN")}
              <input
                value={ed.captionEn}
                disabled={saving}
                maxLength={400}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, captionEn: e.target.value }
                  }))
                }
                style={{ display: "block", marginTop: 4, width: "100%", maxWidth: 480 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={ed.isActive}
                disabled={saving}
                onChange={(e) =>
                  setFaqAdEditById((prev) => ({
                    ...prev,
                    [item.id]: { ...ed, isActive: e.target.checked }
                  }))
                }
              />
              {t("Actif", "Active")}
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              {t("Fichier image", "Image file")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={saving}
                onChange={(e) => onFaqAdUpload(item.id, e)}
                style={{ display: "block", marginTop: 6 }}
              />
            </label>
            {item.imageUrl ? (
              <p>
                <button
                  type="button"
                  className="btn-secondary-outline"
                  disabled={saving}
                  onClick={() => onFaqAdClearImage(item.id)}
                >
                  {t("Supprimer l’image", "Remove image")}
                </button>
              </p>
            ) : null}
            <p>
              <button type="button" disabled={saving} onClick={() => onSaveFaqAd(item.id)}>
                {t("Enregistrer les champs", "Save fields")}
              </button>{" "}
              <button type="button" className="btn-secondary-outline" disabled={saving} onClick={() => onDeleteFaqAd(item.id)}>
                {t("Supprimer l’entrée", "Delete entry")}
              </button>
            </p>
          </div>
        );
      })}

      <h3 style={{ marginTop: 28 }}>{t("Blocs d’annonce (page publique)", "Public page announcement blocks")}</h3>
      <form className="panel" style={{ marginBottom: 16 }} onSubmit={onCreateFooter}>
        <h4 style={{ marginTop: 0 }}>{t("Nouveau bloc", "New block")}</h4>
        <input
          placeholder={t("Titre", "Title")}
          value={footerForm.title}
          maxLength={PUBLIC_PAGE_TITLE_MAX}
          disabled={saving}
          onChange={(e) => setFooterForm((f) => ({ ...f, title: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <input
          placeholder="https://…"
          value={footerForm.linkUrl}
          disabled={saving}
          onChange={(e) => setFooterForm((f) => ({ ...f, linkUrl: e.target.value }))}
          style={{ display: "block", marginBottom: 8, width: "100%", maxWidth: 480 }}
        />
        <input
          type="number"
          placeholder={t("Ordre d’affichage", "Sort order")}
          value={footerForm.sortOrder}
          disabled={saving}
          onChange={(e) => setFooterForm((f) => ({ ...f, sortOrder: e.target.value }))}
          style={{ display: "block", marginBottom: 8, maxWidth: 120 }}
        />
        <label style={{ display: "block", marginBottom: 8 }}>
          {t("Mise en page", "Layout")}
          <select
            value={footerForm.layout}
            disabled={saving}
            onChange={(e) => setFooterForm((f) => ({ ...f, layout: e.target.value }))}
            style={{ display: "block", marginTop: 6, maxWidth: 360 }}
          >
            <option value="card">{t("Carte (image + texte)", "Card (image + text)")}</option>
            <option value="wide">{t("Bannière large (fond image)", "Wide banner (image background)")}</option>
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          {t("Emplacement", "Placement")}
          <select
            value={footerForm.placement}
            disabled={saving}
            onChange={(e) => setFooterForm((f) => ({ ...f, placement: e.target.value }))}
            style={{ display: "block", marginTop: 6, maxWidth: 360 }}
          >
            <option value="after_why">
              {t("Après « Pourquoi choisir McBuleli… »", "After “Why choose McBuleli…”")}
            </option>
            <option value="pre_footer">{t("Bas de page (après la FAQ)", "Page bottom (after FAQ)")}</option>
          </select>
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          {t("Photo d’annonce (image du bloc)", "Announcement image (block photo)")}
          <input
            ref={footerCreateImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={saving}
            style={{ display: "block", marginTop: 6 }}
          />
        </label>
        <p className="app-meta" style={{ margin: "0 0 10px", maxWidth: "52rem" }}>
          {t(
            "Pour une bannière large, utilisez une image paysage (ex. 1200×400). Le fichier est envoyé juste après la création du bloc.",
            "For a wide banner, use a landscape image (e.g. 1200×400). The file is uploaded right after the block is created."
          )}
        </p>
        <RichAnnouncementEditor
          valueHtml={footerForm.bodyHtml}
          onChange={(html, len) => setFooterForm((f) => ({ ...f, bodyHtml: html, plainLen: len }))}
          t={t}
        />
        <p className="app-meta">
          {footerForm.plainLen} / {PUBLIC_PAGE_BODY_PLAIN_MAX}
        </p>
        <button type="submit" disabled={saving}>
          {t("Ajouter le bloc", "Add block")}
        </button>
      </form>

      <div className="platform-public-slots">
        {footerItems.map((item) => (
          <div key={item.id} className="platform-public-slot panel" style={{ margin: "0 0 12px" }}>
            {editingFooterId === item.id && editingFooter ? (
              <div className="platform-public-slot__body">
                <input
                  value={editingFooter.title}
                  maxLength={PUBLIC_PAGE_TITLE_MAX}
                  disabled={saving}
                  onChange={(e) => setEditingFooter((x) => ({ ...x, title: e.target.value }))}
                  style={{ width: "100%", maxWidth: 480, marginBottom: 8 }}
                />
                <input
                  placeholder="https://"
                  value={editingFooter.linkUrl}
                  disabled={saving}
                  onChange={(e) => setEditingFooter((x) => ({ ...x, linkUrl: e.target.value }))}
                  style={{ width: "100%", maxWidth: 480, marginBottom: 8 }}
                />
                <input
                  type="number"
                  value={editingFooter.sortOrder}
                  disabled={saving}
                  onChange={(e) => setEditingFooter((x) => ({ ...x, sortOrder: e.target.value }))}
                  style={{ maxWidth: 120, marginBottom: 8 }}
                />
                <label style={{ display: "block", marginBottom: 8 }}>
                  {t("Mise en page", "Layout")}
                  <select
                    value={editingFooter.layout === "wide" ? "wide" : "card"}
                    disabled={saving}
                    onChange={(e) => setEditingFooter((x) => ({ ...x, layout: e.target.value }))}
                    style={{ display: "block", marginTop: 6, maxWidth: 360 }}
                  >
                    <option value="card">{t("Carte (image + texte)", "Card (image + text)")}</option>
                    <option value="wide">{t("Bannière large (fond image)", "Wide banner (image background)")}</option>
                  </select>
                </label>
                <label style={{ display: "block", marginBottom: 8 }}>
                  {t("Emplacement", "Placement")}
                  <select
                    value={editingFooter.placement === "after_why" ? "after_why" : "pre_footer"}
                    disabled={saving}
                    onChange={(e) => setEditingFooter((x) => ({ ...x, placement: e.target.value }))}
                    style={{ display: "block", marginTop: 6, maxWidth: 360 }}
                  >
                    <option value="after_why">
                      {t("Après « Pourquoi choisir McBuleli… »", "After “Why choose McBuleli…”")}
                    </option>
                    <option value="pre_footer">{t("Bas de page (après la FAQ)", "Page bottom (after FAQ)")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={editingFooter.isActive}
                    disabled={saving}
                    onChange={(e) => setEditingFooter((x) => ({ ...x, isActive: e.target.checked }))}
                  />
                  {t("Actif", "Active")}
                </label>
                <RichAnnouncementEditor
                  valueHtml={editingFooter.bodyHtml}
                  onChange={(html, len) =>
                    setEditingFooter((x) => ({ ...x, bodyHtml: html, plainLen: len }))
                  }
                  t={t}
                />
                <p className="app-meta">{editingFooter.plainLen} / {PUBLIC_PAGE_BODY_PLAIN_MAX}</p>
                <p>
                  <button type="button" disabled={saving} onClick={onSaveEditingFooter}>
                    {t("Enregistrer", "Save")}
                  </button>{" "}
                  <button type="button" className="btn-secondary-outline" onClick={() => { setEditingFooterId(null); setEditingFooter(null); }}>
                    {t("Annuler", "Cancel")}
                  </button>
                </p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="platform-public-slot__head"
                  onClick={() => {
                    setEditingFooterId(item.id);
                    setEditingFooter({
                      title: item.title || "",
                      bodyHtml: item.bodyHtml || "<p></p>",
                      linkUrl: item.linkUrl || "",
                      sortOrder: item.sortOrder ?? 0,
                      layout: item.layout === "wide" ? "wide" : "card",
                      placement: item.placement === "after_why" ? "after_why" : "pre_footer",
                      isActive: item.isActive !== false,
                      plainLen: plainTextLength(item.bodyHtml)
                    });
                  }}
                >
                  <strong>{item.title || item.id.slice(0, 8)}</strong>
                  <span className="app-meta">
                    {item.isActive === false ? t("(inactif)", "(inactive)") : ""} · order {item.sortOrder} ·{" "}
                    {item.layout === "wide" ? t("bannière large", "wide") : t("carte", "card")} ·{" "}
                    {item.placement === "after_why"
                      ? t("après Pourquoi", "after Why")
                      : t("bas de page", "page bottom")}
                  </span>
                </button>
                <div style={{ padding: "0 14px 14px" }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" style={{ maxWidth: "100%", maxHeight: 100, objectFit: "contain" }} />
                  ) : null}
                  <label style={{ display: "block", marginTop: 8 }}>
                    {t("Image", "Image")}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={saving} onChange={(e) => onFooterUpload(item.id, e)} />
                  </label>
                  {item.imageUrl ? (
                    <button type="button" className="btn-secondary-outline" disabled={saving} onClick={() => onFooterClearImage(item.id)}>
                      {t("Supprimer l’image", "Remove image")}
                    </button>
                  ) : null}
                  <p style={{ marginTop: 10 }}>
                    <button type="button" className="btn-secondary-outline" onClick={() => onDeleteFooter(item.id)}>
                      {t("Supprimer le bloc", "Delete block")}
                    </button>
                  </p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
