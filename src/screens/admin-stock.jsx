// Администратор: вкладка «Остатки» — упаковочные материалы.
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { PACKAGING_TYPES, buildPackagingSkuName, getMultiplicity } from "../lib/helpers.js";

export function AdminStock(ctx) {
  const {
    renderStockLastOp, renderStockOps,
    addPackagingStock, addToPurchaseRequest, createPackagingMaterial, downloadStockImportTemplate,
    editPackagingMaterial, exportPurchaseRequestToExcel, exportStockToExcel, filteredStock, fulfillPurchaseRequest,
    importStockFromExcel, isAdmin, packagingMaterials, packagingPurchaseRequest, printPurchaseRequest,
    productsByMaterial, purchaseAddFor, purchaseAddVal, removeFromPurchaseRequest, removePackagingMaterial,
    setMaterialLinkModal, setPurchaseAddFor, setPurchaseAddVal, setStockAddAmountFor, setStockAddAmountVal,
    setStockAddingNew, setStockEditId, setStockEditMultiplicity, setStockEditSize, setStockEditType, setStockNewSize,
    setStockNewStock, setStockNewType, setStockSearch, setStockSizeFilter, startSupplyReconcile, stockAddAmountFor,
    stockAddAmountVal, stockAddingNew, stockEditId, stockEditMultiplicity, stockEditSize, stockEditType,
    stockNewSize, stockNewStock, stockNewType, stockSearch, stockSizeFilter, stockSortDir, stockSortMode,
    toggleStockSort, updatePurchaseRequestQty,
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
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 4px" }} />
            <label className="btn" style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
              📦 Сверить с поставкой товаров
              <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) startSupplyReconcile(e.target.files[0]); e.target.value = ""; }} />
            </label>
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
                    {renderStockLastOp(m)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {renderStockOps(m)}
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
                    {isAdmin && (
                      <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removePackagingMaterial(m.id)}>Удалить</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
}
