import { useMemo, useState } from "react";
import { IconCopy, IconLink, IconPencil } from "./icons.jsx";
import { isValidSlug, normalizeSlug, publicUrlForSlug, slugifyName } from "./tenantSlug.js";

/**
 * Minimal link preview: SVG + https://slug.isp.mcbuleli.org
 * @param {{ nameValue: string, slug: string, onSlugChange: (s: string) => void, editable?: boolean, isEn?: boolean }} props
 */
export default function TenantLinkField({ nameValue, slug, onSlugChange, editable = true, isEn = false }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const effective = useMemo(() => {
    const manual = normalizeSlug(slug);
    if (manual) return manual;
    return slugifyName(nameValue || "");
  }, [slug, nameValue]);

  const url = publicUrlForSlug(effective);
  const ok = isValidSlug(effective);

  async function copy() {
    if (!navigator.clipboard?.writeText || !url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (_e) {
      setCopied(false);
    }
  }

  return (
    <div className="tenant-link-field">
      <div className="tenant-link-field__row">
        <IconLink width={18} height={18} className="tenant-link-field__ico" aria-hidden />
        <a className="tenant-link-field__url" href={ok ? url : undefined} target="_blank" rel="noreferrer">
          {url.replace(/^https?:\/\//, "")}
        </a>
        <button type="button" className="tenant-link-field__btn" onClick={copy} title={isEn ? "Copy" : "Copier"}>
          <IconCopy width={16} height={16} aria-hidden />
          <span className="visually-hidden">{copied ? (isEn ? "Copied" : "Copié") : isEn ? "Copy" : "Copier"}</span>
        </button>
        {editable ? (
          <button
            type="button"
            className="tenant-link-field__btn"
            onClick={() => setOpen((v) => !v)}
            title={isEn ? "Edit link" : "Modifier le lien"}
            aria-expanded={open}
          >
            <IconPencil width={16} height={16} aria-hidden />
          </button>
        ) : null}
      </div>
      {editable && open ? (
        <input
          className="tenant-link-field__input"
          value={slug || effective}
          onChange={(e) => onSlugChange(normalizeSlug(e.target.value))}
          placeholder="mon-entreprise"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
        />
      ) : null}
      {!ok ? (
        <p className="tenant-link-field__hint" role="status">
          {isEn ? "Use a-z, 0-9, - (3-30)" : "Utilisez a-z, 0-9, - (3-30)"}
        </p>
      ) : null}
    </div>
  );
}
