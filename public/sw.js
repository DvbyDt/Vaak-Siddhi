/**
 * VaakSiddhi Service Worker
 * Strategy:
 *   - App shell (HTML, JS, CSS) → Cache-first, updated in background
 *   - shlokas.json              → Cache-first (rarely changes)
 *   - /api/*                    → Network-only (never cache AI responses)
 *   - Google Fonts              → Stale-while-revalidate (works offline after first load)
 */

const CACHE     = "vaaksiddhi-v1";
const API_REGEX = /\/api\//;
const FONT_REGEX = /fonts\.(googleapis|gstatic)\.com/;

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll([
        "/",
        "/manifest.json",
        "/om.svg",
      ])
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ──────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — always go to network, never cache
  if (API_REGEX.test(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  // Google Fonts — stale-while-revalidate so they work offline after first visit
  if (FONT_REGEX.test(url.hostname)) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request).then(res => {
          cache.put(request, res.clone());
          return res;
        }).catch(() => null);
        return cached || networkPromise;
      })
    );
    return;
  }

  // Everything else — cache-first, fall back to network
  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const res = await fetch(request);
        // Only cache successful same-origin or CDN responses
        if (res.ok && (url.origin === self.location.origin || FONT_REGEX.test(url.hostname))) {
          cache.put(request, res.clone());
        }
        return res;
      } catch {
        // Offline and not cached — return a minimal offline page for navigation
        if (request.mode === "navigate") {
          return caches.match("/");
        }
        return new Response("Offline", { status: 503 });
      }
    })
  );
});
