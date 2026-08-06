const CACHE_NAME = "calldesk-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
];

// 1. Install Event: Cache App Shell Only
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up old shell caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Network-First for Shell with Cache Fallback, NEVER Cache API Data
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // CRITICAL RULE: NEVER cache Supabase API requests (leads, activities, followups, auth tokens).
  // Serving cached lead lists causes duplicate calling and stale status errors.
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/auth/")
  ) {
    // Explicit bypass: Network-only with zero caching
    return;
  }

  // Only handle GET requests for app shell
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If successful network response for a static asset, update cache
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.startsWith("/_next/static/") || SHELL_ASSETS.includes(url.pathname))
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Offline Fallback: Serve cached shell asset if network fails
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get("accept")?.includes("text/html")) {
            return caches.match("/");
          }
          return new Response("Offline - Asset unavailable", { status: 503 });
        });
      })
  );
});

// 4. Message Event: Skip waiting on user update request
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
