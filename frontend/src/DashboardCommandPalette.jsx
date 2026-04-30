import { useEffect, useMemo, useRef, useState } from "react";

function getHash() {
  if (typeof window === "undefined") return "";
  return window.location.hash || "";
}

export default function DashboardCommandPalette({ open, onClose, t, categories }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  const items = useMemo(() => {
    const list = Array.isArray(categories) ? categories.flatMap((c) => c.items.map((it) => ({ ...it, _cat: c }))) : [];
    const query = q.trim().toLowerCase();
    if (!query) return list.slice(0, 20);
    return list
      .filter((it) => it.label.toLowerCase().includes(query) || it._cat?.label?.toLowerCase?.().includes(query))
      .slice(0, 20);
  }, [categories, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    const tmr = setTimeout(() => inputRef.current?.focus?.(), 0);
    return () => clearTimeout(tmr);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mb-cmdk-overlay" role="dialog" aria-modal="true" aria-label={t("Recherche", "Search")}>
      <button type="button" className="mb-cmdk-backdrop" aria-label={t("Fermer", "Close")} onClick={onClose} />
      <div className="mb-cmdk">
        <div className="mb-cmdk__head">
          <input
            ref={inputRef}
            className="mb-cmdk__input"
            type="search"
            placeholder={t("Rechercher une section…", "Search a section…")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
          />
          <span className="mb-cmdk__hint" aria-hidden>
            ESC
          </span>
        </div>
        <div className="mb-cmdk__list" role="listbox" aria-label={t("Résultats", "Results")}>
          {items.length ? (
            items.map((it) => {
              const active = getHash() === it.href;
              return (
                <button
                  key={it.href}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`mb-cmdk__item${active ? " mb-cmdk__item--active" : ""}`}
                  onClick={() => {
                    if (typeof window !== "undefined") window.location.hash = it.href;
                    onClose?.();
                  }}
                >
                  <span className="mb-cmdk__item-label">{it.label}</span>
                  {it._cat?.label ? <span className="mb-cmdk__item-meta">{it._cat.label}</span> : null}
                </button>
              );
            })
          ) : (
            <p className="mb-cmdk__empty">{t("Aucun résultat.", "No results.")}</p>
          )}
        </div>
        <div className="mb-cmdk__foot">
          <span className="mb-cmdk__foot-key">↵</span> {t("Ouvrir", "Open")}
          <span className="mb-cmdk__foot-spacer" />
          <span className="mb-cmdk__foot-key">Ctrl</span>+<span className="mb-cmdk__foot-key">K</span>
        </div>
      </div>
    </div>
  );
}

