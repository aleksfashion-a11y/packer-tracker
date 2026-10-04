// Сотрудник: вкладки «Учёт» и «История».
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { PAGE_ROWS, defaultPayPeriod, fmtDate, todayStr } from "../lib/helpers.js";
import { BarcodeAddRow, Manifest, PieceOptionRow, ProductThumb, SearchModeToggle, SortableTh, StopwatchCard } from "../ui/components.jsx";

export function EmployeeWork(ctx) {
  const {
    addCustomBarcode, addHourEntry, addPieceEntryWithAutoPackaging, askConfirm, barcodesForSku, catalog, currentUser,
    deleteEntry, fuzzyResults, getProductImage, hoursDate, hoursInput, markMessageRead, messagesForMe, money,
    optionsForSku, packDate, pauseTimer, qtyMap, recentProducts, renderProductPackaging, resetTimer,
    saveTimerSession, scanMode, search, searchInputRef, searchMode, searchResults, setHoursDate, setHoursInput,
    setLightbox, setPackDate, setQtyMap, setScanMode, setSearch, setSearchMode, setShowFuzzy, setTimerQtyInput,
    setToast, showFuzzy, soundEnabled, startPackagingFlow, startTimer, t, timerElapsedMs, timerQtyInput,
    timerRunning, timerSessions, todayTotals, todaysEntries, toggleSound, undoLastEntry,
  } = ctx;
  return (
      <div>
        {messagesForMe.filter((m) => !m.readBy.includes(currentUser.id)).length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Новые объявления</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {messagesForMe.filter((m) => !m.readBy.includes(currentUser.id)).map((m) => (
                <div key={m.id} style={{ background: "rgba(242,163,59,0.1)", border: "1px solid var(--accent)", borderRadius: 10, padding: 12, cursor: "pointer" }}
                  onClick={() => markMessageRead(m.id)}>
                  <div style={{ fontSize: 14 }}>{m.text}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 4 }}>{m.from} · {new Date(m.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · нажмите, чтобы отметить прочитанным</div>
                </div>
              ))}
            </div>
          </div>
        )}
      <div className="grid-log">
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Поиск товара</div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: packDate !== todayStr() ? "var(--accent)" : "var(--muted)" }}>
                Дата упаковки:
                <input type="date" value={packDate} onChange={(e) => setPackDate(e.target.value || todayStr())} style={{ padding: "4px 8px", fontSize: 12 }} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: soundEnabled ? "var(--accent)" : "var(--muted)" }}>
                <input type="checkbox" checked={soundEnabled} onChange={(e) => toggleSound()} style={{ width: 15, height: 15, padding: 0 }} />
                Звук
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: scanMode ? "var(--accent)" : "var(--muted)" }}>
                <input type="checkbox" checked={scanMode} onChange={(e) => setScanMode(e.target.checked)} style={{ width: 15, height: 15, padding: 0 }} />
                Режим сканера
              </label>
            </div>
          </div>
          {packDate !== todayStr() && (
            <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 10 }}>
              ⚠ Записи будут добавлены датой {fmtDate(packDate)}, а не сегодняшним числом.
            </div>
          )}
          <input ref={searchInputRef} autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchProduct")} style={{ width: "100%", padding: "12px 14px", fontSize: 15, marginBottom: 8 }} />
          <div style={{ marginBottom: scanMode ? 4 : 14 }}><SearchModeToggle mode={searchMode} onChange={setSearchMode} /></div>
          {scanMode && <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 14 }}>Сканируйте штрихкод сканером — товар добавится сразу, по 1 шт., поле очистится само.</div>}

          {recentProducts.length > 0 && search.trim() === "" && (
            <div style={{ marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 6 }}>НЕДАВНО УПАКОВАНО</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {recentProducts.map((p) => (
                  <button key={p.sku} className="btn" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => addPieceEntryWithAutoPackaging(p, 1)}>
                    +1 {p.name.length > 28 ? p.name.slice(0, 28) + "…" : p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {search.trim() === "" ? (
            <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "20px 0" }}>Начните вводить название, артикул или сканировать штрихкод, чтобы найти товар из каталога ({catalog.length} товаров).</div>
          ) : searchResults.length === 0 ? (
            <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "20px 0" }}>
              <div style={{ marginBottom: !showFuzzy && fuzzyResults.length > 0 ? 10 : 0 }}>Ничего не найдено.</div>
              {!showFuzzy && fuzzyResults.length > 0 && (
                <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setShowFuzzy(true)}>Показать похожие номера ({fuzzyResults.length})</button>
              )}
              {showFuzzy && fuzzyResults.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {fuzzyResults.map((p) => {
                    const img = getProductImage(p.sku);
                    return (
                      <div key={p.sku} style={{ padding: "8px 0", borderBottom: "1px solid var(--surface-2)", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                        onClick={() => { setSearch(String(p.sku)); setSearchMode("sku"); }}>
                        {img && img.main && <ProductThumb src={img.main} size={40} onClick={(e) => { e.stopPropagation(); setLightbox({ images: [img.main, ...img.gallery], index: 0, name: p.name }); }} />}
                        <div style={{ flex: 1, textAlign: "left" }}>
                          <div style={{ fontSize: 13 }}>{p.name}</div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>арт. {p.sku}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28, maxHeight: 460, overflowY: "auto" }}>
              {searchResults.map((p) => {
                const opts = optionsForSku(p.sku);
                const bcodes = barcodesForSku[p.sku] || [];
                const img = getProductImage(p.sku);
                return (
                  <div key={p.sku} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      {img && img.main && (
                        <ProductThumb src={img.main} size={56}
                          onClick={() => setLightbox({ images: [img.main, ...img.gallery], index: 0, name: p.name })} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, lineHeight: 1.4, marginBottom: 4 }}>{p.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8 }}>арт. {p.sku} {bcodes.length > 0 ? "· " + bcodes.join(", ") : ""}</div>
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>{renderProductPackaging(p)}</div>

                    {opts.length === 0 ? (
                      <PieceOptionRow key="none" qty={qtyMap[`none-${p.sku}`] ?? 1}
                        onQtyChange={(v) => setQtyMap((m) => ({ ...m, [`none-${p.sku}`]: v }))}
                        priceLabel="цена не задана" priceColor="var(--muted-2)"
                        onAdd={() => { const q = Math.max(1, parseInt(qtyMap[`none-${p.sku}`]) || 1); startPackagingFlow(p, { price: 0, label: "", id: null }, q); }} />
                    ) : opts.map((opt) => (
                      <PieceOptionRow key={opt.id} label={opt.label} qty={qtyMap[opt.id] ?? 1}
                        onQtyChange={(v) => setQtyMap((m) => ({ ...m, [opt.id]: v }))}
                        priceLabel={money(opt.price)} priceColor="var(--accent)"
                        onAdd={() => { const q = Math.max(1, parseInt(qtyMap[opt.id]) || 1); startPackagingFlow(p, opt, q); }} />
                    ))}

                    {currentUser.barcodeAddEnabled && (
                      <BarcodeAddRow sku={p.sku} onAdd={(code) => addCustomBarcode(p.sku, code)} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Отработанные часы</div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input type="date" value={hoursDate} onChange={(e) => setHoursDate(e.target.value || todayStr())} style={{ borderColor: hoursDate !== todayStr() ? "var(--accent)" : undefined, color: hoursDate !== todayStr() ? "var(--accent)" : undefined }} />
            <input placeholder="Часы, напр. 8" value={hoursInput} onChange={(e) => setHoursInput(e.target.value)} style={{ width: 130 }} />
            <span className="mono" style={{ color: "var(--muted)", fontSize: 13 }}>× {money(currentUser.hourlyRate || 0)}/ч</span>
            <button className="btn btn-accent" style={{ marginLeft: "auto" }} onClick={() => {
              const h = parseFloat(hoursInput.replace(",", "."));
              if (!h || h <= 0) { setToast("Укажите количество часов"); return; }
              askConfirm(`Добавить смену ${h} ч? Дата: ${fmtDate(hoursDate)}`, addHourEntry);
            }}>Добавить смену</button>
          </div>
          {hoursDate !== todayStr() && (
            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 8 }}>
              ⚠ Смена будет добавлена датой {fmtDate(hoursDate)}, а не сегодняшним числом.
            </div>
          )}
          {(currentUser.hourlyRate || 0) === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 8 }}>Ставка за час ещё не назначена — обратитесь к администратору.</div>}
        </div>

        <div>
          {currentUser.timerEnabled && (
            <StopwatchCard
              running={timerRunning}
              elapsedMs={timerElapsedMs}
              qtyInput={timerQtyInput}
              setQtyInput={setTimerQtyInput}
              onStart={startTimer}
              onPause={pauseTimer}
              onReset={resetTimer}
              onSave={saveTimerSession}
              mySessions={timerSessions.filter((s) => s.employeeId === currentUser.id).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)}
            />
          )}
          <Manifest employee={currentUser} entries={todaysEntries} totals={todayTotals} money={money} deleteEntry={deleteEntry} onUndoLast={undoLastEntry} />
        </div>
      </div>
      </div>
    );
}

export function EmployeeHistory(ctx) {
  const {
    deleteEntry, empFilterDateFrom, empFilterDateTo, empFilterSku, empFilterType, empSortDir, empSortKey,
    empToggleSort, entryAmount, filteredMyHistory, filteredMyHistoryTotal, histVisible, money, myHistoryTotals,
    renderEntriesWindowNotice, setEmpFilterDateFrom, setEmpFilterDateTo, setEmpFilterSku, setEmpFilterType,
    setHistVisible, showEmployeeTotals, sortedMyHistory,
  } = ctx;
  return (
      <div>
        {showEmployeeTotals && (
          <>
            <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Итог проделанной работы {empFilterDateFrom && empFilterDateTo && (
                <span className="mono" style={{ textTransform: "none", fontSize: 11, color: "var(--muted-2)" }}>· период {fmtDate(empFilterDateFrom)} — {fmtDate(empFilterDateTo)}</span>
              )}
            </div>
            <div className="row-wrap" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 20, gap: 20 }}>
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>УПАКОВАНО ШТУК</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{myHistoryTotals.pieceQty}</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>СДЕЛЬНАЯ</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{money(myHistoryTotals.pieceSum)}</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>ЧАСОВ ОТРАБОТАНО</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{myHistoryTotals.hourQty}</div>
              </div>
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>ПОЧАСОВАЯ</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{money(myHistoryTotals.hourSum)}</div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>ИТОГО</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{money(myHistoryTotals.total)}</div>
              </div>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
          <select value={empFilterType} onChange={(e) => setEmpFilterType(e.target.value)}>
            <option value="all">Всё</option>
            <option value="piece">Только упаковка</option>
            <option value="hour">Только часы</option>
          </select>
          <input value={empFilterSku} onChange={(e) => setEmpFilterSku(e.target.value)} placeholder="Артикул" style={{ width: 110 }} />
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>с</span>
          <input type="date" value={empFilterDateFrom} onChange={(e) => setEmpFilterDateFrom(e.target.value)} />
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>по</span>
          <input type="date" value={empFilterDateTo} onChange={(e) => setEmpFilterDateTo(e.target.value)} />
          {(empFilterType !== "all" || empFilterSku || empFilterDateFrom || empFilterDateTo) && (
            <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { setEmpFilterType("all"); setEmpFilterSku(""); const p = defaultPayPeriod(); setEmpFilterDateFrom(p.from); setEmpFilterDateTo(p.to); }}>Сбросить фильтры</button>
          )}
          <div className="mono" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>{filteredMyHistory.length} записей{showEmployeeTotals ? ` · ${money(filteredMyHistoryTotal)}` : ""}</div>
        </div>

        {renderEntriesWindowNotice()}
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <SortableTh label="Дата" sortKey="date" currentKey={empSortKey} dir={empSortDir} onClick={empToggleSort} />
              <SortableTh label="Тип" sortKey="type" currentKey={empSortKey} dir={empSortDir} onClick={empToggleSort} />
              <th>Запись</th>
              <SortableTh label="Артикул" sortKey="sku" currentKey={empSortKey} dir={empSortDir} onClick={empToggleSort} />
              <th>Кол-во</th>
              {showEmployeeTotals && <SortableTh label="Сумма" sortKey="amount" currentKey={empSortKey} dir={empSortDir} onClick={empToggleSort} />}
              <th></th>
            </tr></thead>
            <tbody>
              {sortedMyHistory.slice(0, histVisible).map((e) => (
                <tr key={e.id}>
                  <td className="mono">{fmtDate(e.date)}</td>
                  <td>
                    <span className="mono" style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: e.type === "piece" ? "rgba(242,163,59,0.15)" : "rgba(73,181,166,0.15)", color: e.type === "piece" ? "var(--accent)" : "var(--teal)" }}>
                      {e.type === "piece" ? "Упаковка" : "Часы"}
                    </span>
                  </td>
                  <td>{e.type === "piece" ? e.productName : "Смена (часы)"}{e.type === "piece" && e.packagingName && <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>📦 {e.packagingName}</div>}</td>
                  <td className="mono">{e.type === "piece" ? e.sku : "—"}</td>
                  <td className="mono">{e.type === "piece" ? e.qty : `${e.hours} ч`}</td>
                  {showEmployeeTotals && <td className="mono">{money(entryAmount(e))}</td>}
                  <td><button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => deleteEntry(e.id)}>Удалить</button></td>
                </tr>
              ))}
              {sortedMyHistory.length === 0 && <tr><td colSpan={showEmployeeTotals ? 7 : 6} style={{ color: "var(--muted-2)" }}>Записей пока нет.</td></tr>}
            </tbody>
          </table>
        </div>
        {sortedMyHistory.length > histVisible && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="btn" onClick={() => setHistVisible((n) => n + PAGE_ROWS)}>Показать ещё {Math.min(PAGE_ROWS, sortedMyHistory.length - histVisible)} (осталось {sortedMyHistory.length - histVisible})</button>
          </div>
        )}
      </div>
    );
}
