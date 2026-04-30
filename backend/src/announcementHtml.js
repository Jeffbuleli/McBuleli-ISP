import sanitizeHtml from "sanitize-html";

export const ANNOUNCE_TITLE_MAX = 120;
export const ANNOUNCE_BODY_PLAIN_MAX = 2000;
export const PUBLIC_PAGE_TITLE_MAX = 200;
export const PUBLIC_PAGE_BODY_PLAIN_MAX = 4000;

export function plainTextLength(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export function sanitizeAnnouncementHtml(html) {
  return sanitizeHtml(String(html || ""), {
    allowedTags: ["b", "strong", "i", "em", "u", "br", "p", "div", "span", "a", "h3", "ul", "ol", "li"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      "*": ["style"]
    },
    allowedStyles: {
      "*": {
        "text-align": [/^left$/i, /^right$/i, /^center$/i, /^justify$/i],
        "font-size": [/^(?:\d{1,3}(?:px|pt|rem|em|%))$/i],
        "font-family": [
          /^['"]?(?:Arial|Helvetica|Georgia|Verdana|Tahoma|serif|sans-serif|monospace|"Times New Roman")['"]?$/i
        ]
      }
    },
    transformTags: {
      a: (_tagName, attribs) => {
        const raw = attribs.href != null ? String(attribs.href).trim() : "";
        const href = /^https?:\/\//i.test(raw) ? raw.slice(0, 2048) : "#";
        return {
          tagName: "a",
          attribs: { href, target: "_blank", rel: "noopener noreferrer" }
        };
      }
    }
  });
}

export function validateAnnouncementContent(title, bodyHtml) {
  const t = String(title || "").trim();
  if (!t) return { ok: false, message: "Title is required." };
  if (t.length > ANNOUNCE_TITLE_MAX) {
    return { ok: false, message: `Title must be at most ${ANNOUNCE_TITLE_MAX} characters.` };
  }
  const cleaned = sanitizeAnnouncementHtml(bodyHtml);
  const len = plainTextLength(cleaned);
  if (len > ANNOUNCE_BODY_PLAIN_MAX) {
    return {
      ok: false,
      message: `Message text must be at most ${ANNOUNCE_BODY_PLAIN_MAX} characters (plain text length).`
    };
  }
  return { ok: true, title: t, bodyHtml: cleaned };
}

/** Contenu éditable page d’accueil publique (system_owner). */
export function validatePublicPageSlot(title, bodyHtml) {
  const t = String(title || "").trim();
  if (t.length > PUBLIC_PAGE_TITLE_MAX) {
    return { ok: false, message: `Title must be at most ${PUBLIC_PAGE_TITLE_MAX} characters.` };
  }
  const cleaned = sanitizeAnnouncementHtml(bodyHtml);
  const len = plainTextLength(cleaned);
  if (len > PUBLIC_PAGE_BODY_PLAIN_MAX) {
    return {
      ok: false,
      message: `Body must be at most ${PUBLIC_PAGE_BODY_PLAIN_MAX} characters (plain text length).`
    };
  }
  return { ok: true, title: t, bodyHtml: cleaned };
}
