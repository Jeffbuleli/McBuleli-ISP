/**
 * Enregistrement du service worker - production uniquement.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
        return reg.update();
      })
      .catch((err) => {
        console.warn("[PWA] Echec d'enregistrement du service worker :", err);
      });
  });
}
