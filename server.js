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
      if (!rows.length) return undefined;
      const raw = rows[0].value;
      // Историческая особенность: браузер (App.jsx/entry.jsx) сам оборачивает
      // значение в JSON.stringify перед отправкой, а затем сам же один раз
      // распаковывает его при чтении — так исторически сложился протокол между
      // клиентом и этим хранилищем. Чтобы всё работало ОДИНАКОВО что для браузера,
      // что для прямого серверного кода (как синхронизация с Ozon), get() всегда
      // возвращает значение как JSON-текст (строку) — если Postgres уже отдал
      // готовый разобранный объект/массив (когда значение туда записал сам сервер
      // напрямую, не через двойное оборачивание), досериализуем его один раз здесь.
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    },
    async set(key, value) {
      await ready;
      // Если пришла уже готовая JSON-строка (обычный путь от браузера, который
      // сам делает JSON.stringify перед отправкой) — записываем её КАК ЕСТЬ, без
      // повторного оборачивания: Postgres сам корректно распознает и сохранит её
      // как настоящий JSONB-массив/объект. Раньше здесь стоял JSON.stringify(value)
      // БЕЗУСЛОВНО, что при значении-строке заворачивало его ВТОРОЙ раз — из-за
      // этого при прямом серверном чтении (минуя браузерную "обёртку") значение
      // выглядело как одна большая строка, а не как список товаров — это и стало
      // причиной сбоя синхронизации с Ozon 27-28 августа 2026.
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

// Удобные обёртки для СЕРВЕРНОГО кода (не браузера), которому нужно работать с
// НАСТОЯЩИМИ объектами/массивами, а не с "сырым" JSON-текстом, который хранит store.
// store.get/set всегда оперируют JSON-текстом (строкой) — это исторически сложившийся
// протокол, совместимый с тем, что уже делает браузерный App.jsx/entry.jsx. Любой
// НОВЫЙ серверный код (как интеграция с Ozon ниже) должен пользоваться именно этими
// обёртками, а не store.get/set напрямую — иначе будет тот самый баг с "текстом вместо
// списка товаров", из-за которого сломалась синхронизация 27-28 августа 2026.
async function storeGetJSON(key, fallback) {
  const raw = await store.get(key);
  if (raw === undefined || raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
async function storeSetJSON(key, value) {
  await store.set(key, JSON.stringify(value));
}

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
    const creds = await storeGetJSON("_ozonCredentials", null);
    const lastSync = await storeGetJSON("_ozonLastSync", null);
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
    await storeSetJSON("_ozonCredentials", { clientId: String(clientId).trim(), apiKey: String(apiKey).trim() });
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
    const creds = await storeGetJSON("_ozonCredentials", null);
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
    const currentCatalog = (await storeGetJSON("catalog", [])) || [];
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
    await storeSetJSON("catalog", next);
    console.log(`[Ozon sync] Готово: было ${currentCatalog.length} товаров, стало ${next.length}. Добавлено ${added}, обновлено ${updated}, без изменений ${dedupedProducts.length - added - updated}.`);

    const historyEntry = {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      total: dedupedProducts.length,
      added, updated,
      addedItems, updatedItems,
      addedSkus: addedItems.map((i) => i.sku), // отдельный список артикулов — для отмены
      undone: false,
    };
    const history = (await storeGetJSON("_ozonSyncHistory", [])) || [];
    history.unshift(historyEntry); // самая свежая — в начале списка
    await storeSetJSON("_ozonSyncHistory", history.slice(0, 20)); // храним последние 20 запусков
    await storeSetJSON("_ozonLastSync", { timestamp: historyEntry.timestamp, total: historyEntry.total, added, updated });

    res.json({ timestamp: historyEntry.timestamp, total: historyEntry.total, added, updated });
  } catch (e) {
    res.status(500).json({ error: "Ошибка синхронизации с Ozon: " + e.message });
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
  try {
    const history = (await storeGetJSON("_ozonSyncHistory", [])) || [];
    const entry = history.find((h) => h.id === req.params.id);
    if (!entry) return res.status(404).json({ error: "Такая синхронизация не найдена в истории" });
    if (entry.undone) return res.status(400).json({ error: "Эта синхронизация уже была отменена ранее" });

    let catalog = (await storeGetJSON("catalog", [])) || [];
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
    await storeSetJSON("_ozonLastSync", lastActive ? { timestamp: lastActive.timestamp, total: lastActive.total, added: lastActive.added, updated: lastActive.updated } : null);

    res.json({ ok: true, removedCount: entry.addedSkus.length, restoredCount: entry.updatedItems.length });
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
