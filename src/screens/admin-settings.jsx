// Администратор: вкладка «Настройки».
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

export function AdminSettings(ctx) {
  const {
    addAdminQuickReply, addEmployeeQuickReply, adminQuickReplies, currency, currentUser, downloadSnapshot,
    employeeQuickReplies, enabledAdminTabs, exportFullBackup, exportOzonSyncToExcel, importFullBackup,
    loadSnapshotsList, loginLog, newEmployeeQuickReply, newQuickReply, ozonApiKey, ozonClientId, ozonEditingCreds,
    ozonHistory, ozonStatus, ozonSyncing, ozonUndoing, persistSettings, registrationOpen, removeAdminQuickReply,
    removeEmployeeQuickReply, removeOzonCredentials, saveOzonCredentials, setNewEmployeeQuickReply, setNewQuickReply,
    setOzonApiKey, setOzonClientId, setOzonEditingCreds, setShowLoginLog, showChartComparison, showChartDaily,
    showChartEmployees, showChartHeatmap, showChartTopProducts, showChatReadReceipts, showEmployeeTotals,
    showLoginLog, showTimerTab, snapshotKeys, snapshotsLoaded, syncOzonCatalog, t, toggleAdminTabEnabled,
    toggleMyIncognito, undoOzonSync,
  } = ctx;
  return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Интеграции</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, maxWidth: 640, marginTop: -12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            🔵 Автосинхронизация с Ozon
            {ozonStatus && ozonStatus.configured && <span className="mono" style={{ fontSize: 10, background: "rgba(90,200,120,0.15)", color: "#5ac878", border: "1px solid #5ac878", borderRadius: 999, padding: "1px 8px" }}>подключено</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 10 }}>
            Подтягивает артикул, название и штрихкоды напрямую из вашего кабинета продавца Ozon — без ручной выгрузки Excel. Ключи возьмите в кабинете Ozon: Настройки → Seller API.
          </div>

          {ozonStatus && ozonStatus.unreadable && (
            <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>Сохранённые ключи не удалось расшифровать (изменился ключ шифрования APP_SECRET) — введите Client-Id и Api-Key заново.</div>
          )}
          {ozonStatus && ozonStatus.encrypted === false && (
            <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 10 }}>⚠ Ключи Ozon и QR-коды входа хранятся в базе без шифрования. Чтобы включить шифрование, задайте в Timeweb переменную окружения APP_SECRET.</div>
          )}
          {!ozonStatus || !ozonStatus.configured || ozonEditingCreds ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
              <input placeholder="Client-Id" value={ozonClientId} onChange={(e) => setOzonClientId(e.target.value)} />
              <input placeholder="Api-Key" type="password" value={ozonApiKey} onChange={(e) => setOzonApiKey(e.target.value)} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-accent" style={{ padding: "6px 14px" }} onClick={saveOzonCredentials}>Сохранить ключи</button>
                {ozonEditingCreds && <button className="btn" style={{ padding: "6px 14px" }} onClick={() => setOzonEditingCreds(false)}>Отмена</button>}
              </div>
            </div>
          ) : (
            <div>
              <div className="mono" style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 10 }}>
                Client-Id: {ozonStatus.clientIdHint || "—"}
                {ozonStatus.lastSync && ` · последняя синхронизация: ${new Date(ozonStatus.lastSync.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} (добавлено ${ozonStatus.lastSync.added}, обновлено ${ozonStatus.lastSync.updated} из ${ozonStatus.lastSync.total}${ozonStatus.lastSync.photosUpdated ? `, фото: ${ozonStatus.lastSync.photosUpdated}` : ""})`}
              </div>
              {ozonStatus.replacedByMoySklad && <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 10 }}>Каталог теперь синхронизируется с «Моим складом» — синхронизация с Ozon отключена.</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-accent" style={{ padding: "6px 14px" }} onClick={syncOzonCatalog} disabled={ozonSyncing || ozonStatus.replacedByMoySklad} title={ozonStatus.replacedByMoySklad ? "Каталог синхронизируется с «Моим складом»" : ""}>
                  {ozonSyncing ? "Синхронизация..." : "Синхронизировать сейчас"}
                </button>
                {ozonHistory.length > 0 && !ozonHistory[0].undone && (
                  <button className="btn btn-danger" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => undoOzonSync(ozonHistory[0], true)} disabled={!!ozonUndoing}>
                    {ozonUndoing === ozonHistory[0].id ? "Отмена..." : "↶ Отменить последнюю синхронизацию"}
                  </button>
                )}
                <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setOzonEditingCreds(true)}>Сменить ключи</button>
                <button className="btn btn-danger" style={{ padding: "6px 14px", fontSize: 12 }} onClick={removeOzonCredentials}>Отключить</button>
              </div>
              {ozonHistory.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>История синхронизаций ({ozonHistory.length})</summary>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                    {ozonHistory.map((h, i) => (
                      <div key={h.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", background: "var(--surface-2)", borderRadius: 6, flexWrap: "wrap" }}>
                        <span className="mono" style={{ fontSize: 11, color: h.undone ? "var(--muted-2)" : "var(--text)", textDecoration: h.undone ? "line-through" : "none" }}>
                          {new Date(h.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} — добавлено {h.added}, обновлено {h.updated} из {h.total}{h.photosUpdated ? `, фото: ${h.photosUpdated}` : ""}{h.undone ? " (отменено)" : ""}
                        </span>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {(h.added > 0 || h.updated > 0) && (
                            <button className="btn" style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => exportOzonSyncToExcel(h)}>Excel</button>
                          )}
                          {!h.undone && (h.added > 0 || h.updated > 0) && (
                            <button className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => undoOzonSync(h, i === 0)} disabled={!!ozonUndoing}>
                              {ozonUndoing === h.id ? "..." : "↶ Отменить"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, paddingTop: 16, borderTop: "1px solid var(--surface-2)" }}>Основные настройки</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -12 }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Валюта</span>
          <input value={currency} onChange={(e) => persistSettings({ currency: e.target.value })} style={{ width: 48, padding: "6px 8px", textAlign: "center" }} />
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={showEmployeeTotals} onChange={(e) => persistSettings({ showEmployeeTotals: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
            Показывать сотрудникам итог их проделанной работы
          </label>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4, marginLeft: 28 }}>
            Если включено, сотрудник в своей истории видит сводку: сколько упаковал, сколько заработал сдельно, сколько часов и на какую сумму, и общий итог. Если выключено — сводка скрыта, но фильтры и сортировка истории всё равно работают.
          </div>
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={showTimerTab} onChange={(e) => persistSettings({ showTimerTab: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
            Показывать вкладку «Секундомер» в админ-панели
          </label>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4, marginLeft: 28 }}>
            Используется редко — можно скрыть, чтобы не занимала место в меню. Сами замеры сотрудников при этом никуда не денутся, просто вкладка не будет показываться. Секундомер у отдельных сотрудников (вкладка «Сотрудники») включается отдельно и от этой настройки не зависит.
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Вкладки админ-панели</div>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Выберите, какие разделы показывать в меню. «Настройки» отключить нельзя — иначе не получится вернуться сюда и включить обратно.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["overview", t("tabOverview")], ["log", t("tabJournal")], ["employees", t("tabEmployees")], ["products", t("tabProducts")], ["stock", "Остатки"], ["messages", "Объявления"], ["chat", "Чат"]].map(([k, label]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={enabledAdminTabs[k] !== false} onChange={(e) => toggleAdminTabEnabled(k, e.target.checked)} style={{ width: 18, height: 18, padding: 0 }} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, paddingTop: 16, borderTop: "1px solid var(--surface-2)" }}>Чат</div>
        <div style={{ marginTop: -12 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Быстрые ответы в чате</div>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Свой набор кнопок-шаблонов, которые появляются над полем ввода в чате — чтобы не печатать частые фразы каждый раз заново.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, maxWidth: 420 }}>
            {adminQuickReplies.map((qr, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, flex: 1 }}>{qr}</span>
                <button className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => removeAdminQuickReply(i)}>✕</button>
              </div>
            ))}
            {adminQuickReplies.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Пока ни одного шаблона.</div>}
          </div>
          <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
            <input value={newQuickReply} onChange={(e) => setNewQuickReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAdminQuickReply()} placeholder="Новый шаблон..." style={{ flex: 1 }} />
            <button className="btn btn-accent" onClick={addAdminQuickReply}>Добавить</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Быстрые ответы у сотрудников</div>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>То же самое, но для сотрудников — их набор кнопок в личном чате с администрацией. Удалите все, если кнопки вообще не нужны.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, maxWidth: 420 }}>
            {employeeQuickReplies.map((qr, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, flex: 1 }}>{qr}</span>
                <button className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => removeEmployeeQuickReply(i)}>✕</button>
              </div>
            ))}
            {employeeQuickReplies.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Кнопки отключены — сотрудники не видят быстрых ответов.</div>}
          </div>
          <div style={{ display: "flex", gap: 8, maxWidth: 420 }}>
            <input value={newEmployeeQuickReply} onChange={(e) => setNewEmployeeQuickReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEmployeeQuickReply()} placeholder="Новый шаблон..." style={{ flex: 1 }} />
            <button className="btn btn-accent" onClick={addEmployeeQuickReply}>Добавить</button>
          </div>
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={showChatReadReceipts} onChange={(e) => persistSettings({ showChatReadReceipts: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
            Показывать в чате, кто прочитал сообщение
          </label>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4, marginLeft: 28 }}>
            Под своими сообщениями будет видно, прочитал ли собеседник (в личном чате) или сколько человек прочитали (в общем чате). Настройка общая для всех — сотрудники этот переключатель не видят.
          </div>
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={currentUser.chatIncognito === true} onChange={(e) => toggleMyIncognito(e.target.checked)} style={{ width: 18, height: 18, padding: 0 }} />
            Режим инкогнито лично для меня
          </label>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4, marginLeft: 28 }}>
            Только для вашей учётной записи — другие не будут видеть, что именно вы прочитали их сообщение (ни в чате, ни в объявлениях). Работает независимо от общей настройки выше — даже если статус прочтения включён для всех, ваше собственное прочтение всё равно останется скрытым. Влияет только на то, что видят другие о вас — сами вы по-прежнему видите статус прочтения своих сообщений другими.
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, paddingTop: 16, borderTop: "1px solid var(--surface-2)" }}>Обзор</div>
        <div style={{ marginTop: -12 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Графики в «Обзоре»</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={showChartEmployees} onChange={(e) => persistSettings({ showChartEmployees: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
              «Кто сколько заработал»
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={showChartDaily} onChange={(e) => persistSettings({ showChartDaily: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
              «Заработок по дням»
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={showChartTopProducts} onChange={(e) => persistSettings({ showChartTopProducts: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
              «Топ товаров по количеству»
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={showChartComparison} onChange={(e) => persistSettings({ showChartComparison: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
              «Сравнение периодов»
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={showChartHeatmap} onChange={(e) => persistSettings({ showChartHeatmap: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
              «Активность по часам дня»
            </label>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, paddingTop: 16, borderTop: "1px solid var(--surface-2)" }}>Данные и безопасность</div>
        <div style={{ marginTop: -12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
            <input type="checkbox" checked={registrationOpen} onChange={(e) => persistSettings({ registrationOpen: e.target.checked })} style={{ width: 18, height: 18, padding: 0 }} />
            Разрешить самостоятельную регистрацию новых сотрудников
          </label>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4, marginLeft: 28 }}>
            Пока включено, любой, у кого есть ссылка на приложение, может зарегистрироваться как упаковщик. Когда все сотрудники зарегистрировались — выключите: вкладка «Я новый» на экране входа исчезнет, а уже зарегистрированные продолжат работать как обычно.
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Резервная копия</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-accent" onClick={exportFullBackup}>Скачать бэкап (JSON)</button>
            <label className="btn" style={{ cursor: "pointer" }}>
              Восстановить из файла
              <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importFullBackup(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 6 }}>
            Бэкап включает всех сотрудников, записи, цены упаковки, историю цен, штрихкоды и настройки. Восстановление полностью заменяет текущие данные.
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Ежедневные снэпшоты</div>
            <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={loadSnapshotsList}>Показать список</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 8 }}>
            Приложение автоматически сохраняет копию данных раз в день (хранятся последние 14 дней) — на случай сбоя.
          </div>
          {snapshotsLoaded && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, maxHeight: 240, overflowY: "auto" }}>
              {snapshotKeys.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted-2)" }}>Снэпшотов пока нет.</div>
              ) : snapshotKeys.map((k) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--surface-2)" }}>
                  <span className="mono" style={{ fontSize: 13 }}>{k.replace("snapshot:", "")}</span>
                  <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => downloadSnapshot(k)}>Скачать</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Журнал входов</div>
            <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setShowLoginLog((v) => !v)}>{showLoginLog ? "Скрыть" : "Показать"}</button>
          </div>
          {showLoginLog && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, maxHeight: 280, overflowY: "auto" }}>
              {loginLog.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--muted-2)" }}>Входов пока не зафиксировано.</div>
              ) : [...loginLog].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100).map((l) => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--surface-2)", flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: 13 }}>{l.userName}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>
                    {new Date(l.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {l.device} · {l.method}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
}

// Настройки → ключи доступа для других приложений («Мой склад» и т.д.)
export function ApiKeysSection(ctx) {
  const { apiKeys, apiKeyName, setApiKeyName, apiKeyCreated, setApiKeyCreated, createApiKey, deleteApiKey, setToast } = ctx;
  const fmt = (ts) => (ts ? new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "ещё не использовался");
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid var(--surface-2)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Доступ для других приложений</div>
      <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12, maxWidth: 720 }}>
        По ключу доступа другое ваше приложение (например, «Мой склад») может читать отсюда данные об упаковке: остатки, движения (приход, списание, инвентаризация, списание при упаковке), привязку упаковки к товарам, расценки за упаковку и почасовую оплату упаковщиков по дням (суммой, без имён). Только чтение — изменить что-либо по ключу нельзя.
      </div>
      {apiKeyCreated && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10, padding: 12, marginBottom: 12, maxWidth: 720 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Ключ «{apiKeyCreated.name}» создан. <b>Скопируйте его сейчас — позже посмотреть его будет нельзя:</b></div>
          <div className="mono" style={{ fontSize: 12, overflowWrap: "anywhere", background: "var(--bg-alt)", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>{apiKeyCreated.key}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-accent" style={{ padding: "6px 12px", fontSize: 12 }} onClick={async () => { try { await navigator.clipboard.writeText(apiKeyCreated.key); setToast("Ключ скопирован"); } catch (e) { setToast("Не удалось скопировать — выделите ключ и скопируйте вручную"); } }}>Скопировать</button>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setApiKeyCreated(null)}>Я сохранил ключ</button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, maxWidth: 720 }}>
        {(apiKeys || []).length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Ключей пока нет.</div>}
        {(apiKeys || []).map((k) => (
          <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13 }}>{k.name} <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>{k.hint}</span></div>
              <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>создан {fmt(k.createdAt)} · последний запрос: {fmt(k.lastUsedAt)}</div>
            </div>
            <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => deleteApiKey(k)}>Удалить</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, maxWidth: 520, flexWrap: "wrap" }}>
        <input placeholder="Для какого приложения, например: Мой склад" value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn btn-accent" onClick={createApiKey}>Создать ключ</button>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 12, maxWidth: 720, overflowWrap: "anywhere" }}>
        Адреса для чтения (заголовок запроса: Authorization: Bearer КЛЮЧ):<br />
        {base}/api/ext/v1/packaging/materials — остатки упаковки<br />
        {base}/api/ext/v1/packaging/moves?since=0 — движения упаковки<br />
        {base}/api/ext/v1/packaging/links — привязка упаковки к товарам<br />
        {base}/api/ext/v1/packaging/rates — расценки за упаковку (оплата упаковщику за штуку)<br />
        {base}/api/ext/v1/payroll/hourly?from=ГГГГ-ММ-ДД&amp;to=ГГГГ-ММ-ДД — почасовая оплата по дням
      </div>
    </div>
  );
}

// Настройки → синхронизация каталога товаров с приложением «Мой склад»
export function MoySkladSection(ctx) {
  const { msStatus, msHistory, msBaseUrl, setMsBaseUrl, msApiKey, setMsApiKey, msEditing, setMsEditing, msBusy, saveMsCredentials, removeMsCredentials, syncMs, undoMsSync } = ctx;
  const fmt = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const summary = (r) => [`получено ${r.total}`, `добавлено ${r.added}`, `обновлено ${r.updated}`, r.photosUpdated ? `фото ${r.photosUpdated}` : "", r.renamed ? `смен артикула ${r.renamed}` : "", r.deletedMarked ? `удалено ${r.deletedMarked}` : ""].filter(Boolean).join(", ");
  const modeLabel = { full: "полная", delta: "изменения", auto: "авто" };
  const connected = msStatus && msStatus.configured && !msEditing;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Каталог товаров</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>📦 Синхронизация с «Моим складом»</span>
          {msStatus && msStatus.configured && <span className="mono" style={{ fontSize: 10, background: "rgba(90,200,120,0.15)", color: "#5ac878", border: "1px solid #5ac878", borderRadius: 999, padding: "1px 8px" }}>подключено</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 10 }}>
          Товары (артикул, название, штрихкоды, фото) берутся из вашего приложения «Мой склад». Изменения подтягиваются сами раз в {msStatus ? msStatus.autoMinutes : 30} минут; полную сверку можно запустить кнопкой. Удалённые в «Моём складе» товары здесь не удаляются, а помечаются; при смене артикула все записи, цены и упаковка переносятся на новый.
        </div>
        {msStatus && msStatus.unreadable && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>Сохранённый ключ не удалось расшифровать (изменился APP_SECRET) — введите адрес и ключ заново.</div>}
        {msStatus && msStatus.lastError && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>Последняя попытка ({fmt(msStatus.lastError.timestamp)}) не удалась: {msStatus.lastError.message}</div>}
        {!connected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
            <input placeholder="Адрес «Моего склада» — как в адресной строке браузера, когда оно открыто" value={msBaseUrl} onChange={(e) => setMsBaseUrl(e.target.value)} />
            <input placeholder="Ключ доступа (msa_…)" type="password" value={msApiKey} onChange={(e) => setMsApiKey(e.target.value)} />
            <div style={{ fontSize: 11, color: "var(--muted-2)" }}>Ключ создаётся в «Моём складе»: Настройки → «Аналитика МП» → создать ключ с названием «Складской учёт».</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" style={{ padding: "6px 14px" }} disabled={msBusy === "save"} onClick={saveMsCredentials}>{msBusy === "save" ? "Проверяем связь…" : "Подключить"}</button>
              {msEditing && <button className="btn" style={{ padding: "6px 14px" }} onClick={() => setMsEditing(false)}>Отмена</button>}
            </div>
          </div>
        ) : (
          <>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10, overflowWrap: "anywhere" }}>
              {msStatus.baseUrl} · ключ {msStatus.keyHint}
              {msStatus.lastCheckedAt ? ` · проверено: ${fmt(msStatus.lastCheckedAt)}` : " · ещё не синхронизировалось"}
              {msStatus.lastSync ? ` · последние изменения: ${fmt(msStatus.lastSync.timestamp)} (${summary(msStatus.lastSync)})` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-accent" style={{ padding: "6px 14px" }} disabled={!!msBusy} onClick={() => syncMs(false)}>{msBusy === "sync" ? "Синхронизация…" : "Синхронизировать сейчас"}</button>
              <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} disabled={!!msBusy} onClick={() => syncMs(true)}>{msBusy === "full" ? "Полная сверка…" : "Полная сверка каталога"}</button>
              <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => { setMsBaseUrl(msStatus.baseUrl || ""); setMsEditing(true); }}>Сменить адрес или ключ</button>
              <button className="btn btn-danger" style={{ padding: "6px 14px", fontSize: 12 }} onClick={removeMsCredentials}>Отключить</button>
            </div>
            {msHistory.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>История синхронизаций</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {msHistory.slice(0, 8).map((h) => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, opacity: h.undone ? 0.5 : 1 }}>
                      <span className="mono" style={{ color: "var(--muted-2)" }}>{fmt(h.timestamp)} · {modeLabel[h.mode] || h.mode}</span>
                      <span style={{ flex: 1, minWidth: 160 }}>{summary(h)}{h.undone ? " — отменена" : ""}</span>
                      {!h.undone && (h.added > 0 || h.updated > 0 || h.deletedMarked > 0) && <button className="btn" style={{ padding: "3px 10px", fontSize: 11 }} disabled={!!msBusy} onClick={() => undoMsSync(h)}>Отменить</button>}
                      {(h.renameProblems || []).map((p, i) => <div key={i} style={{ flexBasis: "100%", color: "var(--danger)", fontSize: 11 }}>⚠ {p}</div>)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

