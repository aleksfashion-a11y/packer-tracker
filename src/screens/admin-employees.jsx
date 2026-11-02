// Администратор: вкладка «Сотрудники».
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { useState } from "react";
import { api } from "../lib/server.js";

// Придумать пароль, который легко продиктовать: без похожих символов (0/О, 1/l)
const makePassword = () => {
  const a = "abcdefghjkmnpqrstuvwxyz", d = "23456789";
  const r = (set) => set[Math.floor(Math.random() * set.length)];
  return Array.from({ length: 6 }, () => r(a)).join("") + r(d) + r(d);
};

// Добавить упаковщика: администратор сам задаёт имя, логин и пароль — регистрацию открывать не нужно
function AddEmployeeForm({ reloadUsers, setShowQrForId, setToast }) {
  const empty = { name: "", username: "", password: "", secretWord: "", hourlyRate: "" };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { id, name, username, password }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    if (!f.name.trim() || !f.username.trim()) { setToast("Укажите имя и логин"); return; }
    if (f.password.length < 6) { setToast("Пароль — не короче 6 символов"); return; }
    setBusy(true);
    try {
      const r = await api("/api/admin/employees", { ...f, username: f.username.trim().toLowerCase() });
      await reloadUsers();
      setDone({ id: r.id, name: f.name.trim(), username: f.username.trim().toLowerCase(), password: f.password });
      setF(empty); setOpen(false);
      setToast("Упаковщик добавлен");
    } catch (e) { setToast(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ marginBottom: 14 }} data-testid="add-employee">
      {done && (
        <div style={{ background: "rgba(90,200,120,0.1)", border: "1px solid #5ac878", borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>✓ {done.name} добавлен. Передайте ему данные для входа:</div>
          <div className="mono" data-testid="new-emp-creds" style={{ fontSize: 14, marginBottom: 8 }}>логин: {done.username}<br />пароль: {done.password}</div>
          <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8 }}>Пароль показывается только сейчас. Можно вместо пароля дать личный QR-код — распечатать или показать с экрана.</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setShowQrForId(done.id)}>Показать QR для входа</button>
            <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => { try { navigator.clipboard.writeText(`Складской учёт\nлогин: ${done.username}\nпароль: ${done.password}`); setToast("Скопировано"); } catch (e) {} }}>Скопировать</button>
            <button className="btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setDone(null)}>Готово</button>
          </div>
        </div>
      )}
      {!open ? (
        <button className="btn btn-accent" onClick={() => { setOpen(true); setF({ ...empty, password: makePassword() }); }}>+ Добавить упаковщика</button>
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Новый упаковщик</div>
          <input data-testid="emp-name" placeholder="Имя, например: Иван Петров" value={f.name} onChange={set("name")} />
          <input data-testid="emp-login" placeholder="Логин для входа, например: ivan" value={f.username} onChange={set("username")} autoCapitalize="none" />
          <div style={{ display: "flex", gap: 6 }}>
            <input data-testid="emp-pass" placeholder="Пароль (от 6 символов)" value={f.password} onChange={set("password")} style={{ flex: 1, minWidth: 0 }} className="mono" />
            <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setF({ ...f, password: makePassword() })}>Придумать</button>
          </div>
          <input placeholder="Ставка за час, ₽ (можно потом)" inputMode="decimal" value={f.hourlyRate} onChange={set("hourlyRate")} />
          <input placeholder="Секретное слово для восстановления пароля (необязательно)" value={f.secretWord} onChange={set("secretWord")} />
          <div style={{ fontSize: 11, color: "var(--muted-2)" }}>Регистрацию открывать не нужно — сотрудник сразу входит этим логином и паролем (или по QR-коду).</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-accent" disabled={busy} onClick={submit}>{busy ? "Добавляю…" : "Добавить"}</button>
            <button className="btn" onClick={() => { setOpen(false); setF(empty); }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminEmployees(ctx) {
  const {
    addAdmin, admins, currentUser, editRateId, editRateVal, employees, newAdminName, newAdminPassword,
    newAdminUsername, removeUser, resetPwId, resetPwVal, resetSecretId, resetSecretVal, savePwReset, saveRate,
    saveSecretWordReset, setEditRateId, setEditRateVal, setNewAdminName, setNewAdminPassword, setNewAdminUsername,
    setResetPwId, setResetPwVal, setResetSecretId, setResetSecretVal, setShowQrForId, toggleBarcodeAddForUser,
    toggleStockTabForUser, toggleTimerForUser,
  } = ctx;
  return (
      <div className="grid-emp">
        <div>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Сотрудники ({employees.length})</div>
          <AddEmployeeForm reloadUsers={ctx.reloadUsers} setShowQrForId={setShowQrForId} setToast={ctx.setToast} />
          {employees.length === 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, color: "var(--muted-2)", fontSize: 13 }}>Сотрудников пока нет. Добавьте упаковщика кнопкой выше и передайте ему логин и пароль (или QR-код).</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {employees.map((e) => (
              <div key={e.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{e.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>@{e.username}</div>
                  </div>
                  {editRateId === e.id ? (
                    <>
                      <input className="mono" autoFocus value={editRateVal} onChange={(ev) => setEditRateVal(ev.target.value)} style={{ width: 80 }} />
                      <button className="btn btn-accent" style={{ padding: "6px 10px" }} onClick={() => saveRate(e.id)}>OK</button>
                    </>
                  ) : (
                    <button className="btn" style={{ padding: "6px 10px" }} onClick={() => { setEditRateId(e.id); setEditRateVal(String(e.hourlyRate || 0)); }}>{e.hourlyRate || 0}/ч</button>
                  )}
                  <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => removeUser(e.id)}>✕</button>
                </div>
                {resetPwId === e.id ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="text" placeholder="Новый пароль" value={resetPwVal} onChange={(ev) => setResetPwVal(ev.target.value)} style={{ flex: 1, minWidth: 0 }} />
                    <button className="btn btn-accent" style={{ padding: "6px 10px" }} onClick={() => savePwReset(e.id)}>Сохранить</button>
                    <button className="btn" style={{ padding: "6px 10px" }} onClick={() => setResetPwId(null)}>Отмена</button>
                  </div>
                ) : resetSecretId === e.id ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="text" placeholder="Новое секретное слово" value={resetSecretVal} onChange={(ev) => setResetSecretVal(ev.target.value)} style={{ flex: 1, minWidth: 0 }} />
                    <button className="btn btn-accent" style={{ padding: "6px 10px" }} onClick={() => saveSecretWordReset(e.id)}>Сохранить</button>
                    <button className="btn" style={{ padding: "6px 10px" }} onClick={() => setResetSecretId(null)}>Отмена</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => { setResetPwId(e.id); setResetPwVal(""); }}>Сбросить пароль</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => { setResetSecretId(e.id); setResetSecretVal(""); }}>{e.secretWordHash ? "Сменить секретное слово" : "Задать секретное слово"}</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setShowQrForId(e.id)}>Показать QR</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--surface-2)" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: e.timerEnabled ? "var(--accent)" : "var(--muted)", cursor: "pointer" }}>
                        <input type="checkbox" checked={!!e.timerEnabled} onChange={(ev) => toggleTimerForUser(e.id, ev.target.checked)} style={{ width: 15, height: 15, padding: 0 }} />
                        Секундомер
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: e.barcodeAddEnabled ? "var(--accent)" : "var(--muted)", cursor: "pointer" }}>
                        <input type="checkbox" checked={!!e.barcodeAddEnabled} onChange={(ev) => toggleBarcodeAddForUser(e.id, ev.target.checked)} style={{ width: 15, height: 15, padding: 0 }} />
                        Добавление штрихкодов
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: e.stockTabEnabled !== false ? "var(--accent)" : "var(--muted)", cursor: "pointer" }}>
                        <input type="checkbox" checked={e.stockTabEnabled !== false} onChange={(ev) => toggleStockTabForUser(e.id, ev.target.checked)} style={{ width: 15, height: 15, padding: 0 }} />
                        Доступ к «Остаткам»
                      </label>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Администраторы ({admins.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
            {admins.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{a.name}{a.id === currentUser.id ? " (вы)" : ""}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>@{a.username}</div>
                </div>
                {resetPwId === a.id ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Новый пароль" value={resetPwVal} onChange={(ev) => setResetPwVal(ev.target.value)} style={{ width: 100 }} />
                    <button className="btn btn-accent" style={{ padding: "6px 10px" }} onClick={() => savePwReset(a.id)}>OK</button>
                  </div>
                ) : (
                  <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => { setResetPwId(a.id); setResetPwVal(""); }}>Сбросить пароль</button>
                )}
                {a.id !== currentUser.id && <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => removeUser(a.id)}>✕</button>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Добавить администратора</div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <input placeholder="Имя" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} />
            <input placeholder="Логин" value={newAdminUsername} onChange={(e) => setNewAdminUsername(e.target.value)} />
            <input type="password" placeholder="Пароль" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} />
            <button className="btn btn-accent" onClick={addAdmin}>Добавить</button>
          </div>
        </div>
      </div>
    );
}
