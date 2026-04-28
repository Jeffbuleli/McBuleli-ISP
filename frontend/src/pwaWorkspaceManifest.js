/**
 * Manifest Web App dynamique : « {nom de l’espace} — McBuleli »
 * (blob URL, même origine — requis pour installation après connexion).
 */

const MANIFEST_SUFFIX = {
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  dir: "ltr",
  lang: "fr",
  background_color: "#0a0a0a",
  theme_color: "#0a0a0a",
  categories: ["business", "finance", "productivity"],
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
  ]
};

let lastManifestBlobUrl = null;

/**
 * @param {string} workspaceTitle - Nom affiché de l’entreprise / espace (sans « McBuleli »)
 */
export function applyWorkspacePwaManifest(workspaceTitle) {
  if (typeof document === "undefined") return;

  const clean = workspaceTitle != null ? String(workspaceTitle).trim() : "";
  const partner = clean && clean !== "AA" ? clean : "";
  const name = partner ? `${partner} — McBuleli` : "McBuleli ISP";
  const short_name = partner ? (partner.length > 16 ? `${partner.slice(0, 15)}…` : partner) : "McBuleli";

  const manifest = {
    id: `${window.location.origin}/`,
    name,
    short_name,
    description:
      "Plateforme d'exploitation pour opérateurs FAI : facturation, réseau, portail abonnés.",
    ...MANIFEST_SUFFIX
  };

  if (lastManifestBlobUrl) {
    URL.revokeObjectURL(lastManifestBlobUrl);
    lastManifestBlobUrl = null;
  }

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json;charset=utf-8" });
  lastManifestBlobUrl = URL.createObjectURL(blob);

  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = lastManifestBlobUrl;
}
