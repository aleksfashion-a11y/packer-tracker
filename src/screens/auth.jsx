// Экраны до входа: первый запуск (создание администратора) и вход / регистрация / восстановление пароля.
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { FontLinks, GlobalStyle } from "../ui/styles.jsx";

export function SetupScreen(ctx) {
  const {
    authBusy, authError, doSetupAdmin, setSetupName, setSetupPassword, setSetupUsername, setupName, setupPassword,
    setupUsername, styles, theme,
  } = ctx;
  return (
      <div data-theme={theme} style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <FontLinks /><GlobalStyle />
        <div style={{ width: "100%", maxWidth: 360, background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
          <div className="display" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Первый запуск</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18 }}>Создайте аккаунт администратора — он будет видеть всех сотрудников и настраивать приложение.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="Ваше имя" value={setupName} onChange={(e) => setSetupName(e.target.value)} />
            <input placeholder="Логин" value={setupUsername} onChange={(e) => setSetupUsername(e.target.value)} />
            <input type="password" placeholder="Пароль" value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} />
            {authError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{authError}</div>}
            <button className="btn btn-accent" disabled={authBusy} onClick={doSetupAdmin}>Создать админа</button>
          </div>
        </div>
      </div>
    );
}

export function LoginScreen(ctx) {
  const {
    authBusy, authError, authMode, doLogin, doQrLogin, doRecoverBySecret, doRecoverScan, doRecoverSubmit, doRegister,
    lang, loginPassword, loginUsername, qrInput, recoverMethod, recoverName, recoverPassword, recoverPassword2,
    recoverQrInput, recoverSecretWord, recoverStep, recoverUsername, regName, regPassword, regPassword2,
    regSecretWord, regUsername, registrationOpen, setAuthError, setAuthMode, setLoginPassword, setLoginUsername,
    setQrInput, setRecoverMethod, setRecoverPassword, setRecoverPassword2, setRecoverQrInput, setRecoverSecretWord,
    setRecoverStep, setRecoverUsername, setRegName, setRegPassword, setRegPassword2, setRegSecretWord,
    setRegUsername, styles, t, theme, toggleLang, toggleTheme,
  } = ctx;
  return (
      <div data-theme={theme} style={{ ...styles.page, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <FontLinks /><GlobalStyle />
        <div style={{ width: "100%", maxWidth: 360, background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, position: "relative" }}>
          <button className="btn" style={{ position: "absolute", top: 12, right: 12, padding: "4px 8px", borderRadius: 999, fontSize: 12 }} onClick={toggleTheme} title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="btn" style={{ position: "absolute", top: 12, left: 12, padding: "4px 8px", borderRadius: 999, fontSize: 11 }} onClick={toggleLang} title="Тил / Язык">
            {lang === "ru" ? "UZ" : "RU"}
          </button>
          <div className="display" style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, textAlign: "center" }}>{t("appTitle")}</div>
          <div style={{ display: "flex", gap: 6, margin: "16px 0", borderBottom: "1px solid var(--surface)" }}>
            <button onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0", fontSize: 14, fontWeight: 500, color: authMode === "login" ? "var(--accent)" : "var(--muted)", borderBottom: authMode === "login" ? "2px solid var(--accent)" : "2px solid transparent" }}>{t("tabLogin")}</button>
            <button onClick={() => { setAuthMode("qr"); setAuthError(""); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0", fontSize: 14, fontWeight: 500, color: authMode === "qr" ? "var(--accent)" : "var(--muted)", borderBottom: authMode === "qr" ? "2px solid var(--accent)" : "2px solid transparent" }}>{t("tabQr")}</button>
{registrationOpen && <button onClick={() => { setAuthMode("register"); setAuthError(""); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0", fontSize: 14, fontWeight: 500, color: authMode === "register" ? "var(--accent)" : "var(--muted)", borderBottom: authMode === "register" ? "2px solid var(--accent)" : "2px solid transparent" }}>{t("tabRegister")}</button>}
            <button onClick={() => { setAuthMode("recover"); setAuthError(""); setRecoverStep("scan"); }} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "8px 0", fontSize: 12, fontWeight: 500, color: authMode === "recover" ? "var(--accent)" : "var(--muted)", borderBottom: authMode === "recover" ? "2px solid var(--accent)" : "2px solid transparent" }}>Забыли пароль?</button>
          </div>

          {authMode === "login" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input placeholder={t("login")} value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
              <input type="password" placeholder={t("password")} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} />
              {authError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{authError}</div>}
              <button className="btn btn-accent" disabled={authBusy} onClick={doLogin}>{t("signIn")}</button>
            </div>
          ) : authMode === "qr" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 2 }}>Наведите камерой сканера на свой личный QR-код, или вставьте код сюда и нажмите Enter.</div>
              <input autoFocus placeholder="Отсканируйте QR..." value={qrInput} onChange={(e) => setQrInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doQrLogin(qrInput)} />
              {authError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{authError}</div>}
              <button className="btn btn-accent" onClick={() => doQrLogin(qrInput)}>{t("signInQr")}</button>
            </div>
          ) : authMode === "register" && registrationOpen ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 2 }}>Регистрация для упаковщиков. Ставку вам назначит администратор после регистрации.</div>
              <input placeholder={t("yourName")} value={regName} onChange={(e) => setRegName(e.target.value)} />
              <input placeholder={t("login")} value={regUsername} onChange={(e) => setRegUsername(e.target.value)} />
              <input type="password" placeholder={t("password")} value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
              <input type="password" placeholder={t("confirmPassword")} value={regPassword2} onChange={(e) => setRegPassword2(e.target.value)} />
              <input placeholder="Секретное слово (для восстановления пароля)" value={regSecretWord} onChange={(e) => setRegSecretWord(e.target.value)} />
              <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: -6 }}>Придумайте слово, которое легко запомните — оно понадобится, если забудете пароль и не будет под рукой QR-кода.</div>
              {authError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{authError}</div>}
              <button className="btn btn-accent" disabled={authBusy} onClick={doRegister}>{t("register")}</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recoverStep === "scan" ? (
                <>
                  <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 2 }}>Чтобы задать новый пароль без участия администратора, сначала подтвердите, что это вы.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn" style={{ flex: 1, padding: "6px 10px", fontSize: 12, background: recoverMethod === "qr" ? "var(--accent)" : "var(--surface)", color: recoverMethod === "qr" ? "#1a1a1a" : "var(--text)" }} onClick={() => { setRecoverMethod("qr"); setAuthError(""); }}>По QR-коду</button>
                    <button className="btn" style={{ flex: 1, padding: "6px 10px", fontSize: 12, background: recoverMethod === "secret" ? "var(--accent)" : "var(--surface)", color: recoverMethod === "secret" ? "#1a1a1a" : "var(--text)" }} onClick={() => { setRecoverMethod("secret"); setAuthError(""); }}>По секретному слову</button>
                  </div>
                  {recoverMethod === "qr" ? (
                    <>
                      <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Отсканируйте (или вставьте) свой личный QR-код — тот же, что используете для входа.</div>
                      <input autoFocus placeholder="Отсканируйте QR..." value={recoverQrInput} onChange={(e) => setRecoverQrInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRecoverScan()} />
                      {authError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{authError}</div>}
                      <button className="btn btn-accent" onClick={doRecoverScan}>Подтвердить QR-кодом</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Введите свой логин и секретное слово, которое указывали при регистрации.</div>
                      <input autoFocus placeholder={t("login")} value={recoverUsername} onChange={(e) => setRecoverUsername(e.target.value)} />
                      <input placeholder="Секретное слово" value={recoverSecretWord} onChange={(e) => setRecoverSecretWord(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRecoverBySecret()} />
                      {authError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{authError}</div>}
                      <button className="btn btn-accent" onClick={doRecoverBySecret}>Подтвердить секретным словом</button>
                    </>
                  )}
                  <div style={{ fontSize: 11, color: "var(--muted-2)" }}>Ни QR, ни секретного слова нет под рукой? Обратитесь к администратору — он сможет сбросить пароль вручную.</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "var(--text)" }}>Личность подтверждена — {recoverName}. Задайте новый пароль:</div>
                  <input type="password" autoFocus placeholder={t("password")} value={recoverPassword} onChange={(e) => setRecoverPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRecoverSubmit()} />
                  <input type="password" placeholder={t("confirmPassword")} value={recoverPassword2} onChange={(e) => setRecoverPassword2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRecoverSubmit()} />
                  {authError && <div style={{ color: "var(--danger)", fontSize: 13 }}>{authError}</div>}
                  <button className="btn btn-accent" disabled={authBusy} onClick={doRecoverSubmit}>Сохранить новый пароль и войти</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
}
