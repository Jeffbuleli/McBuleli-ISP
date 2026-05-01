import { useMemo } from "react";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function DataTable({
  title,
  description,
  rows,
  columns,
  loading,
  error,
  emptyLabel,
  searchValue,
  onSearchValueChange,
  filters,
  actions,
  sort,
  onSortChange,
  page,
  pageSize,
  totalRows,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  getRowKey,
  /** `(fr, en) => string` — aligné sur `uiLang` depuis l’accueil (obligatoire pour un libellé cohérent) */
  t
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safePageSize = pageSizeOptions.includes(pageSize) ? pageSize : pageSizeOptions[0] || 10;

  const tr = typeof t === "function" ? t : (_, en) => en;
  const emptyText = emptyLabel != null && emptyLabel !== "" ? emptyLabel : tr("Aucun résultat.", "No results.");

  const totalPages = useMemo(() => {
    const total = typeof totalRows === "number" ? totalRows : safeRows.length;
    return Math.max(1, Math.ceil(total / safePageSize));
  }, [safeRows.length, safePageSize, totalRows]);

  const safePage = clamp(page || 1, 1, totalPages);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  const pageStatusLabel = tr(`Page ${safePage} sur ${totalPages}`, `Page ${safePage} of ${totalPages}`);

  return (
    <section className="mb-table" aria-busy={loading ? "true" : "false"}>
      <div className="mb-table__head">
        <div className="mb-table__headtext">
          {title ? <h2 className="mb-table__title">{title}</h2> : null}
          {description ? <p className="mb-table__desc">{description}</p> : null}
        </div>

        <div className="mb-table__headactions">{actions}</div>
      </div>

      {(onSearchValueChange || filters) && (
        <div className="mb-table__tools">
          {onSearchValueChange ? (
            <label className="mb-table__search">
              <span className="visually-hidden">{tr("Rechercher", "Search")}</span>
              <input
                type="search"
                value={searchValue || ""}
                onChange={(e) => onSearchValueChange(e.target.value)}
                placeholder={tr("Rechercher…", "Search…")}
                className="mb-table__searchinput"
                autoComplete="off"
              />
            </label>
          ) : null}
          {filters ? <div className="mb-table__filters">{filters}</div> : null}
        </div>
      )}

      <div className="mb-table__frame">
        <table className="mb-table__table">
          <thead>
            <tr>
              {safeColumns.map((c) => {
                const sortable = Boolean(c.sortKey) && typeof onSortChange === "function";
                const active = sortable && sort?.key === c.sortKey;
                const dir = active ? sort?.dir : null;
                return (
                  <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}>
                    {sortable ? (
                      <button
                        type="button"
                        className={`mb-table__sortbtn${active ? " mb-table__sortbtn--active" : ""}`}
                        onClick={() => {
                          const nextDir = !active ? "asc" : dir === "asc" ? "desc" : "asc";
                          onSortChange({ key: c.sortKey, dir: nextDir });
                        }}
                      >
                        <span>{c.header}</span>
                        <span className="mb-table__sorticon" aria-hidden>
                          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="mb-table__state" colSpan={safeColumns.length || 1}>
                  {tr("Chargement…", "Loading…")}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td className="mb-table__state mb-table__state--error" colSpan={safeColumns.length || 1}>
                  {String(error)}
                </td>
              </tr>
            ) : safeRows.length ? (
              safeRows.map((r, idx) => (
                <tr key={getRowKey ? getRowKey(r) : r?.id || idx}>
                  {safeColumns.map((c) => (
                    <td key={c.key} data-col={c.key}>
                      {typeof c.cell === "function" ? c.cell(r) : r?.[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="mb-table__state" colSpan={safeColumns.length || 1}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-table__foot">
        <div className="mb-table__pager">
          <button
            type="button"
            className="mb-table__pagebtn mb-table__pagebtn--prev"
            disabled={!canPrev}
            onClick={() => onPageChange?.(safePage - 1)}
            aria-label={tr("Page précédente", "Previous page")}
            title={tr("Page précédente", "Previous page")}
          >
            <span className="mb-table__pagebtn-glyph" aria-hidden>
              {"\u003c\u003c"}
            </span>
          </button>
          <div className="mb-table__pagenums" role="status" aria-label={pageStatusLabel}>
            <span className="mb-table__pagepill">
              <span className="mb-table__pagenum mb-table__pagenum--cur">{safePage}</span>
              <span className="mb-table__pagesep" aria-hidden>
                {tr(" sur ", " of ")}
              </span>
              <span className="mb-table__pagenum mb-table__pagenum--tot">{totalPages}</span>
            </span>
          </div>
          <button
            type="button"
            className="mb-table__pagebtn mb-table__pagebtn--next"
            disabled={!canNext}
            onClick={() => onPageChange?.(safePage + 1)}
            aria-label={tr("Page suivante", "Next page")}
            title={tr("Page suivante", "Next page")}
          >
            <span className="mb-table__pagebtn-glyph" aria-hidden>
              {"\u003e\u003e"}
            </span>
          </button>
        </div>

        <label className="mb-table__pagesize">
          <span className="mb-table__pagesize-hash" aria-hidden title={tr("Lignes par page", "Rows per page")}>
            #
          </span>
          <select
            value={safePageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            aria-label={tr("Nombre de lignes par page", "Rows per page")}
            title={tr("Nombre de lignes par page", "Rows per page")}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
