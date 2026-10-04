// Кто что может читать и менять.
//
// Администратор: всё (кроме служебных ключей с "_" — к ним доступа через общий API
// нет ни у кого).
// Сотрудник: общие справочники (каталог, цены упаковки, фото, остатки упаковки,
// настройки) — на чтение; свои записи, свои замеры, свой чат — на чтение и запись.
// Чужие записи, чужие личные чаты, журнал входов, историю цен сотрудник с сервера
// не получает вообще — раньше они приходили на каждое устройство и просто не
// показывались на экране.

const { PatchError, isObj } = require("./patch");
const { isValidHash } = require("./auth");
const secrets = require("./secrets");

const forbidden = (msg) => new PatchError(msg || "Недостаточно прав для этого действия", 403);

// Правила слияния одновременных изменений (см. lib/patch.js)
const MERGE_RULES = {
  packagingMaterials: { deltaFields: ["stock"] },
  chatMessages: { unionFields: ["readBy"] },
  messages: { unionFields: ["readBy"] },
};

const ADMIN_ONLY_READ = new Set(["loginLog", "priceHistory", "dismissedInactiveNotices"]);
const EMPLOYEE_FILTERED = new Set(["entries", "timerSessions", "chatMessages", "messages"]);

const isAdmin = (user) => !!user && user.role === "admin";

function canRead(key, user) {
  if (isAdmin(user)) return true;
  if (ADMIN_ONLY_READ.has(key) || key.startsWith("snapshot:")) return false;
  return true;
}

// Нужно ли разбирать и фильтровать значение перед отдачей (иначе отдаём как есть, без лишней работы)
function needsView(key, user) {
  if (key === "users") return true;
  return !isAdmin(user) && EMPLOYEE_FILTERED.has(key);
}

function userForAdmin(u) {
  const out = { ...u };
  delete out.passwordHash;
  if (out.secretWordHash) out.secretWordHash = "set"; // сам хеш не отдаём — только признак "задано"
  // QR-код в базе зашифрован; администратору отдаём его расшифрованным (чтобы показать QR)
  const qr = secrets.readQrToken(u);
  delete out.qrTokenEnc; delete out.qrTokenHash; delete out.qrToken;
  if (qr) out.qrToken = qr;
  return out;
}
function userForSelf(u) {
  const out = userForAdmin(u);
  delete out.qrToken;
  return out;
}
function userForOthers(u) {
  return { id: u.id, name: u.name, role: u.role, chatIncognito: !!u.chatIncognito };
}

function viewFor(key, value, user) {
  if (key === "users") {
    const list = Array.isArray(value) ? value : [];
    if (isAdmin(user)) return list.map(userForAdmin);
    return list.map((u) => (u.id === user.id ? userForSelf(u) : userForOthers(u)));
  }
  if (isAdmin(user) || !Array.isArray(value)) return value;
  if (key === "entries" || key === "timerSessions") return value.filter((e) => e && e.employeeId === user.id);
  if (key === "chatMessages") return value.filter((m) => m && (m.threadId === "all" || m.threadId === user.id));
  if (key === "messages") return value.filter((m) => m && (m.toEmployeeId === null || m.toEmployeeId === undefined || m.toEmployeeId === user.id));
  return value;
}

const MAX_CHAT_AUDIO_CHARS = 3 * 1024 * 1024; // голосовое до 60 сек — с большим запасом

// Проверяет (и при необходимости поправляет) изменения перед применением.
// current — актуальное значение из базы (целиком, без фильтров), ctx.getJSON — чтение других ключей.
async function guardWrite(key, ops, current, user, ctx) {
  if (key.startsWith("snapshot:") && !isAdmin(user)) throw forbidden();

  if (isAdmin(user)) {
    if (key === "users") return guardUsersByAdmin(ops, current);
    return ops;
  }

  const cur = Array.isArray(current) ? current : [];
  const byId = (id) => cur.find((x) => x && String(x.id) === String(id));
  const noReplace = () => { if (ops.kind !== "array") throw forbidden(); };
  const none = (list) => { if (list && list.length) throw forbidden(); };

  switch (key) {
    case "entries": {
      noReplace();
      none(ops.remove);
      const upsert = [];
      let options = null;
      for (const u of ops.upsert || []) {
        const item = { ...u.item };
        if (item.employeeId !== user.id) throw forbidden("Нельзя добавлять записи от имени другого сотрудника");
        const existing = byId(item.id);
        if (existing) {
          if (existing.employeeId !== user.id) throw forbidden();
          continue; // такая запись уже сохранена (повторная отправка из офлайн-очереди) — не трогаем
        }
        if (item.type === "hour") {
          if (!(Number(item.hours) > 0)) throw new PatchError("Некорректное количество часов");
          item.approved = false; // подтверждает только администратор
          item.rate = Number(user.hourlyRate) || 0; // ставка — та, что назначил администратор
        } else if (item.type === "piece") {
          if (!(Number(item.qty) > 0)) throw new PatchError("Некорректное количество");
          // Цена за штуку — всегда из справочника цен на сервере, а не то, что прислал браузер
          if (options === null) options = (await ctx.getJSON("packagingOptions", [])) || [];
          const forSku = options.filter((o) => o && String(o.sku) === String(item.sku));
          const opt = forSku.find((o) => o.id === item.optionId) || forSku[0];
          if (opt) {
            item.unitPrice = Number(opt.price) || 0;
            item.optionId = opt.id;
            item.optionLabel = opt.label || "";
          } else {
            item.unitPrice = 0;
          }
        } else {
          throw new PatchError("Неизвестный тип записи");
        }
        delete item.deletedAt; delete item.deletedBy;
        upsert.push({ ...u, item });
      }
      for (const p of ops.patch || []) {
        const existing = byId(p.id);
        if (!existing) continue;
        if (existing.employeeId !== user.id) throw forbidden("Нельзя менять чужие записи");
        const fields = Object.keys(p.set || {});
        if ((p.unset && p.unset.length) || fields.some((f) => f !== "deletedAt" && f !== "deletedBy")) {
          throw forbidden("Запись можно только удалить — изменить её может администратор");
        }
      }
      return { ...ops, upsert };
    }

    case "timerSessions": {
      noReplace(); none(ops.remove); none(ops.patch);
      const upsert = [];
      for (const u of ops.upsert || []) {
        if (u.item.employeeId !== user.id) throw forbidden();
        if (byId(u.item.id)) continue;
        upsert.push(u);
      }
      return { ...ops, upsert };
    }

    case "chatMessages": {
      noReplace();
      const visible = (m) => m.threadId === "all" || m.threadId === user.id;
      for (const id of ops.remove || []) {
        const m = byId(id);
        if (m && m.from !== user.id) throw forbidden("Удалять можно только свои сообщения");
      }
      const upsert = [];
      for (const u of ops.upsert || []) {
        const item = { ...u.item };
        if (item.from !== user.id || !visible(item)) throw forbidden();
        if (byId(item.id)) continue;
        if (item.audio && typeof item.audio.dataUrl === "string" && item.audio.dataUrl.length > MAX_CHAT_AUDIO_CHARS) {
          throw new PatchError("Голосовое сообщение слишком большое");
        }
        item.readBy = [user.id];
        upsert.push({ ...u, item });
      }
      const patch = [];
      for (const p of ops.patch || []) {
        const m = byId(p.id);
        if (!m) continue;
        const fields = Object.keys(p.set || {});
        if (!visible(m) || (p.unset && p.unset.length) || fields.some((f) => f !== "readBy")) throw forbidden();
        patch.push({ id: p.id, set: { readBy: [user.id] } }); // отметить прочитанным можно только за себя
      }
      return { ...ops, upsert, patch };
    }

    case "messages": {
      noReplace(); none(ops.remove); none(ops.upsert);
      const patch = [];
      for (const p of ops.patch || []) {
        const m = byId(p.id);
        if (!m) continue;
        const mine = m.toEmployeeId === null || m.toEmployeeId === undefined || m.toEmployeeId === user.id;
        const fields = Object.keys(p.set || {});
        if (!mine || (p.unset && p.unset.length) || fields.some((f) => f !== "readBy")) throw forbidden();
        patch.push({ id: p.id, set: { readBy: [user.id] } });
      }
      return { ...ops, patch };
    }

    case "customBarcodes": {
      noReplace(); none(ops.remove); none(ops.patch);
      if (!user.barcodeAddEnabled) throw forbidden("Добавление штрихкодов вам не разрешено");
      const upsert = [];
      for (const u of ops.upsert || []) {
        if (u.item.employeeId !== user.id) throw forbidden();
        if (byId(u.item.id)) continue;
        upsert.push(u);
      }
      return { ...ops, upsert };
    }

    case "packagingMaterials": {
      noReplace();
      if ((ops.remove || []).length) throw forbidden("Удалять упаковку может только администратор");
      const upsert = (ops.upsert || []).filter((u) => !byId(u.item.id));
      return { ...ops, upsert };
    }

    case "productPackagingLinks":
      if (ops.kind !== "object") throw forbidden();
      return ops;

    case "packagingPurchaseRequest":
      return ops;

    default:
      throw forbidden();
  }
}

// Администратор меняет список сотрудников: хеши паролей/секретных слов через этот путь
// не задаются (для этого есть отдельные запросы /api/admin/...). Исключение — уже готовые
// хеши из файла резервной копии при восстановлении.
function guardUsersByAdmin(ops, current) {
  const cur = Array.isArray(current) ? current : [];
  const stored = new Map(cur.map((u) => [String(u.id), u]));
  const fixUser = (incoming) => {
    if (!isObj(incoming) || incoming.id === undefined || incoming.id === null) throw new PatchError("Некорректные данные сотрудника");
    const out = { ...incoming };
    const old = stored.get(String(out.id));
    for (const f of ["passwordHash", "secretWordHash"]) {
      if (!isValidHash(out[f])) {
        if (old && old[f]) out[f] = old[f]; else delete out[f];
      }
    }
    // QR-код: администратор работает с открытым значением, в базу оно уходит зашифрованным
    const incomingQr = typeof out.qrToken === "string" && out.qrToken ? out.qrToken : null;
    const storedQr = old ? secrets.readQrToken(old) : null;
    if (incomingQr && incomingQr !== storedQr) return secrets.withQrToken(out, incomingQr);
    delete out.qrToken; delete out.qrTokenEnc; delete out.qrTokenHash;
    if (old) for (const f of ["qrToken", "qrTokenEnc", "qrTokenHash"]) if (old[f]) out[f] = old[f];
    return out;
  };
  if (ops.kind === "replace") {
    if (!Array.isArray(ops.value)) throw new PatchError("Некорректный список сотрудников");
    return { kind: "replace", value: ops.value.map(fixUser) };
  }
  if (ops.kind !== "array") throw new PatchError("Некорректный список сотрудников");
  const patch = (ops.patch || []).map((p) => {
    const set = { ...(p.set || {}) };
    for (const f of ["passwordHash", "secretWordHash"]) if (f in set && !isValidHash(set[f])) delete set[f];
    delete set.qrTokenEnc; delete set.qrTokenHash;
    let unset = (p.unset || []).filter((f) => !["passwordHash", "secretWordHash", "qrTokenEnc", "qrTokenHash"].includes(f));
    if (typeof set.qrToken === "string" && set.qrToken && secrets.enabled) {
      const enc = secrets.withQrToken({}, set.qrToken);
      delete set.qrToken;
      set.qrTokenEnc = enc.qrTokenEnc; set.qrTokenHash = enc.qrTokenHash;
    }
    if (unset.includes("qrToken") && secrets.enabled) unset = unset.filter((f) => f !== "qrToken").concat(["qrTokenEnc", "qrTokenHash"]);
    return { ...p, set, unset };
  });
  const upsert = (ops.upsert || []).map((u) => ({ ...u, item: fixUser(u.item) }));
  return { ...ops, patch, upsert };
}

// Проверка результата после применения изменений
function checkResult(key, before, after) {
  if (key === "users") {
    if (!Array.isArray(after)) throw new PatchError("Некорректный список сотрудников");
    const hadAdmin = Array.isArray(before) && before.some((u) => u && u.role === "admin");
    if (hadAdmin && !after.some((u) => u && u.role === "admin")) {
      throw new PatchError("Нельзя удалить последнего администратора");
    }
  }
}

module.exports = { MERGE_RULES, isAdmin, canRead, needsView, viewFor, guardWrite, checkResult, userForSelf, userForAdmin };
