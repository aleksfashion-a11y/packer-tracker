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

// Ключи с префиксом "_" — служебные/секретные (например, учётные данные Ozon).
// Общий публичный /api/kv, которым пользуется браузерное приложение, к ним доступа
// не имеет вообще — ни на чтение, ни на запись. Работать с ними может только сам
// сервер, через отдельные защищённые ниже маршруты /api/ozon/...
function isPrivateKey(key) {
  return key.startsWith("_");
}

// GET /api/kv?prefix=xxx  -> список ключей
// GET /api/kv/:key        -> получить одно значение
app.get("/api/kv", async (req, res) => {
  try {
    const prefix = req.query.prefix || "";
    const keys = (await store.list(prefix)).filter((k) => !isPrivateKey(k));
    res.json({ keys, prefix, shared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/kv/:key", async (req, res) => {
  try {
    const key = req.params.key;
    if (isPrivateKey(key)) return res.status(403).json({ error: "forbidden" });
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
    if (isPrivateKey(key)) return res.status(403).json({ error: "forbidden" });
    await store.set(key, req.body.value);
    res.json({ key, value: req.body.value, shared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/kv/:key", async (req, res) => {
  try {
    const key = req.params.key;
    if (isPrivateKey(key)) return res.status(403).json({ error: "forbidden" });
    const existed = await store.del(key);
    res.json({ key, deleted: existed, shared: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== Синхронизация каталога с Ozon =====================
// Учётные данные (Client-Id + Api-Key от Ozon Seller API) хранятся под "приватным"
// ключом _ozonCredentials — недоступным через общий /api/kv (см. isPrivateKey выше).
// Наружу (в браузер) сами ключи никогда не возвращаются — только факт "настроено/нет"
// и последние 4 символа Client-Id для узнавания.

app.get("/api/ozon/status", async (req, res) => {
  try {
    const creds = await store.get("_ozonCredentials");
    const lastSync = await store.get("_ozonLastSync");
    res.json({
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
    await store.set("_ozonCredentials", { clientId: String(clientId).trim(), apiKey: String(apiKey).trim() });
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
  try {
    const creds = await store.get("_ozonCredentials");
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
        products.push({ sku, name: item.name || `Товар ${skuRaw}`, barcodes });
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
    const currentCatalog = (await store.get("catalog")) || [];
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
        const mergedBarcodes = Array.from(new Set([...(existing.barcodes || []), ...p.barcodes]));
        const nameChanged = p.name && p.name !== existing.name;
        const barcodesChanged = mergedBarcodes.length !== (existing.barcodes || []).length;
        if (nameChanged || barcodesChanged) {
          const newName = nameChanged ? p.name : existing.name;
          updatedItems.push({ sku: existing.sku, previousName: existing.name, previousBarcodes: existing.barcodes || [], newName, newBarcodes: mergedBarcodes });
          next[idx] = { ...existing, name: newName, barcodes: mergedBarcodes };
          updated++;
        }
      }
    }
    await store.set("catalog", next);

    const historyEntry = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      total: dedupedProducts.length,
      added, updated,
      addedItems, updatedItems,
      addedSkus: addedItems.map((i) => i.sku), // отдельный список артикулов — для отмены
      undone: false,
    };
    const history = (await store.get("_ozonSyncHistory")) || [];
    history.unshift(historyEntry); // самая свежая — в начале списка
    await store.set("_ozonSyncHistory", history.slice(0, 20)); // храним последние 20 запусков
    await store.set("_ozonLastSync", { timestamp: historyEntry.timestamp, total: historyEntry.total, added, updated });

    res.json({ timestamp: historyEntry.timestamp, total: historyEntry.total, added, updated });
  } catch (e) {
    res.status(500).json({ error: "Ошибка синхронизации с Ozon: " + e.message });
  }
});

// История синхронизаций — для отображения в интерфейсе (без секретных ключей внутри,
// показывать её браузеру безопасно)
app.get("/api/ozon/history", async (req, res) => {
  try {
    const history = (await store.get("_ozonSyncHistory")) || [];
    res.json({ history });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Отмена ПОСЛЕДНЕЙ синхронизации: убирает то, что она добавила, и возвращает
// изменённым товарам их прежние название/штрихкоды. Отменить можно только самую
// последнюю ещё не отменённую запись — более старые трогать небезопасно, если
// после них уже были другие изменения (в т.ч. ручные).
app.post("/api/ozon/undo-last-sync", async (req, res) => {
  try {
    const history = (await store.get("_ozonSyncHistory")) || [];
    const last = history.find((h) => !h.undone);
    if (!last) return res.status(400).json({ error: "Нет синхронизации для отмены" });

    let catalog = (await store.get("catalog")) || [];
    // Убираем товары, которые были добавлены этой синхронизацией
    const addedSet = new Set(last.addedSkus.map((s) => String(s)));
    catalog = catalog.filter((p) => !addedSet.has(String(p.sku)));
    // Возвращаем прежние значения тем, что было обновлено
    for (const u of last.updatedItems) {
      const idx = catalog.findIndex((p) => String(p.sku) === String(u.sku));
      if (idx !== -1) {
        catalog[idx] = { ...catalog[idx], name: u.previousName, barcodes: u.previousBarcodes };
      }
    }
    await store.set("catalog", catalog);

    last.undone = true;
    await store.set("_ozonSyncHistory", history);
    const nextLast = history.find((h) => !h.undone);
    await store.set("_ozonLastSync", nextLast ? { timestamp: nextLast.timestamp, total: nextLast.total, added: nextLast.added, updated: nextLast.updated } : null);

    res.json({ ok: true, removedCount: last.addedSkus.length, restoredCount: last.updatedItems.length });
  } catch (e) {
    res.status(500).json({ error: "Не удалось отменить синхронизацию: " + e.message });
  }
});


app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
