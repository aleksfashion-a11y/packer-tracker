// Пароли, секретные слова, сессии и защита от перебора.
//
// Раньше пароль проверялся прямо в браузере: приложение скачивало список всех
// сотрудников вместе с хешами паролей и сравнивало само. Теперь проверка — только
// на сервере, а хеши из сервера наружу не выходят вообще.

const crypto = require("crypto");

const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 дней без единого захода — сессия гаснет
const MIN_PASSWORD_LENGTH = 4;

function sha256hex(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function scrypt(plain, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(plain), salt, 32, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// Формат хранения: "scrypt$<соль base64>$<хеш base64>" — с индивидуальной солью,
// в отличие от прежнего "голого" SHA-256, который подбирается перебором за секунды.
async function hashSecret(plain) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(plain, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Старые учётные записи хранят SHA-256 (64 hex-символа) — они продолжают работать:
// при первом же успешном входе пароль перехешируется в новый формат (legacy: true).
async function verifySecret(stored, plain) {
  if (typeof stored !== "string" || !stored) return { ok: false };
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 3) return { ok: false };
    const salt = Buffer.from(parts[1], "base64");
    const expected = Buffer.from(parts[2], "base64");
    const actual = await scrypt(plain, salt);
    return { ok: expected.length === actual.length && crypto.timingSafeEqual(expected, actual), legacy: false };
  }
  if (/^[0-9a-f]{64}$/.test(stored)) {
    const actual = Buffer.from(sha256hex(plain), "hex");
    const expected = Buffer.from(stored, "hex");
    return { ok: crypto.timingSafeEqual(expected, actual), legacy: true };
  }
  return { ok: false };
}

function isValidHash(value) {
  return typeof value === "string" && (/^[0-9a-f]{64}$/.test(value) || /^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(value));
}

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function newId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) { try { out[k] = decodeURIComponent(v); } catch (e) { out[k] = v; } }
  }
  return out;
}

function parseDevice(ua) {
  ua = String(ua || "");
  let os = "Неизвестно", browser = "";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Chrome|CriOS/i.test(ua)) browser = "Chrome";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Safari/i.test(ua)) browser = "Safari";
  return browser ? `${os} · ${browser}` : os;
}

// Простая защита от перебора паролей/QR/секретных слов: считаем НЕУДАЧНЫЕ попытки
// по ключу (IP-адрес и логин) и на время блокируем, если их слишком много.
function makeRateLimiter({ max, windowMs }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, 60 * 1000);
  if (timer.unref) timer.unref();
  return {
    blocked(key) {
      const v = hits.get(key);
      return !!v && v.resetAt > Date.now() && v.count >= max;
    },
    fail(key) {
      const now = Date.now();
      const v = hits.get(key);
      if (!v || v.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
      else v.count++;
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = {
  SESSION_TTL_MS, MIN_PASSWORD_LENGTH,
  sha256hex, hashSecret, verifySecret, isValidHash, newToken, newId, parseCookies, parseDevice, makeRateLimiter,
};
