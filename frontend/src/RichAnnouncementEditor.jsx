import { useCallback, useEffect, useRef } from "react";

export const ANNOUNCE_TITLE_MAX = 120;
export const ANNOUNCE_BODY_PLAIN_MAX = 2000;

function plainLen(html) {
  const d = typeof document !== "undefined" ? document.createElement("div") : null;
  if (!d) return String(html || "").replace(/<[^>]*>/g, " ").trim().length;
  d.innerHTML = html || "";
  return (d.textContent || "").replace(/\s+/g, " ").trim().length;
}

export default function RichAnnouncementEditor({ valueHtml, onChange, placeholder, t }) {
  const ref = useRef(null);
  const lastHtml = useRef("");

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    lastHtml.current = html;
    onChange(html, plainLen(html));
  }, [onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = valueHtml || "";
    if (next !== lastHtml.current && next !== el.innerHTML) {
      el.innerHTML = next;
      lastHtml.current = next;
    }
  }, [valueHtml]);

  function exec(cmd, arg = null) {
    ref.current?.focus();
    try {
      document.execCommand(cmd, false, arg);
    } catch {
      /* ignore */
    }
    emit();
  }

  function onLink() {
    const url = window.prompt(
      t ? t("URL du lien (https://…)", "Link URL (https://…)") : "https://",
      "https://"
    );
    if (url && /^https?:\/\//i.test(url.trim())) {
      exec("createLink", url.trim().slice(0, 2048));
    }
  }

  return (
    <div className="rich-announcement-editor">
      <div className="rich-announcement-toolbar" role="toolbar" aria-label="Format">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}>
          <strong>B</strong>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}>
          <em>I</em>
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}>
          <u>U</u>
        </button>
        <span className="rich-announcement-toolbar__sep" aria-hidden />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyLeft")}>
          ◧
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyCenter")}>
          ◨
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("justifyRight")}>
          ◀
        </button>
        <span className="rich-announcement-toolbar__sep" aria-hidden />
        <select
          aria-label="Font"
          defaultValue="Arial"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            exec("fontName", e.target.value);
            e.target.selectedIndex = 0;
          }}
        >
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
          <option value="Tahoma">Tahoma</option>
          <option value="Courier New">Courier</option>
        </select>
        <select
          aria-label="Size"
          defaultValue="3"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            exec("fontSize", e.target.value);
            e.target.selectedIndex = 1;
          }}
        >
          <option value="2">{t ? t("Petit", "Small") : "Small"}</option>
          <option value="3">{t ? t("Normal", "Normal") : "Normal"}</option>
          <option value="4">{t ? t("Grand", "Large") : "Large"}</option>
          <option value="5">{t ? t("Très grand", "XL") : "XL"}</option>
        </select>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onLink}>
          Link
        </button>
      </div>
      <div
        ref={ref}
        className="rich-announcement-field"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder || ""}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}
