const CACHE_NAME = "grok-chess-v1";
const ENGINE_CACHE = "grok-chess-engine-v1";
const PRECACHE = [
  "/",
  "/favicon.svg",
  "/__grok/icon-180.png",
  "/__grok/manifest.webmanifest",
  "/engine/stockfish-nnue-16-single.js",
  "/engine/stockfish-nnue-16-single.wasm",
  "/engine/nn-5af11540bbfe.nnue",
  "/pieces/wK.svg","/pieces/wQ.svg","/pieces/wR.svg","/pieces/wB.svg","/pieces/wN.svg","/pieces/wP.svg",
  "/pieces/bK.svg","/pieces/bQ.svg","/pieces/bR.svg","/pieces/bB.svg","/pieces/bN.svg","/pieces/bP.svg",
];
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE.filter((u) => !u.includes("/engine/"))).catch(() => {});
    const engineCache = await caches.open(ENGINE_CACHE);
    await Promise.all(PRECACHE.filter((u) => u.includes("/engine/")).map(async (url) => {
      try { const res = await fetch(url); if (res.ok) await engineCache.put(url, res); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== ENGINE_CACHE).map((k) => caches.delete(k)));
    self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const respond = async () => {
    const engine = url.pathname.startsWith("/engine/");
    const cacheName = engine ? ENGINE_CACHE : CACHE_NAME;
    if (engine || url.pathname.startsWith("/pieces/") || url.pathname.startsWith("/__grok/") || /\.(svg|png|jpg|css|js|wasm)$/.test(url.pathname)) {
      const hit = await caches.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) (await caches.open(cacheName)).put(request, res.clone());
      return res;
    }
    try {
      const res = await fetch(request);
      if (res.ok) (await caches.open(CACHE_NAME)).put(request, res.clone());
      return res;
    } catch {
      return (await caches.match(request)) || (await caches.match("/")) || new Response("Offline", { status: 503 });
    }
  };
  event.respondWith(respond());
});
