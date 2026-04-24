/** @param {string} line */
export function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (!inQ && c === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** @param {string} text */
export function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = cols[j] != null ? String(cols[j]).trim() : "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

/** @param {unknown} val */
export function escapeCsvField(val) {
  const s = val == null ? "" : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {string[]} headers
 * @param {Record<string, unknown>[]} rows
 */
export function rowsToCsv(headers, rows) {
  const head = headers.map(escapeCsvField).join(",");
  const body = rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(","));
  return [head, ...body].join("\r\n");
}
