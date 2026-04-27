import { publicAssetUrl } from "./api";

function plainTextLen(html) {
  if (typeof document === "undefined") return String(html || "").replace(/<[^>]*>/g, " ").trim().length;
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/\s+/g, " ").trim().length;
}

/**
 * Bloc marketing éditable (page d'accueil publique) — image, titre, HTML, lien optionnel.
 */
export default function PublicMarketingSlot({ slot, variant = "block", t }) {
  if (!slot || slot.isActive === false) return null;
  const imgSrc = slot.imageUrl != null && String(slot.imageUrl).trim() ? publicAssetUrl(slot.imageUrl) : null;
  const bodyLen = plainTextLen(slot.bodyHtml);
  const hasBody = bodyLen > 0;
  if (!imgSrc && !hasBody && !(slot.title && String(slot.title).trim())) return null;

  const title = slot.title != null ? String(slot.title).trim() : "";
  const cta = (key, fr, en) => (t ? t(fr, en) : fr);

  const bodyBlock =
    hasBody ? (
      <div
        className="public-marketing-slot__body"
        dangerouslySetInnerHTML={{ __html: slot.bodyHtml || "" }}
      />
    ) : null;

  const bodyBlockWide =
    hasBody ? (
      <div
        className="public-marketing-slot__body public-marketing-slot__body--wide"
        dangerouslySetInnerHTML={{ __html: slot.bodyHtml || "" }}
      />
    ) : null;

  const linkUrl = slot.linkUrl != null ? String(slot.linkUrl).trim() : "";
  const layoutWide = slot.layout === "wide";

  if (layoutWide) {
    const plateClass = "public-marketing-slot__wide-plate" + (imgSrc ? "" : " public-marketing-slot__wide-plate--no-image");
    const bgImg =
      imgSrc != null ? (
        <img
          src={imgSrc}
          alt=""
          className="public-marketing-slot__wide-bg"
          loading="lazy"
          decoding="async"
          sizes="100vw"
        />
      ) : null;
    const inner = (
      <>
        {bgImg}
        <div className="public-marketing-slot__wide-shade" aria-hidden="true" />
        <div className="public-marketing-slot__wide-content">
          {title ? <h2 className="public-marketing-slot__wide-title">{title}</h2> : null}
          {bodyBlockWide}
        </div>
      </>
    );
    return (
      <aside className="public-marketing-slot public-marketing-slot--wide" aria-label={title || undefined}>
        {linkUrl ? (
          <a href={linkUrl} className={plateClass} target="_blank" rel="noopener noreferrer">
            {inner}
          </a>
        ) : (
          <div className={plateClass}>{inner}</div>
        )}
      </aside>
    );
  }

  return (
    <aside
      className={`public-marketing-slot public-marketing-slot--${variant}`}
      aria-label={title || undefined}
    >
      <div className="public-marketing-slot__inner">
        {imgSrc ? (
          <div className="public-marketing-slot__media">
            {linkUrl ? (
              <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="public-marketing-slot__media-link">
                <img src={imgSrc} alt="" className="public-marketing-slot__img" loading="lazy" decoding="async" />
              </a>
            ) : (
              <img src={imgSrc} alt="" className="public-marketing-slot__img" loading="lazy" decoding="async" />
            )}
          </div>
        ) : null}
        <div className="public-marketing-slot__text">
          {title ? <h3 className="public-marketing-slot__title">{title}</h3> : null}
          {bodyBlock}
          {linkUrl && !imgSrc && (hasBody || title) ? (
            <p className="public-marketing-slot__cta">
              <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                {cta("Voir le lien", "Open link")}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
