// Применение "точечных изменений" к значению в хранилище.
//
// Раньше браузер при любом изменении присылал ВЕСЬ список целиком (все записи, весь
// чат и т.д.), и сервер просто заменял старое значение новым. Если два человека
// работали одновременно, второй затирал то, что успел сохранить первый.
//
// Теперь браузер присылает только то, что реально изменилось (добавить / изменить /
// удалить конкретные элементы), а сервер применяет это к АКТУАЛЬНОМУ значению из базы.
// Чужие изменения при этом сохраняются.
//
// Формат операций (ops):
//   { kind: "replace", value }                       — заменить целиком (редкий случай)
//   { kind: "array", keyField, remove, patch, upsert } — для списков объектов
//   { kind: "object", set, unset }                   — для словарей (настройки, фото и т.п.)

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

class PatchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 400;
  }
}

function validateOps(ops) {
  if (!isObj(ops)) throw new PatchError("Некорректный формат изменений");
  if (ops.kind === "replace") {
    if (!("value" in ops)) throw new PatchError("Некорректный формат изменений");
    return;
  }
  if (ops.kind === "array") {
    if (typeof ops.keyField !== "string" || !ops.keyField) throw new PatchError("Некорректный формат изменений");
    for (const f of ["remove", "patch", "upsert"]) {
      if (ops[f] !== undefined && !Array.isArray(ops[f])) throw new PatchError("Некорректный формат изменений");
    }
    for (const p of ops.patch || []) {
      if (!isObj(p) || p.id === undefined || p.id === null) throw new PatchError("Некорректный формат изменений");
      if (p.set !== undefined && !isObj(p.set)) throw new PatchError("Некорректный формат изменений");
      if (p.unset !== undefined && !Array.isArray(p.unset)) throw new PatchError("Некорректный формат изменений");
      if (p.old !== undefined && !isObj(p.old)) throw new PatchError("Некорректный формат изменений");
    }
    for (const u of ops.upsert || []) {
      if (!isObj(u) || !isObj(u.item)) throw new PatchError("Некорректный формат изменений");
      const id = u.item[ops.keyField];
      if (id === undefined || id === null || typeof id === "object") throw new PatchError("Некорректный формат изменений");
    }
    return;
  }
  if (ops.kind === "object") {
    if (ops.set !== undefined && !isObj(ops.set)) throw new PatchError("Некорректный формат изменений");
    if (ops.unset !== undefined && !Array.isArray(ops.unset)) throw new PatchError("Некорректный формат изменений");
    return;
  }
  throw new PatchError("Некорректный формат изменений");
}

// Применяет изменение полей к одному элементу списка (используется и для значений,
// хранящихся целиком, и для строк таблиц)
function patchItem(source, p, kf, rules) {
  const deltaFields = new Set((rules && rules.deltaFields) || []);
  const unionFields = new Set((rules && rules.unionFields) || []);
  const item = { ...source };
  for (const f of p.unset || []) { if (f !== kf) delete item[f]; }
  for (const [f, v] of Object.entries(p.set || {})) {
    if (f === kf) continue; // ключ элемента менять нельзя
    const old = p.old ? p.old[f] : undefined;
    if (deltaFields.has(f) && typeof v === "number" && typeof old === "number" && typeof item[f] === "number") {
      item[f] = item[f] + (v - old);
    } else if (unionFields.has(f) && Array.isArray(v) && Array.isArray(item[f])) {
      const merged = item[f].slice();
      for (const x of v) if (!merged.includes(x)) merged.push(x);
      item[f] = merged;
    } else {
      item[f] = v;
    }
  }
  return item;
}

// rules: { deltaFields: [..], unionFields: [..] }
//   deltaFields — числовые поля, которые меняются "на разницу" (остаток упаковки:
//                 двое одновременно списали по 10 — должно уйти 20, а не 10)
//   unionFields — поля-списки, которые объединяются (кто прочитал сообщение)
function applyOps(current, ops, rules) {
  if (ops.kind === "replace") return ops.value;

  if (ops.kind === "object") {
    const next = isObj(current) ? { ...current } : {};
    for (const k of ops.unset || []) delete next[String(k)];
    for (const [k, v] of Object.entries(ops.set || {})) next[k] = v;
    return next;
  }

  // kind === "array"
  const kf = ops.keyField;
  const keyOf = (item) => (isObj(item) && item[kf] !== undefined && item[kf] !== null ? String(item[kf]) : null);
  let next = Array.isArray(current) ? current.slice() : [];

  const removeSet = new Set((ops.remove || []).map(String));
  if (removeSet.size) next = next.filter((item) => { const k = keyOf(item); return k === null || !removeSet.has(k); });

  if ((ops.patch || []).length) {
    const index = new Map();
    next.forEach((item, i) => { const k = keyOf(item); if (k !== null && !index.has(k)) index.set(k, i); });
    for (const p of ops.patch) {
      const i = index.get(String(p.id));
      if (i === undefined) continue; // элемент уже кем-то удалён — менять нечего
      next[i] = patchItem(next[i], p, kf, rules);
    }
  }

  for (const u of ops.upsert || []) {
    const k = keyOf(u.item);
    const existing = next.findIndex((item) => keyOf(item) === k);
    if (existing !== -1) { next[existing] = u.item; continue; } // такой уже есть (повторная отправка) — заменяем на месте
    let pos = -1;
    if (u.after !== undefined && u.after !== null) {
      const a = next.findIndex((item) => keyOf(item) === String(u.after));
      if (a !== -1) pos = a + 1;
    } else if (u.atStart) {
      pos = 0;
    }
    if (pos === -1) next.push(u.item); else next.splice(pos, 0, u.item);
  }
  return next;
}

module.exports = { applyOps, patchItem, validateOps, PatchError, isObj };
