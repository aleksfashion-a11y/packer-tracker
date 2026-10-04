// Сравнение "было → стало" для значения хранилища: вычисляет минимальный набор
// изменений, который нужно отправить на сервер (применяются в lib/patch.js).
//
// base — то, что было в приложении ДО изменения (то, из чего получено next),
// next — новое значение. Сервер применит разницу к актуальным данным в базе, поэтому
// чужие изменения, о которых это устройство ещё не знает, не затираются.

export const KEY_FIELDS = ["id", "sku", "materialId"];
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Поле, по которому элементы списка отличаются друг от друга (есть у всех и не повторяется)
function keyFieldFor(arr, candidates) {
  if (!arr.every(isObj)) return null;
  for (const f of candidates) {
    const seen = new Set();
    let ok = true;
    for (const it of arr) {
      const v = it[f];
      if (v === undefined || v === null || typeof v === "object") { ok = false; break; }
      const s = String(v);
      if (seen.has(s)) { ok = false; break; }
      seen.add(s);
    }
    if (ok) return f;
  }
  return null;
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

// Возвращает null, если ничего не изменилось, иначе объект ops для сервера.
// base === undefined означает "на сервере такого значения ещё нет".
export function diffValues(base, next) {
  const replace = { kind: "replace", value: next };

  if (Array.isArray(next)) {
    if (base !== undefined && !Array.isArray(base)) return replace;
    const b = base || [];
    let kf;
    if (next.length > 0) {
      kf = keyFieldFor(next, KEY_FIELDS);
      if (!kf) return same(b, next) && base !== undefined ? null : replace;
      if (b.length > 0 && keyFieldFor(b, [kf]) !== kf) return replace;
    } else if (b.length > 0) {
      kf = keyFieldFor(b, KEY_FIELDS);
      if (!kf) return replace;
    } else {
      return base === undefined ? { kind: "array", keyField: "id", remove: [], patch: [], upsert: [] } : null;
    }

    const baseMap = new Map();
    b.forEach((it, i) => baseMap.set(String(it[kf]), { it, i }));
    const nextIds = new Set();
    for (const it of next) nextIds.add(String(it[kf]));

    const remove = [];
    for (const it of b) if (!nextIds.has(String(it[kf]))) remove.push(it[kf]);

    const upsert = [];
    const patch = [];
    let prevId = null;
    let lastBasePos = -1;
    // Позиция последнего "старого" элемента в новом списке: всё новое, что идёт после
    // него, — это добавление в конец. Для таких элементов место не указываем, сервер
    // просто допишет их в конец актуального списка (после того, что могли добавить другие).
    let lastCommonIdx = -1;
    for (let i = next.length - 1; i >= 0; i--) {
      if (baseMap.has(String(next[i][kf]))) { lastCommonIdx = i; break; }
    }
    for (let i = 0; i < next.length; i++) {
      const it = next[i];
      const id = String(it[kf]);
      const found = baseMap.get(id);
      if (!found) {
        const u = { item: it };
        if (i < lastCommonIdx) {
          if (prevId !== null) u.after = prevId;
          else u.atStart = true;
        }
        upsert.push(u);
      } else {
        // Порядок общих элементов должен совпадать — перестановку точечными
        // изменениями не выразить, тогда отправляем значение целиком
        if (found.i < lastBasePos) return replace;
        lastBasePos = found.i;
        const baseItem = found.it;
        if (baseItem !== it) {
          const set = {};
          const unset = [];
          const old = {};
          let changed = false;
          for (const f of Object.keys(it)) {
            if (f === kf || it[f] === undefined) continue;
            if (!same(it[f], baseItem[f])) {
              set[f] = it[f];
              changed = true;
              if (typeof it[f] === "number" && typeof baseItem[f] === "number") old[f] = baseItem[f];
            }
          }
          for (const f of Object.keys(baseItem)) {
            if (baseItem[f] !== undefined && (!(f in it) || it[f] === undefined)) { unset.push(f); changed = true; }
          }
          if (changed) {
            const p = { id: it[kf] };
            if (Object.keys(set).length) p.set = set;
            if (unset.length) p.unset = unset;
            if (Object.keys(old).length) p.old = old;
            patch.push(p);
          }
        }
      }
      prevId = id;
    }
    if (base !== undefined && !remove.length && !patch.length && !upsert.length) return null;
    return { kind: "array", keyField: kf, remove, patch, upsert };
  }

  if (isObj(next)) {
    if (base !== undefined && !isObj(base)) return replace;
    const b = base || {};
    const set = {};
    const unset = [];
    for (const k of Object.keys(next)) {
      if (next[k] === undefined) continue;
      if (!(k in b) || !same(b[k], next[k])) set[k] = next[k];
    }
    for (const k of Object.keys(b)) if (b[k] !== undefined && (!(k in next) || next[k] === undefined)) unset.push(k);
    if (base !== undefined && !Object.keys(set).length && !unset.length) return null;
    return { kind: "object", set, unset };
  }

  if (base !== undefined && same(base, next)) return null;
  return replace;
}
