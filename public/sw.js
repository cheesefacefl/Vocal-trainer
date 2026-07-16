// Service worker: caches the app shell so Aria opens instantly and works like
// a native app. The coach API is always fetched live (never cached).
const CACHE = "aria-v1";
const SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/pitch.js",
  "/manifest.json",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Never cache the coach API — always go to the network.
  if (request.url.includes("/api/")) return;
  if (request.method !== "GET") return;

  // Cache-first for the app shell, falling back to the network.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
