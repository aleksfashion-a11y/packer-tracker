const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;

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

let store; // объект с методами list/get/set/del — реализация ниже зависит от режима

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

  function load() {
    if (!fs.existsSync(STORE_FILE)) return {};
    try {
      return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
    } catch (e) {
      return {};
    }
  }
  function save(obj) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj));
  }

  return {
    async list(prefix) {
      const obj = load();
      return Object.keys(obj).filter((k) => k.startsWith(prefix));
    },
    async get(key) {
      const obj = load();
      return key in obj ? obj[key] : undefined;
    },
    async set(key, value) {
      const obj = load();
      obj[key] = value;
      save(obj);
    },
    async del(key) {
      const obj = load();
      const existed = key in obj;
      delete obj[key];
      save(obj);
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

  return {
    async list(prefix) {
      await ready;
      const { rows } = await pool.query(
        "SELECT key FROM kv_store WHERE project = $1 AND key LIKE $2",
        [PROJECT_NAME, prefix + "%"]
      );
      return rows.map((r) => r.key);
    },
    async get(key) {
      await ready;
      const { rows } = await pool.query(
        "SELECT value FROM kv_store WHERE project = $1 AND key = $2",
        [PROJECT_NAME, key]
      );
      return rows.length ? rows[0].value : undefined;
    },
    async set(key, value) {
      await ready;
      await pool.query(
        `INSERT INTO kv_store (project, key, value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (project, key)
         DO UPDATE SET value = $3, updated_at = now()`,
        [PROJECT_NAME, key, JSON.stringify(value)]
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

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

// GET /api/kv?prefix=xxx  -> список ключей
// GET /api/kv/:key        -> получить одно значение
app.get("/api/kv", async (req, res) => {
  try {
    const prefix = req.query.prefix || "";
    const keys = await store.list(prefix);
    res.json({ keys, prefix, shared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/kv/:key", async (req, res) => {
  try {
    const key = req.params.key;
    const value = await store.get(key);
    if (value === undefined) return res.status(404).json({ error: "not found" });
    res.json({ key, value, shared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/kv/:key", async (req, res) => {
  try {
    const key = req.params.key;
    await store.set(key, req.body.value);
    res.json({ key, value: req.body.value, shared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/kv/:key", async (req, res) => {
  try {
    const key = req.params.key;
    const existed = await store.del(key);
    res.json({ key, deleted: existed, shared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
