/**
 * McBuleli — Service Worker (PWA)
 * - Statiques : cache-first (hors /api)
 * - Navigation : network-first, repli offline.html
 * - /api/* : toujours réseau, jamais mis en cache (données sensibles)
 */

const VERSION = "mcbuleli-sw-v4";
const CACHE_STATIC = `${VERSION}-static`;
const CACHE_RUNTIME = `${VERSION}-runtime`;

const PRECACHE_URLS = [
  "/offline.html",
  "/mcbuleli-logo.svg",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[SW] precache", err))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!key.startsWith(VERSION) && (key.includes("mcbuleli-sw") || key.includes("mcb-static"))) {
              return caches.delete(key);
            }
            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

/** Ne jamais intercepter les requêtes avec jetons. */
function hasSensitiveHeader(request) {
  const a = request.headers.get("Authorization");
  const x = request.headers.get("X-Portal-Token");
  return Boolean((a && a.length > 0) || (x && x.length > 0));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isApiRequest(url) || hasSensitiveHeader(request)) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ message: "Hors ligne" }), { status: 503 }))
    );
    return;
  }

  if (request.mode === "navigate" || request.headers.get("Accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
          return new Response("Hors ligne", { status: 503, statusText: "Offline" });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((res) => {
            if (res.ok) {
              caches.open(CACHE_RUNTIME).then((c) => c.put(request, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_RUNTIME).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/offline.html"));
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
