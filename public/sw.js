// Service worker: кэширует "оболочку" приложения (HTML/JS/иконки), чтобы сама
// страница открывалась даже без интернета. Данные (каталог, записи, чат и т.д.)
// сюда не входят — это отдельная логика с офлайн-очередью внутри самого приложения
// (см. entry.jsx и App.jsx), сервис-воркер отвечает только за то, чтобы код вообще
// смог загрузиться и запуститься без сети.
//
// Стратегия: СНАЧАЛА СЕТЬ, кэш — только запасной вариант, если сети совсем нет
// (или она не ответила за отведённое время). Так каждое обновление bundle.js сразу
// видно сотрудникам — не нужно просить их вручную перезакрывать приложение после
// каждого деплоя.
//
// Почему это не медленно: сервер (Express) сам умеет отвечать "файл не изменился"
// (заголовки ETag/Last-Modified) — если bundle.js такой же, как в прошлый раз,
// браузер получает короткий быстрый ответ вместо повторной закачки всех 3.5 МБ.
// Заметно дольше будет только сразу после того, как вы выкатили новую версию — тогда
// её действительно нужно скачать, это ожидаемо и оправдано.
//
// !!! При каждом обновлении bundle.js/index.html меняйте номер версии ниже (v4, v5...) —
// это заставит браузер полностью пересоздать кэш, а не мучиться с частично устаревшим.
const CACHE_NAME = "packer-tracker-shell-v4";
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
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Кэшируем каждый файл ОТДЕЛЬНО, а не всё разом через cache.addAll — если один
      // файл не загрузится (например, временная сетевая заминка), это не должно
      // ломать установку остальных. cache.addAll — всё или ничего, это слишком хрупко.
      Promise.all(
        SHELL_FILES.map((url) => cache.add(url).catch(() => { /* не страшно, обновится при следующей загрузке */ }))
      )
    )
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

function fetchWithTimeout(req, ms) {
  // cache: "no-cache" — не "не кэшировать вообще", а "всегда сверяться с сервером,
  // прежде чем использовать закэшированное" (браузер сам решит — 304 быстро или
  // качать заново, если правда что-то изменилось)
  const revalidatingReq = new Request(req, { cache: "no-cache" });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(revalidatingReq).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

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
    fetchWithTimeout(req, NETWORK_TIMEOUT_MS)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        // Сети совсем нет (или не ответила вовремя) — показываем последнюю
        // сохранённую версию вместо пустого экрана
        caches.match(req).then((cached) => cached || caches.match("/index.html"))
      )
  );
});
