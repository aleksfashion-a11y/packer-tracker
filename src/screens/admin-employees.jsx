// Администратор: вкладка «Сотрудники».
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

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
          {employees.length === 0 && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, color: "var(--muted-2)", fontSize: 13 }}>Никто ещё не зарегистрировался. Отправьте сотрудникам ссылку на это приложение — они зарегистрируются сами во вкладке «Я новый».</div>
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
