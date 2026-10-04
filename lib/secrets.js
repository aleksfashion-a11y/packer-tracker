// Шифрование секретов, которые сервер должен уметь прочитать обратно
// (ключи Ozon, QR-коды входа), — чтобы в базе они не лежали открытым текстом.
//
// Ключ шифрования берётся из переменной окружения APP_SECRET. В базе его нет:
// тот, кто получил доступ только к базе (pgAdmin, утёкший пароль базы, файл снимка),
// эти секреты прочитать не сможет.
//
// Если APP_SECRET не задан — всё работает как раньше, без шифрования (в логах
// при старте будет предупреждение).

const crypto = require("crypto");

const RAW = process.env.APP_SECRET ? String(process.env.APP_SECRET) : "";
const enabled = RAW.length >= 16;
const key = enabled ? crypto.scryptSync(RAW, "packer-tracker-secrets-v1", 32) : null;
const PREFIX = "enc:v1:";

function encrypt(plain) {
  if (!enabled) throw new Error("APP_SECRET не задан");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), ct].map((b) => b.toString("base64")).join(":");
}

// Возвращает исходный текст или null, если расшифровать не удалось (другой APP_SECRET,
// повреждённое значение)
function decrypt(value) {
  if (!enabled || !isEncrypted(value)) return null;
  try {
    const [iv, tag, ct] = value.slice(PREFIX.length).split(":").map((x) => Buffer.from(x, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch (e) {
    return null;
  }
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

// "Отпечаток" значения для поиска (по QR-коду нужно найти сотрудника, не расшифровывая
// коды всех подряд). Зависит от APP_SECRET — по базе его не подобрать.
function lookupHash(value) {
  if (!enabled) throw new Error("APP_SECRET не задан");
  return crypto.createHmac("sha256", key).update(String(value), "utf8").digest("hex");
}

// ----- QR-код входа в записи сотрудника -----
// Без шифрования: поле qrToken (как раньше).
// С шифрованием: qrTokenEnc (зашифрованный код — чтобы админ мог показать QR) и
// qrTokenHash (отпечаток — чтобы найти сотрудника при входе по QR).
function withQrToken(user, token) {
  const out = { ...user };
  delete out.qrToken; delete out.qrTokenEnc; delete out.qrTokenHash;
  if (!token) return out;
  if (enabled) { out.qrTokenEnc = encrypt(token); out.qrTokenHash = lookupHash(token); }
  else out.qrToken = String(token);
  return out;
}
function readQrToken(user) {
  if (!user) return null;
  if (user.qrTokenEnc) return decrypt(user.qrTokenEnc);
  return user.qrToken || null;
}
function matchesQrToken(user, token) {
  if (!user || !token) return false;
  if (user.qrTokenHash) return enabled && safeEqual(user.qrTokenHash, lookupHash(token));
  return !!user.qrToken && safeEqual(user.qrToken, token);
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function needsQrMigration(user) {
  return enabled && !!user && typeof user.qrToken === "string" && !!user.qrToken;
}

module.exports = { enabled, encrypt, decrypt, isEncrypted, lookupHash, withQrToken, readQrToken, matchesQrToken, needsQrMigration };
