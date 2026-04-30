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
  emptyLabel = "No results.",
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
  getRowKey
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safePageSize = pageSizeOptions.includes(pageSize) ? pageSize : pageSizeOptions[0] || 10;

  const totalPages = useMemo(() => {
    const total = typeof totalRows === "number" ? totalRows : safeRows.length;
    return Math.max(1, Math.ceil(total / safePageSize));
  }, [safeRows.length, safePageSize, totalRows]);

  const safePage = clamp(page || 1, 1, totalPages);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

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
              <span className="visually-hidden">Search</span>
              <input
                type="search"
                value={searchValue || ""}
                onChange={(e) => onSearchValueChange(e.target.value)}
                placeholder="Search…"
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
                  Loading…
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
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mb-table__foot">
        <div className="mb-table__pager">
          <button type="button" className="mb-table__pagebtn" disabled={!canPrev} onClick={() => onPageChange?.(safePage - 1)}>
            Previous
          </button>
          <div className="mb-table__pagenums" aria-label="Pages">
            <span className="mb-table__pagenum">
              {safePage} / {totalPages}
            </span>
          </div>
          <button type="button" className="mb-table__pagebtn" disabled={!canNext} onClick={() => onPageChange?.(safePage + 1)}>
            Next
          </button>
        </div>

        <label className="mb-table__pagesize">
          <span className="mb-table__pagesize-label">Rows</span>
          <select value={safePageSize} onChange={(e) => onPageSizeChange?.(Number(e.target.value))}>
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

