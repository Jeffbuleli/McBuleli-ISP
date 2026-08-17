/** Short browser tab title for public / auth surfaces (no long SEO string). */
export const MCBULELI_TAB = "McBuleli";

/** Homepage title kept for Google (do not overwrite with the short tab label). */
export const PUBLIC_HOME_TITLE =
  "McBuleli ISP - Logiciel de gestion FAI en RDC et Afrique";

export function setIndependentPublicPageTitle() {
  if (typeof document !== "undefined") {
    document.title = MCBULELI_TAB;
  }
}

export function setPublicHomePageTitle() {
  if (typeof document !== "undefined") {
    document.title = PUBLIC_HOME_TITLE;
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
