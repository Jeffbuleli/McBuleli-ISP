/**
 * Manifest PWA dynamique via URL HTTP (jamais blob: - Chrome refuse l'install).
 * Exemple: /api/public/pwa-manifest?name=MonFAI
 */

export function applyWorkspacePwaManifest(workspaceTitle) {
  if (typeof document === "undefined") return;

  const clean = workspaceTitle != null ? String(workspaceTitle).trim() : "";
  const partner = clean && clean !== "AA" ? clean : "";

  let href = "/api/public/pwa-manifest";
  if (partner) {
    const q = new URLSearchParams({ name: partner });
    href = `${href}?${q.toString()}`;
  }

  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  if (link.href !== new URL(href, window.location.origin).href) {
    link.href = href;
  }

  const title = partner ? `${partner} - McBuleli` : "McBuleli";
  let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (!appleTitle) {
    appleTitle = document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    document.head.appendChild(appleTitle);
  }
  appleTitle.content = partner ? (partner.length > 12 ? partner.slice(0, 12) : partner) : "McBuleli";
  if (document.title !== title && !document.title.startsWith(partner || "McBuleli")) {
    /* keep page-specific titles; only set app title meta */
  }
}
