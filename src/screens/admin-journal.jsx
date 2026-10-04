// Администратор: вкладки «Журнал» и «Секундомер».
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { PAGE_ROWS, fmtDate, fmtDuration } from "../lib/helpers.js";
import { SortableTh } from "../ui/components.jsx";

export function AdminJournal(ctx) {
  const {
    approveHour, employees, exportLogToExcel, fullLog, logDateFrom, logDateTo, logEmployeeFilter, logFilteredTotal,
    logOptionFilter, logSkuFilter, logTypeFilter, logVisible, money, optionsForSku, renderEntriesWindowNotice,
    setLogDateFrom, setLogDateTo, setLogEmployeeFilter, setLogOptionFilter, setLogSkuFilter, setLogTypeFilter,
    setLogVisible, setShowDeleted, showDeleted, sortDir, sortKey, toggleSort,
  } = ctx;
  return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Журнал записей</div>
          <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={exportLogToExcel}>Экспорт в Excel</button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
          <select value={logEmployeeFilter} onChange={(e) => setLogEmployeeFilter(e.target.value)}>
            <option value="all">Все сотрудники</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value)}>
            <option value="all">Все типы</option>
            <option value="piece">Только упаковка</option>
            <option value="hour">Только часы</option>
          </select>
          <input value={logSkuFilter} onChange={(e) => { setLogSkuFilter(e.target.value); setLogOptionFilter("all"); }} placeholder="Артикул" style={{ width: 110 }} />
          {logSkuFilter.trim() && optionsForSku(logSkuFilter.trim()).length > 1 && (
            <select value={logOptionFilter} onChange={(e) => setLogOptionFilter(e.target.value)}>
              <option value="all">Все варианты</option>
              {optionsForSku(logSkuFilter.trim()).map((o) => (
                <option key={o.id} value={o.id}>{o.label || "без названия"} · {money(o.price)}</option>
              ))}
            </select>
          )}
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>с</span>
          <input type="date" value={logDateFrom} onChange={(e) => setLogDateFrom(e.target.value)} />
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>по</span>
          <input type="date" value={logDateTo} onChange={(e) => setLogDateTo(e.target.value)} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} style={{ width: 15, height: 15, padding: 0 }} />
            Показывать удалённые
          </label>
          {(logEmployeeFilter !== "all" || logTypeFilter !== "all" || logSkuFilter || logOptionFilter !== "all" || logDateFrom || logDateTo) && (
            <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { setLogEmployeeFilter("all"); setLogTypeFilter("all"); setLogSkuFilter(""); setLogOptionFilter("all"); setLogDateFrom(""); setLogDateTo(""); }}>Сбросить фильтры</button>
          )}
          <div className="mono" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>{fullLog.length} записей · {money(logFilteredTotal)}</div>
        </div>
        {renderEntriesWindowNotice()}

        <div style={{ overflowX: "auto" }}>
          <table className="m-cards m-sort">
            <thead><tr>
              <SortableTh label="Дата" sortKey="date" currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Сотрудник" sortKey="employee" currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <SortableTh label="Тип" sortKey="type" currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th>Товар / смена</th>
              <SortableTh label="Артикул" sortKey="sku" currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th>Кол-во</th>
              <SortableTh label="Сумма" sortKey="amount" currentKey={sortKey} dir={sortDir} onClick={toggleSort} />
              <th>Статус</th>
            </tr></thead>
            <tbody>
              {fullLog.slice(0, logVisible).map((r) => (
                <tr key={r.id} style={r.deletedAt ? { opacity: 0.5, textDecoration: "line-through" } : undefined}>
                  <td className="mono">{fmtDate(r.date)}</td>
                  <td>{r.employeeName}</td>
                  <td>
                    <span className="mono" style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: r.type === "piece" ? "rgba(242,163,59,0.15)" : "rgba(73,181,166,0.15)", color: r.type === "piece" ? "var(--accent)" : "var(--teal)" }}>
                      {r.typeLabel}
                    </span>
                  </td>

                  <td style={{ fontSize: 13 }}>{r.type === "piece" ? r.productName : "Рабочая смена"}{r.type === "piece" && r.packagingName && <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>📦 {r.packagingName}</div>}</td>
                  <td className="mono">{r.type === "piece" ? r.sku : "—"}</td>
                  <td className="mono">{r.type === "piece" ? r.qtyLabel : `${r.qtyLabel} ч`}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>{money(r.amount)}</td>
                  <td>
                    {r.deletedAt ? (
                      <span className="mono" style={{ fontSize: 11, color: "var(--danger)" }}>удалено ({r.deletedBy})</span>
                    ) : r.type === "hour" && !r.approved ? (
                      <button className="btn btn-accent" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => approveHour(r.id)}>Подтвердить</button>
                    ) : r.type === "hour" ? (
                      <span className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>подтверждено</span>
                    ) : ""}
                  </td>
                </tr>
              ))}
              {fullLog.length === 0 && <tr><td colSpan={8} style={{ color: "var(--muted-2)" }}>Нет записей по выбранным фильтрам.</td></tr>}
            </tbody>
          </table>
        </div>
        {fullLog.length > logVisible && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="btn" onClick={() => setLogVisible((n) => n + PAGE_ROWS)}>Показать ещё {Math.min(PAGE_ROWS, fullLog.length - logVisible)} (осталось {fullLog.length - logVisible})</button>
          </div>
        )}
      </div>
    );
}

export function AdminTimer(ctx) {
  const {
    allTimerRows, avgRate, employees, setTimerFilterEmployee, timerFilterEmployee, timerSortDir, timerSortKey,
    toggleTimerSort,
  } = ctx;
  return (
      <div>
        <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Замеры секундомера</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
          <select value={timerFilterEmployee} onChange={(e) => setTimerFilterEmployee(e.target.value)}>
            <option value="all">Все сотрудники</option>
            {employees.filter((e) => e.timerEnabled).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {timerFilterEmployee !== "all" && (
            <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setTimerFilterEmployee("all")}>Сбросить фильтр</button>
          )}
          <div className="mono" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>
            {allTimerRows.length} замеров {allTimerRows.length > 0 && `· в среднем ${avgRate.toFixed(1)} шт/мин`}
          </div>
        </div>

        {allTimerRows.length === 0 ? (
          <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Замеров пока нет. Они появятся, когда сотрудник с включённым секундомером сохранит первый замер.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="m-cards m-sort">
              <thead><tr>
                <SortableTh label="Дата" sortKey="date" currentKey={timerSortKey} dir={timerSortDir} onClick={toggleTimerSort} />
                <SortableTh label="Сотрудник" sortKey="employee" currentKey={timerSortKey} dir={timerSortDir} onClick={toggleTimerSort} />
                <SortableTh label="Кол-во, шт" sortKey="qty" currentKey={timerSortKey} dir={timerSortDir} onClick={toggleTimerSort} />
                <SortableTh label="Время" sortKey="seconds" currentKey={timerSortKey} dir={timerSortDir} onClick={toggleTimerSort} />
                <SortableTh label="Штук/мин" sortKey="rate" currentKey={timerSortKey} dir={timerSortDir} onClick={toggleTimerSort} />
              </tr></thead>
              <tbody>
                {allTimerRows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{fmtDate(r.date)}</td>
                    <td>{r.employeeName}</td>
                    <td className="mono">{r.qty}</td>
                    <td className="mono">{fmtDuration(r.seconds * 1000)}</td>
                    <td className="mono" style={{ fontWeight: 600, color: "var(--teal)" }}>{r.rate.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
}
