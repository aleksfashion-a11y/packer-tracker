// Общие мелкие функции и константы: упаковка, даты, тексты интерфейса.

// Специальное значение вместо id упаковки — "этому товару упаковка не нужна"
export const NO_PACKAGING = "none";
// Работа без упаковки — товар не кладут в пакет или коробку, а, например, проклеивают
// штрихкод или скрепляют степлером. В привязке товара вместо id упаковки тогда стоит
// "work:<id вида работы>": упаковка не списывается, а в записи видно, что делали с товаром.
export const WORK_PREFIX = "work:";
export const isWorkId = (id) => typeof id === "string" && id.startsWith(WORK_PREFIX);
export const isNoMaterialId = (id) => id === NO_PACKAGING || isWorkId(id);
export const DEFAULT_PACKAGING_WORKS = [{ id: "barcode", name: "Проклейка штрихкода" }, { id: "stapler", name: "Степлер" }, { id: "tape", name: "Замотка скотчем" }];
// Виды работ из настроек. Если список уже сохранён (админ его менял), стандартные виды, появившиеся
// в приложении позже («Замотка скотчем»), дописываются сами — кроме тех, что админ удалил
// (settings.packagingWorksHidden). То же правило — в server.js (выдача привязок для «Моего склада»).
const LATER_DEFAULT_WORKS = ["tape"];
export const resolvePackagingWorks = (settings) => {
  const hidden = Array.isArray(settings && settings.packagingWorksHidden) ? settings.packagingWorksHidden : [];
  const stored = Array.isArray(settings && settings.packagingWorks) ? settings.packagingWorks : null;
  if (!stored) return DEFAULT_PACKAGING_WORKS.filter((w) => !hidden.includes(w.id));
  const missing = DEFAULT_PACKAGING_WORKS.filter((w) => LATER_DEFAULT_WORKS.includes(w.id) && !hidden.includes(w.id)
    && !stored.some((s) => s.id === w.id || String(s.name).toLowerCase() === w.name.toLowerCase()));
  return [...stored, ...missing];
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Типы упаковочных материалов: стандартные + свои, которые добавляет администратор
// (settings.packagingTypesCustom). Артикул и название упаковки собираются автоматически из
// типа + размера, чтобы упаковщику/админу не приходилось придумывать и вбивать их самим.
export const DEFAULT_PACKAGING_TYPES = [
  { key: "bopp", label: "Бопп-пакет", prefix: "БП", defaultMultiplicity: 1000 },
  { key: "courier", label: "Курьерский пакет", prefix: "КП", defaultMultiplicity: 1000 },
  { key: "courier_clear", label: "Курьерский пакет прозрачный", prefix: "КПП", defaultMultiplicity: 1000 },
  { key: "bubble", label: "Пупырчатый пакет", prefix: "ПУП", defaultMultiplicity: 1000 },
  { key: "zip", label: "Зип-пакет", prefix: "ЗП", defaultMultiplicity: 1000 },
  { key: "box", label: "Коробка", prefix: "КОР", defaultMultiplicity: 100 },
];
// Действующий список. Один и тот же массив на всё приложение — applyPackagingTypes меняет его
// содержимое на месте, поэтому все экраны, которые его импортировали, сразу видят новые типы.
export const PACKAGING_TYPES = [...DEFAULT_PACKAGING_TYPES];
export const cleanCustomPackagingTypes = (list) => (Array.isArray(list) ? list : []).filter((t) => t && t.key && t.label && t.prefix
  && !DEFAULT_PACKAGING_TYPES.some((d) => d.key === t.key))
  .map((t) => ({ key: String(t.key), label: String(t.label), prefix: String(t.prefix), defaultMultiplicity: Math.max(1, parseInt(t.defaultMultiplicity) || 1), custom: true }));
export const applyPackagingTypes = (custom) => {
  PACKAGING_TYPES.splice(0, PACKAGING_TYPES.length, ...DEFAULT_PACKAGING_TYPES, ...cleanCustomPackagingTypes(custom));
};
// Буквы для артикула нового типа: «Зип-лок» → «ЗЛ», «Термопакет» → «ТЕР»; занято — добавляем цифру
export const suggestTypePrefix = (label) => {
  const words = String(label || "").trim().split(/[\s\-]+/).filter(Boolean);
  let p = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] || "").slice(0, 3);
  p = p.toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, "") || "УП";
  let res = p, n = 2;
  while (PACKAGING_TYPES.some((t) => t.prefix.toUpperCase() === res)) res = p + n++;
  return res;
};

export const packagingTypeLabel = (key) => (PACKAGING_TYPES.find((t) => t.key === key) || {}).label || key;

// На случай упаковок, созданных до появления кратности — берём кратность по умолчанию для её типа
export const getMultiplicity = (m) => m.multiplicity || packagingDefaultMultiplicity(m.type);

export const packagingDefaultMultiplicity = (key) => (PACKAGING_TYPES.find((t) => t.key === key) || {}).defaultMultiplicity || 1;

export const buildPackagingSkuName = (typeKey, size) => {
  const t = PACKAGING_TYPES.find((x) => x.key === typeKey);
  const sizeClean = size.trim().replace(/\s+/g, "");
  // "см" добавляется только в НАЗВАНИЕ (для удобства чтения — "Бопп-пакет 10х35 см"),
  // артикул остаётся без единиц измерения (БП10х35), как и раньше
  return { sku: `${t ? t.prefix : "УП"}${sizeClean}`, name: `${t ? t.label : "Упаковка"} ${size.trim()} см` };
};

// Округляет количество вверх до ближайшего кратного числа (например, нужно 250 при
// кратности 100 → закупить 300). Кратность 1 или меньше — округление не нужно.
export const roundUpToMultiple = (qty, multiplicity) => {
  const m = Math.max(1, Math.floor(multiplicity) || 1);
  return Math.ceil(qty / m) * m;
};

export const pad2 = (n) => String(n).padStart(2, "0");

export const localDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayStr = () => localDateStr(new Date());

export const defaultPayPeriod = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  let fy, fm, ty, tm;
  if (d >= 5) {
    fy = y; fm = m;
    if (m === 11) { ty = y + 1; tm = 0; } else { ty = y; tm = m + 1; }
  } else {
    ty = y; tm = m;
    if (m === 0) { fy = y - 1; fm = 11; } else { fy = y; fm = m - 1; }
  }
  return { from: `${fy}-${pad2(fm + 1)}-05`, to: `${ty}-${pad2(tm + 1)}-05` };
};

// Записи загружаются не за всё время, а начиная с этой даты: с первого числа месяца,
// предшествующего текущему расчётному периоду (этого хватает для всех экранов по
// умолчанию, включая сравнение "этот месяц против прошлого"). Более ранние подгружаются
// сами, когда в любом фильтре выбирают более раннюю дату, или кнопкой.
export const defaultEntriesFrom = () => {
  const d = new Date(defaultPayPeriod().from + "T00:00:00");
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return localDateStr(d);
};

export const shiftMonths = (dateStr, months) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return localDateStr(d);
};

export const shiftDays = (dateStr, days) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return localDateStr(d);
};

// Чат загружается за последние 30 дней (с начала суток — чтобы адрес запроса не менялся
// каждую секунду), более ранние сообщения — по кнопке
export const DAY_MS = 24 * 60 * 60 * 1000;

export const defaultChatFromTs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - 30 * DAY_MS;
};

export const PAGE_ROWS = 100;

 // сколько строк таблицы показывать за раз

export const defaultLast7Days = () => {
  const now = new Date();
  const to = localDateStr(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 6);
  const from = localDateStr(fromDate);
  return { from, to };
};

export const fmtDate = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
};

export const STR = {
  ru: {
    appTitle: "СКЛАДСКОЙ УЧЁТ", tabLogin: "Вход", tabQr: "По QR", tabRegister: "Я новый",
    login: "Логин", password: "Пароль", confirmPassword: "Повторите пароль", yourName: "Ваше имя",
    signIn: "Войти", signInQr: "Войти по QR", register: "Зарегистрироваться", logout: "Выйти",
    tabLog: "Учёт", tabHistory: "История", tabOverview: "Обзор", tabJournal: "Журнал",
    tabTimer: "Секундомер", tabEmployees: "Сотрудники", tabProducts: "Товары", tabSettings: "Настройки",
    searchProduct: "Название, артикул или штрихкод...", admin: "АДМИН",
  },
  uz: {
    appTitle: "OMBOR HISOBI", tabLogin: "Kirish", tabQr: "QR orqali", tabRegister: "Men yangiman",
    login: "Login", password: "Parol", confirmPassword: "Parolni takrorlang", yourName: "Ismingiz",
    signIn: "Kirish", signInQr: "QR orqali kirish", register: "Roʻyxatdan oʻtish", logout: "Chiqish",
    tabLog: "Hisob", tabHistory: "Tarix", tabOverview: "Umumiy", tabJournal: "Jurnal",
    tabTimer: "Sekundomer", tabEmployees: "Xodimlar", tabProducts: "Mahsulotlar", tabSettings: "Sozlamalar",
    searchProduct: "Nomi, artikul yoki shtrix-kod...", admin: "ADMIN",
  },
};

export const fmtDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh > 0 ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${pad2(mm)}:${pad2(ss)}`;
};

export const daysSince = (dateStr) => {
  const d1 = new Date(dateStr + "T00:00:00");
  const d2 = new Date(localDateStr(new Date()) + "T00:00:00");
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
};

export function proxiedImageUrl(url) {
  const bare = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(bare)}`;
}
