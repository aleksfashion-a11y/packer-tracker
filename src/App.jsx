// Ядро приложения: состояние, загрузка данных и все действия. Разметка разделов вынесена
// в папку screens/, общие функции — в lib/, мелкие элементы интерфейса — в ui/.

import * as XLSX from "xlsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PACKAGING_OPTIONS, SEED_CATALOG } from "./data/seed.js";
import { DAY_MS, NO_PACKAGING, PACKAGING_TYPES, PAGE_ROWS, STR, buildPackagingSkuName, defaultChatFromTs, defaultEntriesFrom, defaultLast7Days, defaultPayPeriod, fmtDate, fmtDuration, getMultiplicity, localDateStr, packagingDefaultMultiplicity, packagingTypeLabel, pad2, roundUpToMultiple, shiftDays, shiftMonths, todayStr, uid } from "./lib/helpers.js";
import { api, safeGet, safeSet, serverFetch, sharedKeyMissing } from "./lib/server.js";
import { playBeep, playVibrate } from "./lib/sound.js";
import { qrSvg } from "./qr.js";
import { AdminEmployees } from "./screens/admin-employees.jsx";
import { AdminJournal, AdminTimer } from "./screens/admin-journal.jsx";
import { AdminChat, AdminMessages } from "./screens/admin-messages.jsx";
import { AdminOverview } from "./screens/admin-overview.jsx";
import { AdminProducts } from "./screens/admin-products.jsx";
import { AdminSettings } from "./screens/admin-settings.jsx";
import { AdminStock } from "./screens/admin-stock.jsx";
import { LoginScreen, SetupScreen } from "./screens/auth.jsx";
import { EmployeeChat, EmployeeStock } from "./screens/employee-stock.jsx";
import { EmployeeHistory, EmployeeWork } from "./screens/employee-work.jsx";
import { ChatAttachModal, LightboxModal, PrintView } from "./screens/modals-common.jsx";
import { MaterialLinkModal, PackagingChoiceModal, ProductLinkModal, SupplyReconcileModal } from "./screens/modals-packaging.jsx";
import { FontLinks, GlobalStyle } from "./ui/styles.jsx";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStartYRef = useRef(null);
  const pullingRef = useRef(false);
  const lightboxTouchRef = useRef(null);
  const [theme, setTheme] = useState("dark");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lang, setLang] = useState("ru");
  const t = (key) => (STR[lang] && STR[lang][key]) || STR.ru[key] || key;
  const [users, setUsers] = useState([]);
  const [catalog, setCatalog] = useState(SEED_CATALOG);
  const [catalogEditSku, setCatalogEditSku] = useState(null);
  const [catalogEditSkuValue, setCatalogEditSkuValue] = useState("");
  const [catalogEditName, setCatalogEditName] = useState("");
  const [catalogEditBarcodes, setCatalogEditBarcodes] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductSku, setNewProductSku] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductBarcodes, setNewProductBarcodes] = useState("");
  const [newProductError, setNewProductError] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [ozonStatus, setOzonStatus] = useState(null); // { configured, clientIdHint, lastSync }
  const [ozonClientId, setOzonClientId] = useState("");
  const [ozonApiKey, setOzonApiKey] = useState("");
  const [ozonEditingCreds, setOzonEditingCreds] = useState(false);
  const [ozonSyncing, setOzonSyncing] = useState(false);
  // Состояние раздела "Остатки" (упаковочные материалы)
  const [stockSearch, setStockSearch] = useState("");
  const [stockSortMode, setStockSortMode] = useState("sku"); // "sku" | "name" | "size" | "stock"
  const [stockSortDir, setStockSortDir] = useState("asc"); // "asc" | "desc"
  const [stockSizeFilter, setStockSizeFilter] = useState("");
  const [stockAddingNew, setStockAddingNew] = useState(false);
  const [stockNewType, setStockNewType] = useState(PACKAGING_TYPES[0].key);
  const [stockNewSize, setStockNewSize] = useState("");
  const [stockNewStock, setStockNewStock] = useState("");
  const [stockEditId, setStockEditId] = useState(null);
  const [stockEditType, setStockEditType] = useState("");
  const [stockEditSize, setStockEditSize] = useState("");
  const [stockEditMultiplicity, setStockEditMultiplicity] = useState("");
  const [stockAddAmountFor, setStockAddAmountFor] = useState(null);
  const [stockAddAmountVal, setStockAddAmountVal] = useState("");
  const [ozonHistory, setOzonHistory] = useState([]);
  const [ozonUndoing, setOzonUndoing] = useState(null); // id отменяемой записи, либо null
  const [packagingOptions, setPackagingOptions] = useState([]);
  // Внимание: это ДРУГАЯ сущность, чем packagingOptions выше (это цены за упаковку
  // товара — "Вариант 1"/"Вариант 2"). packagingMaterials — это физические упаковочные
  // материалы (пакеты/коробки) с остатками на складе.
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  // Заявка на закупку упаковки — список позиций, ожидающих оформления
  const [packagingPurchaseRequest, setPackagingPurchaseRequest] = useState([]); // [{ materialId, qty }]
  const [purchaseAddFor, setPurchaseAddFor] = useState(null); // id материала, для которого сейчас вводим количество в заявку
  const [purchaseAddVal, setPurchaseAddVal] = useState("");
  // Сверка остатков с поставкой товаров: null, либо { step: "mapping"|"report", headers, dataRows, articleCol, qtyCol, productRows, materialSummary }
  const [supplyReconcile, setSupplyReconcile] = useState(null);
  // Какие материалы упаковки привязаны к какому товару (по артикулу товара), и какой
  // использовался последний раз — чтобы предлагать его по умолчанию при подтверждении
  const [productPackagingLinks, setProductPackagingLinks] = useState({});
  const [entries, setEntries] = useState([]);
  // С какой даты загружены записи (null — загружены все) и с какого момента — чат.
  // Ref-копии нужны функциям загрузки, которые вызываются из "старых" замыканий.
  const [entriesFrom, setEntriesFrom] = useState(() => defaultEntriesFrom());
  const entriesFromRef = useRef(entriesFrom);
  const [entriesLoadingMore, setEntriesLoadingMore] = useState(false);
  const [chatFromTs, setChatFromTs] = useState(() => defaultChatFromTs());
  const chatFromTsRef = useRef(chatFromTs);
  const [chatHasOlder, setChatHasOlder] = useState(false);
  const [logVisible, setLogVisible] = useState(PAGE_ROWS);
  const [histVisible, setHistVisible] = useState(PAGE_ROWS);
  const [currency, setCurrency] = useState("₽");
  const [showEmployeeTotals, setShowEmployeeTotals] = useState(true);
  const [showTimerTab, setShowTimerTab] = useState(true);
  const DEFAULT_ADMIN_TABS = { overview: true, log: true, employees: true, products: true, stock: true, messages: true, chat: true };
  const [enabledAdminTabs, setEnabledAdminTabs] = useState(DEFAULT_ADMIN_TABS);
  const DEFAULT_ADMIN_QUICK_REPLIES = ["Принято в работу", "Загрузите фото ошибки", "Уточните количество", "Смена подтверждена"];
  const [adminQuickReplies, setAdminQuickReplies] = useState(DEFAULT_ADMIN_QUICK_REPLIES);
  const DEFAULT_EMPLOYEE_QUICK_REPLIES = ["Опоздаю", "Где моя зарплата?", "Товара не хватает", "Ошибка в цене"];
  const [employeeQuickReplies, setEmployeeQuickReplies] = useState(DEFAULT_EMPLOYEE_QUICK_REPLIES);

  const [currentUser, setCurrentUser] = useState(null);
  const [serverHasAdmin, setServerHasAdmin] = useState(true); // есть ли уже администратор (сообщает сервер)
  const [registrationOpen, setRegistrationOpen] = useState(true); // разрешена ли самостоятельная регистрация
  const [authBusy, setAuthBusy] = useState(false);
  const [recoverName, setRecoverName] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [recoverStep, setRecoverStep] = useState("scan"); // "scan" | "newpass"
  const [recoverMethod, setRecoverMethod] = useState("qr"); // "qr" | "secret"
  const [recoverQrInput, setRecoverQrInput] = useState("");
  const [recoverUsername, setRecoverUsername] = useState("");
  const [recoverSecretWord, setRecoverSecretWord] = useState("");
  const [recoverUserId, setRecoverUserId] = useState(null);
  const [recoverPassword, setRecoverPassword] = useState("");
  const [recoverPassword2, setRecoverPassword2] = useState("");

  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [regName, setRegName] = useState("");
  const [regSecretWord, setRegSecretWord] = useState("");

  const [setupUsername, setSetupUsername] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupName, setSetupName] = useState("");

  const [tab, setTab] = useState("log");
  const [adminTab, setAdminTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState("all"); // all | name | barcode | sku
  const [qtyMap, setQtyMap] = useState({});
  const [hoursInput, setHoursInput] = useState("");
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState(null);
  const [timerAccumulated, setTimerAccumulated] = useState(0);
  const [timerTick, setTimerTick] = useState(0);
  const [timerQtyInput, setTimerQtyInput] = useState("");
  const [timerSessions, setTimerSessions] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [customBarcodes, setCustomBarcodes] = useState([]);
  const [productImages, setProductImages] = useState({});
  const [loginLog, setLoginLog] = useState([]);
  const [dismissedInactiveNotices, setDismissedInactiveNotices] = useState({}); // { [employeeId]: lastDate, который отклонили }
  const [messages, setMessages] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatActiveThread, setChatActiveThread] = useState("all"); // "all" | employeeUserId
  const [chatInput, setChatInput] = useState("");
  const [chatAttachOpen, setChatAttachOpen] = useState(false);
  const [chatAttachQuery, setChatAttachQuery] = useState("");
  const [chatMediaOpen, setChatMediaOpen] = useState(false);
  const [chatMediaUrl, setChatMediaUrl] = useState("");
  const [chatMediaType, setChatMediaType] = useState("image");
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }
  // Модалка выбора упаковки перед подтверждением количества: { product, opt, qty, selectedMaterialId, showAllPicker, showCreateForm, newType, newSize }
  const [packagingModal, setPackagingModal] = useState(null);
  // Привязка в обе стороны, вне обычного потока упаковки количества:
  // materialLinkModal — открыт со стороны упаковки: "к какому товару её прикрепить"
  // productLinkModal — открыт со стороны товара: "какую упаковку к нему прикрепить"
  const [materialLinkModal, setMaterialLinkModal] = useState(null); // { material, query }
  const [productLinkModal, setProductLinkModal] = useState(null); // { product, query }
  const askConfirm = (message, onConfirm) => setConfirmDialog({ message, onConfirm });
  const [showChatReadReceipts, setShowChatReadReceipts] = useState(true);
  const [chatRecording, setChatRecording] = useState(false);
  const [chatRecordSeconds, setChatRecordSeconds] = useState(0);
  const chatRecorderRef = useRef(null);
  const chatRecordChunksRef = useRef([]);
  const chatRecordTimerRef = useRef(null);
  const [hoursDate, setHoursDate] = useState(todayStr());
  const [packDate, setPackDate] = useState(todayStr());
  const [toast, setToast] = useState(null);

  const [priceEditOptionId, setPriceEditOptionId] = useState(null);
  const [priceEditVal, setPriceEditVal] = useState("");
  const [priceEditLabelVal, setPriceEditLabelVal] = useState("");
  const [addingOptionSku, setAddingOptionSku] = useState(null);
  const [imageEditSku, setImageEditSku] = useState(null);
  const [imageEditVal, setImageEditVal] = useState("");
  const [imageEditGalleryVal, setImageEditGalleryVal] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [newOptionPrice, setNewOptionPrice] = useState("");
  const [editRateId, setEditRateId] = useState(null);
  const [editRateVal, setEditRateVal] = useState("");
  const [resetPwId, setResetPwId] = useState(null);
  const [resetPwVal, setResetPwVal] = useState("");
  const [resetSecretId, setResetSecretId] = useState(null);
  const [resetSecretVal, setResetSecretVal] = useState("");
  const [showMySecretWord, setShowMySecretWord] = useState(false);
  const [mySecretWordVal, setMySecretWordVal] = useState("");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminName, setNewAdminName] = useState("");

  const [logEmployeeFilter, setLogEmployeeFilter] = useState("all");
  const [logTypeFilter, setLogTypeFilter] = useState("all");
  const [logSkuFilter, setLogSkuFilter] = useState("");
  const [logOptionFilter, setLogOptionFilter] = useState("all");
  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [showDeleted, setShowDeleted] = useState(false);
  const [timerFilterEmployee, setTimerFilterEmployee] = useState("all");
  const [headerQuery, setHeaderQuery] = useState("");
  const [headerFocused, setHeaderFocused] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [overviewDateFrom, setOverviewDateFrom] = useState(() => defaultPayPeriod().from);
  const [overviewDateTo, setOverviewDateTo] = useState(() => defaultPayPeriod().to);
  const [dailyChartFrom, setDailyChartFrom] = useState(() => defaultLast7Days().from);
  const [dailyChartTo, setDailyChartTo] = useState(() => defaultLast7Days().to);
  const [showChartDaily, setShowChartDaily] = useState(true);
  const [showChartEmployees, setShowChartEmployees] = useState(true);
  const [showChartTopProducts, setShowChartTopProducts] = useState(true);
  const [showChartComparison, setShowChartComparison] = useState(true);
  const [showChartHeatmap, setShowChartHeatmap] = useState(true);
  const [timerSortKey, setTimerSortKey] = useState("date");
  const [timerSortDir, setTimerSortDir] = useState("desc");
  const [scanMode, setScanMode] = useState(false);
  const [snapshotKeys, setSnapshotKeys] = useState([]);
  const [showQrForId, setShowQrForId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);
  const [showLoginLog, setShowLoginLog] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgTarget, setMsgTarget] = useState("all");
  const searchInputRef = useRef(null);

  // Записи за загруженный период. null — не удалось получить (ошибка сервера).
  const entriesPath = (from, to) => {
    const q = [];
    if (from) q.push("from=" + from);
    if (to) q.push("to=" + to);
    return "/api/entries" + (q.length ? "?" + q.join("&") : "");
  };
  const loadEntriesWindow = async () => {
    try {
      const r = await window.storage.getCached(entriesPath(entriesFromRef.current), "entries-window");
      return Array.isArray(r.data.rows) ? r.data.rows : null;
    } catch (e) { return null; }
  };
  const loadChatWindow = async () => {
    try {
      const r = await window.storage.getCached(`/api/chat?fromTs=${chatFromTsRef.current}`, "chat-window");
      if (!Array.isArray(r.data.rows)) return null;
      setChatHasOlder(!!r.data.hasOlder);
      return r.data.rows;
    } catch (e) { return null; }
  };
  // Догрузить более ранние записи: newFrom — новая начальная дата, null — все записи
  const extendEntriesWindow = async (newFrom) => {
    const cur = entriesFromRef.current;
    if (cur === null || (newFrom !== null && newFrom >= cur)) return;
    entriesFromRef.current = newFrom; // сразу, чтобы повторные вызовы не запускали вторую загрузку
    setEntriesLoadingMore(true);
    try {
      const data = await window.storage.api(entriesPath(newFrom, shiftDays(cur, -1)));
      const older = Array.isArray(data.rows) ? data.rows : [];
      setEntries((prev) => {
        const have = new Set(prev.map((e) => e.id));
        return [...older.filter((e) => !have.has(e.id)), ...prev];
      });
      setEntriesFrom(newFrom);
    } catch (e) {
      entriesFromRef.current = cur;
      setToast("Не удалось загрузить более ранние записи: " + (e.message || "нет связи"));
    }
    setEntriesLoadingMore(false);
  };
  const loadOlderChat = async () => {
    const prevTs = chatFromTsRef.current;
    const nextTs = Math.max(0, prevTs - 90 * DAY_MS);
    chatFromTsRef.current = nextTs;
    const rows = await loadChatWindow();
    if (rows === null) { chatFromTsRef.current = prevTs; setToast("Не удалось загрузить более ранние сообщения"); return; }
    setChatFromTs(nextTs);
    setChatMessages(rows);
  };
  // Строка "с какой даты загружены записи" + кнопки подгрузки (в журнале и в истории)
  const renderEntriesWindowNotice = () => (entriesFrom === null ? null : (
    <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span>Загружены записи с {new Date(entriesFrom + "T00:00:00").toLocaleDateString("ru-RU")}. Более ранние подгрузятся сами, если выбрать дату раньше, или кнопкой:</span>
      <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} disabled={entriesLoadingMore} onClick={() => extendEntriesWindow(shiftMonths(entriesFrom, -3))}>Ещё 3 месяца</button>
      <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} disabled={entriesLoadingMore} onClick={() => extendEntriesWindow(null)}>Все записи</button>
      {entriesLoadingMore && <span className="mono">загрузка…</span>}
    </div>
  ));

  // userHint — кто сейчас вошёл (передаётся сразу после входа, когда состояние
  // currentUser ещё не успело обновиться)
  const loadSharedData = async (userHint) => {
    const me = userHint || currentUser;
    // Разделы, которые сервер отдаёт только администратору, сотрудник даже не запрашивает
    const adminOnly = (key, fallback) => (me && me.role === "admin" ? safeGet(key, true, fallback) : Promise.resolve(fallback));
    // Все разделы запрашиваются одновременно, а не по очереди — приложение открывается быстрее
    const [u, catRaw, poRaw, ent, ts, ph, cb, pi, ll, din, msgs, chatMsgs, pm, ppr, ppl, settings] = await Promise.all([
      safeGet("users", true, []),
      safeGet("catalog", true, null),
      safeGet("packagingOptions", true, null),
      loadEntriesWindow().then((rows) => rows || []),
      safeGet("timerSessions", true, []),
      adminOnly("priceHistory", []),
      safeGet("customBarcodes", true, []),
      safeGet("productImages", true, {}),
      adminOnly("loginLog", []),
      adminOnly("dismissedInactiveNotices", {}),
      safeGet("messages", true, []),
      loadChatWindow().then((rows) => rows || []),
      safeGet("packagingMaterials", true, []),
      safeGet("packagingPurchaseRequest", true, []),
      safeGet("productPackagingLinks", true, {}),
      safeGet("settings", true, { currency: "₽", showEmployeeTotals: true }),
    ]);
    // Начальный каталог и цены записываются на сервер только в одном случае: сервер
    // точно ответил, что таких данных ещё нет (самый первый запуск), и вошёл администратор.
    // Если каталог просто не удалось прочитать (сбой связи/сервера) — НИЧЕГО не записываем:
    // раньше в такой ситуации настоящий каталог мог быть затёрт начальным.
    let cat = catRaw;
    if (cat === null) {
      if (await sharedKeyMissing("catalog")) {
        cat = SEED_CATALOG;
        if (me && me.role === "admin") await safeSet("catalog", cat, true, undefined);
      } else cat = [];
    }
    setCatalog(cat);
    let po = poRaw;
    if (po === null) {
      if (await sharedKeyMissing("packagingOptions")) {
        po = DEFAULT_PACKAGING_OPTIONS;
        if (me && me.role === "admin") await safeSet("packagingOptions", po, true, undefined);
      } else po = [];
    }
    setUsers(u);
    // currentUser — отдельный снимок пользователя, сохранённый при входе; если админ
    // поменял его данные (ставку, роль и т.п.), это не подтянется само собой без
    // явного пересинка при каждом обновлении данных (свайп/кнопка ↻)
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const fresh = u.find((x) => x.id === prev.id);
      return fresh || prev;
    });
    setPackagingOptions(po);
    setPackagingMaterials(pm);
    setPackagingPurchaseRequest(ppr);
    setProductPackagingLinks(ppl);
    setEntries(ent);
    setTimerSessions(ts);
    setCustomBarcodes(cb);
    setProductImages(pi);
    setLoginLog(ll);
    setDismissedInactiveNotices(din);
    setMessages(msgs);
    setChatMessages(chatMsgs);
    setPriceHistory(ph);
    setCurrency(settings.currency || "₽");
    setShowEmployeeTotals(settings.showEmployeeTotals !== false);
    setShowTimerTab(settings.showTimerTab !== false);
    setEnabledAdminTabs({ ...DEFAULT_ADMIN_TABS, ...(settings.enabledAdminTabs || {}) });
    setAdminQuickReplies(settings.adminQuickReplies || DEFAULT_ADMIN_QUICK_REPLIES);
    setEmployeeQuickReplies(settings.employeeQuickReplies || DEFAULT_EMPLOYEE_QUICK_REPLIES);
    setShowChatReadReceipts(settings.showChatReadReceipts !== false);
    setRegistrationOpen(settings.registrationOpen !== false);
    setShowChartDaily(settings.showChartDaily !== false);
    setShowChartEmployees(settings.showChartEmployees !== false);
    setShowChartTopProducts(settings.showChartTopProducts !== false);
    setShowChartComparison(settings.showChartComparison !== false);
    setShowChartHeatmap(settings.showChartHeatmap !== false);
    // При каждом обновлении данных (свайп/кнопка ↻) даты упаковки и часов сбрасываются
    // на сегодняшний день — чтобы разовое исправление задним числом не забылось висеть выбранным
    setPackDate(todayStr());
    setHoursDate(todayStr());
    return u;
  };

  const PULL_THRESHOLD = 60;
  const PULL_DEADZONE = 12; // не реагируем на первые ~12px — гасит дребезг от обычного "резинового" отскока iOS у верха страницы
  const pullRafRef = useRef(null);
  const pullLatestYRef = useRef(null);
  // ===== Обновление приложения =====
  // Интерфейс знает номер своей сборки (вшит при сборке на сервере). Раз в пару минут,
  // при возвращении в приложение и при каждом ручном обновлении он спрашивает у сервера
  // текущий номер: если на сервере уже другая сборка — вышла новая версия.
  const APP_BUILD = (typeof window !== "undefined" && window.__PT_BUILD__) || null;
  const APP_VERSION = (typeof window !== "undefined" && window.__PT_VERSION__) || "";
  const [updateInfo, setUpdateInfo] = useState(null); // { version, build } — есть новая версия
  const checkForUpdate = async () => {
    if (!APP_BUILD) return null;
    try {
      const v = await window.storage.api("/api/version");
      if (v && v.build && v.build !== APP_BUILD) { setUpdateInfo(v); return v; }
      setUpdateInfo(null);
    } catch (e) { /* нет связи — проверим в следующий раз */ }
    return null;
  };
  // Перейти на новую версию: сбрасываем сохранённую на устройстве оболочку приложения и
  // перезагружаем страницу. Данные и неотправленные офлайн-записи при этом сохраняются.
  const applyUpdate = async () => {
    setToast("Обновляем приложение…");
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
      if (window.caches) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
    } catch (e) { /* не получилось почистить — перезагрузка всё равно возьмёт новую версию с сервера */ }
    window.location.reload();
  };
  // Ручное обновление (свайп вниз или кнопка ↻): если вышла новая версия — переходим на
  // неё, иначе просто перечитываем данные
  const refreshEverything = async () => {
    if (await checkForUpdate()) { await applyUpdate(); return; }
    await loadSharedData();
    setToast("Обновлено");
  };
  useEffect(() => {
    const first = setTimeout(checkForUpdate, 5000);
    const timer = setInterval(checkForUpdate, 2 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") checkForUpdate(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", checkForUpdate);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", checkForUpdate); };
  }, []);

  const handlePullTouchStart = (e) => {
    if (refreshing) return;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollTop <= 0) {
      pullStartYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    } else {
      pullingRef.current = false;
    }
  };
  const handlePullTouchMove = (e) => {
    if (!pullingRef.current || pullStartYRef.current == null) return;
    // Палец во время touchmove может двигаться десятки раз в секунду — если пересчитывать
    // высоту индикатора на каждое такое событие, Safari/WebKit заметно "тормозит" на этом
    // (частый пересчёт раскладки). Поэтому обновляем состояние не чаще одного раза за кадр
    // отрисовки (requestAnimationFrame), а не на каждый чих touchmove.
    pullLatestYRef.current = e.touches[0].clientY;
    if (pullRafRef.current == null) {
      pullRafRef.current = requestAnimationFrame(() => {
        pullRafRef.current = null;
        if (!pullingRef.current || pullStartYRef.current == null || pullLatestYRef.current == null) return;
        const rawDelta = pullLatestYRef.current - pullStartYRef.current;
        const eased = Math.max(0, rawDelta - PULL_DEADZONE);
        setPullDistance((prev) => (eased === 0 && prev === 0 ? prev : Math.min(eased * 0.5, 90)));
      });
    }
  };
  const handlePullTouchEnd = async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    pullStartYRef.current = null;
    if (pullRafRef.current != null) { cancelAnimationFrame(pullRafRef.current); pullRafRef.current = null; }
    if (pullDistance > PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(56);
      await refreshEverything();
      setRefreshing(false);
    }
    setPullDistance(0);
  };

  useEffect(() => {
    (async () => {
      const savedTheme = await safeGet("theme", false, "dark");
      setTheme(savedTheme === "light" ? "light" : "dark");
      const savedSound = await safeGet("soundEnabled", false, true);
      setSoundEnabled(savedSound !== false);
      const savedLang = await safeGet("lang", false, "ru");
      setLang(savedLang === "uz" ? "uz" : "ru");

      // Кто вошёл на этом устройстве — решает сервер (по сессии), а не само приложение
      let authState = null;
      try { authState = await api("/api/auth/state"); } catch (e) { authState = null; }
      if (authState) {
        setServerHasAdmin(authState.hasAdmin !== false);
        setRegistrationOpen(authState.registrationOpen !== false);
        if (authState.user) {
          setCurrentUser(authState.user);
          await safeSet("session", authState.user.id, false);
          await loadSharedData(authState.user);
        } else {
          await safeSet("session", null, false);
          try { window.storage.resetShared(); } catch (e) {}
        }
      } else {
        // Сервер недоступен (нет интернета) — открываемся по последним сохранённым на
        // устройстве данным, как и раньше; записи уйдут на сервер, когда связь вернётся
        const sessionUserId = await safeGet("session", false, null);
        if (sessionUserId) {
          const u = await loadSharedData();
          const su = u.find((x) => x.id === sessionUserId);
          if (su) setCurrentUser(su);
        }
      }

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2200);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    if (!showTimerTab && adminTab === "timer") setAdminTab("overview");
  }, [showTimerTab, adminTab]);

  useEffect(() => {
    if (adminTab === "settings") { loadOzonStatus(); loadOzonHistory(); }
  }, [adminTab]);

  useEffect(() => {
    const toggleable = ["overview", "log", "employees", "products", "stock", "messages", "chat"];
    if (toggleable.includes(adminTab) && enabledAdminTabs[adminTab] === false) {
      const firstEnabled = toggleable.find((k) => enabledAdminTabs[k] !== false);
      setAdminTab(firstEnabled || "settings");
    }
  }, [enabledAdminTabs, adminTab]);

  useEffect(() => {
    // Если сотруднику как раз сейчас отключили доступ к "Остаткам", а он на ней уже
    // находится — перекидываем на "Журнал", чтобы не остаться на скрытой вкладке
    if (currentUser && currentUser.role === "employee" && tab === "stock" && currentUser.stockTabEnabled === false) {
      setTab("log");
    }
  }, [currentUser, tab]);

  useEffect(() => {
    if (!printData) return;
    const onAfterPrint = () => setPrintData(null);
    window.addEventListener("afterprint", onAfterPrint);
    const t = setTimeout(() => window.print(), 80);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", onAfterPrint); };
  }, [printData]);

  const printPayrollAll = () => {
    setPrintData({
      type: "all",
      periodFrom: overviewDateFrom, periodTo: overviewDateTo,
      rows: managerSummary,
    });
  };
  const printPayslipFor = (row) => {
    setPrintData({
      type: "single",
      periodFrom: overviewDateFrom, periodTo: overviewDateTo,
      row,
    });
  };
  const printCatalog = () => {
    const rows = catalog.map((p) => ({ product: p, opts: optionsForSku(p.sku) })).filter((r) => r.opts.length > 0);
    setPrintData({ type: "catalog", rows });
  };
  const printPurchaseRequest = () => {
    if (packagingPurchaseRequest.length === 0) { setToast("Заявка пуста"); return; }
    setPrintData({ type: "purchaseRequest", rows: packagingPurchaseRequest });
  };
  const exportCatalogToExcel = () => {
    const rows = [];
    catalog.forEach((p) => {
      const opts = optionsForSku(p.sku);
      if (opts.length === 0) {
        rows.push({ "Артикул": p.sku, "Название": p.name, "Вариант": "", "Цена упаковки, ₽": "" });
      } else {
        opts.forEach((o) => rows.push({ "Артикул": p.sku, "Название": p.name, "Вариант": o.label || "", "Цена упаковки, ₽": Math.round(o.price) }));
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Каталог");
    XLSX.writeFile(wb, `catalog_${todayStr()}.xlsx`);
  };

  const exportOzonSyncToExcel = (entry) => {
    const dateStr = new Date(entry.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const rows = [];
    (entry.addedItems || []).forEach((it) => {
      rows.push({
        "Тип изменения": "Добавлен",
        "Артикул": it.sku,
        "Название": it.name,
        "Штрихкоды": (it.barcodes || []).join(", "),
        "Было (название)": "",
        "Было (штрихкоды)": "",
      });
    });
    (entry.updatedItems || []).forEach((it) => {
      rows.push({
        "Тип изменения": "Обновлён",
        "Артикул": it.sku,
        "Название": it.newName,
        "Штрихкоды": (it.newBarcodes || []).join(", "),
        "Было (название)": it.previousName || "",
        "Было (штрихкоды)": (it.previousBarcodes || []).join(", "),
      });
    });
    if (rows.length === 0) {
      setToast("В этой синхронизации нечего выгружать — ничего не изменилось");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Изменения Ozon");
    XLSX.writeFile(wb, `ozon-sync_${dateStr.replace(/[.,: ]+/g, "-")}.xlsx`);
  };

  const downloadJson = (obj, filename) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportFullBackup = async () => {
    // Хеши паролей в обычных данных приложения больше не передаются — для резервной
    // копии запрашиваем их отдельно, чтобы после восстановления сотрудники могли войти
    let usersForBackup = users;
    try {
      const { secrets } = await api("/api/admin/user-secrets");
      usersForBackup = users.map((u) => {
        const sec = secrets[u.id] || {};
        const out = { ...u };
        if (sec.passwordHash) out.passwordHash = sec.passwordHash;
        if (sec.secretWordHash) out.secretWordHash = sec.secretWordHash; else delete out.secretWordHash;
        return out;
      });
    } catch (e) {
      setToast("Не удалось получить данные для бэкапа: " + e.message);
      return;
    }
    // В приложении загружена только часть записей и чата (за последнее время, чат — без
    // звука голосовых) — для бэкапа запрашиваем всё целиком
    let allEntries, fullChat;
    try {
      allEntries = (await api("/api/entries")).rows;
      try { fullChat = JSON.parse((await window.storage.get("chatMessages", true)).value); }
      catch (e) { if (e && e.status === 404) fullChat = []; else throw e; }
    } catch (e) {
      setToast("Не удалось получить данные для бэкапа: " + (e.message || "нет связи"));
      return;
    }
    const backup = {
      exportedAt: new Date().toISOString(),
      users: usersForBackup, packagingOptions, entries: allEntries, timerSessions, priceHistory, customBarcodes,
      catalog, productImages, packagingMaterials, productPackagingLinks, packagingPurchaseRequest, messages, chatMessages: fullChat,
      settings: { currency, showEmployeeTotals, showTimerTab, showChartDaily, showChartEmployees, showChartTopProducts, showChartComparison, showChartHeatmap, enabledAdminTabs, adminQuickReplies, employeeQuickReplies, showChatReadReceipts, registrationOpen },
    };
    downloadJson(backup, `backup_${todayStr()}.json`);
    setToast("Резервная копия скачана");
  };

  const replaceShared = async (key, value) => {
    try { await window.storage.set(key, JSON.stringify(value), true); }
    catch (e) { setToast(`Раздел «${key}» не восстановлен: ${e.message || "нет связи"}`); }
  };
  const importFullBackup = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.users || !Array.isArray(data.users)) throw new Error("bad shape");
        askConfirm("Восстановить данные из этого файла? Текущие данные (сотрудники, записи, цены) будут заменены.", async () => {
          await persistUsers(data.users || []);
          await persistPackagingOptions(data.packagingOptions || []);
          // Записи и чат заменяются на сервере целиком (в приложении загружена только их часть)
          await replaceShared("entries", data.entries || []);
          await persistTimerSessions(data.timerSessions || []);
          await persistPriceHistory(data.priceHistory || []);
          await persistCustomBarcodes(data.customBarcodes || []);
          // Эти разделы есть только в новых бэкапах — в старых файлах их нет, тогда не трогаем
          if (Array.isArray(data.catalog)) await persistCatalog(data.catalog);
          if (data.productImages) await persistProductImages(data.productImages);
          if (Array.isArray(data.packagingMaterials)) await persistPackagingMaterials(data.packagingMaterials);
          if (data.productPackagingLinks) await persistProductPackagingLinks(data.productPackagingLinks);
          if (Array.isArray(data.packagingPurchaseRequest)) await persistPackagingPurchaseRequest(data.packagingPurchaseRequest);
          if (Array.isArray(data.messages)) await persistMessages(data.messages);
          if (Array.isArray(data.chatMessages)) await replaceShared("chatMessages", data.chatMessages);
          if (data.settings) await persistSettings(data.settings);
          await loadSharedData();
          setToast("Данные восстановлены из бэкапа");
        });
      } catch (err) {
        setToast("Не удалось прочитать файл бэкапа");
      }
    };
    reader.readAsText(file);
  };

  const loadSnapshotsList = async () => {
    try {
      const res = await window.storage.list("snapshot:", true);
      const keys = (res && res.keys ? res.keys : []).sort().reverse();
      setSnapshotKeys(keys);
    } catch (e) { setSnapshotKeys([]); }
    setSnapshotsLoaded(true);
  };

  const downloadSnapshot = async (key) => {
    try {
      const res = await window.storage.get(key, true);
      if (!res) return;
      const data = JSON.parse(res.value);
      downloadJson(data, `${key.replace(":", "_")}.json`);
    } catch (e) { setToast("Не удалось скачать снэпшот"); }
  };

  const persistUsers = async (next) => { setUsers(next); await safeSet("users", next, true, users); };
  const toggleMyIncognito = async (checked) => {
    if (!currentUser) return;
    const next = users.map((u) => u.id === currentUser.id ? { ...u, chatIncognito: checked } : u);
    await persistUsers(next);
    setCurrentUser((cu) => ({ ...cu, chatIncognito: checked }));
  };
  const persistCatalog = async (next) => { setCatalog(next); await safeSet("catalog", next, true, catalog); };
  const addProduct = async () => {
    setNewProductError("");
    const skuVal = newProductSku.trim();
    if (!skuVal) { setNewProductError("Укажите артикул"); return; }
    if (!newProductName.trim()) { setNewProductError("Укажите название товара"); return; }
    if (catalog.some((p) => String(p.sku) === skuVal)) { setNewProductError("Товар с таким артикулом уже есть"); return; }
    const barcodes = newProductBarcodes.split("\n").map((b) => b.trim()).filter(Boolean);
    // Если артикул состоит только из цифр — храним как число (для обратной совместимости
    // со старым каталогом), иначе как текст (если в артикуле есть буквы)
    const sku = /^\d+$/.test(skuVal) ? parseInt(skuVal, 10) : skuVal;
    const next = [...catalog, { sku, name: newProductName.trim(), barcodes }];
    await persistCatalog(next);
    setToast("Товар добавлен");
    setAddingProduct(false);
    setNewProductSku(""); setNewProductName(""); setNewProductBarcodes("");
  };
  const saveProductEdit = async (sku) => {
    if (!catalogEditName.trim()) return;
    const newSkuRaw = catalogEditSkuValue.trim();
    if (!newSkuRaw) { setToast("Укажите артикул"); return; }
    const newSku = /^\d+$/.test(newSkuRaw) ? parseInt(newSkuRaw, 10) : newSkuRaw;
    const skuChanged = String(newSku) !== String(sku);
    if (skuChanged && catalog.some((p) => String(p.sku) !== String(sku) && String(p.sku) === String(newSku))) {
      setToast("Товар с таким артикулом уже есть");
      return;
    }
    const barcodes = catalogEditBarcodes.split("\n").map((b) => b.trim()).filter(Boolean);
    const next = catalog.map((p) => p.sku === sku ? { ...p, sku: newSku, name: catalogEditName.trim(), barcodes } : p);
    await persistCatalog(next);
    if (skuChanged) {
      // переносим варианты упаковки, доп. штрихкоды и фото на новый артикул
      await persistPackagingOptions(packagingOptions.map((o) => o.sku === sku ? { ...o, sku: newSku } : o));
      await persistCustomBarcodes(customBarcodes.map((cb) => cb.sku === sku ? { ...cb, sku: newSku } : cb));
      if (productImages[sku] !== undefined) {
        const nextImages = { ...productImages };
        nextImages[newSku] = nextImages[sku];
        delete nextImages[sku];
        await persistProductImages(nextImages);
      }
    }
    setCatalogEditSku(null);
    setToast("Товар обновлён");
  };
  const removeProduct = async (sku) => {
    askConfirm("Удалить товар из каталога? Это действие нельзя отменить.", async () => {
      await persistCatalog(catalog.filter((p) => p.sku !== sku));
      setToast("Товар удалён");
    });
  };
  // Синхронизация с Ozon — идёт через отдельные защищённые серверные эндпоинты
  // (не через общий window.storage/api/kv), поскольку там передаются секретные
  // ключи продавца. В песочнице-мокапе внутри чата этих эндпоинтов нет — запросы
  // просто тихо не сработают, ошибка не показывается пользователю зря.
  const loadOzonStatus = async () => {
    try {
      const res = await serverFetch("/api/ozon/status");
      if (!res.ok) return;
      setOzonStatus(await res.json());
    } catch (e) { /* мокап в чате или сеть недоступна — ничего страшного */ }
  };
  const loadOzonHistory = async () => {
    try {
      const res = await serverFetch("/api/ozon/history");
      if (!res.ok) return;
      const data = await res.json();
      setOzonHistory(data.history || []);
    } catch (e) { /* мокап в чате — не критично */ }
  };
  const undoOzonSync = (entry, isLatest) => {
    const warning = isLatest
      ? "Отменить эту синхронизацию с Ozon? Товары, которые она добавила, будут удалены, а изменённые — вернутся к прежнему виду."
      : "Отменить эту (не самую последнюю) синхронизацию? Если после неё были другие изменения тех же товаров — они не пострадают, но советуем сначала посмотреть Excel-отчёт этой записи, чтобы понимать, что именно откатится.";
    askConfirm(warning, async () => {
      setOzonUndoing(entry.id);
      try {
        const res = await serverFetch(`/api/ozon/undo/${entry.id}`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) { setToast(data.error || "Не удалось отменить"); setOzonUndoing(null); return; }
        await loadSharedData();
        await loadOzonStatus();
        await loadOzonHistory();
        setToast(`Отменено: удалено ${data.removedCount}, возвращено к прежнему виду ${data.restoredCount}`);
      } catch (e) {
        setToast("Нет связи с сервером — попробуйте ещё раз");
      }
      setOzonUndoing(null);
    });
  };
  const saveOzonCredentials = async () => {
    if (!ozonClientId.trim() || !ozonApiKey.trim()) { setToast("Укажите Client-Id и Api-Key"); return; }
    try {
      const res = await serverFetch("/api/ozon/credentials", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: ozonClientId.trim(), apiKey: ozonApiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setToast(data.error || "Не удалось сохранить"); return; }
      setToast("Ключи Ozon сохранены");
      setOzonEditingCreds(false); setOzonClientId(""); setOzonApiKey("");
      await loadOzonStatus();
    } catch (e) { setToast("Нет связи с сервером — попробуйте ещё раз"); }
  };
  const removeOzonCredentials = () => {
    askConfirm("Удалить сохранённые ключи Ozon? Синхронизация перестанет работать, пока не введёте их заново.", async () => {
      try {
        await serverFetch("/api/ozon/credentials", { method: "DELETE" });
        setToast("Ключи Ozon удалены");
        await loadOzonStatus();
      } catch (e) { setToast("Нет связи с сервером — попробуйте ещё раз"); }
    });
  };
  const syncOzonCatalog = async () => {
    setOzonSyncing(true);
    try {
      const res = await serverFetch("/api/ozon/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setToast(data.error || "Ошибка синхронизации"); setOzonSyncing(false); return; }
      await loadSharedData(); // подтягиваем обновлённый каталог и фото себе на экран
      setToast(`Ozon: добавлено ${data.added}, обновлено ${data.updated} из ${data.total}${data.photosUpdated ? `, фото обновлено: ${data.photosUpdated}` : ""}`);
      await loadOzonStatus();
      await loadOzonHistory();
    } catch (e) {
      setToast("Нет связи с сервером — попробуйте ещё раз");
    }
    setOzonSyncing(false);
  };
  const persistPackagingOptions = async (next) => { setPackagingOptions(next); await safeSet("packagingOptions", next, true, packagingOptions); };
  const persistPackagingMaterials = async (next) => { setPackagingMaterials(next); await safeSet("packagingMaterials", next, true, packagingMaterials); };
  const persistProductPackagingLinks = async (next) => { setProductPackagingLinks(next); await safeSet("productPackagingLinks", next, true, productPackagingLinks); };
  const persistPackagingPurchaseRequest = async (next) => { setPackagingPurchaseRequest(next); await safeSet("packagingPurchaseRequest", next, true, packagingPurchaseRequest); };

  // Добавляет позицию в заявку на закупку упаковки (если такая упаковка уже в заявке —
  // прибавляет к уже указанному количеству, а не создаёт вторую строку)
  const addToPurchaseRequest = async (materialId, qty) => {
    const n = Math.max(0, parseInt(qty) || 0);
    if (n <= 0) { setToast("Укажите положительное количество"); return; }
    const idx = packagingPurchaseRequest.findIndex((r) => r.materialId === materialId);
    const next = [...packagingPurchaseRequest];
    if (idx === -1) next.push({ materialId, qty: n });
    else next[idx] = { ...next[idx], qty: next[idx].qty + n };
    await persistPackagingPurchaseRequest(next);
    setToast(`Добавлено в заявку: ${n}`);
  };
  const removeFromPurchaseRequest = async (materialId) => {
    await persistPackagingPurchaseRequest(packagingPurchaseRequest.filter((r) => r.materialId !== materialId));
  };
  const updatePurchaseRequestQty = async (materialId, qty) => {
    const n = Math.max(0, parseInt(qty) || 0);
    await persistPackagingPurchaseRequest(packagingPurchaseRequest.map((r) => r.materialId === materialId ? { ...r, qty: n } : r).filter((r) => r.qty > 0));
  };
  // "Оформить заявку" — считаем, что упаковка приехала: добавляем количество из заявки
  // прямо в остаток каждой позиции, и очищаем саму заявку
  const fulfillPurchaseRequest = () => {
    if (packagingPurchaseRequest.length === 0) return;
    askConfirm(`Оформить заявку (${packagingPurchaseRequest.length} поз.) — добавить указанные количества к остаткам и очистить заявку?`, async () => {
      let next = [...packagingMaterials];
      for (const r of packagingPurchaseRequest) {
        next = next.map((m) => m.id === r.materialId ? { ...m, stock: m.stock + r.qty } : m);
      }
      await persistPackagingMaterials(next);
      await persistPackagingPurchaseRequest([]);
      setToast("Заявка оформлена, остатки пополнены");
    });
  };
  const exportPurchaseRequestToExcel = () => {
    const rows = packagingPurchaseRequest.map((r) => {
      const m = packagingMaterials.find((x) => x.id === r.materialId);
      return {
        "Артикул": m ? m.sku : "?",
        "Название": m ? m.name : "?",
        "Тип": m ? packagingTypeLabel(m.type) : "",
        "Размер": m ? m.size : "",
        "Текущий остаток": m ? m.stock : "",
        "Кратность": m ? getMultiplicity(m) : "",
        "Количество к заказу": r.qty,
      };
    });
    if (rows.length === 0) { setToast("Заявка пуста"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Заявка на упаковку");
    XLSX.writeFile(wb, `packaging-order_${todayStr()}.xlsx`);
  };

  // ===== Сверка остатков упаковки с новой поставкой товаров =====
  // Шаг 1: читаем файл, показываем найденные столбцы для сопоставления
  const startSupplyReconcile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        if (rows.length < 2) { setToast("Файл пустой или без данных"); return; }
        const headers = rows[0].map((h) => String(h || "").trim());
        const guessRole = (h) => {
          const s = h.toLowerCase();
          if (s.includes("артикул")) return "article";
          if (s.includes("количество") || s.includes("кол-во") || s.includes("кол.во")) return "qty";
          return "none";
        };
        const columnRoles = headers.map(guessRole);
        setSupplyReconcile({ step: "mapping", headers, dataRows: rows.slice(1), columnRoles });
      } catch (err) {
        setToast("Не удалось прочитать файл — проверьте формат");
      }
    };
    reader.readAsArrayBuffer(file);
  };
  // Шаг 2: посчитать, какой упаковки не хватит на эту поставку (по каждому товару и
  // итогово по каждой упаковке, с учётом кратности при заказе)
  const computeSupplyReconcile = () => {
    const { dataRows, columnRoles } = supplyReconcile;
    const articleCol = columnRoles.indexOf("article");
    const qtyCol = columnRoles.indexOf("qty");
    if (articleCol === -1 || qtyCol === -1) { setToast("Укажите, какой столбец — «Артикул», а какой — «Количество»"); return; }
    const productRows = [];
    const materialNeed = {}; // materialId -> суммарно нужно упаковки на эту поставку
    for (const row of dataRows) {
      const skuRaw = String(row[articleCol] || "").trim();
      if (!skuRaw) continue;
      const qty = parseInt(row[qtyCol]) || 0;
      if (qty <= 0) continue;
      const skuNorm = /^\d+$/.test(skuRaw) ? parseInt(skuRaw, 10) : skuRaw;
      const product = catalog.find((p) => String(p.sku) === String(skuNorm));
      const link = getPackagingLink(skuNorm);
      const materialId = link ? link.mainId : null;
      const material = materialId && materialId !== "none" ? packagingMaterials.find((m) => m.id === materialId) : null;
      if (material) materialNeed[material.id] = (materialNeed[material.id] || 0) + qty;
      productRows.push({
        sku: skuNorm,
        name: product ? product.name : "(не найден в каталоге)",
        qty,
        materialId: material ? material.id : null,
        materialName: material ? material.name : (materialId === "none" ? "без упаковки" : "упаковка не привязана"),
      });
    }
    const materialSummary = Object.entries(materialNeed).map(([materialId, needed]) => {
      const m = packagingMaterials.find((x) => x.id === materialId);
      const stock = m ? m.stock : 0;
      const shortage = Math.max(0, needed - stock);
      const orderQty = shortage > 0 ? roundUpToMultiple(shortage, m ? getMultiplicity(m) : 1) : 0;
      return { materialId, material: m, needed, stock, shortage, orderQty };
    });
    setSupplyReconcile({ step: "report", productRows, materialSummary, headers: supplyReconcile.headers, dataRows: supplyReconcile.dataRows, columnRoles: supplyReconcile.columnRoles });
  };
  // Пока открыт отчёт сверки, любое изменение привязок или остатков (привязали, сменили
  // основную, убрали, создали упаковку) сразу пересчитывает отчёт
  useEffect(() => {
    if (supplyReconcile && supplyReconcile.step === "report") computeSupplyReconcile();
  }, [productPackagingLinks, packagingMaterials]);
  // Шаг 3: из отчёта — сразу в заявку на закупку (с учётом кратности)
  const createPurchaseRequestFromReconcile = async () => {
    const toOrder = supplyReconcile.materialSummary.filter((s) => s.orderQty > 0);
    if (toOrder.length === 0) { setToast("Дефицита не обнаружено — заказывать нечего"); return; }
    // Считаем весь итоговый список локально и сохраняем ОДНИМ вызовом — если вызывать
    // addToPurchaseRequest по очереди в цикле, каждый вызов читает ещё не обновлённое
    // состояние заявки (React обновляет его не мгновенно), и реально сохраняется
    // только последняя позиция — остальные "теряются" (это и была причина бага).
    const next = [...packagingPurchaseRequest];
    for (const s of toOrder) {
      const idx = next.findIndex((r) => r.materialId === s.materialId);
      if (idx === -1) next.push({ materialId: s.materialId, qty: s.orderQty });
      else next[idx] = { ...next[idx], qty: next[idx].qty + s.orderQty };
    }
    await persistPackagingPurchaseRequest(next);
    setToast(`В заявку на закупку добавлено позиций: ${toOrder.length}`);
    setSupplyReconcile(null);
  };

  // Создаёт новый упаковочный материал (или возвращает уже существующий с таким же
  // артикулом, если такой уже есть — чтобы не плодить дубли при повторном создании
  // "того же" боп-пакета 35х40, например)
  const exportStockToExcel = () => {
    const rows = packagingMaterials.map((m) => ({
      "Артикул": m.sku,
      "Название": m.name,
      "Тип": packagingTypeLabel(m.type),
      "Размер": m.size,
      "Остаток": m.stock,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Остатки упаковки");
    XLSX.writeFile(wb, `packaging-stock_${todayStr()}.xlsx`);
  };

  // Импорт упаковок из Excel: артикул и название не читаются из файла (даже если они
  // там есть, например из ранее сделанного экспорта) — пересчитываются заново из
  // "Тип" + "Размер", чтобы не разъезжались с автогенерацией. "Остаток" из файла
  // ПОЛНОСТЬЮ ЗАМЕНЯЕТ текущий остаток (как обычный импорт — "вот актуальное
  // состояние", а не "добавить к тому что есть").
  const downloadStockImportTemplate = () => {
    const rows = [
      { "Тип": "Бопп-пакет", "Размер": "35х40", "Остаток": 100 },
      { "Тип": "Коробка", "Размер": "50х30х30", "Остаток": 20 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Шаблон");
    XLSX.writeFile(wb, "packaging-import-template.xlsx");
  };
  const importStockFromExcel = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
        let typeCol = -1, sizeCol = -1, stockCol = -1, headerRow = -1;
        for (let r = 0; r < Math.min(rows.length, 10); r++) {
          rows[r].forEach((cell, ci) => {
            const s = String(cell || "");
            if (s.includes("Тип") && typeCol === -1) { typeCol = ci; headerRow = r; }
            if (s.includes("Размер")) sizeCol = ci;
            if (s.includes("Остаток")) stockCol = ci;
          });
          if (typeCol !== -1 && sizeCol !== -1) break;
        }
        if (typeCol === -1 || sizeCol === -1 || headerRow === -1) {
          setToast("Не удалось распознать таблицу — нужны столбцы «Тип» и «Размер»");
          return;
        }
        let added = 0, updated = 0;
        const unknownTypes = [];
        const next = [...packagingMaterials];
        for (let r = headerRow + 1; r < rows.length; r++) {
          const row = rows[r];
          const typeLabelRaw = String(row[typeCol] || "").trim();
          const sizeRaw = String(row[sizeCol] || "").trim();
          if (!typeLabelRaw || !sizeRaw) continue;
          const typeMatch = PACKAGING_TYPES.find((t) => t.label.toLowerCase() === typeLabelRaw.toLowerCase());
          if (!typeMatch) { unknownTypes.push(typeLabelRaw); continue; }
          const stockRaw = stockCol !== -1 ? row[stockCol] : "";
          const stock = Math.max(0, parseInt(stockRaw) || 0);
          const { sku, name } = buildPackagingSkuName(typeMatch.key, sizeRaw);
          const idx = next.findIndex((m) => m.sku === sku);
          if (idx === -1) {
            next.push({ id: uid(), type: typeMatch.key, size: sizeRaw, sku, name, stock });
            added++;
          } else if (next[idx].stock !== stock) {
            next[idx] = { ...next[idx], stock };
            updated++;
          }
        }
        await persistPackagingMaterials(next);
        const unknownNote = unknownTypes.length > 0 ? ` Не распознан тип у ${unknownTypes.length} строк: ${Array.from(new Set(unknownTypes)).slice(0, 3).join(", ")}${unknownTypes.length > 3 ? "…" : ""}` : "";
        setToast(`Импорт остатков: добавлено ${added}, обновлено ${updated}.${unknownNote}`);
      } catch (err) {
        setToast("Не удалось прочитать файл — проверьте формат");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const createPackagingMaterial = async (typeKey, sizeRaw, initialStock) => {
    const size = sizeRaw.trim();
    if (!size) { setToast("Укажите размер упаковки"); return null; }
    const { sku, name } = buildPackagingSkuName(typeKey, size);
    const existing = packagingMaterials.find((m) => m.sku === sku);
    if (existing) {
      // Такая упаковка уже есть — если заодно указали начальный остаток, просто
      // пополняем существующую, а не создаём дубль
      const stockToAdd = Math.max(0, parseInt(initialStock) || 0);
      if (stockToAdd > 0) await addPackagingStock(existing.id, stockToAdd);
      return existing;
    }
    const stock = Math.max(0, parseInt(initialStock) || 0);
    const material = { id: uid(), type: typeKey, size, sku, name, stock, multiplicity: packagingDefaultMultiplicity(typeKey) };
    await persistPackagingMaterials([...packagingMaterials, material]);
    setToast(`Упаковка «${name}» создана${stock > 0 ? `, остаток: ${stock}` : ""}`);
    return material;
  };
  const addPackagingStock = async (materialId, amount) => {
    const n = Number(amount);
    if (!n || n <= 0) { setToast("Укажите положительное количество"); return; }
    const next = packagingMaterials.map((m) => m.id === materialId ? { ...m, stock: m.stock + n } : m);
    await persistPackagingMaterials(next);
    setToast(`Остаток пополнен на ${n}`);
  };
  const deductPackagingStock = async (materialId, amount) => {
    const next = packagingMaterials.map((m) => m.id === materialId ? { ...m, stock: Math.max(0, m.stock - amount) } : m);
    await persistPackagingMaterials(next);
  };
  const editPackagingMaterial = async (id, typeKey, sizeRaw, multiplicityRaw) => {
    const size = sizeRaw.trim();
    if (!size) { setToast("Укажите размер упаковки"); return; }
    const { sku, name } = buildPackagingSkuName(typeKey, size);
    if (packagingMaterials.some((m) => m.id !== id && m.sku === sku)) { setToast("Упаковка с таким артикулом уже есть"); return; }
    const multiplicity = Math.max(1, parseInt(multiplicityRaw) || 1);
    const next = packagingMaterials.map((m) => m.id === id ? { ...m, type: typeKey, size, sku, name, multiplicity } : m);
    await persistPackagingMaterials(next);
    setToast("Упаковка обновлена");
  };
  const removePackagingMaterial = async (id) => {
    const m = packagingMaterials.find((x) => x.id === id);
    askConfirm(`Удалить упаковку «${m ? m.name : "?"}»? Если она привязана к товарам, привязку тоже нужно будет настроить заново.`, async () => {
      await persistPackagingMaterials(packagingMaterials.filter((x) => x.id !== id));
      // убираем ссылки на удалённый материал из привязок к товарам
      const nextLinks = {};
      for (const [sku, link] of Object.entries(productPackagingLinks)) {
        const linkedIds = (link.linkedIds || []).filter((lid) => lid !== id);
        if (linkedIds.length === 0) continue; // у товара не осталось привязок — запись о привязке убираем совсем
        nextLinks[sku] = { linkedIds, lastUsedId: linkedIds.includes(link.lastUsedId) ? link.lastUsedId : linkedIds[0] };
      }
      await persistProductPackagingLinks(nextLinks);
      setToast("Упаковка удалена");
    });
  };
  // ===== Привязка упаковки к товарам =====
  // У товара может быть несколько привязанных упаковок, одна из них — ОСНОВНАЯ:
  // она предлагается по умолчанию при упаковке, списывается в быстрых сценариях
  // (сканер, «Недавно упаковано») и учитывается в сверке поставки.
  // В данных: { [артикул]: { linkedIds: [...], lastUsedId: <основная> } }.
  //
  // getPackagingLink — единственное место, где привязка читается: возвращает
  // { linkedIds, mainId } или null, если привязки нет (уже удалённые упаковки отбрасывает).
  const getPackagingLink = (sku) => {
    const raw = productPackagingLinks[String(sku)];
    if (!raw || !Array.isArray(raw.linkedIds)) return null;
    const linkedIds = raw.linkedIds.filter((id) => id === NO_PACKAGING || packagingMaterials.some((m) => m.id === id));
    if (linkedIds.length === 0) return null;
    return { linkedIds, mainId: linkedIds.includes(raw.lastUsedId) ? raw.lastUsedId : linkedIds[0] };
  };
  const packagingLabel = (id) => (id === NO_PACKAGING ? "без упаковки" : ((packagingMaterials.find((m) => m.id === id) || {}).name || "?"));
  const savePackagingLink = async (sku, linkedIds, mainId) => {
    const key = String(sku);
    const next = { ...productPackagingLinks };
    if (linkedIds.length === 0) delete next[key];
    else next[key] = { linkedIds, lastUsedId: linkedIds.includes(mainId) ? mainId : linkedIds[0] };
    await persistProductPackagingLinks(next);
  };
  // Привязать упаковку к товару. По умолчанию она становится основной; с makeMain: false —
  // добавляется как дополнительная (основной станет, только если других привязок ещё нет).
  const linkPackagingToProduct = async (sku, materialId, opts = {}) => {
    const cur = getPackagingLink(sku);
    const ids = cur ? cur.linkedIds : [];
    const linkedIds = ids.includes(materialId) ? ids : [...ids, materialId];
    const makeMain = opts.makeMain !== false || !cur;
    await savePackagingLink(sku, linkedIds, makeMain ? materialId : cur.mainId);
  };
  const unlinkPackagingFromProduct = async (sku, materialId) => {
    const cur = getPackagingLink(sku);
    if (!cur) return;
    await savePackagingLink(sku, cur.linkedIds.filter((id) => id !== materialId), cur.mainId);
  };
  const setMainPackaging = async (sku, materialId) => {
    const cur = getPackagingLink(sku);
    if (!cur || !cur.linkedIds.includes(materialId) || cur.mainId === materialId) return;
    await savePackagingLink(sku, cur.linkedIds, materialId);
  };
  const askUnlinkPackaging = (product, materialId) => {
    askConfirm(`Убрать «${packagingLabel(materialId)}» у товара «${product.name}»?`, async () => {
      await unlinkPackagingFromProduct(product.sku, materialId);
      setToast("Привязка убрана");
    });
  };
  // Обратная сторона: к каким товарам привязана каждая упаковка
  const productsByMaterial = useMemo(() => {
    const map = {};
    for (const p of catalog) {
      const link = getPackagingLink(p.sku);
      if (!link) continue;
      for (const id of link.linkedIds) {
        if (id === NO_PACKAGING) continue;
        (map[id] = map[id] || []).push({ product: p, isMain: link.mainId === id });
      }
    }
    return map;
  }, [catalog, productPackagingLinks, packagingMaterials]);

  // Единый вид "какая упаковка привязана к товару" — используется во всех разделах:
  // чипы привязанных упаковок (основная выделена, рядом остаток), крестик — убрать,
  // нажатие на неосновную — сделать основной, «Изменить» — окно со всеми действиями.
  const renderProductPackaging = (product) => {
    const link = getPackagingLink(product.sku);
    const open = () => setProductLinkModal({ product, query: "" });
    if (!link) {
      return (
        <div className="pack-row">
          <span className="pack-chip empty">📦 упаковка не привязана</span>
          <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} onClick={open}>Привязать</button>
        </div>
      );
    }
    const several = link.linkedIds.length > 1;
    return (
      <div className="pack-row">
        <span style={{ fontSize: 12 }}>📦</span>
        {link.linkedIds.map((id) => {
          const m = id === NO_PACKAGING ? null : packagingMaterials.find((x) => x.id === id);
          const isMain = id === link.mainId;
          return (
            <span key={id} className={"pack-chip" + (isMain ? " main" : "")}>
              <button className={"pack-chip-label" + (!isMain ? " clickable" : "")}
                title={isMain ? (several ? "Основная упаковка" : "") : "Нажмите, чтобы сделать основной"}
                onClick={!isMain ? async () => { await setMainPackaging(product.sku, id); setToast(`Основная упаковка: ${packagingLabel(id)}`); } : undefined}>
                {several && isMain ? "★ " : ""}{m ? m.name : "без упаковки"}
                {m && <span className="mono" style={{ fontSize: 11, color: m.stock > 0 ? "var(--muted-2)" : "var(--danger)" }}> · {m.stock} шт</span>}
              </button>
              <button className="pack-chip-x" title="Убрать привязку" onClick={() => askUnlinkPackaging(product, id)}>✕</button>
            </span>
          );
        })}
        <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} onClick={open}>Изменить</button>
      </div>
    );
  };

  // Перед тем как подтвердить количество упакованного товара, нужно указать/подтвердить
  // упаковку — если у товара ещё нет ни одной привязанной упаковки, выбор ОБЯЗАТЕЛЕН
  // (нельзя пропустить); если уже есть — по умолчанию предлагается последняя
  // использованная, но можно выбрать другую или создать новую прямо здесь же.
  const startPackagingFlow = (product, opt, qty) => {
    const link = getPackagingLink(product.sku);
    setPackagingModal({
      product, opt, qty,
      selectedMaterialId: link ? link.mainId : null,
      showAllPicker: false,
      showCreateForm: false,
      newType: PACKAGING_TYPES[0].key,
      newSize: "",
      newStock: "",
    });
  };
  const confirmPackagingSelection = () => {
    const { product, opt, qty, selectedMaterialId } = packagingModal;
    if (!selectedMaterialId) { setToast("Выберите упаковку, «Без упаковки» или создайте новую — без этого нельзя подтвердить количество"); return; }
    const noPackaging = selectedMaterialId === NO_PACKAGING;
    const material = noPackaging ? null : packagingMaterials.find((m) => m.id === selectedMaterialId);
    if (!noPackaging) {
      if (!material) { setToast("Эта упаковка больше не существует, выберите другую"); return; }
      if (material.stock < qty) {
        setToast(`Недостаточно остатка «${material.name}»: на складе ${material.stock}, а нужно ${qty}. Сначала пополните остаток.`);
        return;
      }
    }
    setPackagingModal(null);
    const label = opt.label ? ` (${opt.label})` : "";
    const packagingText = noPackaging ? "без упаковки" : `с упаковкой «${material.name}»`;
    askConfirm(`Добавить ${qty} × ${product.name}${label} ${packagingText}? Дата: ${fmtDate(packDate)}`, async () => {
      await addPieceEntry(product, qty, opt, selectedMaterialId);
      await linkPackagingToProduct(product.sku, selectedMaterialId);
      if (!noPackaging) await deductPackagingStock(selectedMaterialId, qty);
    });
  };

  const persistCustomBarcodes = async (next) => { setCustomBarcodes(next); await safeSet("customBarcodes", next, true, customBarcodes); };
  const persistProductImages = async (next) => { setProductImages(next); await safeSet("productImages", next, true, productImages); };
  const getProductImage = (sku) => {
    const v = productImages[sku];
    if (!v) return null;
    return typeof v === "string" ? { main: v, gallery: [] } : v;
  };
  const setProductImage = async (sku, mainUrl, galleryUrls) => {
    const next = { ...productImages };
    const main = (mainUrl || "").trim();
    const gallery = (galleryUrls || []).map((u) => u.trim()).filter(Boolean);
    if (main || gallery.length > 0) next[sku] = { main, gallery };
    else delete next[sku];
    await persistProductImages(next);
  };
  const importCatalogFromExcel = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const grouped = new Map(); // sku -> { name, barcodes: Set }
        const skippedRows = []; // строки без артикула — не попали в каталог вообще
        for (const sheetName of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
          let skuCol = -1, nameCol = -1, barcodeCol = -1, headerRow = -1;
          for (let r = 0; r < Math.min(rows.length, 10); r++) {
            const row = rows[r];
            row.forEach((cell, ci) => {
              const s = String(cell || "");
              if (s.includes("Артикул") && skuCol === -1) { skuCol = ci; headerRow = r; }
              if (s.includes("Название товара")) nameCol = ci;
              if (s === "Штрихкод" || (s.includes("Штрихкод") && !s.includes("уникальный") && barcodeCol === -1)) barcodeCol = ci;
            });
            if (skuCol !== -1 && nameCol !== -1 && barcodeCol !== -1) break;
          }
          if (skuCol === -1 || nameCol === -1 || headerRow === -1) continue;
          for (let r = headerRow + 1; r < rows.length; r++) {
            const row = rows[r];
            const skuRaw = String(row[skuCol] || "").trim();
            const name = String(row[nameCol] || "").trim();
            if (!skuRaw) {
              if (name || (barcodeCol !== -1 && row[barcodeCol])) skippedRows.push({ row: r + 1, name: name || "(без названия)" });
              continue;
            }
            const sku = /^\d+$/.test(skuRaw) ? parseInt(skuRaw, 10) : skuRaw;
            const barcode = barcodeCol !== -1 ? String(row[barcodeCol] || "").trim() : "";
            if (!grouped.has(sku)) grouped.set(sku, { name, barcodes: new Set() });
            const g = grouped.get(sku);
            if (name && !g.name) g.name = name;
            if (barcode) g.barcodes.add(barcode);
          }
        }
        if (grouped.size === 0) { setToast("Не удалось распознать таблицу — проверьте, что это тот же шаблон"); return; }
        let added = 0, updated = 0;
        const noBarcodeProducts = [];
        const next = [...catalog];
        for (const [sku, g] of grouped.entries()) {
          const newBarcodes = Array.from(g.barcodes);
          const idx = next.findIndex((p) => String(p.sku) === String(sku));
          if (idx === -1) {
            next.push({ sku, name: g.name || `Товар ${sku}`, barcodes: newBarcodes });
            added++;
          } else {
            const existing = next[idx];
            const mergedBarcodes = Array.from(new Set([...(existing.barcodes || []), ...newBarcodes]));
            const nameChanged = g.name && g.name !== existing.name;
            const barcodesChanged = mergedBarcodes.length !== (existing.barcodes || []).length;
            if (nameChanged || barcodesChanged) {
              next[idx] = { ...existing, name: nameChanged ? g.name : existing.name, barcodes: mergedBarcodes };
              updated++;
            }
          }
          if (newBarcodes.length === 0) noBarcodeProducts.push({ sku, name: g.name || `Товар ${sku}` });
        }
        await persistCatalog(next);
        setImportReport({ added, updated, skippedRows, noBarcodeProducts });
        setToast(`Добавлено новых товаров: ${added}, обновлено: ${updated}`);
      } catch (err) {
        setToast("Не удалось прочитать файл");
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const importImagesFromExcel = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        let matched = 0;
        const next = { ...productImages };
        for (const sheetName of wb.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
          let skuCol = -1, mainCol = -1, galleryCol = -1, headerRow = -1;
          for (let r = 0; r < Math.min(rows.length, 10); r++) {
            const row = rows[r];
            row.forEach((cell, ci) => {
              const s = String(cell || "");
              if (s.includes("Артикул") && skuCol === -1) { skuCol = ci; headerRow = r; }
              if (s.includes("главное фото")) mainCol = ci;
              if (s.includes("дополнительные фото")) galleryCol = ci;
            });
            if (skuCol !== -1 && mainCol !== -1) break;
          }
          if (skuCol === -1 || mainCol === -1 || headerRow === -1) continue;
          for (let r = headerRow + 1; r < rows.length; r++) {
            const row = rows[r];
            const skuRaw = String(row[skuCol] || "").trim();
            if (!skuRaw) continue;
            const sku = /^\d+$/.test(skuRaw) ? parseInt(skuRaw, 10) : skuRaw;
            if (!catalog.some((p) => String(p.sku) === String(sku))) continue;
            const main = String(row[mainCol] || "").trim();
            const galleryRaw = galleryCol !== -1 ? String(row[galleryCol] || "") : "";
            const gallery = galleryRaw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
            if (!main && gallery.length === 0) continue;
            next[sku] = { main, gallery };
            matched++;
          }
        }
        await persistProductImages(next);
        setToast(matched > 0 ? `Фото загружены для ${matched} товаров` : "Совпадений по артикулам не найдено");
      } catch (err) {
        setToast("Не удалось прочитать файл");
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const persistMessages = async (next) => { setMessages(next); await safeSet("messages", next, true, messages); };
  const sendMessage = async (text, toEmployeeId) => {
    if (!text.trim() || !currentUser) return;
    const msg = { id: uid(), from: currentUser.name, toEmployeeId: toEmployeeId || null, text: text.trim(), timestamp: Date.now(), readBy: [] };
    await persistMessages([...messages, msg]);
    setToast("Сообщение отправлено");
  };
  const markMessageRead = async (msgId) => {
    if (!currentUser) return;
    const next = messages.map((m) => m.id === msgId && !m.readBy.includes(currentUser.id) ? { ...m, readBy: [...m.readBy, currentUser.id] } : m);
    await persistMessages(next);
  };
  const deleteMessage = async (msgId) => {
    askConfirm("Удалить это объявление?", async () => {
      await persistMessages(messages.filter((m) => m.id !== msgId));
    });
  };
  const persistChatMessages = async (next) => { setChatMessages(next); await safeSet("chatMessages", next, true, chatMessages); };
  const sendChatMessage = async (threadId, text, attachedSku, media, audio) => {
    if (!text.trim() && !attachedSku && !media && !audio) return;
    if (!currentUser) return;
    const msg = { id: uid(), from: currentUser.id, threadId, text: text.trim(), attachedSku: attachedSku ?? null, media: media ?? null, audio: audio ?? null, timestamp: Date.now(), readBy: [currentUser.id] };
    await persistChatMessages([...chatMessages, msg]);
  };
  const markChatThreadRead = async (threadId) => {
    if (!currentUser) return;
    const next = chatMessages.map((m) => m.threadId === threadId && !m.readBy.includes(currentUser.id) ? { ...m, readBy: [...m.readBy, currentUser.id] } : m);
    if (JSON.stringify(next) !== JSON.stringify(chatMessages)) await persistChatMessages(next);
  };
  const deleteChatMessage = async (msgId, opts = {}) => {
    const msg = chatMessages.find((m) => m.id === msgId);
    const doDelete = async () => { await persistChatMessages(chatMessages.filter((m) => m.id !== msgId)); };
    if (!opts.skipConfirm && msg && currentUser && msg.from !== currentUser.id) {
      askConfirm("Удалить это сообщение? Оно не ваше.", doDelete);
      return;
    }
    await doDelete();
  };
  const MAX_VOICE_SECONDS = 60;
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Safari (iPhone) часто не поддерживает webm — берём лучший доступный формат,
      // а не наклеиваем один и тот же ярлык на всё подряд (иначе аудио запишется в одном
      // формате, а браузер попробует открыть его как другой — и не сможет проиграть)
      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"];
      const supportedType = preferredTypes.find((t) => typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(t));
      const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
      chatRecordChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chatRecordChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(chatRecordTimerRef.current);
        const actualType = recorder.mimeType || supportedType || "audio/webm";
        const blob = new Blob(chatRecordChunksRef.current, { type: actualType });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          sendChatMessage(chatActiveThread, "", null, null, { dataUrl, duration: chatRecordSeconds });
          setChatRecordSeconds(0);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      chatRecorderRef.current = recorder;
      setChatRecording(true);
      setChatRecordSeconds(0);
      chatRecordTimerRef.current = setInterval(() => {
        setChatRecordSeconds((s) => {
          if (s + 1 >= MAX_VOICE_SECONDS) { stopVoiceRecording(); return s; }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      setToast("Нет доступа к микрофону — разрешите доступ в браузере");
    }
  };
  const stopVoiceRecording = () => {
    if (chatRecorderRef.current && chatRecorderRef.current.state !== "inactive") {
      chatRecorderRef.current.stop();
    }
    setChatRecording(false);
  };
  const OFFLINE_QUEUE_KEY = "offlinePendingEntries";
  const loadOfflineQueue = () => {
    try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); } catch (e) { return []; }
  };
  const saveOfflineQueue = (q) => {
    try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  };
  const persistEntries = async (next, opts = {}) => {
    setEntries(next);
    const ok = await safeSet("entries", next, true, entries);
    // В офлайн-очередь кладём только если причина — отсутствие связи. Если сервер
    // запись отклонил (нет прав и т.п.), повторять её бесконечно бессмысленно.
    if (!ok && opts.newEntry && safeSet.lastFailure && safeSet.lastFailure.offline) {
      // Не удалось отправить на сервер (нет сети) — сама запись всё равно уже
      // видна локально (setEntries выше), а в очередь на досылку кладём именно
      // её, чтобы не потерять и отправить, как только связь вернётся
      const queue = loadOfflineQueue();
      queue.push(opts.newEntry);
      saveOfflineQueue(queue);
      setPendingSyncCount(queue.length);
    }
  };
  const syncOfflineQueue = async () => {
    const queue = loadOfflineQueue();
    if (queue.length === 0 || !navigator.onLine) return;
    try {
      // Отправляем только сами записи из очереди. Те, что сервер уже получил раньше
      // (связь оборвалась на ответе), он узнает по ключу и второй раз не добавит.
      await window.storage.api("/api/kv/entries/patch", { ops: { kind: "array", keyField: "id", remove: [], patch: [], upsert: queue.map((item) => ({ item })) } });
    } catch (e) {
      if (e && typeof e.status === "number" && e.status !== 401) {
        // Сервер отклонил эти записи — убираем их из очереди, иначе они будут
        // пытаться отправиться вечно
        saveOfflineQueue([]);
        setPendingSyncCount(0);
        setToast("Офлайн-записи не приняты сервером: " + e.message);
      }
      return; // нет связи — попробуем позже
    }
    saveOfflineQueue([]);
    setPendingSyncCount(0);
    const rows = await loadEntriesWindow();
    if (rows) setEntries(rows);
    setToast(`Отправлено офлайн-записей: ${queue.length}`);
  };

  // Следим за появлением/пропажей сети: обновляем баннер и пытаемся досослать
  // накопившуюся офлайн-очередь записей упаковки/часов при каждом восстановлении связи.
  // "Офлайн" показываем не мгновенно, а с небольшой задержкой — чтобы кратковременные
  // обрывы связи (слабый сигнал) не заставляли баннер мигать туда-обратно и дёргать интерфейс.
  useEffect(() => {
    setPendingSyncCount(loadOfflineQueue().length);
    let offlineTimer = null;
    const handleOnline = () => {
      if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => {
      if (offlineTimer) clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => setIsOnline(false), 2000);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const interval = setInterval(() => { if (navigator.onLine) syncOfflineQueue(); }, 20000);
    syncOfflineQueue();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (offlineTimer) clearTimeout(offlineTimer);
      clearInterval(interval);
    };
  }, []);
  const persistTimerSessions = async (next) => { setTimerSessions(next); await safeSet("timerSessions", next, true, timerSessions); };
  const persistPriceHistory = async (next) => { setPriceHistory(next); await safeSet("priceHistory", next, true, priceHistory); };
  const persistSettings = async (updates) => {
    const base = { currency, showEmployeeTotals, showTimerTab, showChartDaily, showChartEmployees, showChartTopProducts, showChartComparison, showChartHeatmap, enabledAdminTabs, adminQuickReplies, employeeQuickReplies, showChatReadReceipts, registrationOpen };
    const next = { ...base, ...updates };
    setCurrency(next.currency);
    setShowEmployeeTotals(next.showEmployeeTotals);
    setShowTimerTab(next.showTimerTab);
    setShowChartDaily(next.showChartDaily);
    setShowChartEmployees(next.showChartEmployees);
    setShowChartTopProducts(next.showChartTopProducts);
    setShowChartComparison(next.showChartComparison);
    setShowChartHeatmap(next.showChartHeatmap);
    setEnabledAdminTabs(next.enabledAdminTabs);
    setAdminQuickReplies(next.adminQuickReplies);
    setEmployeeQuickReplies(next.employeeQuickReplies);
    setShowChatReadReceipts(next.showChatReadReceipts);
    setRegistrationOpen(next.registrationOpen !== false);
    await safeSet("settings", next, true, base);
  };
  const toggleAdminTabEnabled = (key, checked) => {
    const next = { ...enabledAdminTabs, [key]: checked };
    persistSettings({ enabledAdminTabs: next });
  };
  const [newQuickReply, setNewQuickReply] = useState("");
  const addAdminQuickReply = () => {
    if (!newQuickReply.trim()) return;
    persistSettings({ adminQuickReplies: [...adminQuickReplies, newQuickReply.trim()] });
    setNewQuickReply("");
  };
  const removeAdminQuickReply = (idx) => {
    persistSettings({ adminQuickReplies: adminQuickReplies.filter((_, i) => i !== idx) });
  };
  const [newEmployeeQuickReply, setNewEmployeeQuickReply] = useState("");
  const addEmployeeQuickReply = () => {
    if (!newEmployeeQuickReply.trim()) return;
    persistSettings({ employeeQuickReplies: [...employeeQuickReplies, newEmployeeQuickReply.trim()] });
    setNewEmployeeQuickReply("");
  };
  const removeEmployeeQuickReply = (idx) => {
    persistSettings({ employeeQuickReplies: employeeQuickReplies.filter((_, i) => i !== idx) });
  };

  const money = (n) => `${Math.round(n).toLocaleString("ru-RU")} ${currency}`;
  const optionsForSku = (sku) => packagingOptions.filter((o) => String(o.sku) === String(sku));
  const priceOf = (sku) => {
    const opts = optionsForSku(sku);
    return opts.length > 0 ? opts[0].price : 0;
  };
  const barcodesForSku = useMemo(() => {
    const map = {};
    for (const p of catalog) map[p.sku] = [...p.barcodes];
    for (const cb of customBarcodes) {
      if (!map[cb.sku]) map[cb.sku] = [];
      if (!map[cb.sku].includes(cb.barcode)) map[cb.sku].push(cb.barcode);
    }
    return map;
  }, [catalog, customBarcodes]);
  const entryAmount = (e) => e.type === "piece" ? e.qty * e.unitPrice : e.hours * e.rate;

  // Общая часть после любого успешного входа: сервер уже завёл сессию, осталось
  // запомнить пользователя на устройстве и загрузить его данные
  const finishLogin = async (user) => {
    try { window.storage.resetShared(); } catch (e) {}
    setTab("log"); setAdminTab("overview");
    setCurrentUser(user);
    setServerHasAdmin(true);
    await safeSet("session", user.id, false);
    await loadSharedData(user);
  };
  // Запрос входа с защитой от двойного нажатия и показом ошибки сервера на экране входа
  const authCall = async (path, body) => {
    if (authBusy) return null;
    setAuthError("");
    setAuthBusy(true);
    try {
      return await api(path, body);
    } catch (e) {
      setAuthError(e.message || "Не удалось выполнить запрос");
      return null;
    } finally {
      setAuthBusy(false);
    }
  };

  const doSetupAdmin = async () => {
    setAuthError("");
    if (!setupUsername.trim() || !setupPassword || !setupName.trim()) {
      setAuthError("Заполните все поля");
      return;
    }
    const res = await authCall("/api/auth/setup", { name: setupName.trim(), username: setupUsername.trim().toLowerCase(), password: setupPassword });
    if (!res) return;
    await finishLogin(res.user);
    setSetupUsername(""); setSetupPassword(""); setSetupName("");
  };

  const doLogin = async () => {
    const res = await authCall("/api/auth/login", { username: loginUsername.trim().toLowerCase(), password: loginPassword });
    if (!res) return;
    await finishLogin(res.user);
    setLoginUsername(""); setLoginPassword("");
  };

  const doQrLogin = async (token) => {
    const code = token.trim();
    if (!code) return;
    const res = await authCall("/api/auth/qr", { token: code });
    if (!res) { setQrInput(""); return; }
    await finishLogin(res.user);
    setQrInput("");
  };

  // Данные, которыми подтверждается личность при восстановлении пароля (QR или логин + секретное слово)
  const recoverProof = () => recoverMethod === "qr"
    ? { method: "qr", token: recoverQrInput.trim() }
    : { method: "secret", username: recoverUsername.trim().toLowerCase(), secretWord: recoverSecretWord.trim().toLowerCase() };
  const doRecoverScan = async () => {
    if (!recoverQrInput.trim()) return;
    const res = await authCall("/api/auth/recover/check", { method: "qr", token: recoverQrInput.trim() });
    if (!res) { setRecoverQrInput(""); return; }
    setRecoverName(res.name || "");
    setRecoverStep("newpass");
  };
  const doRecoverBySecret = async () => {
    const uname = recoverUsername.trim().toLowerCase();
    const word = recoverSecretWord.trim().toLowerCase();
    if (!uname || !word) return;
    const res = await authCall("/api/auth/recover/check", { method: "secret", username: uname, secretWord: word });
    if (!res) return;
    setRecoverName(res.name || "");
    setRecoverStep("newpass");
  };
  const doRecoverSubmit = async () => {
    setAuthError("");
    if (!recoverPassword || recoverPassword.length < 4) { setAuthError("Пароль должен быть не короче 4 символов"); return; }
    if (recoverPassword !== recoverPassword2) { setAuthError("Пароли не совпадают"); return; }
    const res = await authCall("/api/auth/recover", { ...recoverProof(), newPassword: recoverPassword });
    if (!res) return;
    await finishLogin(res.user);
    setAuthMode("login");
    setRecoverStep("scan"); setRecoverQrInput(""); setRecoverUsername(""); setRecoverSecretWord(""); setRecoverName(""); setRecoverPassword(""); setRecoverPassword2("");
    setToast("Пароль изменён, вы вошли в систему");
  };

  const doRegister = async () => {
    setAuthError("");
    if (!regUsername.trim() || !regPassword || !regName.trim() || !regSecretWord.trim()) {
      setAuthError("Заполните все поля, включая секретное слово");
      return;
    }
    if (regPassword.length < 4) { setAuthError("Пароль должен быть не короче 4 символов"); return; }
    if (regPassword !== regPassword2) {
      setAuthError("Пароли не совпадают");
      return;
    }
    const res = await authCall("/api/auth/register", { name: regName.trim(), username: regUsername.trim().toLowerCase(), password: regPassword, secretWord: regSecretWord.trim().toLowerCase() });
    if (!res) return;
    await finishLogin(res.user);
    setRegUsername(""); setRegPassword(""); setRegPassword2(""); setRegName(""); setRegSecretWord("");
  };

  // Локальная часть выхода: забываем пользователя и всё, что было скачано для него на это устройство
  const forgetLocalSession = () => {
    setCurrentUser(null); setAuthMode("login"); setAuthError("");
    safeSet("session", null, false);
    try { window.storage.resetShared(); } catch (e) {}
  };
  const logout = async () => {
    try { await api("/api/auth/logout", {}); } catch (e) { /* нет связи — сессия на сервере погаснет сама, локально выходим в любом случае */ }
    forgetLocalSession();
  };
  // Сервер сообщил, что сессия больше не действует (истекла, сменили пароль, сотрудника удалили)
  const currentUserRef = useRef(null);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => {
    const onExpired = () => {
      if (!currentUserRef.current) return;
      currentUserRef.current = null;
      forgetLocalSession();
      setToast("Сессия завершена — войдите заново");
    };
    // Изменение не сохранилось на сервере — раньше это проходило молча, и казалось, что всё записано
    const onSaveFailed = (ev) => {
      const d = (ev && ev.detail) || {};
      if (d.status === 401) return; // про это скажет обработчик выше
      if (d.offline) { if (d.key !== "entries") setToast("Нет связи — изменение не сохранено на сервере"); return; }
      setToast("Не сохранено: " + (d.message || "ошибка сервера"));
    };
    window.addEventListener("packer-auth-expired", onExpired);
    window.addEventListener("packer-save-failed", onSaveFailed);
    return () => {
      window.removeEventListener("packer-auth-expired", onExpired);
      window.removeEventListener("packer-save-failed", onSaveFailed);
    };
  }, []);
  const toggleTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    await safeSet("theme", next, false);
  };
  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    await safeSet("soundEnabled", next, false);
  };
  const toggleLang = async () => {
    const next = lang === "ru" ? "uz" : "ru";
    setLang(next);
    await safeSet("lang", next, false);
  };

  const searchResults = useMemo(() => {
    const raw = search.trim();
    if (!raw) return [];
    const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);

    // Каждое слово запроса разбирается отдельно:
    // - чистые цифры ("25") — дополнительно ищутся как номер (начало/вхождение цифр),
    //   это полезно и для артикулов с буквами (например, "A1000" найдётся по "1000")
    // - любой текст, в т.ч. слитная связка буквы+цифры ("ozn25" или "A1000") — ищется как
    //   ЦЕЛАЯ подстрока (не разбивается на "буквы отдельно + цифры отдельно", иначе
    //   "ozn25" находило бы что угодно, где отдельно есть "ozn" и отдельно артикул на "25")
    const matchesNumericOrText = (tok, valueStr, isPureDigits) => {
      const lower = valueStr.toLowerCase();
      if (lower.startsWith(tok) || (tok.length >= 3 && lower.includes(tok))) return true;
      if (isPureDigits) {
        const digits = valueStr.replace(/\D/g, "");
        if (digits.startsWith(tok) || (tok.length >= 3 && digits.includes(tok))) return true;
      }
      return false;
    };
    const tokenMatches = (tok, p, barcodes) => {
      const tokDigits = tok.replace(/\D/g, "");
      const isPureDigits = tokDigits.length === tok.length && tok.length > 0;
      const nameLower = p.name.toLowerCase();
      const words = nameLower.split(/[\s,.\-]+/).filter(Boolean);
      const matchesNameField = words.some((w) => w.startsWith(tok)) || nameLower.includes(tok);

      if (searchMode === "name") return matchesNameField;

      if (searchMode === "sku") {
        return matchesNumericOrText(tok, String(p.sku), isPureDigits);
      }

      if (searchMode === "barcode") {
        return barcodes.some((b) => matchesNumericOrText(tok, b, isPureDigits));
      }

      // Режим "Везде": слово засчитывается, если совпало хоть в каком-то поле у этого товара
      if (matchesNameField) return true;
      if (matchesNumericOrText(tok, String(p.sku), isPureDigits)) return true;
      if (barcodes.some((b) => matchesNumericOrText(tok, b, isPureDigits))) return true;
      return false;
    };

    const results = catalog.filter((p) => {
      const barcodes = barcodesForSku[p.sku] || [];
      return tokens.every((tok) => tokenMatches(tok, p, barcodes));
    });

    return results.slice(0, 30);
  }, [search, searchMode, barcodesForSku, catalog]);

  // Похожие номера — только по запросу (кнопка "Показать похожие"), не автоматически,
  // чтобы точный поиск оставался предсказуемым. Только для штрихкодов/артикулов, не для названия.
  const [showFuzzy, setShowFuzzy] = useState(false);
  useEffect(() => { setShowFuzzy(false); }, [search, searchMode]);
  const fuzzyResults = useMemo(() => {
    const raw = search.trim();
    if (!raw || searchResults.length > 0 || searchMode === "name") return [];
    const qDigits = raw.replace(/\D/g, "");
    const isMostlyDigits = qDigits.length >= 3 && qDigits.length >= raw.replace(/\s/g, "").length * 0.6;
    if (!isMostlyDigits) return [];
    const minCommonLen = Math.max(4, Math.ceil(qDigits.length * 0.7));
    const scored = [];
    for (const p of catalog) {
      const barcodes = barcodesForSku[p.sku] || [];
      const candidates = barcodes.map((b) => b.replace(/\D/g, ""));
      let best = 0;
      for (const c of candidates) {
        const maxLen = Math.min(qDigits.length, c.length);
        for (let len = maxLen; len >= minCommonLen && len > best; len--) {
          for (let i = 0; i + len <= qDigits.length; i++) {
            if (c.includes(qDigits.slice(i, i + len))) { best = len; break; }
          }
        }
      }
      if (best >= minCommonLen) scored.push({ p, best });
    }
    scored.sort((a, b) => b.best - a.best);
    return scored.slice(0, 10).map((x) => x.p);
  }, [search, searchMode, searchResults, barcodesForSku, catalog]);


  const headerResults = useMemo(() => {
    const q = headerQuery.trim().toLowerCase();
    if (!q) return { employeeMatches: [], productMatches: [] };
    const bySku = q.replace(/\s/g, "");
    const employeeMatches = users.filter((u) => u.role === "employee" && u.name.toLowerCase().includes(q)).slice(0, 5);
    const productMatches = catalog.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (String(p.sku).includes(bySku)) return true;
      if ((barcodesForSku[p.sku] || []).some((b) => b.toLowerCase().includes(q))) return true;
      return false;
    }).slice(0, 5);
    return { employeeMatches, productMatches };
  }, [headerQuery, users, barcodesForSku]);

  const goToEmployeeInLog = (id) => {
    setAdminTab("log");
    setLogEmployeeFilter(id);
    setHeaderQuery("");
    setHeaderFocused(false);
  };
  const goToProductInSettings = (sku) => {
    setAdminTab("products");
    setSearch(String(sku));
    setHeaderQuery("");
    setHeaderFocused(false);
  };

  // packagingId — какой упаковкой упаковали (id упаковки или NO_PACKAGING); сохраняется в
  // записи вместе с названием, чтобы в истории и журнале было видно, даже если привязку потом поменяют
  const addPieceEntry = async (product, qty, option, packagingId) => {
    if (!currentUser || !qty || qty <= 0) return;
    const opt = option || optionsForSku(product.sku)[0] || { price: 0, label: "", id: null };
    const entry = {
      id: uid(), type: "piece", employeeId: currentUser.id,
      sku: product.sku, productName: product.name, unitPrice: opt.price, optionId: opt.id, optionLabel: opt.label || "", qty,
      date: packDate || todayStr(), timestamp: Date.now(),
    };
    if (packagingId) { entry.packagingId = packagingId; entry.packagingName = packagingLabel(packagingId); }
    if (soundEnabled) playBeep();
    playVibrate(40);
    await persistEntries([...entries, entry], { newEntry: entry });
    setToast(`+${qty} × ${product.name}${opt.label ? " (" + opt.label + ")" : ""}`);
  };

  // Обёртка для быстрых сценариев (сканер, "Недавно упаковано") — там нет пошагового
  // диалога, поэтому упаковку не спрашиваем каждый раз: если у товара уже есть
  // привязанная упаковка (пользователь хоть раз её подтверждал), список автоматически
  // спишется; если привязки ещё нет — просто пропускаем списание (не блокируем быстрый
  // сценарий), напоминаем про упаковку тостом, чтобы админ/упаковщик настроил её через
  // обычный ввод количества или через «Остатки»
  const addPieceEntryWithAutoPackaging = async (product, qty, option) => {
    const link = getPackagingLink(product.sku);
    await addPieceEntry(product, qty, option, link ? link.mainId : null);
    if (link && link.mainId !== NO_PACKAGING) {
      await deductPackagingStock(link.mainId, qty);
    } else if (!link) {
      setToast(`+${qty} × ${product.name} — упаковка для этого товара ещё не настроена, остаток не списан`);
    }
    // основная "без упаковки" — сознательный выбор "без упаковки", ничего списывать не нужно, и предупреждать незачем
  };

  useEffect(() => {
    if (!scanMode) return;
    const q = search.trim();
    if (!q) return;
    const match = catalog.find((p) => (barcodesForSku[p.sku] || []).includes(q));
    if (match) {
      addPieceEntryWithAutoPackaging(match, 1);
      setSearch("");
    }
  }, [search, scanMode, barcodesForSku]);

  const employees = users.filter((u) => u.role === "employee");
  // Каталог "по умолчанию" (без активного поиска) — отсортирован по артикулу или по
  // названию, в зависимости от выбора администратора (по умолчанию — по артикулу,
  // от меньшего к большему). localeCompare с numeric:true — это "естественная"
  // сортировка: "9" идёт раньше "10" (а не как при обычном текстовом сравнении, где
  // "10" оказался бы раньше "9"), а буквенные артикулы сортируются по алфавиту.
  const [catalogSortMode, setCatalogSortMode] = useState("sku"); // "sku" | "name"
  const sortedCatalog = useMemo(() => {
    return [...catalog].sort((a, b) => {
      if (catalogSortMode === "name") return a.name.localeCompare(b.name, "ru");
      return String(a.sku).localeCompare(String(b.sku), undefined, { numeric: true, sensitivity: "base" });
    });
  }, [catalog, catalogSortMode]);

  const filteredStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    const sizeQ = stockSizeFilter.trim().toLowerCase();
    let list = packagingMaterials.filter((m) => {
      if (sizeQ && !m.size.toLowerCase().includes(sizeQ)) return false;
      if (!q) return true;
      return m.sku.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.size.toLowerCase().includes(q);
    });
    const dirMult = stockSortDir === "desc" ? -1 : 1;
    list = [...list].sort((a, b) => {
      if (stockSortMode === "name") return a.name.localeCompare(b.name, "ru") * dirMult;
      if (stockSortMode === "size") return a.size.localeCompare(b.size, undefined, { numeric: true }) * dirMult;
      if (stockSortMode === "stock") return (a.stock - b.stock) * dirMult;
      return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: "base" }) * dirMult;
    });
    return list;
  }, [packagingMaterials, stockSearch, stockSizeFilter, stockSortMode, stockSortDir]);
  // Клик по уже активной кнопке сортировки — меняет направление; по другой — переключает
  // режим сортировки и сбрасывает направление на "по возрастанию"
  const toggleStockSort = (mode) => {
    if (stockSortMode === mode) setStockSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setStockSortMode(mode); setStockSortDir("asc"); }
  };

  // Поиск товара для привязки со стороны упаковки ("прикрепить эту упаковку к товару")
  const materialLinkResults = useMemo(() => {
    if (!materialLinkModal) return [];
    const q = materialLinkModal.query.trim().toLowerCase();
    if (!q) return sortedCatalog.slice(0, 20);
    return catalog.filter((p) => p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q)).slice(0, 20);
  }, [materialLinkModal, catalog, sortedCatalog]);
  // Окно остаётся открытым — можно привязать упаковку сразу к нескольким товарам
  const linkMaterialToProductConfirm = async (sku, productName) => {
    await linkPackagingToProduct(sku, materialLinkModal.material.id, { makeMain: false });
    setToast(`Упаковка «${materialLinkModal.material.name}» привязана к товару «${productName}»`);
  };

  // Поиск упаковки для привязки со стороны товара ("прикрепить к этому товару упаковку")
  const productLinkResults = useMemo(() => {
    if (!productLinkModal) return [];
    const q = productLinkModal.query.trim().toLowerCase();
    if (!q) return packagingMaterials.slice(0, 40);
    return packagingMaterials.filter((m) => m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q)).slice(0, 40);
  }, [productLinkModal, packagingMaterials]);
  // Упаковку, созданную прямо в окне, привязываем отдельным шагом — когда она уже
  // появилась в списке упаковок (иначе привязка к ещё "несуществующей" упаковке отбросится)
  useEffect(() => {
    if (!productLinkModal || !productLinkModal.pendingLinkId) return;
    if (!packagingMaterials.some((m) => m.id === productLinkModal.pendingLinkId)) return;
    const { pendingLinkId, pendingLinkName } = productLinkModal;
    setProductLinkModal((prev) => (prev ? { ...prev, pendingLinkId: null, pendingLinkName: null } : prev));
    linkProductToMaterialConfirm(pendingLinkId, pendingLinkName);
  }, [productLinkModal, packagingMaterials]);
  // Окно остаётся открытым — в нём сразу видно результат и можно продолжить настройку
  const linkProductToMaterialConfirm = async (materialId, materialName) => {
    const product = productLinkModal.product;
    await linkPackagingToProduct(product.sku, materialId, { makeMain: false });
    setProductLinkModal((prev) => (prev ? { ...prev, query: "", showCreateForm: false } : prev));
    setToast(`К товару «${product.name}» привязано: ${materialName}`);
  };

  // Опрос новых сообщений чата раз в несколько секунд (в мокапе нет постоянного соединения,
  // поэтому вместо мгновенной доставки — периодическая проверка). Если пришло новое сообщение
  // не от самого пользователя, и он сейчас не смотрит именно на этот тред — показываем тост + звук.
  const chatViewRef = useRef({ onChatTab: false, activeThread: null });
  useEffect(() => {
    chatViewRef.current = {
      onChatTab: currentUser && currentUser.role === "admin" ? adminTab === "chat" : tab === "chat",
      activeThread: chatActiveThread,
    };
  });
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(async () => {
      // Сервер отвечает "ничего не изменилось", если новых сообщений нет, — тогда сам чат
      // не скачивается и не разбирается. Если связи нет — просто пропускаем этот раз.
      let res;
      try { res = await window.storage.getCached(`/api/chat?fromTs=${chatFromTsRef.current}`, "chat-window"); } catch (e) { return; }
      if (!res || res.notModified || res.offline) return;
      const fresh = res.data && res.data.rows;
      if (!Array.isArray(fresh)) return;
      setChatHasOlder(!!res.data.hasOlder);
      setChatMessages((prev) => {
        // Звук голосовых в списке не приходит — для уже известных сообщений сохраняем тот, что есть на устройстве
        const knownAudio = new Map(prev.filter((m) => m.audio && m.audio.dataUrl).map((m) => [m.id, m.audio]));
        const next = fresh.map((m) => (m.audio && m.audio.lazy && knownAudio.has(m.id) ? { ...m, audio: knownAudio.get(m.id) } : m));
        // Ничего не изменилось с прошлой проверки — не трогаем состояние вообще,
        // иначе React будет перерисовывать часть интерфейса каждые 4 секунды впустую
        // (это и вызывало периодическое "дёргание" на iPhone)
        if (next.length === prev.length && JSON.stringify(next) === JSON.stringify(prev)) return prev;
        if (next.length <= prev.length) return next;
        const prevIds = new Set(prev.map((m) => m.id));
        const arrived = next.filter((m) => !prevIds.has(m.id) && m.from !== currentUser.id);
        const myThreads = currentUser.role === "admin" ? new Set(["all", ...employees.map((e) => e.id)]) : new Set(["all", currentUser.id]);
        const relevant = arrived.filter((m) => myThreads.has(m.threadId));
        if (relevant.length > 0) {
          const { onChatTab, activeThread } = chatViewRef.current;
          const stillUnseen = relevant.filter((m) => !(onChatTab && activeThread === m.threadId));
          if (stillUnseen.length > 0) {
            const senderName = chatUserName(stillUnseen[0].from);
            setToast(stillUnseen.length === 1 ? `Новое сообщение от ${senderName}` : `Новых сообщений: ${stillUnseen.length}`);
            if (soundEnabled) playBeep(740, 110);
            playVibrate(40);
          }
        }
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [currentUser, soundEnabled, employees]);

  // Автоматически помечаем прочитанным активный тред, пока пользователь на вкладке "Чат"
  useEffect(() => {
    if (!currentUser) return;
    const onChatTab = currentUser.role === "admin" ? adminTab === "chat" : tab === "chat";
    if (onChatTab) markChatThreadRead(chatActiveThread);
  }, [chatActiveThread, adminTab, tab, chatMessages, currentUser]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const timerElapsedMs = timerAccumulated + (timerRunning && timerStart ? Date.now() - timerStart : 0);

  const startTimer = () => { setTimerStart(Date.now()); setTimerRunning(true); };
  const pauseTimer = () => {
    setTimerAccumulated((acc) => acc + (timerStart ? Date.now() - timerStart : 0));
    setTimerRunning(false);
    setTimerStart(null);
  };
  const resetTimer = () => {
    setTimerRunning(false);
    setTimerStart(null);
    setTimerAccumulated(0);
    setTimerQtyInput("");
  };
  const saveTimerSession = async () => {
    if (!currentUser) return;
    const qty = parseInt(timerQtyInput) || 0;
    const seconds = Math.round(timerElapsedMs / 1000);
    if (seconds <= 0 || qty <= 0) return;
    const session = { id: uid(), employeeId: currentUser.id, seconds, qty, date: todayStr(), timestamp: Date.now() };
    await persistTimerSessions([...timerSessions, session]);
    setToast(`Записано: ${qty} шт. за ${fmtDuration(seconds * 1000)}`);
    resetTimer();
  };

  const addHourEntry = async () => {
    const h = parseFloat(hoursInput.replace(",", "."));
    if (!currentUser || !h || h <= 0) return;
    const entry = {
      id: uid(), type: "hour", employeeId: currentUser.id,
      rate: currentUser.hourlyRate || 0, hours: h, date: hoursDate, timestamp: Date.now(),
      approved: false,
    };
    if (soundEnabled) playBeep(660, 130);
    playVibrate([30, 40, 30]);
    await persistEntries([...entries, entry], { newEntry: entry });
    setHoursInput("");
    setToast(`Смена ${h} ч добавлена, ждёт подтверждения`);
  };

  const deleteEntry = async (id, opts = {}) => {
    if (!currentUser) return;
    const doDelete = async () => {
      const entry = entries.find((e) => e.id === id);
      const next = entries.map((e) => e.id === id
        ? { ...e, deletedAt: Date.now(), deletedBy: currentUser.name }
        : e);
      await persistEntries(next);
      // Если админ удаляет запись другого сотрудника — уведомляем его в личном чате
      if (entry && currentUser.role === "admin" && entry.employeeId && entry.employeeId !== currentUser.id) {
        const what = entry.type === "piece"
          ? `${entry.productName} × ${entry.qty}${entry.optionLabel ? " (" + entry.optionLabel + ")" : ""}`
          : `${entry.hours} ч (смена)`;
        await sendChatMessage(entry.employeeId, `Администратор удалил вашу запись от ${fmtDate(entry.date)}: ${what}`);
      }
    };
    if (opts.skipConfirm) { await doDelete(); return; }
    askConfirm("Удалить эту запись?", doDelete);
  };

  const approveHour = async (id) => {
    const next = entries.map((e) => e.id === id ? { ...e, approved: true } : e);
    await persistEntries(next);
  };

  const activeEntries = useMemo(() => entries.filter((e) => !e.deletedAt), [entries]);

  const todaysEntries = useMemo(
    () => currentUser ? activeEntries.filter((e) => e.employeeId === currentUser.id && e.date === todayStr())
      .sort((a, b) => b.timestamp - a.timestamp) : [],
    [activeEntries, currentUser]
  );

  const lastEntry = todaysEntries[0] || null;
  const undoLastEntry = async () => {
    if (!lastEntry) return;
    await deleteEntry(lastEntry.id, { skipConfirm: true });
    setToast("Последняя запись отменена");
  };

  const todayTotals = useMemo(() => {
    const piece = todaysEntries.filter((e) => e.type === "piece").reduce((s, e) => s + entryAmount(e), 0);
    const hour = todaysEntries.filter((e) => e.type === "hour").reduce((s, e) => s + entryAmount(e), 0);
    return { piece, hour, total: piece + hour };
  }, [todaysEntries]);

  const recentProducts = useMemo(() => {
    const seen = new Map();
    for (const e of todaysEntries) {
      if (e.type === "piece" && !seen.has(e.sku)) seen.set(e.sku, e);
    }
    return Array.from(seen.values()).slice(0, 5)
      .map((e) => catalog.find((p) => p.sku === e.sku))
      .filter(Boolean);
  }, [todaysEntries]);

  const myHistory = useMemo(
    () => currentUser ? activeEntries.filter((e) => e.employeeId === currentUser.id).sort((a, b) => b.timestamp - a.timestamp) : [],
    [activeEntries, currentUser]
  );

  const [empSortKey, setEmpSortKey] = useState("date");
  const [empSortDir, setEmpSortDir] = useState("desc");
  const empToggleSort = (key) => {
    if (empSortKey === key) {
      setEmpSortDir(empSortDir === "asc" ? "desc" : "asc");
    } else {
      setEmpSortKey(key);
      setEmpSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const [empFilterType, setEmpFilterType] = useState("all");
  const [empFilterSku, setEmpFilterSku] = useState("");
  const [empFilterDateFrom, setEmpFilterDateFrom] = useState(() => defaultPayPeriod().from);
  const [empFilterDateTo, setEmpFilterDateTo] = useState(() => defaultPayPeriod().to);

  const filteredMyHistory = useMemo(() => {
    let rows = myHistory;
    if (empFilterType !== "all") rows = rows.filter((e) => e.type === empFilterType);
    if (empFilterSku.trim()) rows = rows.filter((e) => e.type === "piece" && String(e.sku).includes(empFilterSku.trim()));
    if (empFilterDateFrom) rows = rows.filter((e) => e.date >= empFilterDateFrom);
    if (empFilterDateTo) rows = rows.filter((e) => e.date <= empFilterDateTo);
    return rows;
  }, [myHistory, empFilterType, empFilterSku, empFilterDateFrom, empFilterDateTo]);

  const sortedMyHistory = useMemo(() => {
    const dir = empSortDir === "asc" ? 1 : -1;
    const rows = [...filteredMyHistory];
    rows.sort((a, b) => {
      let av, bv;
      if (empSortKey === "date") { av = a.date + "_" + a.timestamp; bv = b.date + "_" + b.timestamp; }
      else if (empSortKey === "type") { av = a.type; bv = b.type; }
      else if (empSortKey === "sku") { av = a.type === "piece" ? a.sku : -1; bv = b.type === "piece" ? b.sku : -1; }
      else if (empSortKey === "amount") { av = entryAmount(a); bv = entryAmount(b); }
      else { av = a.timestamp; bv = b.timestamp; }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [filteredMyHistory, showEmployeeTotals, empSortKey, empSortDir]);

  const filteredMyHistoryTotal = useMemo(() => filteredMyHistory.reduce((s, e) => s + entryAmount(e), 0), [filteredMyHistory]);

  const myHistoryTotals = useMemo(() => {
    const piece = filteredMyHistory.filter((e) => e.type === "piece");
    const hour = filteredMyHistory.filter((e) => e.type === "hour");
    return {
      pieceQty: piece.reduce((s, e) => s + e.qty, 0),
      pieceSum: piece.reduce((s, e) => s + entryAmount(e), 0),
      hourQty: hour.reduce((s, e) => s + e.hours, 0),
      hourSum: hour.reduce((s, e) => s + entryAmount(e), 0),
      total: filteredMyHistory.reduce((s, e) => s + entryAmount(e), 0),
    };
  }, [filteredMyHistory]);

  const messagesForMe = useMemo(() => {
    if (!currentUser || currentUser.role !== "employee") return [];
    return messages.filter((m) => m.toEmployeeId === null || m.toEmployeeId === currentUser.id)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [messages, currentUser]);

  const unreadMessagesCount = useMemo(() => {
    if (!currentUser) return 0;
    return messagesForMe.filter((m) => !m.readBy.includes(currentUser.id)).length;
  }, [messagesForMe, currentUser]);

  // Треды чата, доступные текущему пользователю: у сотрудника — общий + свой личный;
  // у админа — общий + личный с каждым сотрудником
  const chatThreads = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "admin") return ["all", ...employees.map((e) => e.id)];
    return ["all", currentUser.id];
  }, [currentUser, employees]);

  const chatUnreadByThread = useMemo(() => {
    const map = {};
    if (!currentUser) return map;
    for (const threadId of chatThreads) {
      map[threadId] = chatMessages.filter((m) => m.threadId === threadId && m.from !== currentUser.id && !m.readBy.includes(currentUser.id)).length;
    }
    return map;
  }, [chatMessages, chatThreads, currentUser]);

  const chatUnreadTotal = useMemo(() => Object.values(chatUnreadByThread).reduce((s, n) => s + n, 0), [chatUnreadByThread]);

  const chatMessagesInActiveThread = useMemo(() => {
    return chatMessages.filter((m) => m.threadId === chatActiveThread).sort((a, b) => a.timestamp - b.timestamp);
  }, [chatMessages, chatActiveThread]);

  const chatUserName = (userId) => (users.find((u) => u.id === userId) || {}).name || "?";
  const chatReadStatus = (m) => {
    const visibleReaderId = (id) => {
      const u = users.find((x) => x.id === id);
      return !(u && u.chatIncognito);
    };
    if (m.threadId === "all") {
      const readerNames = m.readBy.filter((id) => id !== m.from && visibleReaderId(id)).map((id) => chatUserName(id));
      return { label: readerNames.length > 0 ? `Прочитали: ${readerNames.join(", ")}` : "Ещё никто не прочитал", read: readerNames.length > 0 };
    }
    const readerId = m.readBy.find((id) => id !== m.from && visibleReaderId(id));
    return { label: readerId ? `Прочитано: ${chatUserName(readerId)}` : "Ещё не прочитано", read: !!readerId };
  };
  const chatAttachResults = useMemo(() => {
    const q = chatAttachQuery.trim().toLowerCase();
    if (!q) return catalog.slice(0, 20);
    return catalog.filter((p) => p.name.toLowerCase().includes(q) || String(p.sku).toLowerCase().includes(q)).slice(0, 20);
  }, [chatAttachQuery, catalog]);

  const admins = users.filter((u) => u.role === "admin");

  const pendingHours = useMemo(
    () => activeEntries.filter((e) => e.type === "hour" && !e.approved)
      .map((e) => ({ ...e, employeeName: (users.find((u) => u.id === e.employeeId) || {}).name || "?" }))
      .sort((a, b) => b.timestamp - a.timestamp),
    [activeEntries, users]
  );

  const INACTIVE_DAYS = 3;
  const inactiveEmployees = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);
    const cutoffStr = localDateStr(cutoff);
    return employees.map((emp) => {
      const own = activeEntries.filter((e) => e.employeeId === emp.id);
      const lastDate = own.reduce((max, e) => (e.date > max ? e.date : max), "");
      return { emp, lastDate };
    }).filter((r) => r.lastDate && r.lastDate < cutoffStr)
      // Скрываем те, что уже отклонили именно для этой даты последней записи — если
      // сотрудник так и не появился, повторно уведомление не всплывёт. Но если после
      // отклонения появилась НОВАЯ более поздняя запись, а затем снова наступило
      // затишье — уведомление появится заново (дата другая)
      .filter((r) => dismissedInactiveNotices[r.emp.id] !== r.lastDate);
  }, [employees, activeEntries, dismissedInactiveNotices]);
  const persistDismissedInactiveNotices = async (next) => { setDismissedInactiveNotices(next); await safeSet("dismissedInactiveNotices", next, true, dismissedInactiveNotices); };
  const dismissInactiveNotice = async (employeeId, lastDate) => {
    await persistDismissedInactiveNotices({ ...dismissedInactiveNotices, [employeeId]: lastDate });
  };

  const recentCustomBarcodes = useMemo(() => {
    const cutoff = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
    return customBarcodes.filter((cb) => cb.timestamp >= cutoff).sort((a, b) => b.timestamp - a.timestamp);
  }, [customBarcodes]);

  const totalNotifications = pendingHours.length + inactiveEmployees.length + recentCustomBarcodes.length;

  const managerSummary = useMemo(() => {
    return employees.map((emp) => {
      const own = activeEntries.filter((e) => e.employeeId === emp.id);
      const piece = own.filter((e) => e.type === "piece").reduce((s, e) => s + entryAmount(e), 0);
      const hour = own.filter((e) => e.type === "hour").reduce((s, e) => s + entryAmount(e), 0);
      const totalHours = own.filter((e) => e.type === "hour").reduce((s, e) => s + e.hours, 0);
      const totalPieces = own.filter((e) => e.type === "piece").reduce((s, e) => s + e.qty, 0);
      const todayOwn = own.filter((e) => e.date === todayStr());
      const todayTotal = todayOwn.reduce((s, e) => s + entryAmount(e), 0);
      return { emp, piece, hour, total: piece + hour, totalHours, totalPieces, todayTotal };
    });
  }, [employees, activeEntries]);

  const employeeEarningsChart = useMemo(() => {
    return employees.map((emp) => {
      const own = activeEntries.filter((e) => e.employeeId === emp.id && e.date >= overviewDateFrom && e.date <= overviewDateTo);
      const total = own.reduce((s, e) => s + entryAmount(e), 0);
      const name = emp.name.length > 18 ? emp.name.slice(0, 18) + "…" : emp.name;
      return { name, fullName: emp.name, total: Math.round(total) };
    }).sort((a, b) => b.total - a.total);
  }, [employees, activeEntries, overviewDateFrom, overviewDateTo]);

  const monthRange = (offsetMonths) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
    const from = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
    const lastDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const to = localDateStr(lastDate);
    const label = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    return { from, to, label };
  };

  const comparisonChart = useMemo(() => {
    const cur = monthRange(0);
    const prev = monthRange(-1);
    const rows = employees.map((emp) => {
      const own = activeEntries.filter((e) => e.employeeId === emp.id);
      const curSum = own.filter((e) => e.date >= cur.from && e.date <= cur.to).reduce((s, e) => s + entryAmount(e), 0);
      const prevSum = own.filter((e) => e.date >= prev.from && e.date <= prev.to).reduce((s, e) => s + entryAmount(e), 0);
      const name = emp.name.length > 16 ? emp.name.slice(0, 16) + "…" : emp.name;
      return { name, curr: Math.round(curSum), prev: Math.round(prevSum) };
    });
    return { rows, curLabel: cur.label, prevLabel: prev.label };
  }, [employees, activeEntries]);

  const dailyEarningsChart = useMemo(() => {
    const days = [];
    const start = new Date(dailyChartFrom + "T00:00:00");
    const end = new Date(dailyChartTo + "T00:00:00");
    if (isNaN(start) || isNaN(end) || start > end) return days;
    const cursor = new Date(start);
    let guard = 0;
    while (cursor <= end && guard < 370) {
      const ds = localDateStr(cursor);
      const dayEntries = activeEntries.filter((e) => e.date === ds);
      const total = dayEntries.reduce((s, e) => s + entryAmount(e), 0);
      days.push({ label: fmtDate(ds), total: Math.round(total) });
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    return days;
  }, [activeEntries, dailyChartFrom, dailyChartTo]);

  const topProductsChart = useMemo(() => {
    const bySku = {};
    activeEntries.filter((e) => e.type === "piece").forEach((e) => {
      bySku[e.sku] = bySku[e.sku] || { name: e.productName || String(e.sku), qty: 0 };
      bySku[e.sku].qty += e.qty;
    });
    return Object.values(bySku).sort((a, b) => b.qty - a.qty).slice(0, 8)
      .map((p) => ({ name: p.name.length > 22 ? p.name.slice(0, 22) + "…" : p.name, qty: p.qty }));
  }, [activeEntries]);

  const hourlyActivityChart = useMemo(() => {
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${pad2(h)}:00`, count: 0 }));
    activeEntries.filter((e) => e.type === "piece").forEach((e) => {
      const h = new Date(e.timestamp).getHours();
      byHour[h].count += e.qty;
    });
    return byHour.filter((r, i) => i >= 5 && i <= 23);
  }, [activeEntries]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const fullLog = useMemo(() => {
    let rows = (showDeleted ? entries : activeEntries).map((e) => {
      const emp = users.find((u) => u.id === e.employeeId);
      return {

        ...e,
        employeeName: emp ? emp.name : "?",
        typeLabel: e.type === "piece" ? "Упаковка" : "Часы",
        qtyLabel: e.type === "piece" ? e.qty : e.hours,
        amount: entryAmount(e),
      };
    });

    if (logEmployeeFilter !== "all") rows = rows.filter((r) => r.employeeId === logEmployeeFilter);
    if (logTypeFilter !== "all") rows = rows.filter((r) => r.type === logTypeFilter);
    if (logSkuFilter.trim()) rows = rows.filter((r) => r.type === "piece" && String(r.sku).includes(logSkuFilter.trim()));
    if (logOptionFilter !== "all") rows = rows.filter((r) => r.optionId === logOptionFilter);
    if (logDateFrom) rows = rows.filter((r) => r.date >= logDateFrom);
    if (logDateTo) rows = rows.filter((r) => r.date <= logDateTo);

    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av, bv;
      if (sortKey === "date") { av = a.date + "_" + a.timestamp; bv = b.date + "_" + b.timestamp; }
      else if (sortKey === "employee") { av = a.employeeName.toLowerCase(); bv = b.employeeName.toLowerCase(); }
      else if (sortKey === "type") { av = a.typeLabel; bv = b.typeLabel; }
      else if (sortKey === "amount") { av = a.amount; bv = b.amount; }
      else if (sortKey === "sku") { av = a.type === "piece" ? a.sku : -1; bv = b.type === "piece" ? b.sku : -1; }
      else { av = a.timestamp; bv = b.timestamp; }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [entries, users, logEmployeeFilter, logTypeFilter, logSkuFilter, logOptionFilter, logDateFrom, logDateTo, sortKey, sortDir, showDeleted]);

  const logFilteredTotal = useMemo(() => fullLog.reduce((s, r) => s + r.amount, 0), [fullLog]);

  const toggleTimerSort = (key) => {
    if (timerSortKey === key) {
      setTimerSortDir(timerSortDir === "asc" ? "desc" : "asc");
    } else {
      setTimerSortKey(key);
      setTimerSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const allTimerRows = useMemo(() => {
    let rows = timerSessions.map((s) => {
      const emp = users.find((u) => u.id === s.employeeId);
      const rate = s.seconds > 0 ? (s.qty / (s.seconds / 60)) : 0;
      return { ...s, employeeName: emp ? emp.name : "?", rate };
    });
    if (timerFilterEmployee !== "all") rows = rows.filter((r) => r.employeeId === timerFilterEmployee);

    const dir = timerSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av, bv;
      if (timerSortKey === "date") { av = a.date + "_" + a.timestamp; bv = b.date + "_" + b.timestamp; }
      else if (timerSortKey === "employee") { av = a.employeeName.toLowerCase(); bv = b.employeeName.toLowerCase(); }
      else if (timerSortKey === "qty") { av = a.qty; bv = b.qty; }
      else if (timerSortKey === "seconds") { av = a.seconds; bv = b.seconds; }
      else if (timerSortKey === "rate") { av = a.rate; bv = b.rate; }
      else { av = a.timestamp; bv = b.timestamp; }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [timerSessions, users, timerFilterEmployee, timerSortKey, timerSortDir]);

  const avgRate = useMemo(() => {
    if (allTimerRows.length === 0) return 0;
    return allTimerRows.reduce((s, r) => s + r.rate, 0) / allTimerRows.length;
  }, [allTimerRows]);

  const exportLogToExcel = () => {
    const rows = fullLog.map((r) => ({
      "Дата": r.date,
      "Сотрудник": r.employeeName,
      "Тип": r.typeLabel,
      "Товар / смена": r.type === "piece" ? r.productName : "Рабочая смена",
      "Упаковка": r.type === "piece" ? (r.packagingName || "") : "",
      "Кол-во": r.qtyLabel,
      "Сумма": Math.round(r.amount),
      "Статус": r.deletedAt ? "Удалено" : (r.type === "hour" ? (r.approved ? "Подтверждено" : "На проверке") : ""),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Журнал");
    XLSX.writeFile(wb, `journal_${todayStr()}.xlsx`);
  };

  const exportPayrollToExcel = () => {
    const rows = managerSummary.map((row) => ({
      "Сотрудник": row.emp.name,
      "Штук всего": row.totalPieces,
      "Сдельная, ₽": Math.round(row.piece),
      "Часы": row.totalHours,
      "Почасовая, ₽": Math.round(row.hour),
      "Итого, ₽": Math.round(row.total),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Зарплата");
    XLSX.writeFile(wb, `payroll_${todayStr()}.xlsx`);
  };

  const removeUser = async (id) => {
    const u = users.find((x) => x.id === id);
    askConfirm(`Удалить сотрудника «${u ? u.name : "?"}»? Его логин и пароль будут удалены безвозвратно (сами записи упаковки останутся в журнале).`, async () => {
      await persistUsers(users.filter((x) => x.id !== id));
    });
  };
  const saveRate = async (id) => {
    const rate = parseFloat(editRateVal.replace(",", ".")) || 0;
    const next = users.map((u) => u.id === id ? { ...u, hourlyRate: rate } : u);
    await persistUsers(next);
    setEditRateId(null);
  };
  const toggleTimerForUser = async (id, enabled) => {
    const next = users.map((u) => u.id === id ? { ...u, timerEnabled: enabled } : u);
    await persistUsers(next);
    if (currentUser && currentUser.id === id) setCurrentUser({ ...currentUser, timerEnabled: enabled });
  };
  const toggleStockTabForUser = async (id, enabled) => {
    const next = users.map((u) => u.id === id ? { ...u, stockTabEnabled: enabled } : u);
    await persistUsers(next);
    if (currentUser && currentUser.id === id) setCurrentUser({ ...currentUser, stockTabEnabled: enabled });
  };
  const toggleBarcodeAddForUser = async (id, enabled) => {
    const next = users.map((u) => u.id === id ? { ...u, barcodeAddEnabled: enabled } : u);
    await persistUsers(next);
    if (currentUser && currentUser.id === id) setCurrentUser({ ...currentUser, barcodeAddEnabled: enabled });
  };
  const addCustomBarcode = async (sku, rawCode) => {
    const code = rawCode.trim();
    if (!code || !currentUser) return;
    const alreadyUsed = (barcodesForSku[sku] || []).includes(code) ||
      customBarcodes.some((cb) => cb.barcode === code);
    if (alreadyUsed) { setToast("Такой штрихкод уже используется"); return; }
    const entry = { id: uid(), sku, barcode: code, employeeId: currentUser.id, addedBy: currentUser.name, timestamp: Date.now() };
    await persistCustomBarcodes([...customBarcodes, entry]);
    setToast("Штрихкод добавлен");
  };
  // Список сотрудников заново с сервера (после действий, которые сервер выполняет сам)
  const reloadUsers = async () => {
    const fresh = await safeGet("users", true, null);
    if (!fresh) return;
    setUsers(fresh);
    setCurrentUser((cu) => (cu ? fresh.find((x) => x.id === cu.id) || cu : cu));
  };
  const savePwReset = async (id) => {
    if (!resetPwVal) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(id)}/password`, { password: resetPwVal });
    } catch (e) { setToast(e.message); return; }
    setResetPwId(null); setResetPwVal("");
    setToast("Пароль обновлён");
  };
  const saveSecretWordReset = async (id) => {
    if (!resetSecretVal.trim()) return;
    try {
      await api(`/api/admin/users/${encodeURIComponent(id)}/secret`, { secretWord: resetSecretVal.trim().toLowerCase() });
    } catch (e) { setToast(e.message); return; }
    await reloadUsers();
    setResetSecretId(null); setResetSecretVal("");
    setToast("Секретное слово обновлено");
  };
  const setMySecretWord = async () => {
    if (!currentUser || !mySecretWordVal.trim()) return;
    try {
      await api("/api/auth/secret", { secretWord: mySecretWordVal.trim().toLowerCase() });
    } catch (e) { setToast(e.message); return; }
    await reloadUsers();
    setShowMySecretWord(false);
    setMySecretWordVal("");
    setToast("Секретное слово сохранено");
  };
  const addAdmin = async () => {
    if (!newAdminUsername.trim() || !newAdminPassword || !newAdminName.trim()) return;
    try {
      await api("/api/admin/admins", { name: newAdminName.trim(), username: newAdminUsername.trim().toLowerCase(), password: newAdminPassword });
    } catch (e) { setToast(e.message); return; }
    await reloadUsers();
    setNewAdminUsername(""); setNewAdminPassword(""); setNewAdminName("");
    setToast("Администратор добавлен");
  };
  const saveOptionEdit = async (optionId) => {
    const val = parseFloat(priceEditVal.replace(",", ".")) || 0;
    const label = priceEditLabelVal.trim();
    const old = packagingOptions.find((o) => o.id === optionId);
    const next = packagingOptions.map((o) => o.id === optionId ? { ...o, price: val, label } : o);
    await persistPackagingOptions(next);
    if (old && val !== old.price && currentUser) {
      const product = catalog.find((p) => p.sku === old.sku);
      await persistPriceHistory([...priceHistory, {
        id: uid(), sku: old.sku, productName: product ? product.name : String(old.sku),
        oldPrice: old.price, newPrice: val, changedBy: currentUser.name, timestamp: Date.now(),
      }]);
    }
    setPriceEditOptionId(null); setPriceEditVal(""); setPriceEditLabelVal("");
  };
  const addPackagingOption = async (sku) => {
    const val = parseFloat(newOptionPrice.replace(",", ".")) || 0;
    const label = newOptionLabel.trim() || `Вариант ${optionsForSku(sku).length + 1}`;
    const opt = { id: uid(), sku, price: val, label };
    await persistPackagingOptions([...packagingOptions, opt]);
    if (currentUser) {
      const product = catalog.find((p) => p.sku === sku);
      await persistPriceHistory([...priceHistory, {
        id: uid(), sku, productName: product ? product.name : String(sku),
        oldPrice: 0, newPrice: val, changedBy: currentUser.name, timestamp: Date.now(),
      }]);
    }
    setAddingOptionSku(null); setNewOptionLabel(""); setNewOptionPrice("");
  };
  const removePackagingOption = async (optionId) => {
    await persistPackagingOptions(packagingOptions.filter((o) => o.id !== optionId));
  };
  const mergeDuplicateOptions = async (sku) => {
    const opts = packagingOptions.filter((o) => o.sku === sku);
    const seenPrices = new Set();
    const keepIds = new Set();
    for (const o of opts) {
      if (!seenPrices.has(o.price)) { seenPrices.add(o.price); keepIds.add(o.id); }
    }
    const next = packagingOptions.filter((o) => o.sku !== sku || keepIds.has(o.id));
    await persistPackagingOptions(next);
    setToast("Дубли объединены");
  };

  // При смене фильтров/сортировки таблицы снова показываются с первой порции строк
  useEffect(() => { setLogVisible(PAGE_ROWS); }, [logEmployeeFilter, logTypeFilter, logSkuFilter, logOptionFilter, logDateFrom, logDateTo, sortKey, sortDir, showDeleted]);
  useEffect(() => { setHistVisible(PAGE_ROWS); }, [empFilterType, empFilterSku, empFilterDateFrom, empFilterDateTo, empSortKey, empSortDir]);
  // В любом фильтре выбрали дату раньше загруженного периода — догружаем записи с этой даты
  useEffect(() => {
    if (!currentUser || entriesFrom === null) return;
    const wanted = [logDateFrom, overviewDateFrom, dailyChartFrom, empFilterDateFrom]
      .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= "2020-01-01").sort()[0];
    if (wanted && wanted < entriesFrom) extendEntriesWindow(wanted);
  }, [logDateFrom, overviewDateFrom, dailyChartFrom, empFilterDateFrom, entriesFrom, currentUser]);

  // Таблицы на телефоне показываются карточками (см. стили .m-cards): у каждой ячейки
  // подпись берётся из заголовка её столбца. Подписи расставляются здесь, после каждой
  // отрисовки, — чтобы не прописывать их вручную в каждой таблице.
  useEffect(() => {
    document.querySelectorAll("table.m-cards").forEach((table) => {
      const labels = [...table.querySelectorAll("thead th")].map((th) => th.textContent.replace(/[▲▼]/g, "").trim());
      table.querySelectorAll("tbody tr").forEach((tr) => {
        [...tr.children].forEach((td, i) => {
          const label = td.colSpan > 1 ? "" : (labels[i] || "");
          if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
          // длинный текст и ячейки без подписи (кнопки действий) занимают всю ширину карточки
          const wide = label === "" || td.textContent.trim().length > 18;
          if (wide !== td.hasAttribute("data-wide")) { if (wide) td.setAttribute("data-wide", ""); else td.removeAttribute("data-wide"); }
        });
      });
    });
  });

  const styles = { page: { minHeight: "calc(100dvh / var(--ui-zoom, 1))", background: "var(--bg)", color: "var(--text)", fontFamily: "'Inter', sans-serif", overflowX: "hidden" } };

  if (loading) {
    return (
      <div data-theme={theme} style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh / var(--ui-zoom, 1))" }}>
        <FontLinks />
        <div style={{ color: "var(--muted)", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.05em" }}>ЗАГРУЗКА...</div>
      </div>
    );
  }

  if (!serverHasAdmin && !currentUser) {
    return SetupScreen({ authBusy, authError, doSetupAdmin, setSetupName, setSetupPassword, setSetupUsername, setupName, setupPassword, setupUsername, styles, theme });
  }

  if (!currentUser) {
    return LoginScreen({ authBusy, authError, authMode, doLogin, doQrLogin, doRecoverBySecret, doRecoverScan, doRecoverSubmit, doRegister, lang, loginPassword, loginUsername, qrInput, recoverMethod, recoverName, recoverPassword, recoverPassword2, recoverQrInput, recoverSecretWord, recoverStep, recoverUsername, regName, regPassword, regPassword2, regSecretWord, regUsername, registrationOpen, setAuthError, setAuthMode, setLoginPassword, setLoginUsername, setQrInput, setRecoverMethod, setRecoverPassword, setRecoverPassword2, setRecoverQrInput, setRecoverSecretWord, setRecoverStep, setRecoverUsername, setRegName, setRegPassword, setRegPassword2, setRegSecretWord, setRegUsername, styles, t, theme, toggleLang, toggleTheme });
  }

  const isAdmin = currentUser.role === "admin";

  return (
    <div data-theme={theme} style={styles.page} onTouchStart={handlePullTouchStart} onTouchMove={handlePullTouchMove} onTouchEnd={handlePullTouchEnd}>
      <FontLinks /><GlobalStyle />
      {(pullDistance > 0 || refreshing) && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", height: refreshing ? 56 : pullDistance, overflow: "hidden", transition: refreshing ? "height 0.15s" : "none", zIndex: 50, background: "var(--bg)", borderBottom: pullDistance > 10 || refreshing ? "1px solid var(--border)" : "none", willChange: "height" }}>
          <span className="mono" style={{ fontSize: 12, color: pullDistance > PULL_THRESHOLD || refreshing ? "var(--accent)" : "var(--muted-2)", transform: refreshing ? "none" : `rotate(${Math.min(pullDistance * 3, 200)}deg)`, display: "inline-block", transition: refreshing ? "none" : "transform 0.05s" }}>
            {refreshing ? "⟳ Обновление..." : pullDistance > PULL_THRESHOLD ? "↓ Отпустите для обновления" : "↓"}
          </span>
        </div>
      )}
      {updateInfo && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", padding: "8px 12px", fontSize: 13, background: "var(--accent)", color: "#1a1a1a", fontWeight: 500 }}>
          <span>🔄 Вышла новая версия приложения{updateInfo.version ? ` (${updateInfo.version})` : ""}</span>
          <button className="btn" style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, background: "#1a1a1a", color: "#fff", borderColor: "#1a1a1a" }} onClick={applyUpdate}>Обновить</button>
        </div>
      )}
      {(!isOnline || pendingSyncCount > 0) && (
        <div style={{ textAlign: "center", padding: "6px 10px", fontSize: 12, background: !isOnline ? "var(--danger)" : "var(--accent)", color: "#1a1a1a", fontWeight: 500 }}>
          {!isOnline
            ? (pendingSyncCount > 0 ? `📴 Нет связи — ждут отправки: ${pendingSyncCount}` : "📴 Нет связи — данные могут быть неактуальны")
            : `⏳ Отправка накопленных записей: ${pendingSyncCount}...`}
        </div>
      )}
      <div style={{ height: 6, background: "repeating-linear-gradient(45deg, var(--accent) 0 10px, var(--bg) 10px 20px)" }} />
      <div className="app-shell" style={{ margin: "0 auto", padding: "calc(24px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) calc(60px + env(safe-area-inset-bottom)) calc(20px + env(safe-area-inset-left))" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
          <div>
            <div className="display" style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.02em" }}>{t("appTitle")}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" })}</div>
          </div>

          {isAdmin && (
            <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 360 }}>
              <input
                value={headerQuery}
                onChange={(e) => setHeaderQuery(e.target.value)}
                onFocus={() => setHeaderFocused(true)}
                onBlur={() => setTimeout(() => setHeaderFocused(false), 150)}
                placeholder="🔍 Сотрудник или товар..."
                style={{ width: "100%", padding: "9px 12px" }}
              />
              {headerFocused && headerQuery.trim() && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 10, padding: 8, zIndex: 20, maxHeight: 340, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                  {headerResults.employeeMatches.length === 0 && headerResults.productMatches.length === 0 && (
                    <div style={{ fontSize: 13, color: "var(--muted-2)", padding: 8 }}>Ничего не найдено.</div>
                  )}
                  {headerResults.employeeMatches.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)", padding: "4px 8px" }}>СОТРУДНИКИ</div>
                      {headerResults.employeeMatches.map((e) => (
                        <div key={e.id} onClick={() => goToEmployeeInLog(e.id)} className="header-search-item" style={{ padding: "8px", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
                          onMouseDown={(ev) => ev.preventDefault()}>
                          {e.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {headerResults.productMatches.length > 0 && (
                    <div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)", padding: "4px 8px" }}>ТОВАРЫ</div>
                      {headerResults.productMatches.map((p) => (
                        <div key={p.sku} onClick={() => goToProductInSettings(p.sku)} className="header-search-item" style={{ padding: "8px", borderRadius: 6, cursor: "pointer" }}
                          onMouseDown={(ev) => ev.preventDefault()}>
                          <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>арт. {p.sku}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: "6px 6px 6px 12px", maxWidth: "100%" }}>
            <button className="btn" style={{ padding: "6px 8px", borderRadius: 999, fontSize: 12 }}
              onClick={async () => { setRefreshing(true); await refreshEverything(); setRefreshing(false); }}
              disabled={refreshing} title="Обновить данные">
              {refreshing ? "⟳" : "↻"}
            </button>
            <button className="btn" style={{ padding: "6px 8px", borderRadius: 999, fontSize: 11 }} onClick={toggleLang} title="Тил / Язык">
              {lang === "ru" ? "UZ" : "RU"}
            </button>
            <button className="btn" style={{ padding: "6px 8px", borderRadius: 999, fontSize: 12 }} onClick={toggleTheme} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            {(isAdmin || (!isAdmin && messagesForMe.length > 0) || chatUnreadTotal > 0) && (
              <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 1px" }} />
            )}
            {isAdmin && <span className="mono admin-badge" style={{ fontSize: 10, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "1px 5px" }}>{t("admin")}</span>}
            {isAdmin && totalNotifications > 0 && enabledAdminTabs.overview !== false && (
              <button
                className="btn"
                style={{ padding: "6px 8px", borderRadius: 999, fontSize: 12, display: "flex", alignItems: "center", gap: 6, borderColor: "var(--danger)", color: "var(--danger)" }}
                onClick={() => setAdminTab("overview")}
                title="Есть уведомления"
              >
                🔔 {totalNotifications}
              </button>
            )}
            {!isAdmin && messagesForMe.length > 0 && (
              <button
                className="btn"
                style={{ padding: "6px 8px", borderRadius: 999, fontSize: 12, display: "flex", alignItems: "center", gap: 6, borderColor: unreadMessagesCount > 0 ? "var(--accent)" : "var(--border)", color: unreadMessagesCount > 0 ? "var(--accent)" : "var(--muted)" }}
                onClick={() => setShowAnnouncementsModal(true)}
                title="Объявления"
              >
                📢 {unreadMessagesCount > 0 ? unreadMessagesCount : ""}
              </button>
            )}
            {chatUnreadTotal > 0 && (isAdmin ? enabledAdminTabs.chat !== false : true) && (
              <button
                className="btn"
                style={{ padding: "6px 8px", borderRadius: 999, fontSize: 12, display: "flex", alignItems: "center", gap: 6, borderColor: "var(--accent)", color: "var(--accent)" }}
                onClick={() => (isAdmin ? setAdminTab("chat") : setTab("chat"))}
                title="Новые сообщения в чате"
              >
                💬 {chatUnreadTotal}
              </button>
            )}

            <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 1px" }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{currentUser.name}</span>
            <button className="btn" style={{ padding: "6px 8px", borderRadius: 999, fontSize: 12, borderColor: currentUser.secretWordHash ? undefined : "var(--accent)", color: currentUser.secretWordHash ? undefined : "var(--accent)" }}
              onClick={() => { setShowMySecretWord(true); setMySecretWordVal(""); }}
              title={currentUser.secretWordHash ? "Изменить секретное слово" : "Задать секретное слово — понадобится, если забудете пароль"}>
              🔑{!currentUser.secretWordHash && <span className="header-btn-label"> Задать слово</span>}
            </button>
            <button className="btn" style={{ padding: "6px 8px", borderRadius: 999, fontSize: 12 }} onClick={logout}>{t("logout")}</button>
          </div>
        </header>

        {isAdmin ? (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: "1px solid var(--surface)", flexWrap: "wrap" }}>
              {[["overview", t("tabOverview")], ["log", t("tabJournal")], ...(showTimerTab ? [["timer", t("tabTimer")]] : []), ["employees", t("tabEmployees")], ["products", t("tabProducts")], ["stock", "Остатки"], ["messages", "Объявления"], ["chat", "Чат"], ["settings", t("tabSettings")]].filter(([k]) => k === "timer" || k === "settings" || enabledAdminTabs[k] !== false).map(([k, label]) => (
                <button key={k} onClick={() => setAdminTab(k)} style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 4px", marginRight: 22, fontSize: 14, fontWeight: 500, color: adminTab === k ? "var(--accent)" : "var(--muted)", borderBottom: adminTab === k ? "2px solid var(--accent)" : "2px solid transparent" }}>
                  {label}{k === "chat" && chatUnreadTotal > 0 && <span className="mono" style={{ marginLeft: 5, fontSize: 10, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{chatUnreadTotal}</span>}
                </button>
              ))}
            </div>

            {adminTab === "overview" && AdminOverview({ approveHour, catalog, comparisonChart, dailyChartFrom, dailyChartTo, dailyEarningsChart, deleteEntry, dismissInactiveNotice, employeeEarningsChart, employees, exportPayrollToExcel, hourlyActivityChart, inactiveEmployees, managerSummary, money, overviewDateFrom, overviewDateTo, pendingHours, printPayrollAll, printPayslipFor, recentCustomBarcodes, setDailyChartFrom, setDailyChartTo, setOverviewDateFrom, setOverviewDateTo, showChartComparison, showChartDaily, showChartEmployees, showChartHeatmap, showChartTopProducts, topProductsChart })}

            {adminTab === "log" && AdminJournal({ approveHour, employees, exportLogToExcel, fullLog, logDateFrom, logDateTo, logEmployeeFilter, logFilteredTotal, logOptionFilter, logSkuFilter, logTypeFilter, logVisible, money, optionsForSku, renderEntriesWindowNotice, setLogDateFrom, setLogDateTo, setLogEmployeeFilter, setLogOptionFilter, setLogSkuFilter, setLogTypeFilter, setLogVisible, setShowDeleted, showDeleted, sortDir, sortKey, toggleSort })}

            {adminTab === "timer" && showTimerTab && AdminTimer({ allTimerRows, avgRate, employees, setTimerFilterEmployee, timerFilterEmployee, timerSortDir, timerSortKey, toggleTimerSort })}

            {adminTab === "employees" && AdminEmployees({ addAdmin, admins, currentUser, editRateId, editRateVal, employees, newAdminName, newAdminPassword, newAdminUsername, removeUser, resetPwId, resetPwVal, resetSecretId, resetSecretVal, savePwReset, saveRate, saveSecretWordReset, setEditRateId, setEditRateVal, setNewAdminName, setNewAdminPassword, setNewAdminUsername, setResetPwId, setResetPwVal, setResetSecretId, setResetSecretVal, setShowQrForId, toggleBarcodeAddForUser, toggleStockTabForUser, toggleTimerForUser })}

            {adminTab === "products" && AdminProducts({ addPackagingOption, addProduct, addingOptionSku, addingProduct, catalog, catalogEditBarcodes, catalogEditName, catalogEditSku, catalogEditSkuValue, catalogSortMode, exportCatalogToExcel, fuzzyResults, getProductImage, imageEditGalleryVal, imageEditSku, imageEditVal, importCatalogFromExcel, importImagesFromExcel, importReport, mergeDuplicateOptions, money, newOptionLabel, newOptionPrice, newProductBarcodes, newProductError, newProductName, newProductSku, optionsForSku, persistPriceHistory, priceEditLabelVal, priceEditOptionId, priceEditVal, priceHistory, printCatalog, removePackagingOption, removeProduct, renderProductPackaging, saveOptionEdit, saveProductEdit, search, searchMode, searchResults, setAddingOptionSku, setAddingProduct, setCatalogEditBarcodes, setCatalogEditName, setCatalogEditSku, setCatalogEditSkuValue, setCatalogSortMode, setImageEditGalleryVal, setImageEditSku, setImageEditVal, setImportReport, setLightbox, setNewOptionLabel, setNewOptionPrice, setNewProductBarcodes, setNewProductError, setNewProductName, setNewProductSku, setPriceEditLabelVal, setPriceEditOptionId, setPriceEditVal, setProductImage, setSearch, setSearchMode, setShowFuzzy, showFuzzy, sortedCatalog })}

            {adminTab === "stock" && AdminStock({ addPackagingStock, addToPurchaseRequest, createPackagingMaterial, downloadStockImportTemplate, editPackagingMaterial, exportPurchaseRequestToExcel, exportStockToExcel, filteredStock, fulfillPurchaseRequest, importStockFromExcel, isAdmin, packagingMaterials, packagingPurchaseRequest, printPurchaseRequest, productsByMaterial, purchaseAddFor, purchaseAddVal, removeFromPurchaseRequest, removePackagingMaterial, setMaterialLinkModal, setPurchaseAddFor, setPurchaseAddVal, setStockAddAmountFor, setStockAddAmountVal, setStockAddingNew, setStockEditId, setStockEditMultiplicity, setStockEditSize, setStockEditType, setStockNewSize, setStockNewStock, setStockNewType, setStockSearch, setStockSizeFilter, startSupplyReconcile, stockAddAmountFor, stockAddAmountVal, stockAddingNew, stockEditId, stockEditMultiplicity, stockEditSize, stockEditType, stockNewSize, stockNewStock, stockNewType, stockSearch, stockSizeFilter, stockSortDir, stockSortMode, toggleStockSort, updatePurchaseRequestQty })}

            {adminTab === "messages" && AdminMessages({ deleteMessage, employees, messages, msgTarget, msgText, sendMessage, setMsgTarget, setMsgText })}

            {adminTab === "chat" && AdminChat({ adminQuickReplies, catalog, chatActiveThread, chatHasOlder, chatInput, chatMessagesInActiveThread, chatReadStatus, chatRecordSeconds, chatRecording, chatUnreadByThread, chatUserName, currentUser, deleteChatMessage, employees, getProductImage, loadOlderChat, markChatThreadRead, sendChatMessage, setChatActiveThread, setChatAttachOpen, setChatInput, setChatMediaOpen, setLightbox, showChatReadReceipts, startVoiceRecording, stopVoiceRecording })}

            {adminTab === "settings" && AdminSettings({ addAdminQuickReply, addEmployeeQuickReply, adminQuickReplies, currency, currentUser, downloadSnapshot, employeeQuickReplies, enabledAdminTabs, exportFullBackup, exportOzonSyncToExcel, importFullBackup, loadSnapshotsList, loginLog, newEmployeeQuickReply, newQuickReply, ozonApiKey, ozonClientId, ozonEditingCreds, ozonHistory, ozonStatus, ozonSyncing, ozonUndoing, persistSettings, registrationOpen, removeAdminQuickReply, removeEmployeeQuickReply, removeOzonCredentials, saveOzonCredentials, setNewEmployeeQuickReply, setNewQuickReply, setOzonApiKey, setOzonClientId, setOzonEditingCreds, setShowLoginLog, showChartComparison, showChartDaily, showChartEmployees, showChartHeatmap, showChartTopProducts, showChatReadReceipts, showEmployeeTotals, showLoginLog, showTimerTab, snapshotKeys, snapshotsLoaded, syncOzonCatalog, t, toggleAdminTabEnabled, toggleMyIncognito, undoOzonSync })}
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: "1px solid var(--surface)" }}>
              {[["log", t("tabLog")], ["history", t("tabHistory")], ["stock", "Остатки"], ["chat", "Чат"]].filter(([k]) => k !== "stock" || currentUser.stockTabEnabled !== false).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 4px", marginRight: 22, fontSize: 14, fontWeight: 500, color: tab === k ? "var(--accent)" : "var(--muted)", borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent" }}>
                  {label}{k === "chat" && chatUnreadTotal > 0 && <span className="mono" style={{ marginLeft: 5, fontSize: 10, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{chatUnreadTotal}</span>}
                </button>
              ))}
            </div>

            {tab === "log" && EmployeeWork({ addCustomBarcode, addHourEntry, addPieceEntryWithAutoPackaging, askConfirm, barcodesForSku, catalog, currentUser, deleteEntry, fuzzyResults, getProductImage, hoursDate, hoursInput, markMessageRead, messagesForMe, money, optionsForSku, packDate, pauseTimer, qtyMap, recentProducts, renderProductPackaging, resetTimer, saveTimerSession, scanMode, search, searchInputRef, searchMode, searchResults, setHoursDate, setHoursInput, setLightbox, setPackDate, setQtyMap, setScanMode, setSearch, setSearchMode, setShowFuzzy, setTimerQtyInput, setToast, showFuzzy, soundEnabled, startPackagingFlow, startTimer, t, timerElapsedMs, timerQtyInput, timerRunning, timerSessions, todayTotals, todaysEntries, toggleSound, undoLastEntry })}

            {tab === "history" && EmployeeHistory({ deleteEntry, empFilterDateFrom, empFilterDateTo, empFilterSku, empFilterType, empSortDir, empSortKey, empToggleSort, entryAmount, filteredMyHistory, filteredMyHistoryTotal, histVisible, money, myHistoryTotals, renderEntriesWindowNotice, setEmpFilterDateFrom, setEmpFilterDateTo, setEmpFilterSku, setEmpFilterType, setHistVisible, showEmployeeTotals, sortedMyHistory })}

            {tab === "stock" && EmployeeStock({ addPackagingStock, addToPurchaseRequest, createPackagingMaterial, downloadStockImportTemplate, editPackagingMaterial, exportPurchaseRequestToExcel, exportStockToExcel, filteredStock, fulfillPurchaseRequest, importStockFromExcel, packagingMaterials, packagingPurchaseRequest, printPurchaseRequest, productsByMaterial, purchaseAddFor, purchaseAddVal, removeFromPurchaseRequest, setMaterialLinkModal, setPurchaseAddFor, setPurchaseAddVal, setStockAddAmountFor, setStockAddAmountVal, setStockAddingNew, setStockEditId, setStockEditMultiplicity, setStockEditSize, setStockEditType, setStockNewSize, setStockNewStock, setStockNewType, setStockSearch, setStockSizeFilter, stockAddAmountFor, stockAddAmountVal, stockAddingNew, stockEditId, stockEditMultiplicity, stockEditSize, stockEditType, stockNewSize, stockNewStock, stockNewType, stockSearch, stockSizeFilter, stockSortDir, stockSortMode, toggleStockSort, updatePurchaseRequestQty })}

            {tab === "chat" && EmployeeChat({ catalog, chatActiveThread, chatHasOlder, chatInput, chatMessagesInActiveThread, chatReadStatus, chatRecordSeconds, chatRecording, chatUnreadByThread, chatUserName, currentUser, deleteChatMessage, employeeQuickReplies, getProductImage, loadOlderChat, markChatThreadRead, sendChatMessage, setChatActiveThread, setChatAttachOpen, setChatInput, setChatMediaOpen, setLightbox, showChatReadReceipts, startVoiceRecording, stopVoiceRecording })}
          </>
        )}
        {APP_VERSION && (
          <div className="mono" style={{ marginTop: 40, textAlign: "center", fontSize: 11, color: "var(--muted-2)" }}>
            версия {APP_VERSION}{updateInfo ? " · доступна новая" : ""}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--accent)", color: "var(--accent-ink)", padding: "10px 18px", borderRadius: 8, fontWeight: 600, fontSize: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>{toast}</div>
      )}

      {lightbox && LightboxModal({ lightbox, lightboxTouchRef, setLightbox })}

      {chatAttachOpen && ChatAttachModal({ chatActiveThread, chatAttachQuery, chatAttachResults, chatInput, getProductImage, sendChatMessage, setChatAttachOpen, setChatAttachQuery, setChatInput })}

      {chatMediaOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={() => { setChatMediaOpen(false); setChatMediaUrl(""); }}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, width: "100%", maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Прикрепить фото или видео по ссылке</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button className="btn" style={{ padding: "6px 14px", flex: 1, background: chatMediaType === "image" ? "var(--accent)" : "var(--surface)", color: chatMediaType === "image" ? "#1a1a1a" : "var(--text)" }} onClick={() => setChatMediaType("image")}>Фото</button>
              <button className="btn" style={{ padding: "6px 14px", flex: 1, background: chatMediaType === "video" ? "var(--accent)" : "var(--surface)", color: chatMediaType === "video" ? "#1a1a1a" : "var(--text)" }} onClick={() => setChatMediaType("video")}>Видео</button>
            </div>
            <input autoFocus value={chatMediaUrl} onChange={(e) => setChatMediaUrl(e.target.value)} placeholder="https://..." style={{ marginBottom: 10, width: "100%" }} />
            <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10 }}>Вставьте прямую ссылку на файл (например, из Google Drive, Яндекс.Диска с публичным доступом, или любого другого хранилища).</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" onClick={() => {
                if (!chatMediaUrl.trim()) return;
                sendChatMessage(chatActiveThread, chatInput, null, { url: chatMediaUrl.trim(), type: chatMediaType });
                setChatInput(""); setChatMediaOpen(false); setChatMediaUrl("");
              }}>Отправить</button>
              <button className="btn" onClick={() => { setChatMediaOpen(false); setChatMediaUrl(""); }}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {showAnnouncementsModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={() => setShowAnnouncementsModal(false)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, width: "100%", maxWidth: 460, maxHeight: "calc(75vh / var(--ui-zoom, 1))", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Объявления</div>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {[...messagesForMe].sort((a, b) => b.timestamp - a.timestamp).map((m) => {
                const unread = !m.readBy.includes(currentUser.id);
                return (
                  <div key={m.id} style={{ background: unread ? "rgba(242,163,59,0.1)" : "var(--surface)", border: `1px solid ${unread ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, padding: 12, cursor: unread ? "pointer" : "default" }}
                    onClick={() => unread && markMessageRead(m.id)}>
                    <div style={{ fontSize: 14 }}>{m.text}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 4 }}>{m.from} · {new Date(m.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}{unread ? " · нажмите, чтобы отметить прочитанным" : ""}</div>
                  </div>
                );
              })}
            </div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setShowAnnouncementsModal(false)}>Закрыть</button>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setConfirmDialog(null)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, marginBottom: 14 }}>{confirmDialog.message}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-danger" onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }}>Подтвердить</button>
              <button className="btn" onClick={() => setConfirmDialog(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {packagingModal && PackagingChoiceModal({ addPackagingStock, confirmPackagingSelection, createPackagingMaterial, getPackagingLink, packagingMaterials, packagingModal, setPackagingModal, setToast, unlinkPackagingFromProduct })}

      {showMySecretWord && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setShowMySecretWord(false)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{currentUser.secretWordHash ? "Изменить секретное слово" : "Задать секретное слово"}</div>
            <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Пригодится, если забудете пароль — на экране входа сможете сбросить его сами, введя логин и это слово (без участия администратора).</div>
            <input autoFocus placeholder="Секретное слово" value={mySecretWordVal} onChange={(e) => setMySecretWordVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setMySecretWord()} style={{ width: "100%", marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" onClick={setMySecretWord}>Сохранить</button>
              <button className="btn" onClick={() => setShowMySecretWord(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {supplyReconcile && SupplyReconcileModal({ catalog, computeSupplyReconcile, createPurchaseRequestFromReconcile, setProductLinkModal, setSupplyReconcile, supplyReconcile })}

      {materialLinkModal && MaterialLinkModal({ askUnlinkPackaging, getPackagingLink, linkMaterialToProductConfirm, materialLinkModal, materialLinkResults, packagingLabel, packagingMaterials, productsByMaterial, setMaterialLinkModal })}

      {productLinkModal && ProductLinkModal({ createPackagingMaterial, getPackagingLink, linkProductToMaterialConfirm, packagingMaterials, productLinkModal, productLinkResults, setMainPackaging, setProductLinkModal, unlinkPackagingFromProduct })}

      {showQrForId && (() => {
        const qrUser = users.find((u) => u.id === showQrForId);
        if (!qrUser) return null;
        // QR рисуется прямо в приложении — код входа никуда не отправляется
        const qrSvgText = qrUser.qrToken ? qrSvg(qrUser.qrToken, 220) : null;
        const qrImgUrl = qrSvgText ? "data:image/svg+xml;utf8," + encodeURIComponent(qrSvgText) : null;
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setShowQrForId(null)}>
            <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, textAlign: "center", maxWidth: 300 }} onClick={(e) => e.stopPropagation()}>
              <div className="display" style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{qrUser.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 14 }}>Личный QR для входа</div>
              {qrImgUrl
                ? <img src={qrImgUrl} alt="QR" width={220} height={220} style={{ borderRadius: 8, background: "#fff", padding: 8 }} />
                : <div style={{ fontSize: 13, color: "var(--danger)", maxWidth: 220 }}>QR-код этого сотрудника недоступен (не задан или не удалось расшифровать).</div>}
              <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 12 }}>Распечатайте и выдайте сотруднику, или отсканируйте прямо с экрана на терминале входа.</div>
              <button className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => setShowQrForId(null)}>Закрыть</button>
            </div>
          </div>
        );
      })()}

      {printData && PrintView({ money, packagingMaterials, printData })}
    </div>
  );
}
