import { diffValues } from "./kvdiff.js";

// Хранилище данных приложения (то, что App.jsx видит как window.storage):
//  - shared=true  → наш сервер (/api/kv/...), общие данные всех сотрудников
//  - shared=false → localStorage браузера (личные настройки этого устройства)
//
// Что здесь важно:
//  1. Запись общих данных идёт НЕ целиком, а только изменениями (setShared): сервер
//     применяет их к актуальному значению, поэтому одновременная работа нескольких
//     человек не затирает данные друг друга, а по сети уходят байты, а не мегабайты.
//  2. Чтение умеет "ничего не изменилось" (ответ 304): если на сервере та же версия,
//     что уже есть на устройстве, данные повторно не скачиваются.
//  3. Офлайн: каждое успешное чтение зеркалируется в localStorage; если сети нет —
//     возвращается последнее известное значение.

const LOCAL_PREFIX = "packer-kv:";
const MIRROR_PREFIX = "packer-kv-mirror:";

export function createStorage({ fetchFn, ls, onAuthExpired }) {
  const cache = new Map(); // key → { etag, result } — последнее, что отдал сервер

  // Сетевая ошибка (нет связи / сервер недоступен) — у неё нет числового .status.
  // Настоящий ответ сервера с ошибкой (403, 500...) — это не "нет связи", подменять
  // его старыми данными из кэша нельзя.
  const isNetworkError = (err) => !err || typeof err.status !== "number";

  async function request(path, options = {}) {
    const headers = { "X-Requested-With": "packer-tracker", ...(options.headers || {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetchFn(path, { ...options, headers, credentials: "same-origin" });
    if (res.status === 304) return res;
    if (!res.ok) {
      let message = "Ошибка " + res.status;
      try { const data = await res.json(); if (data && data.error) message = data.error; } catch (e) {}
      if (res.status === 401 && onAuthExpired) onAuthExpired();
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return res;
  }

  const mirrorSet = (key, result) => {
    try { ls.setItem(MIRROR_PREFIX + key, JSON.stringify(result)); } catch (e) { /* хранилище переполнено — не страшно */ }
  };

  return {
    async get(key, shared) {
      if (!shared) {
        const raw = ls.getItem(LOCAL_PREFIX + key);
        if (raw === null) throw new Error("not found");
        return { key, value: raw, shared: false };
      }
      const cached = cache.get(key);
      try {
        const res = await request(`/api/kv/${encodeURIComponent(key)}`, cached ? { headers: { "If-None-Match": cached.etag } } : {});
        if (res.status === 304 && cached) return { ...cached.result, notModified: true };
        const result = await res.json();
        const etag = res.headers.get("ETag");
        if (etag) cache.set(key, { etag, result }); else cache.delete(key);
        mirrorSet(key, result);
        return result;
      } catch (err) {
        if (isNetworkError(err)) {
          const mirrored = ls.getItem(MIRROR_PREFIX + key);
          if (mirrored !== null) return { ...JSON.parse(mirrored), offline: true };
        }
        throw err;
      }
    },

    // Запись общих данных изменениями. next — новое значение (объект/массив),
    // base — то значение, из которого оно получено (undefined — "на сервере ещё ничего нет").
    async setShared(key, next, base) {
      const ops = diffValues(base, next);
      if (ops === null) return { key, shared: true, unchanged: true };
      await request(`/api/kv/${encodeURIComponent(key)}/patch`, { method: "POST", body: JSON.stringify({ ops }) });
      cache.delete(key); // на сервере теперь новая версия — при следующем чтении скачаем её
      // Копию "на случай без связи" обновляем только для небольших разделов, которые
      // приложение читает целиком; записи и чат читаются выборками (см. getCached)
      if (key === "entries") mirrorSet("api:entries-window", { rows: next });
      else if (key === "chatMessages") mirrorSet("api:chat-window", { rows: next });
      else mirrorSet(key, { key, value: JSON.stringify(next), shared: true });
      return { key, shared: true };
    },

    async set(key, value, shared) {
      if (!shared) {
        ls.setItem(LOCAL_PREFIX + key, value);
        return { key, value, shared: false };
      }
      await request(`/api/kv/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify({ value }) });
      cache.delete(key);
      mirrorSet(key, { key, value, shared: true });
      return { key, value, shared: true };
    },

    async delete(key, shared) {
      if (!shared) {
        ls.removeItem(LOCAL_PREFIX + key);
        return { key, deleted: true, shared: false };
      }
      const res = await request(`/api/kv/${encodeURIComponent(key)}`, { method: "DELETE" });
      cache.delete(key);
      ls.removeItem(MIRROR_PREFIX + key);
      return res.json();
    },

    async list(prefix, shared) {
      if (!shared) {
        const keys = [];
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k && k.startsWith(LOCAL_PREFIX)) {
            const bare = k.slice(LOCAL_PREFIX.length);
            if (!prefix || bare.startsWith(prefix)) keys.push(bare);
          }
        }
        return { keys, prefix, shared: false };
      }
      const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
      const res = await request(`/api/kv${qs}`);
      return res.json();
    },

    // Чтение по адресу сервера с теми же удобствами, что и у get(): ответ "не изменилось"
    // (304) и запасная копия на устройстве на случай отсутствия связи.
    // mirrorKey — под каким именем хранить запасную копию (адрес может меняться, например
    // из-за даты в параметрах, а копия нужна одна).
    async getCached(path, mirrorKey) {
      const cacheKey = "api:" + path;
      const cached = cache.get(cacheKey);
      try {
        const res = await request(path, cached ? { headers: { "If-None-Match": cached.etag } } : {});
        if (res.status === 304 && cached) return { data: cached.result, notModified: true };
        const data = await res.json();
        const etag = res.headers.get("ETag");
        if (etag) cache.set(cacheKey, { etag, result: data }); else cache.delete(cacheKey);
        if (mirrorKey) mirrorSet("api:" + mirrorKey, data);
        return { data };
      } catch (err) {
        if (isNetworkError(err) && mirrorKey) {
          const mirrored = ls.getItem(MIRROR_PREFIX + "api:" + mirrorKey);
          if (mirrored !== null) return { data: JSON.parse(mirrored), offline: true };
        }
        throw err;
      }
    },

    // Запрос к остальным адресам сервера (вход, регистрация, Ozon и т.д.)
    async api(path, body, method) {
      const res = await request(path, { method: method || (body !== undefined ? "POST" : "GET"), body: body !== undefined ? JSON.stringify(body) : undefined });
      return res.json();
    },

    // Смена пользователя на этом устройстве (выход / вход под другим логином): то, что
    // было скачано для прежнего пользователя, новому показывать нельзя
    resetShared() {
      cache.clear();
      const toRemove = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(MIRROR_PREFIX)) toRemove.push(k);
      }
      for (const k of toRemove) ls.removeItem(k);
    },
  };
}
