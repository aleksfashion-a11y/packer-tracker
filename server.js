const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");

const { applyOps, validateOps, PatchError } = require("./lib/patch");
const auth = require("./lib/auth");
const access = require("./lib/access");
const secrets = require("./lib/secrets");
const { ensureBundle, appVersion } = require("./lib/build");
const coll = require("./lib/collections");
const { pgDriver } = require("./lib/rows-pg");

const app = express();
const PORT = process.env.PORT || 3000;
app.set("trust proxy", true); // приложение стоит за прокси Timeweb — настоящий IP и https берём из его заголовков
app.disable("x-powered-by");

// Имя текущего проекта в общей базе данных. Если вы подключите эту же
// PostgreSQL к другому проекту — просто задайте там другой PROJECT_NAME,
// и данные не пересекутся, даже если ключи (key) совпадут по названию.
const PROJECT_NAME = process.env.PROJECT_NAME || "packer-tracker";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  (process.env.PGHOST
    ? `postgres://${process.env.PGUSER}:${encodeURIComponent(
        process.env.PGPASSWORD || ""
      )}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`
    : null);

// ===================== Хранилище =====================
// store.get/set всегда оперируют JSON-ТЕКСТОМ (строкой). store.version(key) —
// короткая "метка версии" значения: меняется при каждой записи. По ней сервер
// отвечает браузеру "ничего не изменилось" (304), не пересылая само значение.

let store;

function makeFileStore() {
  function resolveDataDir() {
    const candidates = [];
    if (process.env.DATA_DIR) candidates.push(process.env.DATA_DIR);
    candidates.push(path.join(os.tmpdir(), "packer-tracker-data"));
    for (const dir of candidates) {
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return dir;
      } catch (e) {
        // пробуем следующий вариант
      }
    }
    const fallback = path.join(__dirname, ".data");
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }

  const DATA_DIR = resolveDataDir();
  const STORE_FILE = path.join(DATA_DIR, "store.json");
  console.log(
    "⚠️  PostgreSQL не настроен — данные хранятся во временной папке:",
    STORE_FILE,
    "(будут стёрты при следующем деплое)"
  );

  let cache = null;
  function load() {
    if (cache) return cache;
    if (!fs.existsSync(STORE_FILE)) { cache = {}; return cache; }
    try {
      cache = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
    } catch (e) {
      cache = {};
    }
    return cache;
  }
  function save() {
    fs.writeFileSync(STORE_FILE, JSON.stringify(cache));
  }
  const boot = Date.now().toString(36);
  const versions = new Map();
  let counter = 0;
  const versionOf = (key) => {
    if (!versions.has(key)) versions.set(key, `${boot}.${++counter}`);
    return versions.get(key);
  };
  const asText = (v) => (typeof v === "string" ? v : JSON.stringify(v));

  return {
    dataDir: DATA_DIR,
    async list(prefix) {
      return Object.keys(load()).filter((k) => k.startsWith(prefix));
    },
    async get(key) {
      const obj = load();
      return key in obj ? asText(obj[key]) : undefined;
    },
    async getWithVersion(key) {
      const obj = load();
      if (!(key in obj)) return undefined;
      return { value: asText(obj[key]), version: versionOf(key) };
    },
    async version(key) {
      return key in load() ? versionOf(key) : undefined;
    },
    async set(key, value) {
      load();
      cache[key] = asText(value);
      versions.set(key, `${boot}.${++counter}`);
      save();
    },
    async del(key) {
      load();
      const existed = key in cache;
      delete cache[key];
      versions.delete(key);
      save();
      return existed;
    },
  };
}

function makePgStore() {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  pool.on("error", (err) => console.error("❌ Ошибка соединения с PostgreSQL:", err.message));

  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      project TEXT NOT NULL,
      key TEXT NOT NULL,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (project, key)
    );
  `).then(() => {
    console.log(`✅ Подключено к PostgreSQL, проект: "${PROJECT_NAME}"`);
  }).catch((err) => {
    console.error("❌ Не удалось подключиться к PostgreSQL:", err.message);
  });

  // Значение читаем сразу как текст (value::text) — без лишнего разбора и повторной
  // сборки JSON на каждом запросе. Историческая особенность: часть старых значений
  // лежит в базе "дважды обёрнутой" (JSON-строка, внутри которой JSON-текст) — такие
  // распаковываем один раз здесь, чтобы наружу всегда выходил обычный JSON-текст.
  const normalize = (text) => {
    if (typeof text === "string" && text.startsWith('"')) {
      try {
        const inner = JSON.parse(text);
        if (typeof inner === "string") return inner;
      } catch (e) { /* оставляем как есть */ }
    }
    return text;
  };
  // Метка версии строки: xmin меняется при ЛЮБОМ изменении строки (в том числе при
  // ручной правке через pgAdmin), updated_at — при записи из приложения.
  const VERSION_SQL = "xmin::text || '.' || (extract(epoch from updated_at) * 1000)::bigint::text";

  return {
    pool,
    ready,
    async list(prefix) {
      await ready;
      const { rows } = await pool.query(
        "SELECT key FROM kv_store WHERE project = $1 AND left(key, $3) = $2",
        [PROJECT_NAME, prefix, prefix.length]
      );
      return rows.map((r) => r.key);
    },
    async get(key) {
      await ready;
      const { rows } = await pool.query(
        "SELECT value::text AS v FROM kv_store WHERE project = $1 AND key = $2",
        [PROJECT_NAME, key]
      );
      if (!rows.length) return undefined;
      return normalize(rows[0].v);
    },
    async getWithVersion(key) {
      await ready;
      const { rows } = await pool.query(
        `SELECT value::text AS v, ${VERSION_SQL} AS ver FROM kv_store WHERE project = $1 AND key = $2`,
        [PROJECT_NAME, key]
      );
      if (!rows.length) return undefined;
      return { value: normalize(rows[0].v), version: rows[0].ver };
    },
    async version(key) {
      await ready;
      const { rows } = await pool.query(
        `SELECT ${VERSION_SQL} AS ver FROM kv_store WHERE project = $1 AND key = $2`,
        [PROJECT_NAME, key]
      );
      return rows.length ? rows[0].ver : undefined;
    },
    async set(key, value) {
      await ready;
      // Пришла готовая JSON-строка — записываем её КАК ЕСТЬ, без повторного
      // оборачивания: Postgres сам сохранит её как настоящий JSONB-массив/объект.
      const jsonText = typeof value === "string" ? value : JSON.stringify(value);
      await pool.query(
        `INSERT INTO kv_store (project, key, value, updated_at)
         VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (project, key)
         DO UPDATE SET value = $3::jsonb, updated_at = now()`,
        [PROJECT_NAME, key, jsonText]
      );
    },
    async del(key) {
      await ready;
      const { rowCount } = await pool.query(
        "DELETE FROM kv_store WHERE project = $1 AND key = $2",
        [PROJECT_NAME, key]
      );
      return rowCount > 0;
    },
  };
}

store = DATABASE_URL ? makePgStore() : makeFileStore();

// Обёртки для СЕРВЕРНОГО кода, которому нужны настоящие объекты/массивы.
// storeGetJSON — "мягкое" чтение: если значение не читается, возвращает fallback.
// storeGetJSONStrict — для случаев "прочитать → изменить → записать": если значение
// есть, но не читается, бросает ошибку — чтобы не записать поверх него пустоту.//
// Разделы приложения (записи, чат, каталог, сотрудники...) хранятся в таблицах —
// по строке на элемент (см. lib/collections.js). Эти три функции сами выбирают, откуда
// читать: из таблицы раздела или из общего хранилища ключ-значение (настройки, снимки,
// служебные ключи). Остальному серверному коду знать об этом не нужно.
let tables = null; // драйвер таблиц; null — таблицы не используются (старый способ хранения)
const usesTables = (key) => tables !== null && coll.isCollection(key) && !coll.SPECS[key].internal;
// Раздел считается существующим, если в него хоть раз что-то записывали (пусть даже
// сейчас он пуст) — по этому приложение отличает "ещё не создано" от "всё удалили"
const tableExists = async (key) => (await tables.version(key)) !== "0";

async function storeGetJSON(key, fallback) {
  try {
    return await storeGetJSONStrict(key, fallback);
  } catch (e) {
    return fallback;
  }
}
async function storeGetJSONStrict(key, fallback) {
  if (usesTables(key)) {
    if (!(await tableExists(key))) return fallback;
    return coll.readValue(tables, key);
  }
  const raw = await store.get(key);
  if (raw === undefined || raw === null) return fallback;
  return JSON.parse(raw);
}
async function storeSetJSON(key, value) {
  if (usesTables(key)) {
    await tables.tx(async (t) => { await coll.syncAll(t, key, value); await t.bump(key); });
    return;
  }
  await store.set(key, JSON.stringify(value));
}

// ===================== Запуск хранения в таблицах =====================
// 1. Создаём таблицы (если их ещё нет).
// 2. Самопроверка: прогоняем на служебной таблице набор действий и сверяем результат с
//    эталоном. Если база ведёт себя не так, как ожидается, — таблицы не включаем и
//    продолжаем работать по-старому (данные при этом не трогаем).
// 3. Первый запуск: переносим все разделы из старого хранилища в таблицы одной
//    транзакцией и сверяем каждый раздел с оригиналом. Не сошлось хоть что-то — откат,
//    работаем по-старому. Старые данные в kv_store остаются на месте как страховка.
const DATA_KEYS = Object.keys(coll.SPECS).filter((k) => !coll.SPECS[k].internal);
async function initTables() {
  if (process.env.STORAGE_MODE === "kv") {
    console.log("⚠️  STORAGE_MODE=kv — таблицы отключены, данные хранятся по-старому");
    return;
  }
  if (store.ready) await store.ready;
  const driver = store.pool ? pgDriver(store.pool, PROJECT_NAME) : coll.memoryDriver(path.join(store.dataDir, "tables.json"));
  const markerRaw = await store.get("_tables");
  const marker = markerRaw ? JSON.parse(markerRaw) : null;
  try {
    await driver.ensure(Object.keys(coll.SPECS));
    const problem = await coll.selfCheck(driver);
    if (problem) throw new Error("самопроверка таблиц не пройдена — " + problem);
  } catch (e) {
    if (marker) throw e; // данные уже в таблицах — работать по-старому нельзя, это были бы устаревшие данные
    console.error("❌ Таблицы не включены, работаем по-старому:", e.message);
    return;
  }
  if (!marker) {
    try {
      const summary = [];
      await driver.tx(async (t) => {
        for (const key of DATA_KEYS) {
          const raw = await store.get(key);
          if (raw === undefined || raw === null) continue;
          const value = JSON.parse(raw);
          if (value === null) continue;
          const spec = coll.SPECS[key];
          await t.clear(key);
          const report = await coll.syncAll(t, key, value);
          const expected = coll.rowsToValue(spec, coll.valueToRows(spec, value).rows);
          const actual = await coll.readValue(t, key);
          if (!coll.deepEqual(expected, actual)) throw new Error(`раздел «${key}» после переноса не совпал с оригиналом`);
          await t.bump(key);
          const n = spec.kind === "array" ? actual.length : Object.keys(actual).length;
          summary.push(`${key}: ${n}` + (report.skipped || report.duplicates ? ` (пропущено без ключа: ${report.skipped}, повторов ключа: ${report.duplicates})` : ""));
        }
      });
      await store.set("_tables", JSON.stringify({ version: 1, migratedAt: new Date().toISOString() }));
      console.log("📋 Данные перенесены в таблицы и сверены с оригиналом — " + (summary.join("; ") || "переносить было нечего"));
    } catch (e) {
      console.error("❌ Перенос в таблицы не выполнен, работаем по-старому (данные не изменены):", e.message);
      return;
    }
  }
  tables = driver;
  console.log(`✅ Данные хранятся в таблицах (${driver.name}), самопроверка пройдена`);
}
const dataReady = initTables();
dataReady.catch((e) => console.error("❌ ХРАНИЛИЩЕ НЕДОСТУПНО:", e.message));

// Очередь на каждый ключ: "прочитать → изменить → записать" для одного и того же
// ключа выполняется строго по одному, чтобы два одновременных запроса не затёрли
// результат друг друга.
const keyLocks = new Map();
function acquireKeyLock(key) {
  const prev = keyLocks.get(key) || Promise.resolve();
  let release;
  const mine = new Promise((resolve) => { release = resolve; });
  const tail = prev.then(() => mine);
  keyLocks.set(key, tail);
  tail.then(() => { if (keyLocks.get(key) === tail) keyLocks.delete(key); });
  return prev.then(() => release);
}
async function withKeyLock(key, fn) {
  const release = await acquireKeyLock(key);
  try {
    return await fn();
  } finally {
    release();
  }
}

// ===================== Общие помощники =====================

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Оборачивает обработчик: любая ошибка превращается в понятный JSON-ответ
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    const status = e && e.status ? e.status : 500;
    if (status >= 500) console.error(`[${req.method} ${req.path}]`, e);
    if (!res.headersSent) res.status(status).json({ error: status >= 500 ? "Ошибка сервера: " + e.message : e.message });
  });
};

// JSON-ответ со сжатием: списки записей/каталог/чат сжимаются в 5-10 раз — на
// мобильном интернете это заметно ускоряет загрузку
function sendJSON(req, res, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf-8");
  res.set("Content-Type", "application/json; charset=utf-8");
  const accepts = String(req.headers["accept-encoding"] || "");
  if (body.length < 1024 || !/\bgzip\b/.test(accepts)) return res.send(body);
  zlib.gzip(body, { level: 6 }, (err, zipped) => {
    if (err) return res.send(body);
    res.set("Content-Encoding", "gzip");
    res.set("Vary", "Accept-Encoding");
    res.send(zipped);
  });
}

app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "15mb" }));

// ===================== Интерфейс: сборка и раздача =====================
// bundle.js собирается самим сервером при запуске (см. lib/build.js)

const bundlePromise = ensureBundle(__dirname, console.log).catch((e) => {
  console.error("❌ Не удалось собрать интерфейс:", e.message);
  return { error: e.message };
});

app.get("/bundle.js", wrap(async (req, res) => {
  const bundle = await bundlePromise;
  res.set("Content-Type", "application/javascript; charset=utf-8");
  if (bundle.error) {
    res.set("Cache-Control", "no-store");
    const text = "Приложение не удалось собрать на сервере. Сообщите администратору — подробности в логах приложения.";
    return res.send(`document.getElementById("root").innerHTML = '<div style="padding:24px;font-family:sans-serif">' + ${JSON.stringify(text)} + '</div>';`);
  }
  const etag = `"${bundle.hash}"`;
  res.set("ETag", etag);
  res.set("Cache-Control", "no-cache"); // каждый раз короткая сверка с сервером; качается заново только после обновления
  res.set("Vary", "Accept-Encoding");
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  const accepts = String(req.headers["accept-encoding"] || "");
  if (bundle.br && /\bbr\b/.test(accepts)) { res.set("Content-Encoding", "br"); return res.send(bundle.br); }
  if (bundle.gz && /\bgzip\b/.test(accepts)) { res.set("Content-Encoding", "gzip"); return res.send(bundle.gz); }
  res.send(bundle.js);
}));

// Какая версия сейчас на сервере — по этому открытое приложение узнаёт, что вышло обновление
app.get("/api/version", wrap(async (req, res) => {
  const bundle = await bundlePromise;
  res.json({ version: appVersion(__dirname), build: bundle.hash || null });
}));

// Номер версии кэша в service worker подставляется автоматически (по номеру сборки
// интерфейса) — вручную менять v4 → v5 при каждом обновлении больше не нужно
app.get("/sw.js", wrap(async (req, res) => {
  const bundle = await bundlePromise;
  let text = fs.readFileSync(path.join(__dirname, "public", "sw.js"), "utf-8");
  if (bundle.hash) text = text.replace(/packer-tracker-shell-[\w-]+/, "packer-tracker-shell-" + bundle.hash);
  res.set("Content-Type", "application/javascript; charset=utf-8");
  res.set("Cache-Control", "no-cache");
  res.send(text);
}));

app.use(express.static(path.join(__dirname, "public")));

// ===================== Пользователи и сессии =====================

let usersCache = null; // { at, users }
const USERS_CACHE_MS = 10 * 1000;
async function getUsers() {
  if (usersCache && Date.now() - usersCache.at < USERS_CACHE_MS) return usersCache.users;
  const users = (await storeGetJSON("users", [])) || [];
  usersCache = { at: Date.now(), users: Array.isArray(users) ? users : [] };
  return usersCache.users;
}
function invalidateUsers() { usersCache = null; }

// Изменение списка сотрудников на сервере: fn получает актуальный список и возвращает новый
async function mutateUsers(fn) {
  return withKeyLock("users", async () => {
    const users = (await storeGetJSONStrict("users", [])) || [];
    const result = await fn(users);
    if (result && result.users) {
      await storeSetJSON("users", result.users);
      invalidateUsers();
    }
    return result;
  });
}

// Сессии: в браузере лежит только случайный ключ (cookie, недоступная скриптам),
// на сервере — его хеш и кому он принадлежит. Хранятся в базе под служебным ключом,
// поэтому переживают перезапуск и обновление приложения — заново входить не нужно.
const SESSION_COOKIE = "pt_sid";
const sessions = new Map(); // хеш ключа → { userId, createdAt, lastSeenAt }
let sessionsDirty = false;
const sessionsReady = (async () => {
  try {
    const saved = (await storeGetJSON("_sessions", {})) || {};
    const now = Date.now();
    for (const [h, s] of Object.entries(saved)) {
      if (s && s.userId && now - (s.lastSeenAt || s.createdAt || 0) < auth.SESSION_TTL_MS) sessions.set(h, s);
    }
  } catch (e) {
    console.error("Не удалось загрузить сессии:", e.message);
  }
})();
async function saveSessions() {
  sessionsDirty = false;
  try {
    await withKeyLock("_sessions", () => storeSetJSON("_sessions", Object.fromEntries(sessions)));
  } catch (e) {
    sessionsDirty = true;
    console.error("Не удалось сохранить сессии:", e.message);
  }
}
const sessionsTimer = setInterval(() => { if (sessionsDirty) saveSessions(); }, 10 * 60 * 1000);
if (sessionsTimer.unref) sessionsTimer.unref();

const isHttps = (req) => req.secure || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
function setSessionCookie(req, res, token) {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.floor(auth.SESSION_TTL_MS / 1000)}`];
  if (isHttps(req)) parts.push("Secure");
  res.set("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(req, res) {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isHttps(req)) parts.push("Secure");
  res.set("Set-Cookie", parts.join("; "));
}
async function startSession(req, res, user) {
  await sessionsReady;
  const token = auth.newToken();
  const now = Date.now();
  sessions.set(auth.sha256hex(token), { userId: user.id, createdAt: now, lastSeenAt: now });
  await saveSessions();
  setSessionCookie(req, res, token);
}
async function dropSessionsOf(userIds, exceptHash) {
  const ids = new Set(userIds.map(String));
  let changed = false;
  for (const [h, s] of sessions) {
    if (ids.has(String(s.userId)) && h !== exceptHash) { sessions.delete(h); changed = true; }
  }
  if (changed) await saveSessions();
}

// Определяет, кто делает запрос (req.user), для всех /api/...
app.use("/api", (req, res, next) => {
  (async () => {
    // Защита от подделки запросов с чужих сайтов: всё, что что-то меняет, должно
    // прийти с заголовком, который умеет выставить только само приложение
    if (req.method !== "GET" && req.method !== "HEAD" && !req.headers["x-requested-with"]) {
      throw new HttpError(403, "Запрос отклонён");
    }
    try { await dataReady; } catch (e) { throw new HttpError(503, "Хранилище данных недоступно — подробности в логах приложения"); }
    await sessionsReady;
    req.user = null;
    const token = auth.parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const hash = auth.sha256hex(token);
      const session = sessions.get(hash);
      const now = Date.now();
      if (session && now - session.lastSeenAt < auth.SESSION_TTL_MS) {
        const user = (await getUsers()).find((u) => u && u.id === session.userId);
        if (user) {
          req.user = user;
          req.sessionHash = hash;
          if (now - session.lastSeenAt > 12 * 60 * 60 * 1000) {
            session.lastSeenAt = now;
            sessionsDirty = true;
            setSessionCookie(req, res, token); // продлеваем срок жизни cookie у тех, кто пользуется
          }
        } else {
          sessions.delete(hash); // сотрудника удалили — сессия больше недействительна
          sessionsDirty = true;
        }
      } else if (session) {
        sessions.delete(hash);
        sessionsDirty = true;
      }
    }
  })().then(() => next(), (e) => res.status(e.status || 500).json({ error: e.message }));
});

const requireUser = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Нужно войти в систему" });
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Нужно войти в систему" });
  if (!access.isAdmin(req.user)) return res.status(403).json({ error: "Доступно только администратору" });
  next();
};

// Защита от перебора: не больше 10 неудачных попыток на один логин и 60 — с одного
// адреса за 10 минут (порог по адресу выше, потому что весь склад обычно выходит в
// интернет с одного адреса — чужая ошибка при вводе не должна блокировать остальных)
const userLimiter = auth.makeRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 });
const ipLimiter = auth.makeRateLimiter({ max: 60, windowMs: 10 * 60 * 1000 });
function checkLimit(req, username) {
  if (ipLimiter.blocked(req.ip || "?") || (username && userLimiter.blocked(username))) {
    throw new HttpError(429, "Слишком много неудачных попыток. Подождите 10 минут и попробуйте снова");
  }
}
function failLimit(req, username) {
  ipLimiter.fail(req.ip || "?");
  if (username) userLimiter.fail(username);
}
function okLimit(req, username) {
  if (username) userLimiter.reset(username);
}

async function logLogin(req, user, method) {
  try {
    await withKeyLock("loginLog", async () => {
      const log = (await storeGetJSON("loginLog", [])) || [];
      log.push({ id: auth.newId(), userId: user.id, userName: user.name, method, device: auth.parseDevice(req.headers["user-agent"]), timestamp: Date.now() });
      await storeSetJSON("loginLog", log.slice(-500));
    });
  } catch (e) { /* журнал входов — не критично */ }
}

const normUsername = (s) => String(s || "").trim().toLowerCase();
const normSecretWord = (s) => String(s || "").trim().toLowerCase();
function checkNewPassword(password) {
  if (typeof password !== "string" || password.length < auth.MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Пароль должен быть не короче ${auth.MIN_PASSWORD_LENGTH} символов`);
  }
  if (password.length > 200) throw new HttpError(400, "Слишком длинный пароль");
}
async function isRegistrationOpen() {
  const settings = (await storeGetJSON("settings", {})) || {};
  return settings.registrationOpen !== false;
}

// ---------- Вход / регистрация / восстановление ----------

app.get("/api/auth/state", wrap(async (req, res) => {
  const users = await getUsers();
  res.json({
    hasAdmin: users.some((u) => u && u.role === "admin"),
    registrationOpen: await isRegistrationOpen(),
    user: req.user ? access.userForSelf(req.user) : null,
  });
}));

// Самый первый запуск: создание первого администратора. Работает, только пока
// в системе нет ни одного администратора.
app.post("/api/auth/setup", wrap(async (req, res) => {
  const { name, username, password } = req.body || {};
  const uname = normUsername(username);
  if (!uname || !String(name || "").trim()) throw new HttpError(400, "Заполните все поля");
  checkNewPassword(password);
  const result = await mutateUsers(async (users) => {
    if (users.some((u) => u && u.role === "admin")) throw new HttpError(403, "Администратор уже создан — войдите под его логином");
    if (users.some((u) => u && u.username === uname)) throw new HttpError(400, "Такой логин уже занят");
    const admin = secrets.withQrToken({ id: auth.newId(), username: uname, passwordHash: await auth.hashSecret(password), role: "admin", name: String(name).trim() }, auth.newToken());
    return { users: [...users, admin], user: admin };
  });
  await startSession(req, res, result.user);
  await logLogin(req, result.user, "первый запуск");
  res.json({ user: access.userForSelf(result.user) });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const uname = normUsername((req.body || {}).username);
  const password = String((req.body || {}).password || "");
  checkLimit(req, uname);
  const user = (await getUsers()).find((u) => u && u.username === uname);
  if (!user) { failLimit(req, null); throw new HttpError(400, "Пользователь не найден"); }
  const check = await auth.verifySecret(user.passwordHash, password);
  if (!check.ok) { failLimit(req, uname); throw new HttpError(400, "Неверный пароль"); }
  okLimit(req, uname);
  if (check.legacy) {
    // Старый формат хеша — тихо переводим на новый, раз уж знаем правильный пароль
    const newHash = await auth.hashSecret(password);
    await mutateUsers(async (users) => ({ users: users.map((u) => (u.id === user.id ? { ...u, passwordHash: newHash } : u)) }));
  }
  await startSession(req, res, user);
  await logLogin(req, user, "пароль");
  res.json({ user: access.userForSelf(user) });
}));

app.post("/api/auth/qr", wrap(async (req, res) => {
  const token = String((req.body || {}).token || "").trim();
  checkLimit(req, null);
  const user = token ? (await getUsers()).find((u) => secrets.matchesQrToken(u, token)) : null;
  if (!user) { failLimit(req, null); throw new HttpError(400, "QR-код не распознан"); }
  await startSession(req, res, user);
  await logLogin(req, user, "QR");
  res.json({ user: access.userForSelf(user) });
}));

app.post("/api/auth/register", wrap(async (req, res) => {
  const { name, username, password, secretWord } = req.body || {};
  const uname = normUsername(username);
  const word = normSecretWord(secretWord);
  if (!(await isRegistrationOpen())) throw new HttpError(403, "Регистрация закрыта — обратитесь к администратору");
  if (!uname || !String(name || "").trim() || !word) throw new HttpError(400, "Заполните все поля, включая секретное слово");
  checkNewPassword(password);
  checkLimit(req, null);
  const result = await mutateUsers(async (users) => {
    if (!users.some((u) => u && u.role === "admin")) throw new HttpError(403, "Сначала нужно создать администратора");
    if (users.some((u) => u && u.username === uname)) throw new HttpError(400, "Такой логин уже занят");
    const user = secrets.withQrToken({
      id: auth.newId(), username: uname,
      passwordHash: await auth.hashSecret(password), secretWordHash: await auth.hashSecret(word),
      role: "employee", name: String(name).trim().slice(0, 100), hourlyRate: 0, timerEnabled: false, barcodeAddEnabled: false,
    }, auth.newToken());
    return { users: [...users, user], user };
  });
  await startSession(req, res, result.user);
  await logLogin(req, result.user, "регистрация");
  res.json({ user: access.userForSelf(result.user) });
}));

// Подтверждение личности для восстановления пароля: по QR-коду или по логину + секретному слову
async function findUserForRecovery(req) {
  const body = req.body || {};
  if (body.method === "qr") {
    const token = String(body.token || "").trim();
    checkLimit(req, null);
    const user = token ? (await getUsers()).find((u) => secrets.matchesQrToken(u, token)) : null;
    if (!user) { failLimit(req, null); throw new HttpError(400, "QR-код не распознан"); }
    return { user, method: "восстановление пароля по QR" };
  }
  const uname = normUsername(body.username);
  const word = normSecretWord(body.secretWord);
  checkLimit(req, uname);
  const user = (await getUsers()).find((u) => u && u.username === uname);
  if (!user) { failLimit(req, null); throw new HttpError(400, "Такой логин не найден"); }
  if (!user.secretWordHash) throw new HttpError(400, "У этого аккаунта не задано секретное слово — используйте QR-код или обратитесь к администратору");
  const check = await auth.verifySecret(user.secretWordHash, word);
  if (!check.ok) { failLimit(req, uname); throw new HttpError(400, "Секретное слово не подошло"); }
  okLimit(req, uname);
  return { user, method: "восстановление пароля по секретному слову" };
}

app.post("/api/auth/recover/check", wrap(async (req, res) => {
  const { user } = await findUserForRecovery(req);
  res.json({ ok: true, name: user.name });
}));

app.post("/api/auth/recover", wrap(async (req, res) => {
  const password = (req.body || {}).newPassword;
  checkNewPassword(password);
  const { user, method } = await findUserForRecovery(req);
  const newHash = await auth.hashSecret(password);
  await mutateUsers(async (users) => ({ users: users.map((u) => (u.id === user.id ? { ...u, passwordHash: newHash } : u)) }));
  await dropSessionsOf([user.id]); // пароль сменён — на остальных устройствах нужно войти заново
  await startSession(req, res, user);
  await logLogin(req, user, method);
  res.json({ user: access.userForSelf(user) });
}));

app.post("/api/auth/logout", wrap(async (req, res) => {
  if (req.sessionHash) {
    sessions.delete(req.sessionHash);
    await saveSessions();
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
}));

// Сотрудник задаёт/меняет своё секретное слово
app.post("/api/auth/secret", requireUser, wrap(async (req, res) => {
  const word = normSecretWord((req.body || {}).secretWord);
  if (!word) throw new HttpError(400, "Укажите секретное слово");
  const hash = await auth.hashSecret(word);
  await mutateUsers(async (users) => ({ users: users.map((u) => (u.id === req.user.id ? { ...u, secretWordHash: hash } : u)) }));
  res.json({ ok: true });
}));

// ---------- Действия администратора над учётными записями ----------

app.post("/api/admin/users/:id/password", requireAdmin, wrap(async (req, res) => {
  const password = (req.body || {}).password;
  checkNewPassword(password);
  const hash = await auth.hashSecret(password);
  await mutateUsers(async (users) => {
    if (!users.some((u) => u.id === req.params.id)) throw new HttpError(404, "Сотрудник не найден");
    return { users: users.map((u) => (u.id === req.params.id ? { ...u, passwordHash: hash } : u)) };
  });
  await dropSessionsOf([req.params.id], req.sessionHash);
  res.json({ ok: true });
}));

app.post("/api/admin/users/:id/secret", requireAdmin, wrap(async (req, res) => {
  const word = normSecretWord((req.body || {}).secretWord);
  if (!word) throw new HttpError(400, "Укажите секретное слово");
  const hash = await auth.hashSecret(word);
  await mutateUsers(async (users) => {
    if (!users.some((u) => u.id === req.params.id)) throw new HttpError(404, "Сотрудник не найден");
    return { users: users.map((u) => (u.id === req.params.id ? { ...u, secretWordHash: hash } : u)) };
  });
  res.json({ ok: true });
}));

app.post("/api/admin/admins", requireAdmin, wrap(async (req, res) => {
  const { name, username, password } = req.body || {};
  const uname = normUsername(username);
  if (!uname || !String(name || "").trim()) throw new HttpError(400, "Заполните все поля");
  checkNewPassword(password);
  await mutateUsers(async (users) => {
    if (users.some((u) => u && u.username === uname)) throw new HttpError(400, "Логин занят");
    const admin = secrets.withQrToken({ id: auth.newId(), username: uname, passwordHash: await auth.hashSecret(password), role: "admin", name: String(name).trim() }, auth.newToken());
    return { users: [...users, admin] };
  });
  res.json({ ok: true });
}));

// Хеши паролей и секретных слов — только для файла резервной копии (чтобы после
// восстановления из бэкапа на чистой базе сотрудники могли войти со своими паролями)
app.get("/api/admin/user-secrets", requireAdmin, wrap(async (req, res) => {
  const out = {};
  for (const u of await getUsers()) {
    out[u.id] = { passwordHash: u.passwordHash || null, secretWordHash: u.secretWordHash || null };
  }
  res.json({ secrets: out });
}));

// ===================== Общее хранилище данных приложения =====================
// Ключи с префиксом "_" — служебные/секретные (учётные данные Ozon, сессии).
// Через общий API к ним доступа нет ни у кого — с ними работает только сам сервер.
function isPrivateKey(key) {
  return key.startsWith("_");
}

app.get("/api/kv", requireUser, wrap(async (req, res) => {
  const prefix = String(req.query.prefix || "");
  const all = new Set(await store.list(prefix));
  if (tables) for (const k of DATA_KEYS) if (k.startsWith(prefix) && (await tableExists(k))) all.add(k);
  const keys = [...all].filter((k) => !isPrivateKey(k) && access.canRead(k, req.user));
  res.json({ keys, prefix, shared: true });
}));

app.get("/api/kv/:key", requireUser, wrap(async (req, res) => {
  const key = req.params.key;
  if (isPrivateKey(key) || !access.canRead(key, req.user)) throw new HttpError(403, "Недостаточно прав");
  const filtered = access.needsView(key, req.user);
  const tag = (ver) => `"${ver}-${filtered ? req.user.id : "all"}"`;

  // Сначала спрашиваем только "метку версии" — если у браузера уже есть эта версия,
  // само значение из базы даже не читаем (важно для чата: он опрашивается каждые 4 сек)
  const ifNoneMatch = req.headers["if-none-match"];
  if (usesTables(key)) {
    const ver = await tables.version(key);
    if (ver === "0") throw new HttpError(404, "not found");
    if (ifNoneMatch === tag("t" + ver)) return res.status(304).end();
    const value = JSON.stringify(await readTableView(key, req.user));
    res.set("ETag", tag("t" + ver));
    return sendJSON(req, res, { key, value, shared: true });
  }
  if (ifNoneMatch) {
    const ver = await store.version(key);
    if (ver === undefined) throw new HttpError(404, "not found");
    if (ifNoneMatch === tag(ver)) return res.status(304).end();
  }

  const found = await store.getWithVersion(key);
  if (!found) throw new HttpError(404, "not found");
  let value = found.value;
  if (filtered) value = JSON.stringify(access.viewFor(key, JSON.parse(value), req.user));
  res.set("ETag", tag(found.version));
  sendJSON(req, res, { key, value, shared: true });
}));

// Раздел из таблицы в том виде, в каком его положено видеть этому пользователю.
// Сотруднику из базы выбираются только его строки — чужие даже не читаются.
async function readTableView(key, user) {
  const admin = access.isAdmin(user);
  let rows;
  if (!admin && (key === "entries" || key === "timerSessions")) rows = await tables.query(key, { eq: { employee_id: user.id } });
  else if (!admin && key === "chatMessages") rows = await tables.query(key, { in: { thread_id: ["all", user.id] } });
  else if (key === "loginLog") rows = (await tables.query(key, { orderBy: "ts", desc: true, limit: 500 })).reverse();
  else rows = await tables.all(key);
  const value = coll.rowsToValue(coll.SPECS[key], rows);
  return access.needsView(key, user) ? access.viewFor(key, value, user) : value;
}

// Применение изменений к ключу — общий путь и для точечных изменений, и для замены целиком
async function writeKey(req, key, ops) {
  if (isPrivateKey(key)) throw new HttpError(403, "Недостаточно прав");
  validateOps(ops);
  if (usesTables(key)) return writeTableKey(req, key, ops);
  await withKeyLock(key, async () => {
    const currentText = await store.get(key);
    const current = currentText === undefined ? undefined : JSON.parse(currentText);
    // Защита от порчи данных: списку нельзя прислать изменения "как для словаря" и наоборот
    if (current !== undefined && current !== null) {
      if (ops.kind === "array" && !Array.isArray(current)) throw new HttpError(409, "Формат данных не совпадает с сохранённым");
      if (ops.kind === "object" && (Array.isArray(current) || typeof current !== "object")) throw new HttpError(409, "Формат данных не совпадает с сохранённым");
    }
    const guarded = await access.guardWrite(key, ops, current, req.user, { getJSON: storeGetJSON });
    const next = applyOps(current, guarded, access.MERGE_RULES[key]);
    if (next === undefined) throw new PatchError("Некорректное значение");
    access.checkResult(key, current, next);
    await store.set(key, JSON.stringify(next));
    if (key === "users") {
      invalidateUsers();
      const alive = new Set(next.map((u) => String(u.id)));
      const gone = [...new Set([...sessions.values()].map((s) => String(s.userId)))].filter((id) => !alive.has(id));
      if (gone.length) await dropSessionsOf(gone);
    }
  });
}

// То же для раздела, хранящегося в таблице: меняются только затронутые строки
async function writeTableKey(req, key, ops) {
  const spec = coll.SPECS[key];
  if (ops.kind !== "replace" && ops.kind !== spec.kind) throw new HttpError(409, "Формат данных не совпадает с сохранённым");
  let goneUsers = [];
  await withKeyLock(key, async () => {
    await tables.tx(async (t) => {
      // Для проверки прав читаем только те строки, которых касаются изменения
      // (весь раздел — только для сотрудников: там нужна проверка "остался ли администратор")
      const whole = key === "users";
      const current = whole ? await coll.readValue(t, key) : await coll.readSubset(t, key, coll.referencedIds(spec, ops));
      const guarded = await access.guardWrite(key, ops, current, req.user, { getJSON: storeGetJSON });
      await coll.applyOps(t, key, guarded, access.MERGE_RULES[key]);
      if (whole) {
        const after = await coll.readValue(t, key);
        access.checkResult(key, current, after);
        const alive = new Set(after.map((u) => String(u.id)));
        goneUsers = [...new Set([...sessions.values()].map((x) => String(x.userId)))].filter((id) => !alive.has(id));
      }
      await t.bump(key);
    });
  });
  if (key === "users") {
    invalidateUsers();
    if (goneUsers.length) await dropSessionsOf(goneUsers);
  }
}

app.post("/api/kv/:key/patch", requireUser, wrap(async (req, res) => {
  await writeKey(req, req.params.key, (req.body || {}).ops);
  res.json({ ok: true });
}));

// Замена значения целиком (старый способ записи) — оставлен для совместимости
app.put("/api/kv/:key", requireUser, wrap(async (req, res) => {
  const raw = (req.body || {}).value;
  let value;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new HttpError(400, "Некорректное значение");
  }
  if (value === undefined) throw new HttpError(400, "Некорректное значение");
  await writeKey(req, req.params.key, { kind: "replace", value });
  res.json({ key: req.params.key, shared: true });
}));

app.delete("/api/kv/:key", requireAdmin, wrap(async (req, res) => {
  const key = req.params.key;
  if (isPrivateKey(key) || key === "users") throw new HttpError(403, "Недостаточно прав");
  if (usesTables(key)) {
    await withKeyLock(key, () => tables.tx(async (t) => { await t.clear(key); await t.bump(key); }));
    return res.json({ key, deleted: true, shared: true });
  }
  const existed = await withKeyLock(key, () => store.del(key));
  res.json({ key, deleted: existed, shared: true });
}));

// ===================== Загрузка по частям =====================
// Записи и чат приложение больше не скачивает целиком: записи — за нужный период,
// чат — за последнее время (более ранее подгружается по кнопке). Время открытия
// приложения теперь не зависит от того, сколько данных накопилось за всё время.

const isDateStr = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Записи (упаковка и смены) за период: ?from=ГГГГ-ММ-ДД&to=ГГГГ-ММ-ДД (обе границы
// включительно, любую можно не указывать). Сотрудник получает только свои.
app.get("/api/entries", requireUser, wrap(async (req, res) => {
  const from = isDateStr(req.query.from) ? req.query.from : null;
  const to = isDateStr(req.query.to) ? req.query.to : null;
  let rows;
  if (usesTables("entries")) {
    const etag = `"e${await tables.version("entries")}-${req.user.id}-${from}-${to}"`;
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    const filter = { gte: from ? { entry_date: from } : {}, lte: to ? { entry_date: to } : {} };
    if (!access.isAdmin(req.user)) filter.eq = { employee_id: req.user.id };
    rows = (await tables.query("entries", filter)).map((r) => r.data);
    res.set("ETag", etag);
  } else {
    const all = access.viewFor("entries", (await storeGetJSON("entries", [])) || [], req.user);
    rows = all.filter((e) => e && (!from || e.date >= from) && (!to || e.date <= to));
  }
  sendJSON(req, res, { rows, from, to });
}));

// Голосовые сообщения в списке чата не передаются (они тяжёлые, а список перечитывается
// при каждом изменении) — вместо звука приходит отметка lazy, сам звук запрашивается
// отдельно, когда его включают
const stripAudio = (m) => (m && m.audio && m.audio.dataUrl ? { ...m, audio: { duration: m.audio.duration, lazy: true } } : m);
const chatVisible = (m, user) => access.isAdmin(user) || m.threadId === "all" || m.threadId === user.id;

// Сообщения чата начиная с момента fromTs (мс). hasOlder — есть ли более ранние.
app.get("/api/chat", requireUser, wrap(async (req, res) => {
  const fromTs = Math.max(0, Math.trunc(Number(req.query.fromTs) || 0));
  let rows, hasOlder = false;
  if (usesTables("chatMessages")) {
    const etag = `"c${await tables.version("chatMessages")}-${req.user.id}-${fromTs}"`;
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    const scope = access.isAdmin(req.user) ? {} : { in: { thread_id: ["all", req.user.id] } };
    rows = (await tables.query("chatMessages", { ...scope, gte: { ts: fromTs } })).map((r) => r.data);
    if (fromTs > 0) hasOlder = (await tables.count("chatMessages", { ...scope, lte: { ts: fromTs - 1 } })) > 0;
    res.set("ETag", etag);
  } else {
    const all = ((await storeGetJSON("chatMessages", [])) || []).filter((m) => m && chatVisible(m, req.user));
    rows = all.filter((m) => (Number(m.timestamp) || 0) >= fromTs);
    hasOlder = rows.length < all.length;
  }
  sendJSON(req, res, { rows: rows.map(stripAudio), fromTs, hasOlder });
}));

app.get("/api/chat/audio/:id", requireUser, wrap(async (req, res) => {
  let m;
  if (usesTables("chatMessages")) m = ((await tables.byIds("chatMessages", [req.params.id]))[0] || {}).data;
  else m = ((await storeGetJSON("chatMessages", [])) || []).find((x) => x && String(x.id) === req.params.id);
  if (!m || !chatVisible(m, req.user) || !m.audio || !m.audio.dataUrl) throw new HttpError(404, "Голосовое сообщение не найдено");
  sendJSON(req, res, { dataUrl: m.audio.dataUrl, duration: m.audio.duration });
}));

// ===================== Ежедневные снимки данных =====================
// Раньше снимок делало первое устройство, открывшее приложение за день. Теперь его
// делает сам сервер — раз в сутки, хранит последние 14.
const SNAPSHOT_KEYS = [
  "users", "packagingOptions", "entries", "timerSessions", "priceHistory", "customBarcodes", "settings",
  "catalog", "productImages", "packagingMaterials", "productPackagingLinks", "packagingPurchaseRequest", "messages",
];
function moscowDateStr() {
  // en-CA даёт формат ГГГГ-ММ-ДД
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
async function ensureDailySnapshot() {
  try {
    await dataReady;
    const key = `snapshot:${moscowDateStr()}`;
    if ((await store.version(key)) !== undefined) return;
    const users = await storeGetJSON("users", []);
    if (!Array.isArray(users) || users.length === 0) return; // приложение ещё пустое — снимать нечего
    const snapshot = { exportedAt: new Date().toISOString() };
    for (const k of SNAPSHOT_KEYS) {
      const v = await storeGetJSON(k, undefined);
      if (v !== undefined) snapshot[k] = v;
    }
    await storeSetJSON(key, snapshot);
    const keys = (await store.list("snapshot:")).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - 14))) await store.del(old);
    console.log(`📦 Сделан ежедневный снимок данных: ${key}`);
  } catch (e) {
    console.error("Не удалось сделать ежедневный снимок:", e.message);
  }
}
// ===================== Шифрование уже сохранённых секретов =====================
// При первом запуске с заданным APP_SECRET — ключи Ozon и QR-коды, лежащие в базе
// открытым текстом, перезаписываются в зашифрованном виде.
async function encryptStoredSecrets() {
  if (!secrets.enabled) {
    console.log("⚠️  APP_SECRET не задан — ключи Ozon и QR-коды хранятся в базе без шифрования");
    return;
  }
  try {
    await dataReady;
    const saved = await storeGetJSON("_ozonCredentials", null);
    if (saved && !saved.enc && saved.clientId && saved.apiKey) {
      await saveOzonCredentials({ clientId: saved.clientId, apiKey: saved.apiKey });
      console.log("🔐 Ключи Ozon в базе зашифрованы");
    }
    let count = 0;
    await mutateUsers(async (users) => {
      if (!Array.isArray(users) || !users.some(secrets.needsQrMigration)) return null;
      const next = users.map((u) => {
        if (!secrets.needsQrMigration(u)) return u;
        count++;
        return secrets.withQrToken(u, u.qrToken);
      });
      return { users: next };
    });
    if (count) console.log(`🔐 QR-коды входа в базе зашифрованы: ${count}`);
    console.log("🔐 Шифрование секретов включено (APP_SECRET задан)");
  } catch (e) {
    console.error("Не удалось зашифровать сохранённые секреты:", e.message);
  }
}
setTimeout(encryptStoredSecrets, 3 * 1000);

const snapshotTimer = setInterval(ensureDailySnapshot, 30 * 60 * 1000);
if (snapshotTimer.unref) snapshotTimer.unref();
setTimeout(ensureDailySnapshot, 15 * 1000);

// ===================== Синхронизация каталога с Ozon =====================
// Учётные данные (Client-Id + Api-Key от Ozon Seller API) хранятся под "приватным"
// ключом _ozonCredentials — недоступным через общий /api/kv (см. isPrivateKey выше).
// Наружу (в браузер) сами ключи никогда не возвращаются — только факт "настроено/нет"
// и последние 4 символа Client-Id для узнавания.

app.use("/api/ozon", requireAdmin);

// Ключи Ozon в базе: { enc: "<зашифровано>" } при заданном APP_SECRET, иначе { clientId, apiKey } (как раньше).
// Возвращает { creds, unreadable }: unreadable = true, если ключи есть, но расшифровать их нечем
// (APP_SECRET изменили или убрали) — тогда их нужно ввести заново.
async function loadOzonCredentials() {
  const saved = await storeGetJSON("_ozonCredentials", null);
  if (!saved) return { creds: null, unreadable: false };
  if (saved.enc) {
    const text = secrets.decrypt(saved.enc);
    if (!text) return { creds: null, unreadable: true };
    try { return { creds: JSON.parse(text), unreadable: false }; } catch (e) { return { creds: null, unreadable: true }; }
  }
  return { creds: saved, unreadable: false };
}
async function saveOzonCredentials(creds) {
  await storeSetJSON("_ozonCredentials", secrets.enabled ? { enc: secrets.encrypt(JSON.stringify(creds)) } : creds);
}

app.get("/api/ozon/status", async (req, res) => {
  try {
    const { creds, unreadable } = await loadOzonCredentials();
    const lastSync = await storeGetJSON("_ozonLastSync", null);
    res.json({
      encrypted: secrets.enabled,
      unreadable,
      configured: !!(creds && creds.clientId && creds.apiKey),
      clientIdHint: creds && creds.clientId ? "…" + String(creds.clientId).slice(-4) : null,
      lastSync: lastSync || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/ozon/credentials", async (req, res) => {
  try {
    const { clientId, apiKey } = req.body || {};
    if (!clientId || !apiKey) return res.status(400).json({ error: "Укажите Client-Id и Api-Key" });
    await saveOzonCredentials({ clientId: String(clientId).trim(), apiKey: String(apiKey).trim() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/ozon/credentials", async (req, res) => {
  try {
    await store.del("_ozonCredentials");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/ozon/sync", async (req, res) => {
  let releaseCatalog = null;
  try {
    const { creds, unreadable } = await loadOzonCredentials();
    if (unreadable) {
      return res.status(400).json({ error: "Сохранённые ключи Ozon не удалось расшифровать (изменился APP_SECRET). Введите Client-Id и Api-Key заново" });
    }
    if (!creds || !creds.clientId || !creds.apiKey) {
      return res.status(400).json({ error: "Сначала укажите Client-Id и Api-Key от Ozon в настройках" });
    }
    const headers = {
      "Client-Id": creds.clientId,
      "Api-Key": creds.apiKey,
      "Content-Type": "application/json",
    };

    // 1. Получаем список товаров продавца (артикулы offer_id)
    let offerIds = [];
    let lastId = "";
    for (let page = 0; page < 50; page++) { // защита от бесконечного цикла
      const listResp = await fetch("https://api-seller.ozon.ru/v3/product/list", {
        method: "POST",
        headers,
        body: JSON.stringify({ filter: {}, last_id: lastId, limit: 1000 }),
      });
      const listData = await listResp.json();
      if (!listResp.ok) {
        return res.status(502).json({ error: "Ozon API (список товаров): " + (listData.message || listResp.status) });
      }
      const items = (listData.result && listData.result.items) || [];
      offerIds.push(...items.map((i) => i.offer_id));
      lastId = (listData.result && listData.result.last_id) || "";
      if (!lastId || items.length === 0) break;
    }

    // 2. Получаем название и штрихкоды пачками по 100 (ограничение Ozon API)
    const products = [];
    for (let i = 0; i < offerIds.length; i += 100) {
      const batch = offerIds.slice(i, i + 100);
      const infoResp = await fetch("https://api-seller.ozon.ru/v3/product/info/list", {
        method: "POST",
        headers,
        body: JSON.stringify({ offer_id: batch }),
      });
      const infoData = await infoResp.json();
      if (!infoResp.ok) {
        return res.status(502).json({ error: "Ozon API (карточки товаров): " + (infoData.message || infoResp.status) });
      }
      const items = infoData.items || (infoData.result && infoData.result.items) || [];
      for (const item of items) {
        const barcodes = [item.barcode, ...(item.barcodes || [])].filter(Boolean);
        // Приводим артикул к тому же виду, что и при обычном Excel-импорте (раздел
        // "Импорт каталога"): чисто цифровой — как число, иначе — как обрезанная строка.
        // Иначе Ozon может отдать артикул как текст с пробелами/ведущими нулями, и
        // сравнение с уже сохранённым числовым артикулом не совпадёт — товар задвоится
        // вместо того, чтобы обновиться.
        const skuRaw = String(item.offer_id).trim();
        const sku = /^\d+$/.test(skuRaw) ? parseInt(skuRaw, 10) : skuRaw;
        // Фото — тем же запросом, без отдельного обращения к Ozon: "images" обычно
        // содержит все фото товара, "primary_image" — выделенное главное. На случай,
        // если формат ответа Ozon чуть отличается, проверяем оба варианта защитно.
        const imagesRaw = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
        const primaryRaw = Array.isArray(item.primary_image) ? item.primary_image[0] : item.primary_image;
        const mainImage = primaryRaw || imagesRaw[0] || "";
        const gallery = imagesRaw.filter((u) => u && u !== mainImage);
        products.push({ sku, name: item.name || `Товар ${skuRaw}`, barcodes, mainImage, gallery });
      }
    }

    // Если Ozon вернул один и тот же offer_id дважды (например, из-за перехлёста
    // страниц при постраничной выгрузке) — схлопываем в один товар ещё до слияния
    // с каталогом, объединяя штрихкоды
    const dedupedProducts = [];
    for (const p of products) {
      const existing = dedupedProducts.find((x) => String(x.sku).trim() === String(p.sku).trim());
      if (existing) {
        existing.barcodes = Array.from(new Set([...existing.barcodes, ...p.barcodes]));
      } else {
        dedupedProducts.push(p);
      }
    }

    // 3. Мёржим в существующий каталог — та же логика, что при ручном импорте Excel:
    // новый товар добавляется, у существующего обновляется название/штрихкоды только
    // если реально что-то изменилось (не считаем "обновлённым" то, что не поменялось).
    // Сверка — строго по артикулу (String(sku), уже нормализованному выше), чтобы
    // один и тот же товар не задваивался при повторных синхронизациях.
    //
    // Дополнительно запоминаем, что именно добавили/изменили — чтобы можно было
    // одной кнопкой откатить именно эту синхронизацию, не трогая всё остальное.
    // На время слияния "запираем" каталог, чтобы одновременная правка товара из
    // приложения не потерялась и не затёрла результат синхронизации
    releaseCatalog = await acquireKeyLock("catalog");
    const currentCatalog = (await storeGetJSONStrict("catalog", [])) || [];
    console.log(`[Ozon sync] Начало слияния: в каталоге сейчас ${currentCatalog.length} товаров, от Ozon получено ${dedupedProducts.length} товаров (после схлопывания внутренних дублей).`);
    // Точный "рентген" первых нескольких артикулов с обеих сторон — чтобы увидеть,
    // почему сравнение не находит совпадений, если это повторится: тип значения
    // (число/строка) и точное содержимое, символ в символ
    console.log(`[Ozon sync] Пример из каталога (первые 5): ${JSON.stringify((currentCatalog.slice(0, 5)).map((p) => ({ sku: p.sku, skuType: typeof p.sku })))}`);
    console.log(`[Ozon sync] Пример от Ozon (первые 5): ${JSON.stringify((dedupedProducts.slice(0, 5)).map((p) => ({ sku: p.sku, skuType: typeof p.sku })))}`);
    if (currentCatalog.length > 0 && dedupedProducts.length > 0) {
      const sampleOzonSku = dedupedProducts[0].sku;
      const matchAttempt = currentCatalog.find((x) => String(x.sku).trim() === String(sampleOzonSku).trim());
      console.log(`[Ozon sync] Пробное сравнение: ищем артикул от Ozon "${sampleOzonSku}" (${typeof sampleOzonSku}) в каталоге — ${matchAttempt ? "НАЙДЕНО: " + JSON.stringify(matchAttempt) : "не найдено"}`);
    }
    // Прицельная проверка конкретного давно известного артикула "1000" — если он
    // есть с обеих сторон, но не совпадает, это точно покажет разницу в формате
    const knownCatalogEntry = currentCatalog.find((x) => String(x.sku).trim() === "1000");
    const knownOzonEntry = dedupedProducts.find((p) => String(p.sku).trim() === "1000");
    console.log(`[Ozon sync] Артикул "1000" в каталоге: ${knownCatalogEntry ? JSON.stringify(knownCatalogEntry) : "НЕ НАЙДЕН"}`);
    console.log(`[Ozon sync] Артикул "1000" от Ozon: ${knownOzonEntry ? JSON.stringify(knownOzonEntry) : "НЕ НАЙДЕН"}`);

    // Защита от повторения инцидента 27.08.2026: если каталог не пуст, но подозрительно
    // мал по сравнению с тем, что вернул Ozon — похоже на сбой чтения базы в этот момент,
    // а не на реальное состояние каталога. Раньше в такой ситуации код слепо добавлял всё
    // как "новое", рискуя либо задвоить товары, либо (если бы нумерация Ozon не совпадала
    // с локальной) молча потерять из вида товары, которых нет на Ozon. Теперь просто
    // останавливаемся и ничего не меняем, пока не разберёмся, что произошло.
    const SUSPICIOUSLY_SMALL_RATIO = 0.5;
    if (currentCatalog.length > 0 && currentCatalog.length < dedupedProducts.length * SUSPICIOUSLY_SMALL_RATIO) {
      console.error(`[Ozon sync] ОСТАНОВЛЕНО ради безопасности: в каталоге всего ${currentCatalog.length} товаров, а от Ozon пришло ${dedupedProducts.length} — подозрительно мало для уже существующего каталога. Ничего не изменено.`);
      return res.status(409).json({
        error: `Синхронизация остановлена для безопасности: сервер сейчас видит в каталоге только ${currentCatalog.length} товаров, а от Ozon получено ${dedupedProducts.length}. Это похоже на временный сбой чтения данных, а не на реальное состояние каталога — продолжать слияние в таком виде рискованно. Ничего не изменено. Обновите страницу (свайп вниз или кнопка ↻) и попробуйте синхронизацию ещё раз через минуту.`,
      });
    }

    const next = [...currentCatalog];
    let added = 0, updated = 0;
    const addedItems = []; // { sku, name, barcodes } — полная карточка добавленного товара, для отчёта и отмены
    const updatedItems = []; // { sku, previousName, previousBarcodes, newName, newBarcodes } — для отчёта и отката
    for (const p of dedupedProducts) {
      const idx = next.findIndex((x) => String(x.sku).trim() === String(p.sku).trim());
      if (idx === -1) {
        next.push(p);
        added++;
        addedItems.push({ sku: p.sku, name: p.name, barcodes: p.barcodes });
      } else {
        const existing = next[idx];
        // Ozon — источник истины для штрихкодов этого товара: полностью ЗАМЕНЯЕМ
        // список штрихкодов на тот, что вернул Ozon, а не объединяем со старым.
        // Раньше было объединение (Set из старых+новых) — из-за этого, если вручную
        // исправить неверный штрихкод в приложении, следующая синхронизация просто
        // добавляла верный штрихкод от Ozon РЯДОМ со старым неверным, вместо замены.
        const newBarcodes = p.barcodes || [];
        const existingBarcodes = existing.barcodes || [];
        const barcodesChanged = newBarcodes.length !== existingBarcodes.length
          || newBarcodes.some((b) => !existingBarcodes.includes(b))
          || existingBarcodes.some((b) => !newBarcodes.includes(b));
        const nameChanged = p.name && p.name !== existing.name;
        if (nameChanged || barcodesChanged) {
          const newName = nameChanged ? p.name : existing.name;
          updatedItems.push({ sku: existing.sku, previousName: existing.name, previousBarcodes: existingBarcodes, newName, newBarcodes });
          next[idx] = { ...existing, name: newName, barcodes: newBarcodes };
          updated++;
        }
      }
    }
    await storeSetJSON("catalog", next);

    // Фото — отдельное хранилище (productImages), не часть самого каталога.
    // Ozon тоже источник истины: если для товара пришла ссылка на фото — заменяем,
    // если фото совсем нет в ответе Ozon — не трогаем то, что уже было (мало ли,
    // фото могло быть загружено вручную через "Импорт фото из Excel", когда на самом
    // Ozon карточка временно без фото).
    const currentImages = (await storeGetJSON("productImages", {})) || {};
    const nextImages = { ...currentImages };
    let photosUpdated = 0;
    for (const p of dedupedProducts) {
      if (!p.mainImage && (!p.gallery || p.gallery.length === 0)) continue; // у Ozon нет фото — не трогаем
      const skuKey = String(p.sku);
      const existingImg = currentImages[skuKey];
      const existingMain = existingImg ? (typeof existingImg === "string" ? existingImg : existingImg.main) : "";
      const existingGallery = existingImg && typeof existingImg !== "string" ? (existingImg.gallery || []) : [];
      const galleryChanged = p.gallery.length !== existingGallery.length || p.gallery.some((u) => !existingGallery.includes(u));
      if (p.mainImage !== existingMain || galleryChanged) {
        nextImages[skuKey] = { main: p.mainImage || "", gallery: p.gallery || [] };
        photosUpdated++;
      }
    }
    if (photosUpdated > 0) await storeSetJSON("productImages", nextImages);
    console.log(`[Ozon sync] Готово: было ${currentCatalog.length} товаров, стало ${next.length}. Добавлено ${added}, обновлено ${updated}, без изменений ${dedupedProducts.length - added - updated}. Фото обновлено: ${photosUpdated}.`);

    const historyEntry = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      total: dedupedProducts.length,
      added, updated, photosUpdated,
      addedItems, updatedItems,
      addedSkus: addedItems.map((i) => i.sku), // отдельный список артикулов — для отмены
      undone: false,
    };
    const history = (await storeGetJSON("_ozonSyncHistory", [])) || [];
    history.unshift(historyEntry); // самая свежая — в начале списка
    await storeSetJSON("_ozonSyncHistory", history.slice(0, 20)); // храним последние 20 запусков
    await storeSetJSON("_ozonLastSync", { timestamp: historyEntry.timestamp, total: historyEntry.total, added, updated, photosUpdated });

    res.json({ timestamp: historyEntry.timestamp, total: historyEntry.total, added, updated, photosUpdated });
  } catch (e) {
    res.status(500).json({ error: "Ошибка синхронизации с Ozon: " + e.message });
  } finally {
    if (releaseCatalog) releaseCatalog();
  }
});

// История синхронизаций — для отображения в интерфейсе (без секретных ключей внутри,
// показывать её браузеру безопасно)
app.get("/api/ozon/history", async (req, res) => {
  try {
    const history = (await storeGetJSON("_ozonSyncHistory", [])) || [];
    res.json({ history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Отмена ПОСЛЕДНЕЙ синхронизации: убирает то, что она добавила, и возвращает
// изменённым товарам их прежние название/штрихкоды. Отменить можно только самую
// последнюю ещё не отменённую запись — более старые трогать небезопасно, если
// после них уже были другие изменения (в т.ч. ручные).
// Отмена ОДНОЙ конкретной синхронизации по её id — не обязательно самой последней.
// Отменить более старую запись безопасно ровно в том же смысле, что и последнюю: убираем
// именно то, что добавила ЭТА синхронизация, и возвращаем изменённым ею товарам их
// прежний вид. Если после неё уже были другие синхронизации/правки того же товара —
// они не трогаются (кроме случая, когда та же самая позиция была ещё раз изменена, тогда
// восстановится состояние на момент именно ЭТОЙ отменяемой синхронизации, а не более раннее).
app.post("/api/ozon/undo/:id", async (req, res) => {
  let releaseCatalog = null;
  try {
    const history = (await storeGetJSON("_ozonSyncHistory", [])) || [];
    const entry = history.find((h) => h.id === req.params.id);
    if (!entry) return res.status(404).json({ error: "Такая синхронизация не найдена в истории" });
    if (entry.undone) return res.status(400).json({ error: "Эта синхронизация уже была отменена ранее" });

    releaseCatalog = await acquireKeyLock("catalog");
    let catalog = (await storeGetJSONStrict("catalog", [])) || [];
    const addedSet = new Set(entry.addedSkus.map((s) => String(s)));
    catalog = catalog.filter((p) => !addedSet.has(String(p.sku)));
    for (const u of entry.updatedItems) {
      const idx = catalog.findIndex((p) => String(p.sku) === String(u.sku));
      if (idx !== -1) {
        catalog[idx] = { ...catalog[idx], name: u.previousName, barcodes: u.previousBarcodes };
      }
    }
    await storeSetJSON("catalog", catalog);
    console.log(`[Ozon sync] Отменена синхронизация от ${new Date(entry.timestamp).toISOString()}: удалено ${entry.addedSkus.length}, возвращено к прежнему виду ${entry.updatedItems.length}.`);

    entry.undone = true;
    await storeSetJSON("_ozonSyncHistory", history);
    const lastActive = history.find((h) => !h.undone);
    await storeSetJSON("_ozonLastSync", lastActive ? { timestamp: lastActive.timestamp, total: lastActive.total, added: lastActive.added, updated: lastActive.updated, photosUpdated: lastActive.photosUpdated } : null);

    res.json({ ok: true, removedCount: entry.addedSkus.length, restoredCount: entry.updatedItems.length });
  } catch (e) {
    res.status(500).json({ error: "Не удалось отменить синхронизацию: " + e.message });
  } finally {
    if (releaseCatalog) releaseCatalog();
  }
});


app.use("/api", (req, res) => res.status(404).json({ error: "not found" }));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// При остановке контейнера (каждый деплой) — досохраняем отметки сессий
process.on("SIGTERM", () => {
  const done = () => server.close(() => process.exit(0));
  if (sessionsDirty) saveSessions().then(done, done); else done();
  setTimeout(() => process.exit(0), 5000).unref();
});
