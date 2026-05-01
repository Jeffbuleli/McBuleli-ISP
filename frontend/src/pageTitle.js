/** Short browser tab title for public / auth surfaces (no long SEO string). */
export const MCBULELI_TAB = "McBuleli";

export function setIndependentPublicPageTitle() {
  if (typeof document !== "undefined") {
    document.title = MCBULELI_TAB;
  }
}

/** Dashboard or subscriber portal: `ISP — McBuleli` */
export function setWorkspaceTabTitle(displayName) {
  if (typeof document === "undefined") return;
  const n = displayName != null ? String(displayName).trim() : "";
  if (!n || n === "AA") {
    document.title = MCBULELI_TAB;
    return;
  }
  document.title = `${n} - ${MCBULELI_TAB}`;
}
