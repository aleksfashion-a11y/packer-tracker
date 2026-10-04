// Администратор: вкладки «Объявления» и «Чат».
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { ChatAudio, ChatMediaCard, ChatProductCard } from "../ui/components.jsx";

export function AdminMessages(ctx) {
  const {
    deleteMessage, employees, messages, msgTarget, msgText, sendMessage, setMsgTarget, setMsgText,
  } = ctx;
  return (
      <div>
        <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Новое объявление</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 24, maxWidth: 500 }}>
          <select value={msgTarget} onChange={(e) => setMsgTarget(e.target.value)} style={{ marginBottom: 10, width: "100%" }}>
            <option value="all">Всем сотрудникам</option>
            {employees.map((e) => <option key={e.id} value={e.id}>Только: {e.name}</option>)}
          </select>
          <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Текст объявления..." rows={3}
            style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: 10, fontFamily: "'Inter', sans-serif", fontSize: 14, marginBottom: 10, resize: "vertical" }} />
          <button className="btn btn-accent" onClick={() => { sendMessage(msgText, msgTarget === "all" ? null : msgTarget); setMsgText(""); }}>Отправить</button>
        </div>

        <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Отправленные</div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, maxWidth: 500 }}>
          {messages.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--muted-2)" }}>Пока ничего не отправлено.</div>
          ) : [...messages].sort((a, b) => b.timestamp - a.timestamp).map((m) => {
            const target = m.toEmployeeId ? (employees.find((e) => e.id === m.toEmployeeId) || {}).name || "?" : "Всем";
            const audience = m.toEmployeeId ? employees.filter((e) => e.id === m.toEmployeeId) : employees;
            const readNames = audience.filter((e) => m.readBy.includes(e.id));
            const unreadNames = audience.filter((e) => !m.readBy.includes(e.id));
            return (
              <div key={m.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--surface-2)" }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>{m.text}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <span>Кому: {target} · {new Date(m.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <button className="btn btn-danger" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => deleteMessage(m.id)}>Удалить</button>
                </div>
                {audience.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="mono" style={{ cursor: "pointer", fontSize: 11, color: "var(--accent)" }}>
                      Прочитали {readNames.length}/{audience.length}
                    </summary>
                    <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {readNames.map((e) => (
                        <span key={e.id} className="mono" style={{ fontSize: 10, background: "rgba(90,200,120,0.15)", color: "#5ac878", border: "1px solid #5ac878", borderRadius: 999, padding: "2px 8px" }}>✓ {e.name}</span>
                      ))}
                      {unreadNames.map((e) => (
                        <span key={e.id} className="mono" style={{ fontSize: 10, background: "var(--surface-2)", color: "var(--muted-2)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" }}>{e.name}</span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
}

export function AdminChat(ctx) {
  const {
    adminQuickReplies, catalog, chatActiveThread, chatHasOlder, chatInput, chatMessagesInActiveThread,
    chatReadStatus, chatRecordSeconds, chatRecording, chatUnreadByThread, chatUserName, currentUser,
    deleteChatMessage, employees, getProductImage, loadOlderChat, markChatThreadRead, sendChatMessage,
    setChatActiveThread, setChatAttachOpen, setChatInput, setChatMediaOpen, setLightbox, showChatReadReceipts,
    startVoiceRecording, stopVoiceRecording,
  } = ctx;
  return (
      <div className="chat-layout">
        <div className="chat-threads" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflowY: "auto" }}>
          <button onClick={() => { setChatActiveThread("all"); markChatThreadRead("all"); }}
            style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: chatActiveThread === "all" ? "var(--surface-2)" : "none", border: "none", borderBottom: "1px solid var(--surface-2)", cursor: "pointer", color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>💬 Общий чат</span>
            {chatUnreadByThread["all"] > 0 && <span className="mono" style={{ fontSize: 10, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{chatUnreadByThread["all"]}</span>}
          </button>
          {employees.map((e) => (
            <button key={e.id} onClick={() => { setChatActiveThread(e.id); markChatThreadRead(e.id); }}
              style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: chatActiveThread === e.id ? "var(--surface-2)" : "none", border: "none", borderBottom: "1px solid var(--surface-2)", cursor: "pointer", color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
              {chatUnreadByThread[e.id] > 0 && <span className="mono" style={{ fontSize: 10, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 6px", flexShrink: 0, marginLeft: 6 }}>{chatUnreadByThread[e.id]}</span>}
            </button>
          ))}
          {employees.length === 0 && <div style={{ padding: 14, fontSize: 12, color: "var(--muted-2)" }}>Пока нет сотрудников.</div>}
        </div>
        <div className="chat-panel" style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--surface-2)", fontWeight: 600, fontSize: 14 }}>
            {chatActiveThread === "all" ? "Общий чат (видят все сотрудники)" : chatUserName(chatActiveThread)}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {chatHasOlder && <button className="btn" style={{ alignSelf: "center", padding: "4px 12px", fontSize: 12 }} onClick={loadOlderChat}>Показать более ранние сообщения</button>}
            {chatMessagesInActiveThread.length === 0 && <div style={{ fontSize: 13, color: "var(--muted-2)" }}>{chatHasOlder ? "За последнее время сообщений нет." : "Сообщений пока нет."}</div>}
            {chatMessagesInActiveThread.map((m) => {
              const mine = m.from === currentUser.id;
              return (
                <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                  {!mine && <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)", marginBottom: 2 }}>{chatUserName(m.from)}</div>}
                  {m.attachedSku != null && <ChatProductCard sku={m.attachedSku} catalog={catalog} getProductImage={getProductImage} setLightbox={setLightbox} />}
                  {m.media && <ChatMediaCard media={m.media} setLightbox={setLightbox} />}
                  {m.audio && <ChatAudio message={m} />}
                  {m.text && (
                    <div style={{ background: mine ? "var(--accent)" : "var(--surface-2)", color: mine ? "#1a1a1a" : "var(--text)", padding: "8px 12px", borderRadius: 12, fontSize: 13, wordBreak: "break-word", marginTop: m.attachedSku != null ? 4 : 0 }}>
                      {m.text}
                    </div>
                  )}
                  <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 2, textAlign: mine ? "right" : "left" }}>
                    {new Date(m.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {mine && showChatReadReceipts && <span title={chatReadStatus(m).label} style={{ marginLeft: 6, cursor: "default", opacity: chatReadStatus(m).read ? 1 : 0.4 }}>✓</span>}
                    {(mine || currentUser.role === "admin") && <button onClick={() => deleteChatMessage(m.id)} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--muted-2)", cursor: "pointer", padding: 0, fontSize: 10, textDecoration: "underline" }}>удалить</button>}
                  </div>
                </div>
              );
            })}
          </div>
          {adminQuickReplies.length > 0 && (
            <div style={{ padding: "8px 12px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {adminQuickReplies.map((qr, i) => (
                <button key={i} className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => sendChatMessage(chatActiveThread, qr)}>{qr}</button>
              ))}
            </div>
          )}
          <div className="chat-input-row">
            <button className="btn chat-icon-btn" onClick={() => setChatAttachOpen(true)} title="Прикрепить товар">📎</button>
            <button className="btn chat-icon-btn" onClick={() => setChatMediaOpen(true)} title="Фото или видео по ссылке">🖼️</button>
            <button className="btn chat-icon-btn" style={{ borderColor: chatRecording ? "var(--danger)" : undefined, color: chatRecording ? "var(--danger)" : undefined }}
              onClick={() => (chatRecording ? stopVoiceRecording() : startVoiceRecording())} title="Голосовое сообщение">
              {chatRecording ? `⏹${chatRecordSeconds}с` : "🎤"}
            </button>
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && chatInput.trim()) { sendChatMessage(chatActiveThread, chatInput); setChatInput(""); } }}
              placeholder="Написать сообщение..." style={{ flex: 1, minWidth: 0 }} />
            <button className="btn btn-accent" style={{ flexShrink: 0 }} onClick={() => { if (chatInput.trim()) { sendChatMessage(chatActiveThread, chatInput); setChatInput(""); } }}>Отправить</button>
          </div>
        </div>
      </div>
    );
}
