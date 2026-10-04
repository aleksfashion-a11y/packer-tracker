// Общие окна: просмотр фото, прикрепление товара в чате, печать.
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { fmtDate } from "../lib/helpers.js";
import { LightboxImage, ProductThumb } from "../ui/components.jsx";

export function LightboxModal(ctx) {
  const {
    lightbox, lightboxTouchRef, setLightbox,
  } = ctx;
  return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, flexDirection: "column", padding: 20, touchAction: "none", overscrollBehavior: "contain" }}
        onClick={() => setLightbox(null)}
        onTouchStart={(e) => { e.stopPropagation(); lightboxTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchMove={(e) => { e.stopPropagation(); if (lightboxTouchRef.current) e.preventDefault(); }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          const start = lightboxTouchRef.current;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          lightboxTouchRef.current = null;
          if (Math.abs(dx) < 40 && Math.abs(dy) < 40) return; // клик, не свайп
          if (Math.abs(dy) > Math.abs(dx)) {
            // свайп вверх/вниз — закрыть
            setLightbox(null);
          } else if (lightbox.images.length > 1) {
            // свайп влево/вправо — листать
            setLightbox((l) => ({ ...l, index: dx < 0 ? (l.index + 1) % l.images.length : (l.index - 1 + l.images.length) % l.images.length }));
          }
        }}>
        <div style={{ fontSize: 14, color: "#fff", marginBottom: 12, textAlign: "center" }}>{lightbox.name} · {lightbox.index + 1}/{lightbox.images.length}</div>
        <LightboxImage src={lightbox.images[lightbox.index]} onStop={(e) => e.stopPropagation()} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }} onClick={(e) => e.stopPropagation()}>
          {lightbox.images.length > 1 && (
            <button className="btn" onClick={() => setLightbox((l) => ({ ...l, index: (l.index - 1 + l.images.length) % l.images.length }))}>← Назад</button>
          )}
          {lightbox.images.length > 1 && (
            <button className="btn" onClick={() => setLightbox((l) => ({ ...l, index: (l.index + 1) % l.images.length }))}>Вперёд →</button>
          )}
          <button className="btn btn-accent" onClick={() => setLightbox(null)}>Закрыть</button>
        </div>
      </div>
    );
}

export function ChatAttachModal(ctx) {
  const {
    chatActiveThread, chatAttachQuery, chatAttachResults, chatInput, getProductImage, sendChatMessage,
    setChatAttachOpen, setChatAttachQuery, setChatInput,
  } = ctx;
  return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }} onClick={() => { setChatAttachOpen(false); setChatAttachQuery(""); }}>
        <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, width: "100%", maxWidth: 420, maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Прикрепить товар к сообщению</div>
          <input autoFocus value={chatAttachQuery} onChange={(e) => setChatAttachQuery(e.target.value)} placeholder="Найти товар по названию или артикулу..." style={{ marginBottom: 10 }} />
          <div style={{ overflowY: "auto", flex: 1 }}>
            {chatAttachResults.length === 0 && <div style={{ fontSize: 13, color: "var(--muted-2)", padding: "12px 0" }}>Ничего не найдено.</div>}
            {chatAttachResults.map((p) => {
              const img = getProductImage(p.sku);
              return (
                <div key={p.sku} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--surface-2)", cursor: "pointer" }}
                  onClick={() => { sendChatMessage(chatActiveThread, chatInput, p.sku); setChatInput(""); setChatAttachOpen(false); setChatAttachQuery(""); }}>
                  {img && img.main ? <ProductThumb src={img.main} size={36} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--surface-2)", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>арт. {p.sku}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => { setChatAttachOpen(false); setChatAttachQuery(""); }}>Отмена</button>
        </div>
      </div>
    );
}

export function PrintView(ctx) {
  const {
    money, packagingMaterials, printData,
  } = ctx;
  return (
      <div id="print-payslip">
        {printData.type === "purchaseRequest" ? (
          <>
            <h1>Заявка на закупку упаковки</h1>
            <div className="print-sub">Сформировано {new Date().toLocaleDateString("ru-RU")} · {printData.rows.length} позиций</div>
            <table>
              <thead><tr><th>Артикул</th><th>Название</th><th>Количество</th></tr></thead>
              <tbody>
                {printData.rows.map((r) => {
                  const m = packagingMaterials.find((x) => x.id === r.materialId);
                  return (
                    <tr key={r.materialId}>
                      <td>{m ? m.sku : "?"}</td>
                      <td>{m ? m.name : "?"}</td>
                      <td>{r.qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : printData.type === "catalog" ? (
          <>
            <h1>Каталог — стоимость упаковки</h1>
            <div className="print-sub">Сформировано {new Date().toLocaleDateString("ru-RU")} · {printData.rows.length} товаров</div>
            <table>
              <thead><tr><th>Артикул</th><th>Название</th><th>Вариант</th><th>Цена упаковки</th></tr></thead>
              <tbody>
                {printData.rows.map((r) => r.opts.map((o) => (
                  <tr key={o.id}>
                    <td>{r.product.sku}</td>
                    <td>{r.product.name}</td>
                    <td>{o.label}</td>
                    <td>{money(o.price)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </>
        ) : printData.type === "all" ? (
          <>
            <h1>Расчётный лист — все сотрудники</h1>
            <div className="print-sub">Период: {fmtDate(printData.periodFrom)} — {fmtDate(printData.periodTo)} · сформировано {new Date().toLocaleDateString("ru-RU")}</div>
            <table>
              <thead><tr><th>Сотрудник</th><th>Штук всего</th><th>Сдельная</th><th>Часы</th><th>Почасовая</th><th>Итого</th></tr></thead>
              <tbody>
                {printData.rows.map((row) => (
                  <tr key={row.emp.id}>
                    <td>{row.emp.name}</td>
                    <td>{row.totalPieces}</td>
                    <td>{money(row.piece)}</td>
                    <td>{row.totalHours}</td>
                    <td>{money(row.hour)}</td>
                    <td>{money(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <>
            <h1>Расчётный лист — {printData.row.emp.name}</h1>
            <div className="print-sub">Период: {fmtDate(printData.periodFrom)} — {fmtDate(printData.periodTo)} · сформировано {new Date().toLocaleDateString("ru-RU")}</div>
            <table>
              <tbody>
                <tr><td>Упаковано, шт.</td><td>{printData.row.totalPieces}</td></tr>
                <tr><td>Сдельная оплата</td><td>{money(printData.row.piece)}</td></tr>
                <tr><td>Отработано часов</td><td>{printData.row.totalHours}</td></tr>
                <tr><td>Почасовая оплата</td><td>{money(printData.row.hour)}</td></tr>
                <tr><td><b>Итого к выплате</b></td><td><b>{money(printData.row.total)}</b></td></tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    );
}
