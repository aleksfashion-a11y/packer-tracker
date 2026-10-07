// Администратор: вкладка «Товары» — каталог, цены, фото, привязка упаковки.
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { ProductThumb, SearchModeToggle } from "../ui/components.jsx";

export function AdminProducts(ctx) {
  const {
    addPackagingOption, addProduct, addingOptionSku, addingProduct, catalog, catalogEditBarcodes, catalogEditName,
    catalogEditSku, catalogEditSkuValue, catalogSortMode, exportCatalogToExcel, fuzzyResults, getProductImage,
    imageEditGalleryVal, imageEditSku, imageEditVal, importCatalogFromExcel, importImagesFromExcel, importReport,
    mergeDuplicateOptions, money, newOptionLabel, newOptionPrice, newProductBarcodes, newProductError,
    newProductName, newProductSku, optionsForSku, persistPriceHistory, priceEditLabelVal, priceEditOptionId,
    priceEditVal, priceHistory, printCatalog, removePackagingOption, removeProduct, renderProductPackaging,
    saveOptionEdit, saveProductEdit, search, searchMode, searchResults, setAddingOptionSku, setAddingProduct,
    setCatalogEditBarcodes, setCatalogEditName, setCatalogEditSku, setCatalogEditSkuValue, setCatalogSortMode,
    setImageEditGalleryVal, setImageEditSku, setImageEditVal, setImportReport, setLightbox, setNewOptionLabel,
    setNewOptionPrice, setNewProductBarcodes, setNewProductError, setNewProductName, setNewProductSku,
    setPriceEditLabelVal, setPriceEditOptionId, setPriceEditVal, setProductImage, setSearch, setSearchMode,
    setShowFuzzy, showFuzzy, sortedCatalog,
  } = ctx;
  return (
      <div>
        <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Цены товаров ({catalog.length})</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 6, flexWrap: "wrap", paddingBottom: 16, borderBottom: "1px solid var(--surface-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label className="btn" style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
              Импорт каталога (Excel)
              <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importCatalogFromExcel(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={exportCatalogToExcel}>Экспорт в Excel</button>
            <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={printCatalog}>Печать / PDF</button>
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 4px" }} />
            <label className="btn" style={{ padding: "6px 14px", fontSize: 12, cursor: "pointer" }}>
              Импорт фото из Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importImagesFromExcel(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
          <button className="btn btn-accent" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => { setAddingProduct((v) => !v); setNewProductError(""); }}>{addingProduct ? "Отмена" : "+ Добавить товар"}</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 18 }}>
          Для «Импорт фото из Excel» — файл выгрузки Ozon (со столбцами «Артикул», «Ссылка на главное фото», «Ссылки на дополнительные фото»); фото подставятся автоматически по совпадению артикула.
        </div>

        {importReport && (importReport.skippedRows.length > 0 || importReport.noBarcodeProducts.length > 0) && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 14, maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Отчёт по последнему импорту: добавлено {importReport.added}, обновлено {importReport.updated}
                {importReport.skippedRows.length > 0 && `, пропущено строк без артикула: ${importReport.skippedRows.length}`}
                {importReport.noBarcodeProducts.length > 0 && `, товаров без штрихкода: ${importReport.noBarcodeProducts.length}`}
              </div>
              <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setImportReport(null)}>✕</button>
            </div>
            {importReport.skippedRows.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>Показать пропущенные строки (без артикула)</summary>
                <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
                  {importReport.skippedRows.map((r, i) => (
                    <div key={i} className="mono" style={{ fontSize: 11, color: "var(--muted-2)", padding: "3px 0" }}>Строка {r.row}: {r.name}</div>
                  ))}
                </div>
              </details>
            )}
            {importReport.noBarcodeProducts.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>Показать товары без штрихкода</summary>
                <div style={{ marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
                  {importReport.noBarcodeProducts.map((p) => (
                    <div key={p.sku} className="mono" style={{ fontSize: 11, color: "var(--muted-2)", padding: "3px 0" }}>арт. {p.sku} — {p.name}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        {addingProduct && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 14, maxWidth: 460, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Новый товар</div>
            <input placeholder="Артикул" className="mono" value={newProductSku} onChange={(e) => setNewProductSku(e.target.value)} />
            <input placeholder="Название товара" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} />
            <textarea placeholder="Штрихкоды — по одному на строку (необязательно)" value={newProductBarcodes} onChange={(e) => setNewProductBarcodes(e.target.value)} rows={2}
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: 8, fontFamily: "'Inter', sans-serif", fontSize: 13, resize: "vertical" }} />
            {newProductError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{newProductError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" style={{ padding: "6px 14px" }} onClick={addProduct}>Сохранить</button>
              <button className="btn" style={{ padding: "6px 14px" }} onClick={() => setAddingProduct(false)}>Отмена</button>
            </div>
          </div>
        )}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар для установки цены..." style={{ width: "100%", padding: "10px 12px", marginBottom: 8, maxWidth: 460 }} />
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <SearchModeToggle mode={searchMode} onChange={setSearchMode} />
          {!search.trim() && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--muted-2)" }}>Сортировка:</span>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12, background: catalogSortMode === "sku" ? "var(--accent)" : "var(--surface)", color: catalogSortMode === "sku" ? "#1a1a1a" : "var(--text)" }} onClick={() => setCatalogSortMode("sku")}>По артикулу</button>
              <button className="btn" style={{ padding: "4px 10px", fontSize: 12, background: catalogSortMode === "name" ? "var(--accent)" : "var(--surface)", color: catalogSortMode === "name" ? "#1a1a1a" : "var(--text)" }} onClick={() => setCatalogSortMode("name")}>По названию</button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {search.trim() && searchResults.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              <div style={{ marginBottom: showFuzzy || fuzzyResults.length === 0 ? 0 : 10 }}>Ничего не найдено</div>
              {!showFuzzy && fuzzyResults.length > 0 && (
                <button className="btn" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setShowFuzzy(true)}>Показать похожие номера ({fuzzyResults.length})</button>
              )}
            </div>
          ) : (search.trim() ? searchResults : sortedCatalog.slice(0, 40)).map((p) => {
            const opts = optionsForSku(p.sku);
            const hasDuplicates = opts.length !== new Set(opts.map((o) => o.price)).size;
            const img = getProductImage(p.sku);
            return (
              <div key={p.sku} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px" }}>
                {catalogEditSku === p.sku ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 380 }}>
                    <input placeholder="Артикул" className="mono" value={catalogEditSkuValue} onChange={(e) => setCatalogEditSkuValue(e.target.value)} style={{ fontSize: 13 }} />
                    <input placeholder="Название товара" value={catalogEditName} onChange={(e) => setCatalogEditName(e.target.value)} style={{ fontSize: 13 }} />
                    <textarea placeholder="Штрихкоды — по одному на строку" value={catalogEditBarcodes} onChange={(e) => setCatalogEditBarcodes(e.target.value)} rows={2}
                      style={{ background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-accent" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => saveProductEdit(p.sku)}>Сохранить</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setCatalogEditSku(null)}>Отмена</button>
                      <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removeProduct(p.sku)}>Удалить товар</button>
                    </div>
                  </div>
                ) : imageEditSku === p.sku ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 380 }}>
                    <div style={{ fontSize: 13, marginBottom: 2 }}>{p.name}</div>
                    <input placeholder="Ссылка на главное фото" value={imageEditVal} onChange={(e) => setImageEditVal(e.target.value)} style={{ fontSize: 12 }} />
                    <textarea placeholder="Доп. фото — по одной ссылке на строку" value={imageEditGalleryVal} onChange={(e) => setImageEditGalleryVal(e.target.value)} rows={2}
                      style={{ background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, resize: "vertical" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-accent" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { setProductImage(p.sku, imageEditVal, imageEditGalleryVal.split("\n")); setImageEditSku(null); }}>Сохранить</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setImageEditSku(null)}>Отмена</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {img && img.main && <ProductThumb src={img.main} size={34} onClick={() => setLightbox({ images: [img.main, ...img.gallery], index: 0, name: p.name })} />}
                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13 }}>{p.name}</span>
                        {p.msDeleted && <span className="mono" style={{ fontSize: 10, color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: 4, padding: "0 5px" }} title="Товар удалён в «Моём складе»: сотрудникам он больше не показывается, записи по нему сохранены">удалён в «Моём складе»</span>}
                        <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>· арт. {p.sku}{img && img.gallery.length > 0 ? ` · ещё ${img.gallery.length} фото` : ""}</span>
                        <button className="btn" style={{ padding: "2px 6px", fontSize: 10 }} onClick={() => { setCatalogEditSku(p.sku); setCatalogEditSkuValue(String(p.sku)); setCatalogEditName(p.name); setCatalogEditBarcodes((p.barcodes || []).join("\n")); }}>✎</button>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => { setImageEditSku(p.sku); setImageEditVal(img ? img.main : ""); setImageEditGalleryVal(img ? img.gallery.join("\n") : ""); }}>
                        {img ? "Фото" : "+ фото"}
                      </button>
                      <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 2px" }} />
                      {renderProductPackaging(p)}
                      <span style={{ width: 1, alignSelf: "stretch", background: "var(--border)", margin: "0 2px" }} />
                      {opts.length === 0 && <span style={{ fontSize: 12, color: "var(--muted-2)" }}>Цена не задана</span>}
                      {opts.map((opt) => (
                        priceEditOptionId === opt.id ? (
                          <span key={opt.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input placeholder="Название" value={priceEditLabelVal} onChange={(e) => setPriceEditLabelVal(e.target.value)} style={{ width: 100, padding: "3px 6px" }} />
                            <input className="mono" autoFocus value={priceEditVal} onChange={(e) => setPriceEditVal(e.target.value)} style={{ width: 60, padding: "3px 6px" }} />
                            <button className="btn btn-accent" style={{ padding: "3px 8px" }} onClick={() => saveOptionEdit(opt.id)}>OK</button>
                          </span>
                        ) : (
                          <span key={opt.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                            <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => { setPriceEditOptionId(opt.id); setPriceEditVal(String(opt.price || "")); setPriceEditLabelVal(opt.label || ""); }}>
                              {money(opt.price)}
                            </button>
                            <button className="btn btn-danger" style={{ padding: "3px 6px" }} onClick={() => removePackagingOption(opt.id)}>✕</button>
                          </span>
                        )
                      ))}
                      {addingOptionSku === p.sku ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input placeholder="Название (необяз.)" value={newOptionLabel} onChange={(e) => setNewOptionLabel(e.target.value)} style={{ width: 120, padding: "3px 6px" }} />
                          <input className="mono" placeholder="Цена" value={newOptionPrice} onChange={(e) => setNewOptionPrice(e.target.value)} style={{ width: 60, padding: "3px 6px" }} />
                          <button className="btn btn-accent" style={{ padding: "3px 8px" }} onClick={() => addPackagingOption(p.sku)}>OK</button>
                          <button className="btn" style={{ padding: "3px 8px" }} onClick={() => { setAddingOptionSku(null); setNewOptionLabel(""); setNewOptionPrice(""); }}>✕</button>
                        </span>
                      ) : (
                        <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => { setAddingOptionSku(p.sku); setNewOptionLabel(""); setNewOptionPrice(""); }}>+ вариант</button>
                      )}
                      {hasDuplicates && (
                        <button className="btn" style={{ padding: "3px 8px", fontSize: 11, color: "var(--danger)", borderColor: "var(--danger)" }} onClick={() => mergeDuplicateOptions(p.sku)}>Объединить дубли</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!search.trim() && <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", paddingTop: 8 }}>Показаны первые 40. Используйте поиск для других товаров.</div>}
          {showFuzzy && fuzzyResults.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8 }}>ПОХОЖИЕ ПО НОМЕРУ:</div>
              {fuzzyResults.map((p) => (
                <div key={p.sku} style={{ padding: "6px 0", display: "flex", justifyContent: "space-between", gap: 8, cursor: "pointer" }}
                  onClick={() => { setSearch(String(p.sku)); setSearchMode("sku"); }}>
                  <span style={{ fontSize: 13 }}>{p.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)", whiteSpace: "nowrap" }}>арт. {p.sku}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {priceHistory.length > 0 && (
          <div style={{ marginTop: 24, maxWidth: 640 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>История изменения цен</div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, maxHeight: 300, overflowY: "auto" }}>
              {[...priceHistory].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30).map((h) => (
                <div key={h.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--surface-2)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflowWrap: "break-word" }}>{h.productName} <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>· арт. {h.sku}</span></div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
                      <span>{new Date(h.timestamp).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      <span>{money(h.oldPrice)} → <span style={{ color: "var(--accent)" }}>{money(h.newPrice)}</span></span>
                      <span>· {h.changedBy}</span>
                    </div>
                  </div>
                  <button className="btn" style={{ padding: "2px 8px", fontSize: 11, flexShrink: 0 }} onClick={() => persistPriceHistory(priceHistory.filter((x) => x.id !== h.id))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
}
