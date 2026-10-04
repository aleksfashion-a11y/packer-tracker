// Администратор: вкладка «Обзор» — сводка по сотрудникам, уведомления, графики.
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { daysSince, defaultLast7Days, defaultPayPeriod, fmtDate } from "../lib/helpers.js";

export function AdminOverview(ctx) {
  const {
    approveHour, catalog, comparisonChart, dailyChartFrom, dailyChartTo, dailyEarningsChart, deleteEntry,
    dismissInactiveNotice, employeeEarningsChart, employees, exportPayrollToExcel, hourlyActivityChart,
    inactiveEmployees, managerSummary, money, overviewDateFrom, overviewDateTo, pendingHours, printPayrollAll,
    printPayslipFor, recentCustomBarcodes, setDailyChartFrom, setDailyChartTo, setOverviewDateFrom,
    setOverviewDateTo, showChartComparison, showChartDaily, showChartEmployees, showChartHeatmap,
    showChartTopProducts, topProductsChart,
  } = ctx;
  return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Сводка по всем сотрудникам</div>
          {employees.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={exportPayrollToExcel}>Экспорт в Excel</button>
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={printPayrollAll}>Печать / PDF</button>
            </div>
          )}
        </div>
        {employees.length === 0 ? (
          <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Пока ни один сотрудник не зарегистрировался.</div>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 28 }}>
            <table>
              <thead><tr>
                <th>Сотрудник</th><th>Сегодня</th><th>Штук всего</th><th>Сдельная</th><th>Часы</th><th>Почасовая</th><th>Итого</th><th></th>
              </tr></thead>
              <tbody>
                {managerSummary.map((row) => (
                  <tr key={row.emp.id}>
                    <td style={{ fontWeight: 500 }}>{row.emp.name}</td>
                    <td className="mono" style={{ color: "var(--accent)" }}>{money(row.todayTotal)}</td>
                    <td className="mono">{row.totalPieces}</td>
                    <td className="mono">{money(row.piece)}</td>
                    <td className="mono">{row.totalHours}</td>
                    <td className="mono">{money(row.hour)}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{money(row.total)}</td>
                    <td><button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => printPayslipFor(row)}>Печать</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pendingHours.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Часы на проверке ({pendingHours.length})
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
              {pendingHours.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--surface-2)", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 14 }}>{r.employeeName}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>{fmtDate(r.date)} · {r.hours} ч · {money(r.hours * r.rate)}</div>
                  </div>
                  <button className="btn btn-accent" style={{ padding: "6px 12px" }} onClick={() => approveHour(r.id)}>Подтвердить</button>
                  <button className="btn btn-danger" style={{ padding: "6px 12px" }} onClick={() => deleteEntry(r.id)}>Отклонить</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {inactiveEmployees.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, color: "var(--danger)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Не выходили на связь ({inactiveEmployees.length})
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
              {inactiveEmployees.map(({ emp, lastDate }) => (
                <div key={emp.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--surface-2)", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14 }}>{emp.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="mono" style={{ fontSize: 12, color: "var(--muted-2)" }}>последняя запись {fmtDate(lastDate)} · {daysSince(lastDate)} дн. назад</div>
                    <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} title="Скрыть это уведомление" onClick={() => dismissInactiveNotice(emp.id, lastDate)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentCustomBarcodes.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, color: "var(--teal)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Новые штрихкоды от сотрудников ({recentCustomBarcodes.length})
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
              {recentCustomBarcodes.map((cb) => {
                const product = catalog.find((p) => p.sku === cb.sku);
                return (
                  <div key={cb.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--surface-2)", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{product ? product.name : `арт. ${cb.sku}`}</div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--muted-2)" }}>{cb.barcode} · {cb.addedBy} · {new Date(cb.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showChartEmployees && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Кто сколько заработал</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--muted-2)" }}>с</span>
              <input type="date" value={overviewDateFrom} onChange={(e) => setOverviewDateFrom(e.target.value)} />
              <span style={{ fontSize: 12, color: "var(--muted-2)" }}>по</span>
              <input type="date" value={overviewDateTo} onChange={(e) => setOverviewDateTo(e.target.value)} />
              <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { const p = defaultPayPeriod(); setOverviewDateFrom(p.from); setOverviewDateTo(p.to); }}>Текущий период (5–5)</button>
            </div>
          </div>
          {employeeEarningsChart.length === 0 ? (
            <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Нет сотрудников для отображения.</div>
          ) : (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, height: Math.max(200, employeeEarningsChart.length * 44) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeeEarningsChart} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-2)" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted-2)" fontSize={12} width={130} />
                  <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} formatter={(v) => money(v)} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {employeeEarningsChart.map((_, i) => <Cell key={i} fill="var(--accent)" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        )}

        {showChartComparison && employees.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Сравнение периодов</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10, textTransform: "capitalize" }}>{comparisonChart.curLabel} против {comparisonChart.prevLabel}</div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, height: Math.max(220, comparisonChart.rows.length * 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonChart.rows} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-2)" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted-2)" fontSize={12} width={130} />
                  <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} formatter={(v) => money(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="curr" name={comparisonChart.curLabel} radius={[0, 4, 4, 0]} fill="var(--accent)" />
                  <Bar dataKey="prev" name={comparisonChart.prevLabel} radius={[0, 4, 4, 0]} fill="var(--teal)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {showChartHeatmap && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Активность по часам дня</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10 }}>Упаковано штук в этот час, все сотрудники вместе, за всё время</div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyActivityChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />
                  <XAxis dataKey="hour" stroke="var(--muted-2)" fontSize={10} interval={1} />
                  <YAxis stroke="var(--muted-2)" fontSize={11} width={40} />
                  <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} formatter={(v) => `${v} шт.`} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {hourlyActivityChart.map((r, i) => {
                      const max = Math.max(1, ...hourlyActivityChart.map((x) => x.count));
                      const intensity = r.count / max;
                      return <Cell key={i} fill={intensity === 0 ? "var(--surface-2)" : "var(--teal)"} fillOpacity={intensity === 0 ? 1 : 0.3 + intensity * 0.7} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="grid-emp">
          {showChartDaily && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Заработок по дням</div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="date" value={dailyChartFrom} onChange={(e) => setDailyChartFrom(e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }} />
                  <span style={{ fontSize: 11, color: "var(--muted-2)" }}>—</span>
                  <input type="date" value={dailyChartTo} onChange={(e) => setDailyChartTo(e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }} />
                  <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => { const p = defaultLast7Days(); setDailyChartFrom(p.from); setDailyChartTo(p.to); }}>7 дней</button>
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyEarningsChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--muted-2)" fontSize={11} />
                    <YAxis stroke="var(--muted-2)" fontSize={11} width={40} />
                    <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} formatter={(v) => money(v)} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {dailyEarningsChart.map((_, i) => <Cell key={i} fill="var(--accent)" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {showChartTopProducts && (
            <div>
              <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Топ товаров по количеству</div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, height: 240 }}>
                {topProductsChart.length === 0 ? (
                  <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Пока нет данных.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProductsChart} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" horizontal={false} />
                      <XAxis type="number" stroke="var(--muted-2)" fontSize={11} />
                      <YAxis type="category" dataKey="name" stroke="var(--muted-2)" fontSize={10} width={130} />
                      <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--text)" }} />
                      <Bar dataKey="qty" radius={[0, 4, 4, 0]}>
                        {topProductsChart.map((_, i) => <Cell key={i} fill="var(--teal)" />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
}
