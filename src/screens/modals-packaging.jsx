// Окна, связанные с упаковкой: выбор при упаковке, привязка к товарам, сверка поставки.
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { NO_PACKAGING, PACKAGING_TYPES, buildPackagingSkuName } from "../lib/helpers.js";

export function PackagingChoiceModal(ctx) {
  const {
    addPackagingStock, confirmPackagingSelection, createPackagingMaterial, getPackagingLink, packagingMaterials,
    packagingModal, setPackagingModal, setToast, unlinkPackagingFromProduct,
  } = ctx;
  return (() => {
      const link = getPackagingLink(packagingModal.product.sku);
      const linkedMaterials = link ? link.linkedIds.map((id) => packagingMaterials.find((m) => m.id === id)).filter(Boolean) : [];
      const otherMaterials = packagingMaterials.filter((m) => !linkedMaterials.some((lm) => lm.id === m.id));
      const pickerQuery = (packagingModal.pickerQuery || "").trim().toLowerCase();
      const filteredOtherMaterials = pickerQuery
        ? otherMaterials.filter((m) => m.name.toLowerCase().includes(pickerQuery) || m.sku.toLowerCase().includes(pickerQuery) || m.size.toLowerCase().includes(pickerQuery))
        : otherMaterials;
      const selectedMaterial = packagingMaterials.find((m) => m.id === packagingModal.selectedMaterialId);
      const notEnoughStock = selectedMaterial && selectedMaterial.stock < packagingModal.qty;
      const patch = (fields) => setPackagingModal((prev) => ({ ...prev, ...fields }));
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setPackagingModal(null)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 420, maxHeight: "calc(80vh / var(--ui-zoom, 1))", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Упаковка для «{packagingModal.product.name}»</div>
            {linkedMaterials.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 12 }}>⚠ У этого товара ещё нет привязанной упаковки — выберите, создайте новую, или укажите, что упаковка не нужна.</div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Обычно используется — можно подтвердить или выбрать другую, если упаковали иначе.</div>
            )}

            <button className="btn" style={{ padding: "8px 12px", textAlign: "left", marginBottom: 12, width: "100%", background: packagingModal.selectedMaterialId === NO_PACKAGING ? "var(--accent)" : "var(--surface)", color: packagingModal.selectedMaterialId === NO_PACKAGING ? "#1a1a1a" : "var(--text)" }}
              onClick={() => patch({ selectedMaterialId: NO_PACKAGING, topUpDismissed: false })}>
              Без упаковки — этому товару упаковка не нужна
              {link && link.mainId === NO_PACKAGING && <span style={{ marginLeft: 6, fontSize: 11 }}>(основная)</span>}
            </button>

            {linkedMaterials.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {linkedMaterials.map((m) => (
                  <div key={m.id} style={{ display: "flex", gap: 6 }}>
                    <button className="btn" style={{ flex: 1, minWidth: 0, padding: "8px 12px", textAlign: "left", background: packagingModal.selectedMaterialId === m.id ? "var(--accent)" : "var(--surface)", color: packagingModal.selectedMaterialId === m.id ? "#1a1a1a" : "var(--text)" }}
                      onClick={() => patch({ selectedMaterialId: m.id, topUpDismissed: false })}>
                      {m.name} <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}>· арт. {m.sku}</span> · остаток: {m.stock}
                      {link && link.mainId === m.id && <span style={{ marginLeft: 6, fontSize: 11 }}>(основная)</span>}
                    </button>
                    <button className="btn" title="Убрать привязку этой упаковки к товару" style={{ padding: "8px 10px", fontSize: 12 }} onClick={async () => {
                      await unlinkPackagingFromProduct(packagingModal.product.sku, m.id);
                      if (packagingModal.selectedMaterialId === m.id) patch({ selectedMaterialId: null });
                      setToast("Привязка убрана");
                    }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {!packagingModal.showAllPicker ? (
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12, marginBottom: 10 }} onClick={() => patch({ showAllPicker: true })}>Выбрать другую из уже существующих</button>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <input autoFocus placeholder="Начните вводить название, размер или артикул..." value={packagingModal.pickerQuery || ""} onChange={(e) => patch({ pickerQuery: e.target.value })} style={{ width: "100%", marginBottom: 6, fontSize: 12 }} />
                {pickerQuery && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                    {filteredOtherMaterials.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Ничего не найдено.</div>}
                    {filteredOtherMaterials.map((m) => (
                      <button key={m.id} className="btn" style={{ padding: "6px 10px", fontSize: 12, textAlign: "left", background: packagingModal.selectedMaterialId === m.id ? "var(--accent)" : "var(--surface)", color: packagingModal.selectedMaterialId === m.id ? "#1a1a1a" : "var(--text)" }}
                        onClick={() => patch({ selectedMaterialId: m.id, topUpDismissed: false })}>
                        {m.name} <span className="mono" style={{ fontSize: 10, opacity: 0.8 }}>· арт. {m.sku}</span> · остаток: {m.stock}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {notEnoughStock && !packagingModal.topUpDismissed && (
              <div style={{ background: "rgba(226,96,79,0.1)", border: "1px solid var(--danger)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>Недостаточно остатка «{selectedMaterial.name}»: на складе {selectedMaterial.stock}, а нужно {packagingModal.qty}. Можно пополнить прямо здесь:</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" inputMode="numeric" placeholder="Кол-во" value={packagingModal.topUpVal || ""} onChange={(e) => patch({ topUpVal: e.target.value })} style={{ width: 100 }} />
                  <button className="btn btn-accent" style={{ padding: "6px 12px", fontSize: 12 }} onClick={async () => {
                    const n = parseInt(packagingModal.topUpVal) || 0;
                    if (n <= 0) { setToast("Укажите положительное количество"); return; }
                    await addPackagingStock(selectedMaterial.id, n);
                    patch({ topUpVal: "" });
                  }}>Пополнить</button>
                  <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => patch({ topUpDismissed: true, topUpVal: "" })}>Отмена</button>
                </div>
              </div>
            )}
            {notEnoughStock && packagingModal.topUpDismissed && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                Недостаточно остатка «{selectedMaterial.name}» ({selectedMaterial.stock} из {packagingModal.qty})
                <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => patch({ topUpDismissed: false })}>Пополнить</button>
              </div>
            )}

            {!packagingModal.showCreateForm ? (
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12, marginBottom: 14 }} onClick={() => patch({ showCreateForm: true })}>+ Создать новую упаковку</button>
            ) : (
              <div style={{ background: "var(--surface)", borderRadius: 8, padding: 10, marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <select value={packagingModal.newType} onChange={(e) => patch({ newType: e.target.value })}>
                  {PACKAGING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <input placeholder="Размер, например 35х40" value={packagingModal.newSize} onChange={(e) => patch({ newSize: e.target.value })} />
                <input type="text" inputMode="numeric" placeholder="Начальный остаток (укажите сразу, сколько упаковали)" value={packagingModal.newStock} onChange={(e) => patch({ newStock: e.target.value })} />
                <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
                  Будет создано: {buildPackagingSkuName(packagingModal.newType, packagingModal.newSize || "…").name} (арт. {buildPackagingSkuName(packagingModal.newType, packagingModal.newSize || "…").sku})
                </div>
                <button className="btn btn-accent" style={{ padding: "6px 12px", fontSize: 12 }} onClick={async () => {
                  const material = await createPackagingMaterial(packagingModal.newType, packagingModal.newSize, packagingModal.newStock);
                  if (material) patch({ selectedMaterialId: material.id, showCreateForm: false, newSize: "", newStock: "", topUpDismissed: false });
                }}>Создать и выбрать</button>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-accent" onClick={confirmPackagingSelection} disabled={!packagingModal.selectedMaterialId}>Продолжить</button>
              <button className="btn" onClick={() => setPackagingModal(null)}>Отмена</button>
            </div>
          </div>
        </div>
      );
    })();
}

export function MaterialLinkModal(ctx) {
  const {
    askUnlinkPackaging, getPackagingLink, linkMaterialToProductConfirm, materialLinkModal, materialLinkResults,
    packagingLabel, packagingMaterials, productsByMaterial, setMaterialLinkModal,
  } = ctx;
  return (() => {
      // Со стороны упаковки: к каким товарам она привязана + привязать к другим
      const material = packagingMaterials.find((m) => m.id === materialLinkModal.material.id) || materialLinkModal.material;
      const linked = productsByMaterial[material.id] || [];
      const linkedSkus = new Set(linked.map((x) => String(x.product.sku)));
      const results = materialLinkResults.filter((p) => !linkedSkus.has(String(p.sku)));
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setMaterialLinkModal(null)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 460, maxHeight: "calc(85vh / var(--ui-zoom, 1))", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{material.name}</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 12 }}>арт. {material.sku} · остаток: {material.stock}</div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Привязана к товарам ({linked.length})</div>
            {linked.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Пока ни к одному товару не привязана.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
                {linked.map(({ product, isMain }) => (
                  <div key={product.sku} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: "anywhere" }}>
                      {product.name} <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>· арт. {product.sku}</span>
                      {!isMain && <span style={{ fontSize: 11, color: "var(--muted-2)" }}> · дополнительная</span>}
                    </div>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => askUnlinkPackaging(product, material.id)}>Убрать</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Привязать к товару</div>
            <input placeholder="Поиск товара по названию или артикулу..." value={materialLinkModal.query} onChange={(e) => setMaterialLinkModal((prev) => ({ ...prev, query: e.target.value }))} style={{ width: "100%", marginBottom: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {results.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Ничего не найдено.</div>}
              {results.map((p) => {
                const other = getPackagingLink(p.sku);
                return (
                  <button key={p.sku} className="btn" style={{ padding: "8px 10px", fontSize: 13, textAlign: "left" }} onClick={() => linkMaterialToProductConfirm(p.sku, p.name)}>
                    ＋ {p.name} <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}>· арт. {p.sku}</span>
                    {other && <span style={{ fontSize: 11, color: "var(--muted-2)" }}> · сейчас: {other.linkedIds.map(packagingLabel).join(", ")}</span>}
                  </button>
                );
              })}
            </div>
            <button className="btn btn-accent" style={{ padding: "6px 14px", marginTop: 12 }} onClick={() => setMaterialLinkModal(null)}>Готово</button>
          </div>
        </div>
      );
    })();
}

export function ProductLinkModal(ctx) {
  const {
    createPackagingMaterial, getPackagingLink, linkProductToMaterialConfirm, packagingMaterials, productLinkModal,
    productLinkResults, setMainPackaging, setProductLinkModal, unlinkPackagingFromProduct,
  } = ctx;
  return (() => {
      // Со стороны товара: что привязано (сменить основную / убрать) + добавить упаковку
      const product = productLinkModal.product;
      const link = getPackagingLink(product.sku);
      const linkedIds = link ? link.linkedIds : [];
      const results = productLinkResults.filter((m) => !linkedIds.includes(m.id));
      const sectionTitle = { fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setProductLinkModal(null)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 460, maxHeight: "calc(85vh / var(--ui-zoom, 1))", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Упаковка товара</div>
            <div style={{ fontSize: 13, marginBottom: 12, overflowWrap: "anywhere" }}>{product.name} <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>· арт. {product.sku}</span></div>

            <div style={sectionTitle}>Привязано</div>
            {linkedIds.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>Упаковка не привязана — выберите ниже.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                {linkedIds.map((id) => {
                  const m = id === NO_PACKAGING ? null : packagingMaterials.find((x) => x.id === id);
                  const isMain = id === link.mainId;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--surface)", border: "1px solid " + (isMain ? "var(--accent)" : "var(--border)"), borderRadius: 8, padding: "6px 10px" }}>
                      <div style={{ flex: 1, minWidth: 140, fontSize: 13, overflowWrap: "anywhere" }}>
                        {m ? m.name : "Без упаковки"}
                        {m && <span className="mono" style={{ fontSize: 11, color: m.stock > 0 ? "var(--muted-2)" : "var(--danger)" }}> · арт. {m.sku} · остаток: {m.stock}</span>}
                      </div>
                      {isMain
                        ? <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>★ основная</span>
                        : <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setMainPackaging(product.sku, id)}>Сделать основной</button>}
                      <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => unlinkPackagingFromProduct(product.sku, id)}>Убрать</button>
                    </div>
                  );
                })}
              </div>
            )}
            {linkedIds.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 12 }}>
                Основная предлагается при упаковке, списывается при сканировании и в «Недавно упаковано», учитывается в сверке поставки.
              </div>
            )}

            <div style={sectionTitle}>Добавить</div>
            {!linkedIds.includes(NO_PACKAGING) && (
              <button className="btn" style={{ padding: "8px 10px", fontSize: 13, textAlign: "left", width: "100%", marginBottom: 8 }} onClick={() => linkProductToMaterialConfirm(NO_PACKAGING, "без упаковки")}>＋ Без упаковки — этому товару упаковка не нужна</button>
            )}
            <input placeholder="Поиск упаковки по названию или артикулу..." value={productLinkModal.query} onChange={(e) => setProductLinkModal((prev) => ({ ...prev, query: e.target.value }))} style={{ width: "100%", marginBottom: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
              {results.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Подходящих упаковок нет — можно создать новую ниже.</div>}
              {results.map((m) => (
                <button key={m.id} className="btn" style={{ padding: "8px 10px", fontSize: 13, textAlign: "left" }} onClick={() => linkProductToMaterialConfirm(m.id, m.name)}>
                  ＋ {m.name} <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}>· арт. {m.sku}</span> · остаток: {m.stock}
                </button>
              ))}
            </div>

            {!productLinkModal.showCreateForm ? (
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12, marginBottom: 10 }} onClick={() => setProductLinkModal((prev) => ({ ...prev, showCreateForm: true, newType: PACKAGING_TYPES[0].key, newSize: "", newStock: "" }))}>+ Создать новую упаковку</button>
            ) : (
              <div style={{ background: "var(--surface)", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <select value={productLinkModal.newType} onChange={(e) => setProductLinkModal((prev) => ({ ...prev, newType: e.target.value }))}>
                  {PACKAGING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <input placeholder="Размер, например 35х40" value={productLinkModal.newSize} onChange={(e) => setProductLinkModal((prev) => ({ ...prev, newSize: e.target.value }))} />
                <input type="text" inputMode="numeric" placeholder="Начальный остаток (необязательно)" value={productLinkModal.newStock} onChange={(e) => setProductLinkModal((prev) => ({ ...prev, newStock: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
                  Будет создано: {buildPackagingSkuName(productLinkModal.newType, productLinkModal.newSize || "…").name} (арт. {buildPackagingSkuName(productLinkModal.newType, productLinkModal.newSize || "…").sku})
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-accent" style={{ padding: "6px 12px", fontSize: 12 }} onClick={async () => {
                    const created = await createPackagingMaterial(productLinkModal.newType, productLinkModal.newSize, productLinkModal.newStock);
                    if (created) setProductLinkModal((prev) => (prev ? { ...prev, showCreateForm: false, pendingLinkId: created.id, pendingLinkName: created.name } : prev));
                  }}>Создать и привязать</button>
                  <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setProductLinkModal((prev) => ({ ...prev, showCreateForm: false }))}>Отмена</button>
                </div>
              </div>
            )}

            <div><button className="btn btn-accent" style={{ padding: "6px 14px", marginTop: 4 }} onClick={() => setProductLinkModal(null)}>Готово</button></div>
          </div>
        </div>
      );
    })();
}

export function SupplyReconcileModal(ctx) {
  const {
    catalog, computeSupplyReconcile, createPurchaseRequestFromReconcile, setProductLinkModal, setSupplyReconcile,
    supplyReconcile,
  } = ctx;
  return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setSupplyReconcile(null)}>
        <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 640, maxHeight: "calc(85vh / var(--ui-zoom, 1))", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
          {supplyReconcile.step === "mapping" ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Укажите, какие данные содержатся в столбцах</div>
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 14 }}>Найдено строк: {supplyReconcile.dataRows.length}. Над каждым столбцом выберите, что в нём — «Артикул», «Количество», или «Не загружать», если столбец не нужен.</div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 16 }}>
                <table style={{ fontSize: 12, minWidth: "100%" }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      {supplyReconcile.headers.map((h, ci) => (
                        <th key={ci} style={{ padding: 6 }}>
                          <select
                            value={supplyReconcile.columnRoles[ci]}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSupplyReconcile((prev) => {
                                // Артикул и Количество — по одному столбцу максимум: если эта роль уже
                                // была у другого столбца, снимаем её оттуда (иначе роли задвоятся)
                                const roles = prev.columnRoles.map((r, i) => (i === ci ? val : (r === val && val !== "none" ? "none" : r)));
                                return { ...prev, columnRoles: roles };
                              });
                            }}
                            style={{ width: "100%", fontSize: 12, padding: "4px 6px" }}>
                            <option value="none">Не загружать</option>
                            <option value="article">Артикул</option>
                            <option value="qty">Количество</option>
                          </select>
                        </th>
                      ))}
                    </tr>
                    <tr style={{ borderTop: "1px solid var(--border)" }}>
                      {supplyReconcile.headers.map((h, ci) => (
                        <td key={ci} style={{ padding: "6px 8px", color: "var(--muted-2)", fontSize: 11, whiteSpace: "nowrap" }}>{h || `Столбец ${ci + 1}`}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {supplyReconcile.dataRows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} style={{ borderTop: "1px solid var(--surface-2)" }}>
                        {supplyReconcile.headers.map((h, ci) => (
                          <td key={ci} style={{ padding: "5px 8px", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{String(row[ci] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {supplyReconcile.dataRows.length > 5 && (
                  <div style={{ padding: 8, fontSize: 11, color: "var(--muted-2)", textAlign: "center" }}>Показаны первые 5 из {supplyReconcile.dataRows.length} строк</div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-accent" onClick={computeSupplyReconcile}>Сверить</button>
                <button className="btn" onClick={() => setSupplyReconcile(null)}>Отмена</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Результат сверки</div>

              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--muted)", textTransform: "uppercase" }}>По товарам ({supplyReconcile.productRows.length})</div>
              <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8 }}>
                <table style={{ fontSize: 12 }}>
                  <thead><tr><th>Артикул</th><th>Название</th><th>Кол-во</th><th>Упаковка</th><th></th></tr></thead>
                  <tbody>
                    {supplyReconcile.productRows.map((r, i) => (
                      <tr key={i}>
                        <td className="mono">{r.sku}</td>
                        <td>{r.name}</td>
                        <td>{r.qty}</td>
                        <td style={{ color: r.materialName === "упаковка не привязана" ? "var(--danger)" : "var(--text)" }}>{r.materialName}</td>
                        <td>
                          <button className="btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => {
                            const product = catalog.find((p) => String(p.sku) === String(r.sku)) || { sku: r.sku, name: r.name };
                            setProductLinkModal({ product, query: "" });
                          }}>{r.materialName === "упаковка не привязана" ? "Привязать" : "Изменить"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--muted)", textTransform: "uppercase" }}>Итого по упаковкам — чего не хватает</div>
              <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 8 }}>
                <table style={{ fontSize: 12 }}>
                  <thead><tr><th>Упаковка</th><th>Нужно</th><th>Остаток</th><th>Не хватает</th><th>К заказу</th></tr></thead>
                  <tbody>
                    {supplyReconcile.materialSummary.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted-2)" }}>Все товары либо без упаковки, либо не привязаны.</td></tr>}
                    {supplyReconcile.materialSummary.map((s) => (
                      <tr key={s.materialId}>
                        <td>{s.material ? s.material.name : "?"}</td>
                        <td>{s.needed}</td>
                        <td>{s.stock}</td>
                        <td style={{ color: s.shortage > 0 ? "var(--danger)" : "var(--text)", fontWeight: s.shortage > 0 ? 600 : 400 }}>{s.shortage}</td>
                        <td style={{ color: "var(--accent)", fontWeight: 600 }}>{s.orderQty || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-accent" onClick={createPurchaseRequestFromReconcile}>Создать заявку на закупку</button>
                <button className="btn" onClick={() => setSupplyReconcile((prev) => ({ ...prev, step: "mapping" }))}>← Назад</button>
                <button className="btn" onClick={() => setSupplyReconcile(null)}>Закрыть</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
}
