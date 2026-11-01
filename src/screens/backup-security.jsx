// Администратор: «Настройки» → «Резервные копии и защита».
// Автоматические копии вне Timeweb (Яндекс Диск, Telegram), скачивание зашифрованной копии,
// журнал действий администратора, выход на других устройствах.

import { useEffect, useState } from "react";
import { api, serverFetch } from "../lib/server.js";

const box = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, maxWidth: 640 };
const title = { fontSize: 13, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const hint = { fontSize: 12, color: "var(--muted-2)", marginBottom: 10, lineHeight: 1.5 };
const badge = (ok) => ({ fontSize: 10, background: ok ? "rgba(90,200,120,0.15)" : "rgba(226,96,79,0.12)", color: ok ? "#5ac878" : "var(--danger)", border: "1px solid " + (ok ? "#5ac878" : "var(--danger)"), borderRadius: 999, padding: "1px 8px" });
const fmt = (ts) => (ts ? new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const TARGET = { yandex: "Яндекс Диск", telegram: "Telegram" };

// Частота копий на Яндекс Диск и сколько дней их хранить
function ScheduleEditor({ st, call, setToast }) {
  const [every, setEvery] = useState(String(st.intervalHours));
  const [keep, setKeep] = useState(String(st.keepDays));
  const changed = every !== String(st.intervalHours) || keep !== String(st.keepDays);
  const lastSize = (st.results.yandex && st.results.yandex.sizeKb) || null;
  const perDay = Number(every) ? Math.ceil(24 / Number(every)) : 1;
  const days = parseInt(keep) || 0;
  return (
    <div style={{ background: "var(--surface-2, var(--bg-alt))", borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>Копия
          <select data-testid="bk-every" value={every} onChange={(e) => setEvery(e.target.value)}>
            {st.intervals.map((h) => <option key={h} value={h}>{h === 0 ? "раз в сутки ночью" : `каждые ${h} ч`}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>Хранить, дней
          <input data-testid="bk-keep" type="text" inputMode="numeric" value={keep} onChange={(e) => setKeep(e.target.value)} style={{ width: 70 }} />
        </label>
        {changed && <button className="btn btn-accent" style={{ padding: "4px 12px", fontSize: 12 }} onClick={async () => { const r = await call("sch", () => api("/api/admin/backup/schedule", { intervalHours: Number(every), keepDays: parseInt(keep) })); if (r) setToast("Расписание копий сохранено"); }}>Сохранить</button>}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-2)", lineHeight: 1.5 }}>
        Записи упаковщиков, приходы и списания упаковки есть только здесь — чем чаще копия, тем меньше можно потерять (при копии раз в 6 часов — максимум полдня работы). В рабочие дни лучше 2–3 часа; пока копия делается, приложение работает как обычно.
        {" "}Место на Диске: копий в сутки {perDay} × {days} дн. = {perDay * days} файлов{lastSize ? `, примерно ${Math.max(1, Math.round(lastSize * perDay * days / 1024))} МБ` : " (размер станет виден после первой копии)"}. Заканчивается место — уменьшите «Хранить, дней».
      </div>
    </div>
  );
}

export function BackupSecuritySection({ setToast, askConfirm }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState("");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [pwOpen, setPwOpen] = useState(false);
  const [ya, setYa] = useState({ token: "", clientId: "" }); const [yaOpen, setYaOpen] = useState(false);
  const [tgToken, setTgToken] = useState(""); const [tgOpen, setTgOpen] = useState(false);
  const [log, setLog] = useState(null);
  const [sess, setSess] = useState(null);

  const load = async () => { try { setSt(await api("/api/admin/backup/status")); } catch (e) { setToast("Не удалось загрузить настройки копий: " + e.message); } };
  useEffect(() => { load(); }, []);
  // Пока копия делается (в фоне на сервере) — обновляем ход раз в 5 секунд
  useEffect(() => {
    if (!st || !st.running) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [st]);
  const call = async (name, fn) => {
    setBusy(name);
    try { const r = await fn(); if (r && r.results !== undefined) setSt(r); return r; }
    catch (e) { setToast(e.message); return null; }
    finally { setBusy(""); }
  };

  const savePassword = () => {
    if (pw.length < 8) { setToast("Пароль резервных копий — не короче 8 символов"); return; }
    if (pw !== pw2) { setToast("Пароли не совпадают"); return; }
    const go = async () => { const r = await call("pw", () => api("/api/admin/backup/password", { password: pw })); if (r) { setPw(""); setPw2(""); setPwOpen(false); setToast("Пароль резервных копий сохранён — запишите его, без него копию не открыть"); } };
    if (st && st.passwordSet) askConfirm("Сменить пароль резервных копий? Уже сделанные копии останутся под старым паролем — его тоже не забудьте.", go); else go();
  };
  const downloadNow = async () => {
    setBusy("dl");
    try {
      const r = await serverFetch("/api/admin/backup/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) { let m = "ошибка " + r.status; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
      const blob = await r.blob();
      const name = ((r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/) || [])[1] || "sklad-uchet-backup.json";
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setToast("Зашифрованная копия скачана");
    } catch (e) { setToast("Не удалось скачать копию: " + e.message); }
    finally { setBusy(""); }
  };

  if (!st) return <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Загрузка настроек резервных копий…</div>;
  const anyTarget = st.yandex || st.telegram;
  const res = st.results || {};
  const resultLine = (t) => {
    const r = res[t];
    if (!r) return <span style={{ fontSize: 12, color: "var(--muted-2)" }}>ещё не отправлялось</span>;
    return r.ok
      ? <span style={{ fontSize: 12, color: "#5ac878" }}>✓ {fmt(r.at)} · {r.file} · {r.sizeKb} КБ</span>
      : <span style={{ fontSize: 12, color: "var(--danger)" }}>✕ {fmt(r.at)} · {r.error}</span>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="backup-section">
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 16, borderTop: "1px solid var(--surface-2)" }}>Резервные копии вне Timeweb</div>
      <div style={{ ...hint, marginBottom: 0, maxWidth: 640 }}>
        Сервер делает полную копию данных, шифрует её паролем и отправляет на Яндекс Диск (по расписанию ниже) и в Telegram (раз в сутки, после {st.runHour}:00 по Москве). Не получилось — повтор через час. Папка Яндекс Диска сама попадает на компьютер, если на нём установлено приложение «Яндекс Диск».
      </div>

      <div style={box}>
        <div style={title}>🔑 Пароль резервных копий <span className="mono" style={badge(st.passwordSet)}>{st.passwordSet ? "задан" : "не задан"}</span></div>
        <div style={hint}>Копии шифруются этим паролем: без него их не прочитают ни Яндекс, ни Telegram, ни тот, кто найдёт файл. <b style={{ color: "var(--text)" }}>Запишите его в надёжное место</b> — без пароля восстановить копию нельзя, и мы его не узнаем.</div>
        {!pwOpen ? (
          <button className={"btn" + (st.passwordSet ? "" : " btn-accent")} onClick={() => setPwOpen(true)}>{st.passwordSet ? "Сменить пароль" : "Задать пароль"}</button>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input type="password" data-testid="bk-pw" placeholder="Пароль (от 8 символов)" value={pw} onChange={(e) => setPw(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            <input type="password" data-testid="bk-pw2" placeholder="Ещё раз" value={pw2} onChange={(e) => setPw2(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <button className="btn btn-accent" disabled={busy === "pw"} onClick={savePassword}>Сохранить</button>
            <button className="btn" onClick={() => { setPwOpen(false); setPw(""); setPw2(""); }}>Отмена</button>
          </div>
        )}
      </div>

      <div style={box}>
        <div style={title}>☁️ Яндекс Диск {st.yandex && <span className="mono" style={badge(true)}>подключено</span>}</div>
        {st.yandexOld && !st.yandex && <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>Подключение по логину и паролю приложения (WebDAV) на бесплатном Диске не работает — подключите заново по токену.</div>}
        {st.yandex ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Папка на Диске: «{st.yandex.folder}»</div>
            <div style={{ fontSize: 12, marginBottom: 4, color: st.yandex.tokenEnd && st.yandex.tokenEnd - Date.now() < 30 * 86400000 ? "var(--danger)" : "var(--muted-2)" }}>
              Токен указан {fmt(st.yandex.tokenAt).slice(0, 10)}, действует примерно до {fmt(st.yandex.tokenEnd).slice(0, 10)}{st.yandex.tokenEnd && st.yandex.tokenEnd - Date.now() < 30 * 86400000 ? " — скоро закончится, получите новый" : ""}
            </div>
            <div style={{ marginBottom: 8 }}>Последняя копия: {resultLine("yandex")}</div>
            <ScheduleEditor st={st} call={call} setToast={setToast} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={async () => { const r = await call("yac", () => api("/api/admin/backup/yandex/check", {})); if (r) setToast("Яндекс Диск на связи, папка доступна"); }}>{busy === "yac" ? "Проверяю…" : "Проверить Яндекс Диск"}</button>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => { setYa({ token: "", clientId: st.yandex.clientId || "" }); setYaOpen(true); }}>Заменить токен</button>
              <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => askConfirm("Отключить Яндекс Диск? Уже отправленные копии останутся на Диске.", () => call("ya", () => api("/api/admin/backup/yandex", undefined, "DELETE")))}>Отключить</button>
            </div>
          </>
        ) : !yaOpen ? (
          <>
            <div style={hint}>Нужен <b style={{ color: "var(--text)" }}>OAuth-токен</b> приложения Яндекса с доступом «Доступ к папке приложения на Диске». Подойдёт тот же токен, что у «Моего склада» — копии лягут в свою папку sklad-uchet и не смешаются.</div>
            <button className="btn" onClick={() => setYaOpen(true)} disabled={!st.passwordSet} title={st.passwordSet ? "" : "Сначала задайте пароль резервных копий"}>Подключить Яндекс Диск</button>
          </>
        ) : null}
        {yaOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: st.yandex ? 10 : 0 }}>
            <input data-testid="ya-token" type="password" placeholder="OAuth-токен (y0_…) или вся ссылка после входа" value={ya.token} onChange={(e) => setYa({ ...ya, token: e.target.value })} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input data-testid="ya-client" placeholder="ClientID приложения (если нужен новый токен)" value={ya.clientId} onChange={(e) => setYa({ ...ya, clientId: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
              <a className="btn" style={{ padding: "6px 12px", fontSize: 12, textDecoration: "none", pointerEvents: ya.clientId.trim() ? "auto" : "none", opacity: ya.clientId.trim() ? 1 : 0.5 }}
                href={"https://oauth.yandex.ru/authorize?response_type=token&client_id=" + encodeURIComponent(ya.clientId.trim())} target="_blank" rel="noopener noreferrer">Получить токен</a>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-2)", lineHeight: 1.5 }}>«Получить токен» откроет страницу Яндекса: разрешите доступ — в адресной строке появится ссылка с access_token=… Скопируйте её целиком или только токен и вставьте в поле выше. Токен действует год.</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-accent" disabled={busy === "ya"} onClick={async () => { const r = await call("ya", () => api("/api/admin/backup/yandex", ya)); if (r) { setYaOpen(false); setYa({ token: "", clientId: "" }); setToast("Яндекс Диск подключён"); } }}>{busy === "ya" ? "Проверяю…" : "Проверить и подключить"}</button>
              <button className="btn" onClick={() => setYaOpen(false)}>Отмена</button>
            </div>
          </div>
        )}
      </div>

      <div style={box}>
        <div style={title}>✈️ Telegram {st.telegram && <span className="mono" style={badge(true)}>подключено</span>}</div>
        {st.telegram ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Чат: {st.telegram.chatTitle || st.telegram.chatId}</div>
            <div style={{ marginBottom: 8 }}>{resultLine("telegram")}</div>
            <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => askConfirm("Отключить отправку копий в Telegram?", () => call("tg", () => api("/api/admin/backup/telegram", undefined, "DELETE")))}>Отключить</button>
          </>
        ) : !tgOpen ? (
          <>
            <div style={hint}>1) В Telegram откройте @BotFather → /newbot → придумайте имя → он пришлёт токен. 2) Откройте своего нового бота и нажмите «Start». 3) Вставьте токен сюда — чат найдётся сам.</div>
            <button className="btn" onClick={() => setTgOpen(true)} disabled={!st.passwordSet} title={st.passwordSet ? "" : "Сначала задайте пароль резервных копий"}>Подключить Telegram</button>
          </>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input data-testid="tg-token" placeholder="Токен бота 123456789:AAE…" value={tgToken} onChange={(e) => setTgToken(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button className="btn btn-accent" disabled={busy === "tg"} onClick={async () => { const r = await call("tg", () => api("/api/admin/backup/telegram", { token: tgToken })); if (r) { setTgOpen(false); setTgToken(""); setToast("Telegram подключён — в чат пришло проверочное сообщение"); } }}>{busy === "tg" ? "Проверяю…" : "Подключить"}</button>
            <button className="btn" onClick={() => setTgOpen(false)}>Отмена</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 640 }}>
        <button className="btn btn-accent" data-testid="bk-run" disabled={!anyTarget || !st.passwordSet || busy === "run" || !!st.running} onClick={async () => { const r = await call("run", () => api("/api/admin/backup/run", {})); if (r) setToast("Копия делается — ход виден ниже"); }}>{st.running ? "Копия делается…" : "Сделать копию сейчас"}</button>
        <button className="btn" data-testid="bk-download" disabled={!st.passwordSet || busy === "dl"} onClick={downloadNow}>Скачать зашифрованную копию на это устройство</button>
      </div>
      {st.running && <div data-testid="bk-progress" style={{ fontSize: 12, color: "var(--accent)" }}>⏳ Копия делается ({st.running.reason}): {st.running.stage} · {st.running.sec} с</div>}
      {!st.passwordSet && <div style={{ fontSize: 12, color: "var(--danger)" }}>⚠ Пароль резервных копий не задан — копии вне Timeweb не делаются.</div>}
      {st.passwordSet && !anyTarget && <div style={{ fontSize: 12, color: "var(--danger)" }}>⚠ Не подключено ни одно место для копий — подключите Яндекс Диск или Telegram.</div>}
      {(st.history || []).length > 0 && (
        <div style={{ ...box, maxHeight: 200, overflowY: "auto" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Последние отправки</div>
          {st.history.map((h, i) => (
            <div key={i} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--surface-2)" }}>
              {fmt(h.at)} · {h.reason} · {Object.entries(h.results || {}).map(([t, r]) => `${TARGET[t] || t}: ${r.ok ? "ок" : "ошибка"}`).join(", ")}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", paddingTop: 16, borderTop: "1px solid var(--surface-2)" }}>Защита входа</div>
      <div style={box}>
        <div style={title}>📱 Мои входы</div>
        <div style={hint}>Вход на устройстве держится, пока вы им пользуетесь (выкидывает только если не заходить полгода). Если потеряли телефон или входили с чужого устройства — закройте остальные входы.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: sess ? 8 : 0 }}>
          <button className="btn" onClick={async () => { try { setSess((await api("/api/auth/sessions")).sessions); } catch (e) { setToast(e.message); } }}>Показать устройства</button>
          <button className="btn btn-danger" data-testid="logout-others" onClick={() => askConfirm("Выйти на всех остальных устройствах? На этом устройстве вход останется.", async () => {
            try { const r = await api("/api/auth/logout-others", {}); setToast(`Закрыто входов: ${r.closed}`); setSess(null); } catch (e) { setToast(e.message); }
          })}>Выйти на всех остальных устройствах</button>
        </div>
        {sess && sess.map((s, i) => (
          <div key={i} style={{ fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--surface-2)" }}>
            {s.current ? "👉 это устройство" : s.device || "устройство"} · последний раз {fmt(s.lastSeenAt)}
          </div>
        ))}
      </div>

      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={title}>📝 Журнал действий администратора</div>
          <button className="btn" data-testid="admin-log-btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={async () => {
            if (log) { setLog(null); return; }
            try { setLog((await api("/api/admin/action-log?limit=300")).rows); } catch (e) { setToast(e.message); }
          }}>{log ? "Скрыть" : "Показать"}</button>
        </div>
        <div style={{ ...hint, marginBottom: log ? 8 : 0 }}>Кто из администраторов что менял: цены, товары, упаковку, сотрудников, настройки. Изменить или удалить журнал нельзя.</div>
        {log && (
          <div style={{ maxHeight: 320, overflowY: "auto" }} data-testid="admin-log">
            {log.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Пока пусто.</div>}
            {log.map((l) => (
              <div key={l.id} style={{ fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--surface-2)" }}>
                <span className="mono" style={{ color: "var(--muted-2)" }}>{fmt(l.timestamp)}</span> · <b>{l.userName}</b> · {l.sectionName}: {l.summary}
                {l.items && l.items.length > 0 && <div style={{ color: "var(--muted-2)", overflowWrap: "anywhere" }}>{l.items.join("; ")}{l.more ? ` и ещё ${l.more}` : ""}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
