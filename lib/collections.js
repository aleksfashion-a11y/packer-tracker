// Хранение данных в настоящих таблицах: один элемент списка = одна строка таблицы.
//
// Раньше каждый раздел (все записи, весь чат, весь каталог...) лежал в базе ОДНИМ
// значением и при любом изменении переписывался целиком. Теперь у каждого раздела своя
// таблица, а изменение одной записи — это изменение одной строки. Это позволяет
// выбирать данные частями (постранично, по датам, по сотруднику) и не зависит от того,
// сколько всего накопилось.
//
// Этот файл — общая логика (что делать со строками). Сами обращения к базе — в
// "драйвере": lib/rows-pg.js (PostgreSQL) и memoryDriver ниже (файл/память — для
// запуска без базы и для проверок). Оба драйвера обязаны вести себя одинаково — это
// проверяется при каждом запуске (selfCheck).

const fs = require("fs");
const { patchItem, PatchError, isObj } = require("./patch");

// name — как раздел называется в приложении; table — имя таблицы в базе;
// kind: "array" — список объектов (строка = элемент), "object" — словарь (строка = ключ);
// cols — отдельные столбцы для отбора и сортировки: имя столбца → [тип, поле элемента]
const SPECS = {
  users: { table: "pt_users", kind: "array", keyField: "id", cols: { username: ["text", "username"], role: ["text", "role"] } },
  entries: { table: "pt_entries", kind: "array", keyField: "id", cols: { employee_id: ["text", "employeeId"], entry_date: ["text", "date"], type: ["text", "type"], sku: ["text", "sku"], ts: ["bigint", "timestamp"] } },
  timerSessions: { table: "pt_timer_sessions", kind: "array", keyField: "id", cols: { employee_id: ["text", "employeeId"], entry_date: ["text", "date"], ts: ["bigint", "timestamp"] } },
  chatMessages: { table: "pt_chat_messages", kind: "array", keyField: "id", cols: { thread_id: ["text", "threadId"], sender_id: ["text", "from"], ts: ["bigint", "timestamp"] } },
  messages: { table: "pt_messages", kind: "array", keyField: "id", cols: { to_employee_id: ["text", "toEmployeeId"], ts: ["bigint", "timestamp"] } },
  loginLog: { table: "pt_login_log", kind: "array", keyField: "id", cols: { user_id: ["text", "userId"], ts: ["bigint", "timestamp"] } },
  priceHistory: { table: "pt_price_history", kind: "array", keyField: "id", cols: { sku: ["text", "sku"], ts: ["bigint", "timestamp"] } },
  customBarcodes: { table: "pt_custom_barcodes", kind: "array", keyField: "id", cols: { sku: ["text", "sku"], barcode: ["text", "barcode"] } },
  catalog: { table: "pt_catalog", kind: "array", keyField: "sku", cols: { name: ["text", "name"] } },
  packagingOptions: { table: "pt_packaging_options", kind: "array", keyField: "id", cols: { sku: ["text", "sku"] } },
  packagingMaterials: { table: "pt_packaging_materials", kind: "array", keyField: "id", cols: { sku: ["text", "sku"], name: ["text", "name"] } },
  packagingPurchaseRequest: { table: "pt_packaging_purchase_request", kind: "array", keyField: "materialId", cols: {} },
  productImages: { table: "pt_product_images", kind: "object", cols: {} },
  productPackagingLinks: { table: "pt_product_packaging_links", kind: "object", cols: {} },
  dismissedInactiveNotices: { table: "pt_dismissed_inactive_notices", kind: "object", cols: {} },
};
const isCollection = (key) => Object.prototype.hasOwnProperty.call(SPECS, key);

function colValues(spec, data) {
  const out = {};
  for (const [col, [type, field]] of Object.entries(spec.cols || {})) {
    const v = isObj(data) ? data[field] : undefined;
    if (v === undefined || v === null || typeof v === "object") out[col] = null;
    else if (type === "bigint") out[col] = Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null;
    else out[col] = String(v);
  }
  return out;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined), kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

const rowsToValue = (spec, rows) => (spec.kind === "array" ? rows.map((r) => r.data) : Object.fromEntries(rows.map((r) => [r.id, r.data])));

// Значение раздела целиком (как раньше лежало одним куском)
async function readValue(t, name) {
  return rowsToValue(SPECS[name], await t.all(name));
}
// Только строки с указанными ключами — чтобы проверить права, не читая весь раздел
async function readSubset(t, name, ids) {
  if (!ids.length) return SPECS[name].kind === "array" ? [] : {};
  return rowsToValue(SPECS[name], await t.byIds(name, ids.map(String)));
}

function referencedIds(spec, ops) {
  if (ops.kind === "array") {
    const ids = new Set();
    for (const id of ops.remove || []) ids.add(String(id));
    for (const p of ops.patch || []) ids.add(String(p.id));
    for (const u of ops.upsert || []) ids.add(String(u.item[ops.keyField]));
    return [...ids];
  }
  if (ops.kind === "object") return [...new Set([...(ops.unset || []).map(String), ...Object.keys(ops.set || {})])];
  return [];
}

// Приводит значение к списку строк { id, data }: пропускает мусор, убирает повторы ключей
// (остаётся последний), возвращает ещё и отчёт — что пришлось поправить
function valueToRows(spec, value) {
  const report = { skipped: 0, duplicates: 0 };
  const map = new Map();
  if (spec.kind === "array") {
    if (!Array.isArray(value)) throw new PatchError("Некорректное значение раздела");
    for (const item of value) {
      const id = isObj(item) ? item[spec.keyField] : undefined;
      if (id === undefined || id === null || typeof id === "object") { report.skipped++; continue; }
      if (map.has(String(id))) { report.duplicates++; map.delete(String(id)); }
      map.set(String(id), item);
    }
  } else {
    if (!isObj(value)) throw new PatchError("Некорректное значение раздела");
    for (const [k, v] of Object.entries(value)) if (v !== undefined) map.set(k, v);
  }
  return { rows: [...map.entries()].map(([id, data]) => ({ id, data })), report };
}

// Привести таблицу к заданному значению целиком (замена раздела, восстановление из
// бэкапа, синхронизация с Ozon): меняются только те строки, которые реально отличаются
async function syncAll(t, name, value) {
  const spec = SPECS[name];
  const { rows: wanted, report } = valueToRows(spec, value);
  const current = new Map((await t.all(name)).map((r) => [r.id, r]));
  const wantedIds = new Set(wanted.map((r) => r.id));
  const toRemove = [...current.keys()].filter((id) => !wantedIds.has(id));
  if (toRemove.length) await t.remove(name, toRemove);
  const inserts = [];
  for (let i = 0; i < wanted.length; i++) {
    const w = wanted[i];
    const cur = current.get(w.id);
    if (!cur) inserts.push({ id: w.id, pos: i, data: w.data, cols: colValues(spec, w.data) });
    else {
      if (!deepEqual(cur.data, w.data)) await t.update(name, w.id, w.data, colValues(spec, w.data));
      if (cur.pos !== i) await t.setPos(name, w.id, i);
    }
  }
  if (inserts.length) await t.insertMany(name, inserts);
  return report;
}

// Применить точечные изменения (см. lib/patch.js) к строкам таблицы
async function applyOps(t, name, ops, rules) {
  const spec = SPECS[name];
  if (ops.kind === "replace") { await syncAll(t, name, ops.value); return; }
  if (ops.kind !== spec.kind) throw new PatchError("Формат данных не совпадает с сохранённым", 409);

  if (spec.kind === "object") {
    if ((ops.unset || []).length) await t.remove(name, ops.unset.map(String));
    const keys = Object.keys(ops.set || {});
    if (keys.length) {
      const existing = new Set((await t.byIds(name, keys)).map((r) => r.id));
      let { max } = await t.bounds(name);
      for (const k of keys) {
        if (existing.has(k)) await t.update(name, k, ops.set[k], colValues(spec, ops.set[k]));
        else { max = max === null ? 0 : max + 1; await t.insert(name, { id: k, pos: max, data: ops.set[k], cols: colValues(spec, ops.set[k]) }); }
      }
    }
    return;
  }

  const kf = spec.keyField;
  if (ops.keyField !== kf) throw new PatchError("Формат данных не совпадает с сохранённым", 409);
  if ((ops.remove || []).length) await t.remove(name, ops.remove.map(String));

  if ((ops.patch || []).length) {
    const rows = new Map((await t.byIds(name, ops.patch.map((p) => String(p.id)))).map((r) => [r.id, r]));
    for (const p of ops.patch) {
      const row = rows.get(String(p.id));
      if (!row) continue; // уже кем-то удалено
      const data = patchItem(row.data, p, kf, rules);
      row.data = data;
      await t.update(name, row.id, data, colValues(spec, data));
    }
  }

  if ((ops.upsert || []).length) {
    const ids = ops.upsert.map((u) => String(u.item[kf]));
    const existing = new Set((await t.byIds(name, ids)).map((r) => r.id));
    let { min, max } = await t.bounds(name);
    for (const u of ops.upsert) {
      const id = String(u.item[kf]);
      if (existing.has(id)) { await t.update(name, id, u.item, colValues(spec, u.item)); continue; }
      let pos = null;
      if (u.after !== undefined && u.after !== null) {
        const p = await t.posOf(name, String(u.after));
        if (p !== null) {
          const next = await t.nextPos(name, p);
          pos = next === null ? p + 1 : (p + next) / 2;
        }
      } else if (u.atStart) {
        pos = min === null ? 0 : min - 1;
      }
      if (pos === null) pos = max === null ? 0 : max + 1;
      await t.insert(name, { id, pos, data: u.item, cols: colValues(spec, u.item) });
      existing.add(id);
      min = min === null ? pos : Math.min(min, pos);
      max = max === null ? pos : Math.max(max, pos);
    }
  }
}

// ===================== Драйвер "в памяти / в файле" =====================
// Используется, когда PostgreSQL не подключён, и как эталон для проверки драйвера PostgreSQL.
function memoryDriver(filePath) {
  let state = { tables: {}, versions: {} };
  if (filePath && fs.existsSync(filePath)) {
    try { state = JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch (e) { /* начинаем с пустого */ }
  }
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const table = (name) => (state.tables[name] = state.tables[name] || {});
  const sorted = (name) => Object.values(table(name)).sort((a, b) => (a.pos - b.pos) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const matches = (row, f) => {
    for (const [c, v] of Object.entries(f.eq || {})) if ((row.cols[c] ?? null) !== (v === null ? null : String(v))) return false;
    for (const [c, list] of Object.entries(f.in || {})) if (!list.map(String).includes(row.cols[c])) return false;
    for (const [c, v] of Object.entries(f.gte || {})) if (row.cols[c] === null || row.cols[c] === undefined || !(row.cols[c] >= v)) return false;
    for (const [c, v] of Object.entries(f.lte || {})) if (row.cols[c] === null || row.cols[c] === undefined || !(row.cols[c] <= v)) return false;
    return true;
  };
  const out = (r) => ({ id: r.id, pos: r.pos, data: clone(r.data) });
  const session = {
    async all(name) { return sorted(name).map(out); },
    async byIds(name, ids) { const set = new Set(ids.map(String)); return sorted(name).filter((r) => set.has(r.id)).map(out); },
    async query(name, f = {}) {
      let rows = sorted(name).filter((r) => matches(r, f));
      if (f.orderBy && f.orderBy !== "pos") {
        const c = f.orderBy;
        rows.sort((a, b) => {
          const x = a.cols[c], y = b.cols[c];
          if (x === y) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
          if (x === null || x === undefined) return 1; // пустые — в конце, как NULLS LAST
          if (y === null || y === undefined) return -1;
          return x < y ? -1 : 1;
        });
      }
      if (f.desc) rows.reverse();
      if (f.desc && f.orderBy && f.orderBy !== "pos") {
        // при обратном порядке пустые тоже должны остаться в конце
        const empty = rows.filter((r) => r.cols[f.orderBy] === null || r.cols[f.orderBy] === undefined);
        rows = rows.filter((r) => !(r.cols[f.orderBy] === null || r.cols[f.orderBy] === undefined)).concat(empty);
      }
      const start = f.offset || 0;
      return rows.slice(start, f.limit ? start + f.limit : undefined).map(out);
    },
    async count(name, f = {}) { return sorted(name).filter((r) => matches(r, f)).length; },
    async insert(name, row) {
      if (table(name)[row.id]) throw new Error("duplicate id " + row.id);
      table(name)[row.id] = { id: String(row.id), pos: row.pos, data: clone(row.data), cols: { ...(row.cols || {}) } };
    },
    async insertMany(name, rows) { for (const r of rows) await session.insert(name, r); },
    async update(name, id, data, cols) { const r = table(name)[id]; if (r) { r.data = clone(data); r.cols = { ...(cols || {}) }; } },
    async setPos(name, id, pos) { const r = table(name)[id]; if (r) r.pos = pos; },
    async remove(name, ids) { for (const id of ids) delete table(name)[String(id)]; },
    async clear(name) { state.tables[name] = {}; },
    async bounds(name) { const rows = sorted(name); return rows.length ? { min: rows[0].pos, max: rows[rows.length - 1].pos } : { min: null, max: null }; },
    async posOf(name, id) { const r = table(name)[String(id)]; return r ? r.pos : null; },
    async nextPos(name, pos) { const r = sorted(name).find((x) => x.pos > pos); return r ? r.pos : null; },
    async bump(name) { state.versions[name] = (state.versions[name] || 0) + 1; },
    async version(name) { return String(state.versions[name] || 0); },
  };
  let chain = Promise.resolve();
  return {
    ...session,
    name: filePath ? "файл " + filePath : "память",
    async ensure() {},
    // транзакция: всё или ничего; транзакции выполняются строго по очереди
    tx(fn) {
      const run = async () => {
        const backup = JSON.stringify(state);
        try {
          const result = await fn(session);
          if (filePath) fs.writeFileSync(filePath, JSON.stringify(state));
          return result;
        } catch (e) {
          state = JSON.parse(backup);
          throw e;
        }
      };
      const p = chain.then(run, run);
      chain = p.catch(() => {});
      return p;
    },
  };
}

// ===================== Самопроверка драйвера =====================
// Одна и та же последовательность действий выполняется на проверяемом драйвере и на
// эталонном (в памяти); результаты должны совпасть до мелочей. Работает на отдельной
// служебной таблице, настоящие данные не трогает. Возвращает null, если всё хорошо,
// иначе текст с описанием расхождения.
const SELFCHECK = "__selfcheck";
SPECS[SELFCHECK] = { table: "pt_selfcheck", kind: "array", keyField: "id", cols: { employee_id: ["text", "employeeId"], entry_date: ["text", "date"], ts: ["bigint", "timestamp"] }, internal: true };
const SELFCHECK_OBJ = "__selfcheck_obj";
SPECS[SELFCHECK_OBJ] = { table: "pt_selfcheck_obj", kind: "object", cols: {}, internal: true };

async function selfCheck(driver) {
  const ref = memoryDriver(null);
  const rules = { deltaFields: ["stock"], unionFields: ["readBy"] };
  const item = (id, extra) => ({ id, employeeId: "u" + (id.length % 3), date: "2026-10-0" + ((id.charCodeAt(1) || 0) % 9 + 1), timestamp: 1000 + id.length * 7 + (id.charCodeAt(1) || 0), text: "Привет «" + id + "» \\ \" '", nested: { a: [1, 2, { b: null }] }, ...extra });
  const steps = [
    ["replace пустым", SELFCHECK, { kind: "replace", value: [] }],
    ["первые строки", SELFCHECK, { kind: "array", keyField: "id", upsert: [{ item: item("a1") }, { item: item("b22") }, { item: item("c333", { stock: 100, readBy: ["x"] }) }] }],
    ["вставка в начало и после", SELFCHECK, { kind: "array", keyField: "id", upsert: [{ item: item("z0"), atStart: true }, { item: item("m5"), after: "a1" }, { item: item("m6"), after: "m5" }, { item: item("tail") }] }],
    ["изменение полей", SELFCHECK, { kind: "array", keyField: "id", patch: [{ id: "c333", set: { stock: 90, readBy: ["y"], text: "новый" }, old: { stock: 100 } }, { id: "b22", set: { employeeId: "u9", date: "2026-11-01" }, unset: ["nested"] }, { id: "нет-такого", set: { a: 1 } }] }],
    ["повторная вставка существующего", SELFCHECK, { kind: "array", keyField: "id", upsert: [{ item: item("a1", { text: "заменён" }) }] }],
    ["удаление", SELFCHECK, { kind: "array", keyField: "id", remove: ["m5", "нет-такого"] }],
    ["замена целиком с перестановкой", SELFCHECK, { kind: "replace", value: [item("tail"), item("a1"), item("new1", { timestamp: null }), item("c333", { stock: 5 })] }],
    ["словарь: запись", SELFCHECK_OBJ, { kind: "object", set: { "1000": { main: "http://x", gallery: ["a", "b"] }, "A-5": "строка", n: 42 } }],
    ["словарь: изменение и удаление", SELFCHECK_OBJ, { kind: "object", set: { "1000": { main: "http://y", gallery: [] }, новый: { linkedIds: ["none"] } }, unset: ["n", "нет"] }],
    ["словарь: замена", SELFCHECK_OBJ, { kind: "replace", value: { k1: [1, 2], k2: { deep: { er: true } } } }],
  ];
  const queries = [
    {}, { eq: { employee_id: "u1" } }, { in: { employee_id: ["u0", "u9", "u2"] } }, { gte: { entry_date: "2026-10-03" }, lte: { entry_date: "2026-10-31" } },
    { orderBy: "ts", desc: true, limit: 2, offset: 1 }, { orderBy: "entry_date" }, { gte: { ts: 1100 }, orderBy: "ts" },
  ];
  try {
    await driver.ensure([SELFCHECK, SELFCHECK_OBJ]);
    await driver.tx(async (t) => { await t.clear(SELFCHECK); await t.clear(SELFCHECK_OBJ); });
    for (const [label, name, ops] of steps) {
      for (const d of [ref, driver]) await d.tx(async (t) => { await applyOps(t, name, ops, rules); await t.bump(name); });
      const [a, b] = [await readValue(ref, name), await readValue(driver, name)];
      if (!deepEqual(a, b)) return `шаг «${label}»: ожидалось ${JSON.stringify(a).slice(0, 300)}, получено ${JSON.stringify(b).slice(0, 300)}`;
      if (name === SELFCHECK) {
        for (const q of queries) {
          const [x, y] = [await ref.query(name, q), await driver.query(name, q)];
          if (!deepEqual(x.map((r) => r.data), y.map((r) => r.data))) return `шаг «${label}», выборка ${JSON.stringify(q)}: ожидалось ${JSON.stringify(x.map((r) => r.id))}, получено ${JSON.stringify(y.map((r) => r.id))}`;
          const [cx, cy] = [await ref.count(name, q), await driver.count(name, q)];
          if (cx !== cy) return `шаг «${label}», подсчёт ${JSON.stringify(q)}: ожидалось ${cx}, получено ${cy}`;
        }
        const [s1, s2] = [await readSubset(ref, name, ["a1", "tail", "нет"]), await readSubset(driver, name, ["a1", "tail", "нет"])];
        if (!deepEqual(s1, s2)) return `шаг «${label}»: выборка по ключам не совпала`;
      }
    }
    // транзакция должна откатываться целиком
    const before = await readValue(driver, SELFCHECK);
    try {
      await driver.tx(async (t) => { await t.remove(SELFCHECK, ["a1"]); throw new Error("проверка отката"); });
    } catch (e) { /* так и задумано */ }
    if (!deepEqual(before, await readValue(driver, SELFCHECK))) return "транзакция не откатилась после ошибки";
    const v1 = await driver.version(SELFCHECK);
    await driver.tx(async (t) => { await t.bump(SELFCHECK); });
    if ((await driver.version(SELFCHECK)) === v1) return "метка версии не меняется при записи";
    await driver.tx(async (t) => { await t.clear(SELFCHECK); await t.clear(SELFCHECK_OBJ); });
    return null;
  } catch (e) {
    return "ошибка при выполнении: " + e.message;
  }
}

module.exports = { SPECS, isCollection, readValue, readSubset, referencedIds, valueToRows, syncAll, applyOps, memoryDriver, selfCheck, deepEqual, colValues, rowsToValue };
