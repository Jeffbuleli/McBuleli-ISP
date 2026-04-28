/**
 * Enregistrement du service worker — production uniquement (évite les caches pendant le dev Vite).
 */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              /* nouvelle version disponible — option : reg.waiting?.postMessage({ type: 'SKIP_WAITING' }) */
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[PWA] Échec d’enregistrement du service worker :", err);
      });
  });
}
