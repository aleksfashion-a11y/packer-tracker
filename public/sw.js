// Service worker: кэширует "оболочку" приложения (HTML/JS/иконки), чтобы сама
// страница открывалась даже без интернета. Данные (каталог, записи, чат и т.д.)
// сюда не входят — это отдельная логика с офлайн-очередью внутри самого приложения
// (см. entry.jsx и App.jsx), сервис-воркер отвечает только за то, чтобы код вообще
// смог загрузиться и запуститься без сети.

const CACHE_NAME = "packer-tracker-shell-v1";
const SHELL_FILES = [
  "/",
  "/index.html",
  "/bundle.js",
  "/manifest.json",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Данные (/api/...) всегда идут напрямую в сеть — сервис-воркер их не трогает
  // и не кэширует. Если сети нет — этот запрос честно упадёт, а офлайн-логика
  // внутри самого приложения (мираж-кэш в localStorage / очередь на отправку)
  // разберётся с этим сама.
  if (url.pathname.startsWith("/api/")) return;

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match("/index.html"));
      // Оболочка: сначала кэш (мгновенно, работает офлайн), в фоне обновляем из сети
      return cached || network;
    })
  );
});
