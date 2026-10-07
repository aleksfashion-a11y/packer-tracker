// Синхронизация каталога товаров с приложением «Мой склад».
//
// «Мой склад» — источник правды по товарам: артикул, название, штрихкоды, фото.
// Отсюда читается его API (только чтение, по ключу), формат согласован в переписке
// между чатами проектов (№1 и №2, октябрь 2026):
//   GET <адрес>/api/analytics/v1/products?updated_since=<ISO>&limit=<до 500>&cursor=<…>
//   заголовок X-Api-Key: msa_…
//   ответ { items: [{ article, previous_article, name, barcodes, photo_url, photos, deleted, … }], next_cursor, server_time }
//
// Что делает синхронизация:
//   - новые товары добавляет, у существующих обновляет название, штрихкоды и фото;
//   - товар, удалённый в «Моём складе», НЕ удаляет (на нём записи упаковщиков), а помечает;
//   - если у товара сменился артикул — переносит на новый артикул всё, что к нему привязано
//     (цены упаковки, записи, фото, привязку упаковки, штрихкоды сотрудников, историю цен);
//   - сама запускается раз в 30 минут (только изменившиеся товары), полный проход — по кнопке.

const { SPECS, colValues } = require("./collections");

const PAGE_LIMIT = 500;
const AUTO_INTERVAL_MS = 30 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Артикул в том же виде, что и раньше (импорт из Excel, Ozon): чисто цифровой — числом, иначе строкой
const typedSku = (article) => { const s = String(article).trim(); return /^\d+$/.test(s) ? parseInt(s, 10) : s; };

function register(app, d) {
  const { requireAdmin, wrap, HttpError, store, storeGetJSON, storeGetJSONStrict, storeSetJSON, secrets, acquireKeyLock, getTables, dataReady } = d;

  // ---------- ключ и адрес ----------
  async function loadCredentials() {
    const saved = await storeGetJSON("_moySkladCredentials", null);
    if (!saved) return { creds: null, unreadable: false };
    if (saved.enc) {
      const text = secrets.decrypt(saved.enc);
      if (!text) return { creds: null, unreadable: true };
      try { return { creds: JSON.parse(text), unreadable: false }; } catch (e) { return { creds: null, unreadable: true }; }
    }
    return { creds: saved, unreadable: false };
  }
  async function saveCredentials(creds) {
    await storeSetJSON("_moySkladCredentials", secrets.enabled ? { enc: secrets.encrypt(JSON.stringify(creds)) } : creds);
  }
  const isConfigured = async () => { const { creds } = await loadCredentials(); return !!(creds && creds.baseUrl && creds.apiKey); };
  const loadState = async () => (await storeGetJSON("_moySkladState", {})) || {};
  const saveState = (patch) => loadState().then((s) => storeSetJSON("_moySkladState", { ...s, ...patch }));

  // ---------- чтение API «Моего склада» ----------
  async function fetchPage(creds, params) {
    const url = new URL(creds.baseUrl + "/api/analytics/v1/products");
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url, { headers: { "X-Api-Key": creds.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      } catch (e) {
        throw new Error("«Мой склад» не отвечает по адресу " + creds.baseUrl + " (" + (e.cause && e.cause.code ? e.cause.code : e.name === "TimeoutError" ? "превышено время ожидания" : e.message) + ")");
      }
      if (res.status === 429 && attempt < 5) { await sleep(1000 * (attempt + 1)); continue; } // превышена частота — подождать и повторить
      if (res.status === 401 || res.status === 403) throw new Error("«Мой склад» не принял ключ доступа (ответ " + res.status + "). Проверьте ключ: он создаётся в «Моём складе» → Настройки → «Аналитика МП»");
      if (res.status === 404) throw new Error(`По адресу ${url.origin}${url.pathname} ничего нет (ответ 404). Проверьте адрес «Моего склада»: нужен адрес самого приложения — тот, по которому вы его открываете, без /login и других добавок после имени сайта. Если адрес верный — значит, в «Моём складе» ещё не выкачена версия, которая отдаёт каталог`);
      if (!res.ok) throw new Error(`«Мой склад» ответил ошибкой ${res.status} на запрос ${url.origin}${url.pathname}`);
      let data;
      try { data = await res.json(); } catch (e) { throw new Error("«Мой склад» вернул ответ не в формате JSON — проверьте адрес"); }
      if (!data || !Array.isArray(data.items)) throw new Error("Неожиданный формат ответа «Моего склада»: нет списка items");
      return data;
    }
  }
  // Все страницы. updatedSince — ISO-время (только изменившиеся) или null (весь каталог).
  async function fetchProducts(creds, updatedSince) {
    const items = [];
    let cursor = null, serverTime = null;
    for (let page = 0; page < 400; page++) {
      const data = await fetchPage(creds, { limit: PAGE_LIMIT, updated_since: updatedSince, cursor });
      if (page === 0) serverTime = data.server_time || null;
      items.push(...data.items);
      cursor = data.next_cursor || null;
      if (!cursor) return { items, serverTime };
      await sleep(250); // не больше 5 запросов в секунду на ключ
    }
    throw new Error("Слишком много страниц в ответе «Моего склада» — синхронизация остановлена");
  }
  function normalize(item) {
    const article = String(item.article === undefined || item.article === null ? "" : item.article).trim();
    if (!article) return null;
    const photos = Array.isArray(item.photos) ? item.photos.filter((u) => typeof u === "string" && u) : [];
    const mainImage = photos[0] || (typeof item.photo_url === "string" ? item.photo_url : "") || "";
    const prev = item.previous_article === undefined || item.previous_article === null ? "" : String(item.previous_article).trim();
    return {
      article, sku: typedSku(article),
      name: String(item.name || "").trim() || `Товар ${article}`,
      barcodes: [...new Set((Array.isArray(item.barcodes) ? item.barcodes : []).map((b) => String(b).trim()).filter(Boolean))],
      mainImage, gallery: photos.filter((u) => u !== mainImage),
      deleted: !!item.deleted,
      previousArticle: prev && prev !== article ? prev : null,
    };
  }

  // ---------- смена артикула: перенос всего привязанного ----------
  // Возвращает "done" | "conflict" (товар с новым артикулом уже есть) | "absent" (старого артикула у нас нет) | "unsupported"
  async function renameSku(prevArticle, newArticle) {
    const tables = getTables();
    if (!tables) return "unsupported";
    const next = typedSku(newArticle);
    return tables.tx(async (t) => {
      const [row] = await t.byIds("catalog", [prevArticle]);
      if (!row) return "absent";
      if ((await t.byIds("catalog", [newArticle])).length) return "conflict";
      const data = { ...row.data, sku: next, previousSku: row.data.sku };
      await t.remove("catalog", [prevArticle]);
      await t.insert("catalog", { id: String(next), pos: row.pos, data, cols: colValues(SPECS.catalog, data) });
      await t.bump("catalog");
      for (const name of ["packagingOptions", "customBarcodes", "priceHistory", "entries"]) {
        const rows = await t.query(name, { eq: { sku: prevArticle } });
        for (const r of rows) { const upd = { ...r.data, sku: next }; await t.update(name, r.id, upd, colValues(SPECS[name], upd)); }
        if (rows.length) await t.bump(name);
      }
      for (const name of ["productImages", "productPackagingLinks"]) {
        const [r] = await t.byIds(name, [prevArticle]);
        if (!r) continue;
        await t.remove(name, [prevArticle]);
        if (!(await t.byIds(name, [newArticle])).length) {
          const { max } = await t.bounds(name);
          await t.insert(name, { id: String(newArticle), pos: max === null ? 0 : max + 1, data: r.data, cols: {} });
        }
        await t.bump(name);
      }
      return "done";
    });
  }

  // ---------- сама синхронизация ----------
  let running = null; // одновременно идёт только одна синхронизация
  function sync(mode) {
    if (running) return running;
    running = doSync(mode).finally(() => { running = null; });
    return running;
  }
  async function doSync(mode) {
    const { creds, unreadable } = await loadCredentials();
    if (unreadable) throw new HttpError(400, "Сохранённый ключ «Моего склада» не удалось расшифровать (изменился APP_SECRET). Введите адрес и ключ заново");
    if (!creds || !creds.baseUrl || !creds.apiKey) throw new HttpError(400, "Сначала укажите адрес «Моего склада» и ключ доступа");
    const state = await loadState();
    // Только изменившиеся — с момента начала прошлого прохода минус 2 минуты (запас на стык)
    const full = mode === "full" || !state.lastServerTime;
    const since = full ? null : new Date(new Date(state.lastServerTime).getTime() - 2 * 60 * 1000).toISOString();
    const { items, serverTime } = await fetchProducts(creds, since);

    // один и тот же артикул дважды в ответе — оставляем последний
    const byArticle = new Map();
    for (const raw of items) { const p = normalize(raw); if (p) byArticle.set(p.article, p); }
    const products = [...byArticle.values()];

    // 1. Смена артикулов — до слияния, чтобы товар не задвоился под новым артикулом
    const renamed = [], renameProblems = [];
    for (const p of products) {
      if (!p.previousArticle) continue;
      const r = await renameSku(p.previousArticle, p.article);
      if (r === "done") { renamed.push({ from: p.previousArticle, to: p.article }); console.log(`[Мой склад] Артикул ${p.previousArticle} → ${p.article}: записи, цены, фото и упаковка перенесены`); }
      else if (r === "conflict") renameProblems.push(`${p.previousArticle} → ${p.article}: товар с новым артикулом уже есть, старый оставлен как был`);
      else if (r === "unsupported") renameProblems.push(`${p.previousArticle} → ${p.article}: перенос не выполнен (данные хранятся не в таблицах)`);
    }

    // 2. Слияние с каталогом
    const release = await acquireKeyLock("catalog");
    try {
      const current = (await storeGetJSONStrict("catalog", [])) || [];
      const live = products.filter((p) => !p.deleted);
      // Та же защита, что и при синхронизации с Ozon: каталог не пуст, но подозрительно мал
      // по сравнению с полным списком — похоже на сбой чтения базы; ничего не меняем
      if (full && current.length > 0 && current.length < live.length * 0.5) {
        throw new HttpError(409, `Синхронизация остановлена для безопасности: сервер сейчас видит в каталоге только ${current.length} товаров, а от «Моего склада» получено ${live.length}. Ничего не изменено. Попробуйте ещё раз через минуту`);
      }
      const next = [...current];
      const addedItems = [], updatedItems = [], deletedSkus = [];
      for (const p of products) {
        const idx = next.findIndex((x) => String(x.sku).trim() === p.article);
        if (idx === -1) {
          if (p.deleted) continue; // удалённый товар, которого у нас и не было
          next.push({ sku: p.sku, name: p.name, barcodes: p.barcodes });
          addedItems.push({ sku: p.sku, name: p.name, barcodes: p.barcodes });
          continue;
        }
        const existing = next[idx];
        if (p.deleted) {
          if (!existing.msDeleted) { next[idx] = { ...existing, msDeleted: true }; deletedSkus.push(existing.sku); }
          continue;
        }
        const oldBarcodes = existing.barcodes || [];
        const barcodesChanged = p.barcodes.length !== oldBarcodes.length || p.barcodes.some((b) => !oldBarcodes.includes(b));
        const nameChanged = p.name !== existing.name;
        if (nameChanged || barcodesChanged || existing.msDeleted) {
          if (nameChanged || barcodesChanged) updatedItems.push({ sku: existing.sku, previousName: existing.name, previousBarcodes: oldBarcodes, newName: p.name, newBarcodes: p.barcodes });
          const upd = { ...existing, name: p.name, barcodes: p.barcodes };
          delete upd.msDeleted; // товар снова есть в «Моём складе»
          next[idx] = upd;
        }
      }
      const catalogChanged = addedItems.length || updatedItems.length || deletedSkus.length || next.some((x, i) => x !== current[i]);
      if (catalogChanged) await storeSetJSON("catalog", next);

      // 3. Фото: «Мой склад» — источник правды; если фото у товара там нет — наши не трогаем
      const currentImages = (await storeGetJSON("productImages", {})) || {};
      const nextImages = { ...currentImages };
      let photosUpdated = 0;
      for (const p of live) {
        if (!p.mainImage && p.gallery.length === 0) continue;
        const old = currentImages[p.article];
        const oldMain = old ? (typeof old === "string" ? old : old.main) : "";
        const oldGallery = old && typeof old !== "string" ? old.gallery || [] : [];
        if (p.mainImage !== oldMain || p.gallery.length !== oldGallery.length || p.gallery.some((u, i) => u !== oldGallery[i])) {
          nextImages[p.article] = { main: p.mainImage, gallery: p.gallery };
          photosUpdated++;
        }
      }
      if (photosUpdated) await storeSetJSON("productImages", nextImages);

      const result = {
        timestamp: Date.now(), mode: full ? "full" : mode === "auto" ? "auto" : "delta", total: products.length,
        added: addedItems.length, updated: updatedItems.length, photosUpdated, renamed: renamed.length, deletedMarked: deletedSkus.length,
        renameProblems,
      };
      const changed = result.added || result.updated || result.photosUpdated || result.renamed || result.deletedMarked || renameProblems.length;
      // Автоматические запуски без изменений в историю не пишем — иначе каждые полчаса была бы пустая строка
      if (changed || mode !== "auto") {
        const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 8), ...result, addedItems, updatedItems, addedSkus: addedItems.map((i) => i.sku), renamedItems: renamed, deletedSkus, undone: false };
        const history = (await storeGetJSON("_moySkladSyncHistory", [])) || [];
        history.unshift(entry);
        await storeSetJSON("_moySkladSyncHistory", history.slice(0, 20));
      }
      await saveState({ lastServerTime: serverTime || new Date().toISOString(), lastCheckedAt: Date.now(), lastError: null, ...(changed || mode !== "auto" ? { lastSync: result } : {}) });
      if (changed) console.log(`[Мой склад] Синхронизация (${result.mode}): получено ${result.total}, добавлено ${result.added}, обновлено ${result.updated}, фото ${result.photosUpdated}, смен артикула ${result.renamed}, помечено удалёнными ${result.deletedMarked}`);
      return result;
    } finally {
      release();
    }
  }

  // Автоматически раз в 30 минут — только изменившиеся товары
  const timer = setInterval(async () => {
    try {
      await dataReady;
      if (!(await isConfigured())) return;
      await sync("auto");
    } catch (e) {
      console.error("[Мой склад] Автосинхронизация не удалась:", e.message);
      saveState({ lastError: { timestamp: Date.now(), message: e.message } }).catch(() => {});
    }
  }, AUTO_INTERVAL_MS);
  if (timer.unref) timer.unref();

  // ---------- адреса для приложения (только администратор) ----------
  app.use("/api/moysklad", requireAdmin);

  app.get("/api/moysklad/status", wrap(async (req, res) => {
    const { creds, unreadable } = await loadCredentials();
    const state = await loadState();
    res.json({
      configured: !!(creds && creds.baseUrl && creds.apiKey), unreadable, encrypted: secrets.enabled,
      baseUrl: creds ? creds.baseUrl : null, keyHint: creds && creds.apiKey ? "…" + String(creds.apiKey).slice(-4) : null,
      lastSync: state.lastSync || null, lastCheckedAt: state.lastCheckedAt || null, lastError: state.lastError || null,
      autoMinutes: AUTO_INTERVAL_MS / 60000,
    });
  }));

  app.post("/api/moysklad/credentials", wrap(async (req, res) => {
    let baseUrl = String((req.body || {}).baseUrl || "").trim().replace(/\/+$/, "");
    const apiKey = String((req.body || {}).apiKey || "").trim();
    if (!baseUrl || !apiKey) throw new HttpError(400, "Нужны и адрес «Моего склада», и ключ доступа");
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = "https://" + baseUrl;
    let parsed;
    try { parsed = new URL(baseUrl); } catch (e) { throw new HttpError(400, "Адрес «Моего склада» указан неверно"); }
    // От адреса берём только сам сайт: если вставили ссылку на страницу (…/login, …/#/settings),
    // хвост отбрасывается — API всегда лежит от корня сайта
    baseUrl = parsed.origin;
    const own = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
    if (own && parsed.host.toLowerCase() === own) throw new HttpError(400, "Вы указали адрес самого «Складского учёта». Нужен адрес приложения «Мой склад» — тот, по которому вы открываете его в браузере");
    // Проверяем связь и ключ пробным запросом — чтобы не сохранить то, что не работает
    try { await fetchPage({ baseUrl, apiKey }, { limit: 1 }); } catch (e) { throw new HttpError(400, e.message); }
    await saveCredentials({ baseUrl, apiKey });
    res.json({ ok: true });
  }));

  app.delete("/api/moysklad/credentials", wrap(async (req, res) => {
    await store.del("_moySkladCredentials");
    res.json({ ok: true });
  }));

  app.post("/api/moysklad/sync", wrap(async (req, res) => {
    try {
      res.json(await sync((req.body || {}).full ? "full" : "delta"));
    } catch (e) {
      if (!(e instanceof HttpError)) { await saveState({ lastError: { timestamp: Date.now(), message: e.message } }).catch(() => {}); throw new HttpError(502, e.message); }
      throw e;
    }
  }));

  app.get("/api/moysklad/history", wrap(async (req, res) => {
    res.json({ history: (await storeGetJSON("_moySkladSyncHistory", [])) || [] });
  }));

  // Отмена одной синхронизации: убирает добавленные ею товары, возвращает прежние названия
  // и штрихкоды изменённым, снимает пометку «удалён». Смена артикула не отменяется.
  app.post("/api/moysklad/undo/:id", wrap(async (req, res) => {
    const history = (await storeGetJSON("_moySkladSyncHistory", [])) || [];
    const entry = history.find((h) => h.id === req.params.id);
    if (!entry) throw new HttpError(404, "Такая синхронизация не найдена в истории");
    if (entry.undone) throw new HttpError(400, "Эта синхронизация уже была отменена ранее");
    const release = await acquireKeyLock("catalog");
    try {
      let catalog = (await storeGetJSONStrict("catalog", [])) || [];
      const added = new Set((entry.addedSkus || []).map(String));
      const unmark = new Set((entry.deletedSkus || []).map(String));
      catalog = catalog.filter((p) => !added.has(String(p.sku))).map((p) => {
        let out = p;
        const u = (entry.updatedItems || []).find((x) => String(x.sku) === String(p.sku));
        if (u) out = { ...out, name: u.previousName, barcodes: u.previousBarcodes };
        if (unmark.has(String(p.sku)) && out.msDeleted) { out = { ...out }; delete out.msDeleted; }
        return out;
      });
      await storeSetJSON("catalog", catalog);
    } finally {
      release();
    }
    entry.undone = true;
    await storeSetJSON("_moySkladSyncHistory", history);
    // после отмены следующий запуск должен пройти каталог целиком
    await saveState({ lastServerTime: null });
    res.json({ ok: true, removedCount: (entry.addedSkus || []).length, restoredCount: (entry.updatedItems || []).length, renamedKept: (entry.renamedItems || []).length });
  }));

  return { isConfigured, sync };
}

module.exports = { register };
