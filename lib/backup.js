// Резервные копии ВНЕ Timeweb.
//
// По расписанию (по умолчанию каждые 6 часов) сервер собирает полную копию данных, сжимает и шифрует её
// паролем владельца и отправляет:
//   • на Яндекс Диск (REST API, OAuth-токен приложения владельца, подпапка app:/sklad-uchet) —
//     Диск синхронизируется с компьютером приложением «Яндекс Диск», так копия попадает и на ПК;
//   • в Telegram — файлом в чат с ботом владельца.
// Если отправка не удалась — повтор через час, пока не получится.
//
// (Яндекс Диск — через REST API с OAuth-токеном: WebDAV у Яндекса только для платной подписки.)
// Шифрование: gzip → AES-256-GCM, ключ из пароля по PBKDF2-SHA256 (310 000 повторов).
// Тот же способ есть в браузере (Web Crypto), поэтому файл восстанавливается прямо в приложении:
// «Настройки → Восстановить из файла» → ввести пароль копий. Без пароля файл не прочитать —
// ни Яндексу, ни Telegram, ни тому, кто найдёт файл на компьютере.
//
// Настройки — в служебном ключе _backupConfig (пароли и токен зашифрованы APP_SECRET),
// итоги отправок — в _backupStatus.

const crypto = require("crypto");
const zlib = require("zlib");

const FORMAT = "sklad-uchet-backup";
const ITERATIONS = 310000;
const MIN_BACKUP_PASSWORD = 8;
const RUN_FROM_HOUR = 3; // по Москве: ночью, когда никто не работает
const RETRY_MS = 60 * 60 * 1000;
// Как часто копировать на Яндекс Диск: каждые N часов или 0 — раз в сутки ночью. По умолчанию 6 часов:
// записи упаковщиков, приходы и списания упаковки есть только здесь — при копии раз в сутки можно
// потерять целый рабочий день. В Telegram копия уходит раз в сутки (ночью), чтобы не засыпать чат.
const INTERVALS = [0, 1, 2, 3, 4, 6, 8, 12];
const DEFAULT_INTERVAL = 6;
const DEFAULT_KEEP_DAYS = 30;
const intervalOf = (c) => (INTERVALS.includes(c.intervalHours) ? c.intervalHours : DEFAULT_INTERVAL);
const keepOf = (c) => (Number.isInteger(c.keepDays) && c.keepDays >= 3 ? c.keepDays : DEFAULT_KEEP_DAYS);
const YANDEX_API = () => (process.env.BACKUP_YANDEX_API || "https://cloud-api.yandex.net/v1/disk").replace(/\/+$/, "");
const TELEGRAM_URL = () => (process.env.BACKUP_TELEGRAM_URL || "https://api.telegram.org").replace(/\/+$/, "");

function encryptBackup(obj, password) {
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify(obj), "utf8"));
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, 32, "sha256");
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]); // как в Web Crypto: шифротекст + метка
  return {
    format: FORMAT, version: 1, createdAt: obj.exportedAt || new Date().toISOString(),
    note: "Зашифрованная резервная копия «Складского учёта». Восстановление: Настройки → Восстановить из файла, пароль резервных копий.",
    cipher: "AES-256-GCM", kdf: "PBKDF2-SHA256", iterations: ITERATIONS, compression: "gzip",
    salt: salt.toString("base64"), iv: iv.toString("base64"), data: data.toString("base64"),
  };
}

function decryptBackup(file, password) {
  if (!file || file.format !== FORMAT) throw new Error("это не зашифрованная копия");
  const salt = Buffer.from(file.salt, "base64"), iv = Buffer.from(file.iv, "base64"), all = Buffer.from(file.data, "base64");
  const key = crypto.pbkdf2Sync(String(password), salt, file.iterations || ITERATIONS, 32, "sha256");
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(all.subarray(all.length - 16));
  const plain = Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]);
  return JSON.parse(zlib.gunzipSync(plain).toString("utf8"));
}

// Имя файла: дата и время по Москве — несколько копий в сутки не перезаписывают друг друга
const moscowTime = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", "-");
const fileNameFor = (dateStr, timeStr) => `sklad-uchet-backup_${dateStr}${timeStr ? "_" + timeStr : ""}.json`;
const shortErr = (e) => String((e && e.message) || e).slice(0, 300);

// ---------- Яндекс Диск (REST API, OAuth-токен) ----------
// WebDAV на бесплатном аккаунте Яндекс отвечает «402 Payment Required» (только для Яндекс 360),
// поэтому — REST API Диска (бесплатно). Токен — от приложения владельца на oauth.yandex.ru
// с доступом «Доступ к папке приложения на Диске» (тот же, что у «Моего склада»): пишем в свою
// подпапку app:/sklad-uchet/ — на Диске это «Приложения / <название приложения> / sklad-uchet».
// Токен живёт год — дата ввода видна в настройках. Письмо «Моего склада» от 01.11.
const YA_FOLDER = "sklad-uchet";
const yaPath = (name) => "app:/" + YA_FOLDER + (name ? "/" + name : "");
async function ya(cfg, secrets, method, pathQuery) {
  const r = await fetch(YANDEX_API() + pathQuery, { method, headers: { Authorization: "OAuth " + secrets.decrypt(cfg.tokenEnc) } });
  let json = null;
  try { json = await r.json(); } catch (e) { /* пустой ответ */ }
  return { status: r.status, json };
}
function yaError(r, what) {
  if (r.status === 401) return new Error("Яндекс Диск: токен неверный или истёк — получите новый");
  if (r.status === 403) return new Error("Яндекс Диск: у токена нет доступа к Диску — у приложения на oauth.yandex.ru должен быть отмечен «Доступ к папке приложения на Диске»");
  if (r.status === 507) return new Error("Яндекс Диск: не хватает места — уменьшите «Хранить, дней» или освободите Диск");
  if (r.status === 402) return new Error("Яндекс Диск: 402 — этот способ доступен только с подпиской Яндекс 360");
  return new Error(`Яндекс Диск: ${what} — ответ ${r.status}${r.json && (r.json.message || r.json.description) ? " (" + (r.json.message || r.json.description) + ")" : ""}`);
}
// Проверка доступа и создание своей подпапки. GET /v1/disk/ при доступе «папка приложения» даёт 403 —
// поэтому проверяем саму папку приложения.
async function yandexEnsureFolder(cfg, secrets) {
  let r = await ya(cfg, secrets, "GET", "/resources?path=" + encodeURIComponent("app:/") + "&limit=1");
  if (r.status === 404) {
    const c = await ya(cfg, secrets, "PUT", "/resources?path=" + encodeURIComponent("app:/"));
    if (![201, 409].includes(c.status)) throw yaError(c, "создание папки приложения");
  } else if (r.status !== 200) throw yaError(r, "папка приложения");
  r = await ya(cfg, secrets, "PUT", "/resources?path=" + encodeURIComponent(yaPath()));
  if (![201, 409].includes(r.status)) throw yaError(r, "создание папки sklad-uchet");
}
async function yandexUpload(cfg, secrets, name, body, onStage) {
  await yandexEnsureFolder(cfg, secrets);
  const link = await ya(cfg, secrets, "GET", "/resources/upload?path=" + encodeURIComponent(yaPath(name)) + "&overwrite=true");
  if (link.status !== 200 || !link.json || !link.json.href) throw yaError(link, "ссылка для загрузки");
  if (onStage) onStage("загрузка на Яндекс Диск");
  // Ссылка — на сервер загрузки Яндекса, без заголовка авторизации. Копия у нас небольшая (сжата), держим в памяти.
  const r = await fetch(link.json.href, { method: link.json.method || "PUT", body, headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30 * 60000) });
  if (![200, 201, 202].includes(r.status)) throw yaError({ status: r.status, json: null }, "загрузка файла");
}
// Хранение «лесенкой» (как у «Моего склада»): за последние 2 суток — все копии, дальше — последняя
// за день, старше keepDays — ничего. Бесплатный Диск 10 ГБ делят несколько приложений.
async function yandexCleanup(cfg, secrets, keepDays) {
  const r = await ya(cfg, secrets, "GET", "/resources?path=" + encodeURIComponent(yaPath()) + "&limit=1000&fields=_embedded.items.name");
  if (r.status !== 200 || !r.json) return 0;
  const names = ((r.json._embedded && r.json._embedded.items) || []).map((x) => x.name).filter((x) => /^sklad-uchet-backup_\d{4}-\d{2}-\d{2}(_\d{2}-\d{2})?\.json$/.test(x));
  const when = (n) => Date.parse(n.slice(19, 29) + "T" + (n.length > 34 ? n.slice(30, 32) + ":" + n.slice(33, 35) : "00:00") + ":00Z") - 3 * 3600000; // время по Москве
  const border = Date.now() - keepDays * 86400000, twoDays = Date.now() - 2 * 86400000;
  const lastOfDay = {};
  for (const n of names) { const d = n.slice(19, 29); if (!lastOfDay[d] || n > lastOfDay[d]) lastOfDay[d] = n; }
  let removed = 0;
  for (const n of names) {
    const t = when(n);
    if (!t) continue;
    if (t < border || (t < twoDays && lastOfDay[n.slice(19, 29)] !== n)) {
      const d = await ya(cfg, secrets, "DELETE", "/resources?path=" + encodeURIComponent(yaPath(n)) + "&permanently=true");
      if ([202, 204].includes(d.status)) removed++;
    }
  }
  return removed;
}

// ---------- Telegram ----------
async function tg(token, method, body) {
  const r = await fetch(`${TELEGRAM_URL()}/bot${token}/${method}`, { method: "POST", body });
  let j = null;
  try { j = await r.json(); } catch (e) { /* не JSON */ }
  if (!r.ok || !j || !j.ok) throw new Error(`Telegram: ${(j && j.description) || "ошибка " + r.status}`);
  return j.result;
}
async function telegramFindChat(token) {
  const updates = await tg(token, "getUpdates", new URLSearchParams({ limit: "50" }));
  const withChat = (updates || []).map((u) => (u.message || u.channel_post || u.my_chat_member || {}).chat).filter(Boolean);
  return withChat.length ? withChat[withChat.length - 1] : null;
}
async function telegramSend(cfg, secrets, name, body, caption) {
  const fd = new FormData();
  fd.append("chat_id", String(cfg.chatId));
  fd.append("caption", caption);
  fd.append("document", new Blob([body], { type: "application/json" }), name);
  await tg(secrets.decrypt(cfg.tokenEnc), "sendDocument", fd);
}

// ---------- регистрация ----------
function register(app, deps) {
  const { requireAdmin, wrap, HttpError, storeGetJSON, storeSetJSON, secrets, buildBackupData, moscowDateStr, dataReady } = deps;

  const getConfig = async () => (await storeGetJSON("_backupConfig", null)) || {};
  const setConfig = (c) => storeSetJSON("_backupConfig", c);
  const getStatus = async () => (await storeGetJSON("_backupStatus", null)) || { results: {}, history: [] };
  const needSecrets = () => { if (!secrets.enabled) throw new HttpError(400, "На сервере не задан APP_SECRET — без него пароли копий хранить нельзя"); };

  const publicStatus = async () => {
    const c = await getConfig();
    const s = await getStatus();
    return {
      passwordSet: !!c.passwordEnc,
      // настройка из 3.20.0 (WebDAV, логин и пароль) не работает на бесплатном Диске — считаем неподключённой
      yandex: c.yandex && c.yandex.tokenEnc ? { tokenAt: c.yandex.tokenAt || null, tokenEnd: c.yandex.tokenAt ? c.yandex.tokenAt + 365 * 86400000 : null, clientId: c.yandex.clientId || "", folder: "Приложения / … / " + YA_FOLDER } : null,
      yandexOld: !!(c.yandex && !c.yandex.tokenEnc),
      running: progress.stage ? { stage: progress.stage, sec: Math.round((Date.now() - progress.startedAt) / 1000), reason: progress.reason } : null,
      telegram: c.telegram ? { chatId: c.telegram.chatId, chatTitle: c.telegram.chatTitle || "" } : null,
      keepDays: keepOf(c), intervalHours: intervalOf(c), intervals: INTERVALS,
      results: s.results || {}, lastOkAt: s.lastOkAt || {}, history: (s.history || []).slice(-15).reverse(),
      runHour: RUN_FROM_HOUR,
    };
  };

  let running = null;
  const progress = { stage: "", startedAt: 0, reason: "" }; // ход текущей копии — для экрана настроек
  // Отправить копию. only — список мест ("yandex", "telegram"); по умолчанию — все подключённые
  async function runBackup(reason, only) {
    if (running) return running;
    running = (async () => {
      const c = await getConfig();
      if (!c.passwordEnc) throw new Error("не задан пароль резервных копий");
      const targets = ["yandex", "telegram"].filter((t) => c[t] && (t !== "yandex" || c.yandex.tokenEnc) && (!only || only.includes(t)));
      if (!targets.length) throw new Error("не подключено ни одно место для копий");
      const today = moscowDateStr();
      Object.assign(progress, { stage: "сбор данных", startedAt: Date.now(), reason });
      const data = await buildBackupData();
      progress.stage = "шифрование";
      const file = JSON.stringify(encryptBackup(data, secrets.decrypt(c.passwordEnc)));
      const name = fileNameFor(today, moscowTime());
      const sizeKb = Math.round(file.length / 1024);
      const s = await getStatus();
      s.results = s.results || {};
      const results = {};
      for (const t of targets) {
        const at = Date.now();
        try {
          if (t === "yandex") {
            progress.stage = "подключение к Яндекс Диску";
            await yandexUpload(c.yandex, secrets, name, file, (st) => { progress.stage = st; });
            let removed = 0;
            progress.stage = "удаление старых копий";
            try { removed = await yandexCleanup(c.yandex, secrets, keepOf(c)); } catch (e) { /* чистка не критична */ }
            results[t] = { ok: true, at, date: today, file: name, sizeKb, removed };
          } else {
            progress.stage = "отправка в Telegram";
            const counts = `записей ${(data.entries || []).length}, товаров ${(data.catalog || []).length}, упаковок ${(data.packagingMaterials || []).length}`;
            await telegramSend(c.telegram, secrets, name, file, `Резервная копия «Складского учёта» за ${today} ${name.slice(30, 35).replace("-", ":")} (${counts}). Зашифрована паролем резервных копий.`);
            results[t] = { ok: true, at, date: today, file: name, sizeKb };
          }
        } catch (e) {
          results[t] = { ok: false, at, date: today, error: shortErr(e) };
        }
        s.results[t] = results[t];
        if (results[t].ok) { s.lastOkAt = { ...(s.lastOkAt || {}), [t]: at }; s.lastOkDate = { ...(s.lastOkDate || {}), [t]: today }; }
      }
      s.history = [...(s.history || []), { at: Date.now(), reason, results }].slice(-60);
      await storeSetJSON("_backupStatus", s);
      const line = targets.map((t) => `${t === "yandex" ? "Яндекс Диск" : "Telegram"}: ${results[t].ok ? "ок" : "ошибка — " + results[t].error}`).join("; ");
      console.log(`💾 Резервная копия вне Timeweb (${reason}, ${sizeKb} КБ) — ${line}`);
      return results;
    })();
    try { return await running; } finally { running = null; progress.stage = ""; }
  }

  // Расписание: каждые 10 минут проверяем, не пора ли. Яндекс Диск — каждые N часов (или раз в сутки
  // ночью), Telegram — раз в сутки ночью. Не получилось — повтор через час (или раньше, если интервал короче).
  async function tick() {
    try {
      await dataReady;
      const c = await getConfig();
      if (!c.passwordEnc) return;
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hour12: false }).format(new Date()));
      const today = moscowDateStr();
      const s = await getStatus();
      const now = Date.now();
      const due = ["yandex", "telegram"].filter((t) => {
        if (!c[t] || (t === "yandex" && !c.yandex.tokenEnc)) return false;
        const r = (s.results || {})[t];
        const every = t === "yandex" ? intervalOf(c) : 0;
        if (r && !r.ok && now - r.at < Math.min(RETRY_MS, every ? every * 3600000 : RETRY_MS)) return false;
        if (every) {
          const lastOk = r && r.ok ? r.at : (s.lastOkAt || {})[t] || 0;
          return now - lastOk >= every * 3600000 - 5 * 60000; // 5 минут запаса, чтобы не «уезжало» расписание
        }
        if (hour < RUN_FROM_HOUR) return false;
        return !(r && r.ok && r.date === today) && !((s.lastOkDate || {})[t] === today);
      });
      if (due.length) await runBackup("по расписанию", due);
    } catch (e) {
      console.error("Резервная копия вне Timeweb не сделана:", e.message);
    }
  }
  const timer = setInterval(tick, 10 * 60 * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 60 * 1000);

  app.post("/api/admin/backup/schedule", requireAdmin, wrap(async (req, res) => {
    const b = req.body || {};
    const intervalHours = Number(b.intervalHours);
    const keepDays = parseInt(b.keepDays);
    if (!INTERVALS.includes(intervalHours)) throw new HttpError(400, "Недопустимая частота копий");
    if (!(keepDays >= 3 && keepDays <= 365)) throw new HttpError(400, "Хранить копии можно от 3 до 365 дней");
    const c = await getConfig();
    await setConfig({ ...c, intervalHours, keepDays });
    res.json(await publicStatus());
  }));

  app.get("/api/admin/backup/status", requireAdmin, wrap(async (req, res) => res.json(await publicStatus())));

  app.post("/api/admin/backup/password", requireAdmin, wrap(async (req, res) => {
    needSecrets();
    const password = String((req.body || {}).password || "");
    if (password.length < MIN_BACKUP_PASSWORD) throw new HttpError(400, `Пароль резервных копий — не короче ${MIN_BACKUP_PASSWORD} символов`);
    const c = await getConfig();
    await setConfig({ ...c, passwordEnc: secrets.encrypt(password) });
    res.json(await publicStatus());
  }));

  app.post("/api/admin/backup/yandex", requireAdmin, wrap(async (req, res) => {
    needSecrets();
    const b = req.body || {};
    // токен можно вставить и целиком ссылкой после авторизации: …#access_token=y0_…&token_type=…
    let token = String(b.token || "").trim();
    const m = token.match(/access_token=([^&\s]+)/);
    if (m) token = decodeURIComponent(m[1]);
    const clientId = String(b.clientId || "").trim();
    if (!token || token.length < 20) throw new HttpError(400, "Вставьте OAuth-токен Яндекс Диска (длинная строка, обычно начинается с y0_)");
    const cfg = { tokenEnc: secrets.encrypt(token), tokenAt: Date.now(), clientId };
    try { await yandexEnsureFolder(cfg, secrets); } catch (e) { throw new HttpError(400, "Не удалось подключиться к Яндекс Диску: " + shortErr(e)); }
    const c = await getConfig();
    await setConfig({ ...c, yandex: cfg });
    res.json(await publicStatus());
  }));

  app.post("/api/admin/backup/yandex/check", requireAdmin, wrap(async (req, res) => {
    const c = await getConfig();
    if (!c.yandex || !c.yandex.tokenEnc) throw new HttpError(400, "Яндекс Диск не подключён");
    try { await yandexEnsureFolder(c.yandex, secrets); } catch (e) { throw new HttpError(400, shortErr(e)); }
    res.json({ ok: true });
  }));

  app.post("/api/admin/backup/telegram", requireAdmin, wrap(async (req, res) => {
    needSecrets();
    const b = req.body || {};
    const token = String(b.token || "").trim();
    if (!/^\d+:[\w-]{20,}$/.test(token)) throw new HttpError(400, "Это не похоже на токен бота — он выглядит как 123456789:AAE…");
    let chat;
    try { chat = await telegramFindChat(token); } catch (e) { throw new HttpError(400, "Telegram не принял токен: " + shortErr(e)); }
    if (!chat) throw new HttpError(400, "Бот пока не видит ни одного чата. Откройте бота в Telegram, нажмите «Start» (или напишите ему любое сообщение) и повторите.");
    const cfg = { tokenEnc: secrets.encrypt(token), chatId: chat.id, chatTitle: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "" };
    try { await tg(token, "sendMessage", new URLSearchParams({ chat_id: String(chat.id), text: "✅ «Складской учёт» подключён: сюда будут приходить зашифрованные резервные копии раз в сутки." })); }
    catch (e) { throw new HttpError(400, "Не удалось написать в чат: " + shortErr(e)); }
    const c = await getConfig();
    await setConfig({ ...c, telegram: cfg });
    res.json(await publicStatus());
  }));

  app.delete("/api/admin/backup/:target", requireAdmin, wrap(async (req, res) => {
    const t = req.params.target;
    if (!["yandex", "telegram"].includes(t)) throw new HttpError(404, "not found");
    const c = await getConfig();
    delete c[t];
    await setConfig(c);
    res.json(await publicStatus());
  }));

  // Копия делается в фоне (загрузка может идти минуты) — экран опрашивает статус и показывает ход
  app.post("/api/admin/backup/run", requireAdmin, wrap(async (req, res) => {
    const c = await getConfig();
    if (!c.passwordEnc) throw new HttpError(400, "Сначала задайте пароль резервных копий");
    if (!((c.yandex && c.yandex.tokenEnc) || c.telegram)) throw new HttpError(400, "Не подключено ни одно место для копий");
    if (running) throw new HttpError(409, "Копия уже делается — подождите");
    runBackup("вручную").catch((e) => console.error("Резервная копия:", e.message));
    await new Promise((r) => setTimeout(r, 50));
    res.json(await publicStatus());
  }));

  // Скачать зашифрованную копию на это устройство: текущие данные или ежедневный снимок
  app.post("/api/admin/backup/download", requireAdmin, wrap(async (req, res) => {
    const c = await getConfig();
    if (!c.passwordEnc) throw new HttpError(400, "Сначала задайте пароль резервных копий");
    const snap = String((req.body || {}).snapshot || "");
    let data;
    if (snap) {
      if (!/^snapshot:\d{4}-\d{2}-\d{2}$/.test(snap)) throw new HttpError(400, "Некорректный снимок");
      data = await storeGetJSON(snap, null);
      if (!data) throw new HttpError(404, "Снимок не найден");
    } else data = await buildBackupData();
    const name = snap ? `sklad-uchet-snapshot_${snap.slice(9)}.json` : fileNameFor(moscowDateStr(), moscowTime());
    res.set("Content-Disposition", `attachment; filename="${name}"`);
    res.json(encryptBackup(data, secrets.decrypt(c.passwordEnc)));
  }));

  return { runBackup, tick };
}

module.exports = { register, encryptBackup, decryptBackup, FORMAT, ITERATIONS, MIN_BACKUP_PASSWORD };
