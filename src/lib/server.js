// Обмен данными с сервером: запросы, чтение и сохранение разделов.

// Запрос к серверу (вход, регистрация, действия администратора и т.п.).
// При ошибке бросает исключение с понятным текстом (e.message) — его можно показать пользователю.
export async function api(path, body, method) {
  try {
    return await window.storage.api(path, body, method);
  } catch (e) {
    if (!e || typeof e.status !== "number") {
      const err = new Error("Нет связи с сервером — проверьте интернет и попробуйте ещё раз");
      err.offline = true;
      throw err;
    }
    throw e;
  }
}

export async function safeGet(key, shared, fallback) {
  try {
    const res = await window.storage.get(key, shared);
    return res ? JSON.parse(res.value) : fallback;
  } catch (e) {
    return fallback;
  }
}

// Прямой запрос к серверу с обязательным служебным заголовком: без него сервер
// отклоняет всё, что что-то меняет (защита от запросов с чужих сайтов)
export const serverFetch = (path, options = {}) => fetch(path, {
  ...options,
  credentials: "same-origin",
  headers: { "X-Requested-With": "packer-tracker", ...(options.headers || {}) },
});

// Сохранение. Для общих данных (shared) передаётся ещё и base — значение, из которого
// получено новое: на сервер уходит только разница между ними, и сервер применяет её
// к актуальным данным (так одновременная работа нескольких человек не затирает чужое).
// Если сохранить не удалось — возвращает false и сообщает об этом приложению событием
// "packer-save-failed" (оно покажет предупреждение), detail.offline = true — нет связи.
export async function safeSet(key, value, shared, base) {
  try {
    if (shared) await window.storage.setShared(key, value, base);
    else await window.storage.set(key, JSON.stringify(value), false);
    return true;
  } catch (e) {
    console.error("storage set failed", key, e);
    const offline = !e || typeof e.status !== "number";
    safeSet.lastFailure = { key, offline, message: e && e.message };
    if (shared) {
      try { window.dispatchEvent(new CustomEvent("packer-save-failed", { detail: { key, offline, message: e && e.message, status: e && e.status } })); } catch (e2) {}
    }
    return false;
  }
}

// Точно ли на сервере нет такого значения (а не просто не удалось его прочитать)
export async function sharedKeyMissing(key) {
  try { await window.storage.get(key, true); return false; } catch (e) { return !!e && e.status === 404; }
}
