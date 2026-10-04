// Сотрудник: вкладки «Остатки» и «Чат».
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { PACKAGING_TYPES, buildPackagingSkuName, getMultiplicity } from "../lib/helpers.js";
import { ChatAudio, ChatMediaCard, ChatProductCard } from "../ui/components.jsx";

export function EmployeeStock(ctx) {
  const {
    addPackagingStock, addToPurchaseRequest, createPackagingMaterial, downloadStockImportTemplate,
    editPackagingMaterial, exportPurchaseRequestToExcel, exportStockToExcel, filteredStock, fulfillPurchaseRequest,
    importStockFromExcel, packagingMaterials, packagingPurchaseRequest, printPurchaseRequest, productsByMaterial,
    purchaseAddFor, purchaseAddVal, removeFromPurchaseRequest, setMaterialLinkModal, setPurchaseAddFor,
    setPurchaseAddVal, setStockAddAmountFor, setStockAddAmountVal, setStockAddingNew, setStockEditId,
    setStockEditMultiplicity, setStockEditSize, setStockEditType, setStockNewSize, setStockNewStock, setStockNewType,
    setStockSearch, setStockSizeFilter, stockAddAmountFor, stockAddAmountVal, stockAddingNew, stockEditId,
    stockEditMultiplicity, stockEditSize, stockEditType, stockNewSize, stockNewStock, stockNewType, stockSearch,
    stockSizeFilter, stockSortDir, stockSortMode, toggleStockSort, updatePurchaseRequestQty,
  } = ctx;
  return (
      <div>
        <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Остатки упаковки ({packagingMaterials.length})</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 16, flexWrap: "wrap", paddingBottom: 16, borderBottom: "1px solid var(--surface-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={exportStockToExcel}>Экспорт в Excel</button>
            <label className="btn" style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
              Импорт из Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importStockFromExcel(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={downloadStockImportTemplate}>Скачать шаблон</button>
          </div>
          <button className="btn btn-accent" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setStockAddingNew(!stockAddingNew)}>{stockAddingNew ? "Отмена" : "+ Добавить упаковку"}</button>
        </div>

        {stockAddingNew && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 16, maxWidth: 420, display: "flex", flexDirection: "column", gap: 8 }}>
            <select value={stockNewType} onChange={(e) => setStockNewType(e.target.value)}>
              {PACKAGING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input placeholder="Размер, например 35х40" value={stockNewSize} onChange={(e) => setStockNewSize(e.target.value)} />
            <input type="text" inputMode="numeric" placeholder="Начальный остаток (необязательно)" value={stockNewStock} onChange={(e) => setStockNewStock(e.target.value)} />
            <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
              Будет создано: {buildPackagingSkuName(stockNewType, stockNewSize || "…").name} (арт. {buildPackagingSkuName(stockNewType, stockNewSize || "…").sku})
            </div>
            <button className="btn btn-accent" style={{ padding: "6px 14px" }} onClick={async () => {
              const material = await createPackagingMaterial(stockNewType, stockNewSize, stockNewStock);
              if (material) { setStockAddingNew(false); setStockNewSize(""); setStockNewStock(""); }
            }}>Создать</button>
          </div>
        )}

        {packagingPurchaseRequest.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📝 Заявка на закупку упаковки ({packagingPurchaseRequest.length} поз.)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {packagingPurchaseRequest.map((r) => {
                const m = packagingMaterials.find((x) => x.id === r.materialId);
                return (
                  <div key={r.materialId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                    <span>{m ? m.name : "?"} <span className="mono" style={{ opacity: 0.7 }}>· арт. {m ? m.sku : "?"}</span></span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="text" inputMode="numeric" value={r.qty} onChange={(e) => updatePurchaseRequestQty(r.materialId, e.target.value)} style={{ width: 70, padding: "3px 6px" }} />
                      <button className="btn btn-danger" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => removeFromPurchaseRequest(r.materialId)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={exportPurchaseRequestToExcel}>Экспорт в Excel</button>
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={printPurchaseRequest}>Экспорт в PDF</button>
              <button className="btn btn-accent" style={{ padding: "6px 12px", fontSize: 12 }} onClick={fulfillPurchaseRequest}>Оформить заявку (пополнить остатки)</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} placeholder="Поиск по артикулу, названию, размеру..." style={{ flex: 1, minWidth: 220 }} />
          <input value={stockSizeFilter} onChange={(e) => setStockSizeFilter(e.target.value)} placeholder="Фильтр по размеру, напр. 35х40" style={{ width: 200 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>Сортировка:</span>
          {[["sku", "По артикулу"], ["name", "По названию"], ["size", "По размеру"], ["stock", "По остатку"]].map(([k, label]) => (
            <button key={k} className="btn" style={{ padding: "4px 10px", fontSize: 12, background: stockSortMode === k ? "var(--accent)" : "var(--surface)", color: stockSortMode === k ? "#1a1a1a" : "var(--text)" }} onClick={() => toggleStockSort(k)}>{label}{stockSortMode === k ? (stockSortDir === "asc" ? " ↑" : " ↓") : ""}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredStock.length === 0 && <div style={{ fontSize: 13, color: "var(--muted-2)" }}>Упаковок пока нет.</div>}
          {filteredStock.map((m) => (
            <div key={m.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
              {stockEditId === m.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
                  <select value={stockEditType} onChange={(e) => setStockEditType(e.target.value)}>
                    {PACKAGING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <input value={stockEditSize} onChange={(e) => setStockEditSize(e.target.value)} placeholder="Размер" />
                  <input type="text" inputMode="numeric" value={stockEditMultiplicity} onChange={(e) => setStockEditMultiplicity(e.target.value)} placeholder="Кратность (напр. 100 или 1000)" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-accent" style={{ padding: "4px 10px", fontSize: 11 }} onClick={async () => { await editPackagingMaterial(m.id, stockEditType, stockEditSize, stockEditMultiplicity); setStockEditId(null); }}>Сохранить</button>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setStockEditId(null)}>Отмена</button>
                  </div>
                </div>
              ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14 }}>{m.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>арт. {m.sku} · размер {m.size} · кратность {getMultiplicity(m)} · остаток: <span style={{ color: m.stock > 0 ? "var(--text)" : "var(--danger)", fontWeight: 600 }}>{m.stock}</span> · {(productsByMaterial[m.id] || []).length > 0 ? `товаров: ${productsByMaterial[m.id].length}` : "к товарам не привязана"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {stockAddAmountFor === m.id ? (
                    <>
                      <input type="text" inputMode="numeric" value={stockAddAmountVal} onChange={(e) => setStockAddAmountVal(e.target.value)} placeholder="Кол-во" style={{ width: 90 }} />
                      <button className="btn btn-accent" style={{ padding: "4px 10px", fontSize: 11 }} onClick={async () => { await addPackagingStock(m.id, parseInt(stockAddAmountVal) || 0); setStockAddAmountFor(null); setStockAddAmountVal(""); }}>ОК</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setStockAddAmountFor(null)}>✕</button>
                    </>
                  ) : (
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setStockAddAmountFor(m.id); setStockAddAmountVal(""); }}>+ Пополнить</button>
                  )}
                  {purchaseAddFor === m.id ? (
                    <>
                      <input type="text" inputMode="numeric" value={purchaseAddVal} onChange={(e) => setPurchaseAddVal(e.target.value)} placeholder="Кол-во" style={{ width: 90 }} />
                      <button className="btn btn-accent" style={{ padding: "4px 10px", fontSize: 11 }} onClick={async () => { await addToPurchaseRequest(m.id, purchaseAddVal); setPurchaseAddFor(null); setPurchaseAddVal(""); }}>ОК</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setPurchaseAddFor(null)}>✕</button>
                    </>
                  ) : (
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setPurchaseAddFor(m.id); setPurchaseAddVal(""); }}>📝 В заявку</button>
                  )}
                  <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setMaterialLinkModal({ material: m, query: "" })}>🔗 Товары{(productsByMaterial[m.id] || []).length > 0 ? ` (${productsByMaterial[m.id].length})` : ""}</button>
                  <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setStockEditId(m.id); setStockEditType(m.type); setStockEditSize(m.size); setStockEditMultiplicity(String(getMultiplicity(m))); }}>✎</button>
                </div>
              </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
}

export function EmployeeChat(ctx) {
  const {
    catalog, chatActiveThread, chatHasOlder, chatInput, chatMessagesInActiveThread, chatReadStatus,
    chatRecordSeconds, chatRecording, chatUnreadByThread, chatUserName, currentUser, deleteChatMessage,
    employeeQuickReplies, getProductImage, loadOlderChat, markChatThreadRead, sendChatMessage, setChatActiveThread,
    setChatAttachOpen, setChatInput, setChatMediaOpen, setLightbox, showChatReadReceipts, startVoiceRecording,
    stopVoiceRecording,
  } = ctx;
  return (
      <div className="chat-layout" style={{ flexDirection: "column", maxWidth: 600 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button className="btn" style={{ padding: "6px 14px", fontSize: 13, background: chatActiveThread === "all" ? "var(--accent)" : "var(--surface)", color: chatActiveThread === "all" ? "#1a1a1a" : "var(--text)", position: "relative" }}
            onClick={() => { setChatActiveThread("all"); markChatThreadRead("all"); }}>
            Общий чат
            {chatUnreadByThread["all"] > 0 && <span className="mono" style={{ marginLeft: 6, fontSize: 10, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{chatUnreadByThread["all"]}</span>}
          </button>
          <button className="btn" style={{ padding: "6px 14px", fontSize: 13, background: chatActiveThread === currentUser.id ? "var(--accent)" : "var(--surface)", color: chatActiveThread === currentUser.id ? "#1a1a1a" : "var(--text)" }}
            onClick={() => { setChatActiveThread(currentUser.id); markChatThreadRead(currentUser.id); }}>
            Чат с администрацией
            {chatUnreadByThread[currentUser.id] > 0 && <span className="mono" style={{ marginLeft: 6, fontSize: 10, background: "var(--danger)", color: "#fff", borderRadius: 999, padding: "1px 6px" }}>{chatUnreadByThread[currentUser.id]}</span>}
          </button>
        </div>
        <div className="chat-panel" style={{ display: "flex", flexDirection: "column", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
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
          {employeeQuickReplies.length > 0 && (
            <div style={{ padding: "8px 12px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {employeeQuickReplies.map((qr, i) => (
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
