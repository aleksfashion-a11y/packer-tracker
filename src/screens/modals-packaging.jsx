// Окна, связанные с упаковкой: выбор при упаковке, привязка к товарам, сверка поставки.
// Функции получают от App всё нужное одним объектом (ctx) и возвращают разметку.

import { NO_PACKAGING, PACKAGING_TYPES, WORK_PREFIX, buildPackagingSkuName, isNoMaterialId, isWorkId } from "../lib/helpers.js";

export function PackagingChoiceModal(ctx) {
  const {
    addPackagingStock, confirmPackagingSelection, createPackagingMaterial, getPackagingLink, packagingMaterials,
    packagingModal, packagingWorks, setPackagingModal, setToast, unlinkPackagingFromProduct,
    packagingComboLabel, variantWorkIds, packagingRememberInfo,
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
      // выбор поменялся — отметка «запомнить» снова по умолчанию для нового выбора
      const patch = (fields) => setPackagingModal((prev) => ({ ...prev, ...(("selectedMaterialId" in fields || "selectedWorks" in fields) && !("remember" in fields) ? { remember: undefined } : {}), ...fields }));
      const capTitle = { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
      const selectedWorks = packagingModal.selectedWorks || [];
      const noPack = packagingModal.selectedMaterialId === NO_PACKAGING;
      const toggleWork = (id) => patch({ selectedWorks: selectedWorks.includes(id) ? selectedWorks.filter((x) => x !== id) : [...selectedWorks, id] });
      const selectedWorkNames = selectedWorks.map((id) => packagingWorks.find((w) => WORK_PREFIX + w.id === id)).filter(Boolean).map((w) => w.name); // в порядке выбора — как в названии варианта
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setPackagingModal(null)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 420, maxHeight: "calc(80vh / var(--ui-zoom, 1))", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Упаковка для «{packagingModal.product.name}»</div>
            {!link ? (
              <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 12 }}>⚠ У этого товара ещё не указано, как его упаковывают, — выберите упаковку (или «Без упаковки») и отметьте, что ещё с ним делают.</div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Обычно делают так — можно подтвердить или изменить, если в этот раз было иначе.</div>
            )}

            {link && link.variants.length > 1 && (
              <>
                <div style={capTitle}>Варианты этого товара — выберите, как упаковали</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {link.variants.map((v, i) => {
                    const packId = isNoMaterialId(v.id) ? NO_PACKAGING : v.id;
                    const vw = variantWorkIds(v.id, v.works);
                    const on = packagingModal.selectedMaterialId === packId && selectedWorks.length === vw.length && vw.every((w) => selectedWorks.includes(w));
                    const m = packagingMaterials.find((x) => x.id === v.id);
                    return (
                      <button key={v.id} className="btn" data-testid={"pack-variant-" + i} style={{ padding: "10px 12px", textAlign: "left", background: on ? "var(--accent)" : "var(--surface)", color: on ? "#1a1a1a" : "var(--text)" }}
                        onClick={() => patch({ selectedMaterialId: packId, selectedWorks: vw, topUpDismissed: false, remember: undefined })}>
                        {i + 1}. {v.id === NO_PACKAGING ? "Упаковка не нужна — как есть" : (isWorkId(v.id) ? "Без упаковки: " : "") + packagingComboLabel(v.id, v.works)}
                        {m && <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}> · остаток: {m.stock}</span>}
                        {v.isMain && <span style={{ marginLeft: 6, fontSize: 11 }}>(основной)</span>}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 8 }}>Или укажите вручную, если в этот раз упаковали иначе:</div>
              </>
            )}
            <div style={capTitle}>1. Упаковка (спишется с остатка)</div>

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

            <button className="btn" data-testid="pack-none" style={{ display: "block", width: "100%", padding: "8px 12px", textAlign: "left", marginBottom: 14, background: noPack ? "var(--accent)" : "var(--surface)", color: noPack ? "#1a1a1a" : "var(--text)" }}
              onClick={() => patch({ selectedMaterialId: NO_PACKAGING, topUpDismissed: false })}>
              Без упаковки <span style={{ fontSize: 11, opacity: 0.8 }}>· с остатка ничего не списывается</span>
            </button>

            <div style={capTitle}>2. Что ещё делаем с товаром (можно несколько)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {packagingWorks.map((w) => {
                const on = selectedWorks.includes(WORK_PREFIX + w.id);
                return (
                  <button key={w.id} className="btn" data-testid={"pack-work-" + w.id} style={{ padding: "8px 12px", background: on ? "var(--accent)" : "var(--surface)", color: on ? "#1a1a1a" : "var(--text)" }} onClick={() => toggleWork(WORK_PREFIX + w.id)}>
                    {on ? "✓ " : ""}🏷 {w.name}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 14 }}>
              {!packagingModal.selectedMaterialId ? "Сначала выберите упаковку или «Без упаковки»."
                : <>Итог: <b style={{ color: "var(--text)" }}>{noPack
                    ? (selectedWorkNames.length ? "без упаковки — " + selectedWorkNames.join(" + ") : "упаковка не нужна, товар уходит как есть")
                    : [selectedMaterial ? selectedMaterial.name : "?", ...selectedWorkNames].join(" + ")}</b></>}
            </div>
            {(() => {
              // Выбор не совпал ни с одним вариантом товара — спрашиваем, запомнить ли его
              const r = packagingRememberInfo(packagingModal);
              if (!r || r.match || r.first) return null;
              return (
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, marginBottom: 14, cursor: "pointer" }}>
                  <input type="checkbox" data-testid="pack-remember" checked={r.remember} onChange={(e) => patch({ remember: e.target.checked })} style={{ marginTop: 2 }} />
                  <span>{r.existing
                    ? <>Запомнить для товара: вариант «{r.oldLabel}» заменить на «{r.newLabel}». Не отмечено — только в этот раз.</>
                    : <>Добавить «{r.newLabel}» как ещё один вариант упаковки этого товара. Не отмечено — только в этот раз.</>}</span>
                </label>
              );
            })()}

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
                    {other && <span style={{ fontSize: 11, color: "var(--muted-2)" }}> · сейчас: {other.variants.map((v) => packagingLabel(v.id) + v.works.map((w) => " + " + packagingLabel(w)).join("")).join("; ")}</span>}
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
      const { packagingWorks, packagingLabel, packagingComboLabel, addPackagingWork, removePackagingWork, isAdminUser, toggleVariantWork } = ctx;
      // Со стороны товара: варианты упаковки (у каждого свои работы) + добавить вариант
      const product = productLinkModal.product;
      const link = getPackagingLink(product.sku);
      const linkedIds = link ? link.linkedIds : [];
      const results = productLinkResults;
      const newWorks = productLinkModal.newWorks || [];
      const setPLM = (fields) => setProductLinkModal((prev) => (prev ? { ...prev, ...fields } : prev));
      const sectionTitle = { fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };
      const workChip = (on) => ({ padding: "5px 9px", fontSize: 12, background: on ? "var(--accent)" : undefined, color: on ? "#1a1a1a" : undefined });
      const several = linkedIds.length > 1;
      return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 20 }} onClick={() => setProductLinkModal(null)}>
          <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 480, maxHeight: "calc(85vh / var(--ui-zoom, 1))", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Упаковка товара</div>
            <div style={{ fontSize: 13, marginBottom: 12, overflowWrap: "anywhere" }}>{product.name} <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>· арт. {product.sku}</span></div>

            <div style={sectionTitle}>Варианты упаковки{linkedIds.length ? ` (${linkedIds.length})` : ""}</div>
            {linkedIds.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--danger)", marginBottom: 12 }}>Упаковка не указана — добавьте вариант ниже.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
                {link.variants.map(({ id, works, isMain }, i) => {
                  const m = isNoMaterialId(id) ? null : packagingMaterials.find((x) => x.id === id);
                  return (
                    <div key={id} data-testid={"variant-" + i} style={{ background: "var(--surface)", border: "1px solid " + (isMain ? "var(--accent)" : "var(--border)"), borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 160, fontSize: 13, overflowWrap: "anywhere" }}>
                          {several && <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>{i + 1}. </span>}
                          <b data-testid={"variant-label-" + i}>{id === NO_PACKAGING ? "Упаковка не нужна — как есть" : (isWorkId(id) ? "Без упаковки: " : "") + packagingComboLabel(id, works)}</b>
                          {m && <span className="mono" style={{ fontSize: 11, color: m.stock > 0 ? "var(--muted-2)" : "var(--danger)" }}> · арт. {m.sku} · остаток: {m.stock}</span>}
                          {!m && <span style={{ fontSize: 11, color: "var(--muted-2)" }}> · с остатка ничего не списывается</span>}
                        </div>
                        {isMain
                          ? <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>★ основной</span>
                          : <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setMainPackaging(product.sku, id)}>Сделать основным</button>}
                        <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => unlinkPackagingFromProduct(product.sku, id)}>Убрать</button>
                      </div>
                      {id !== NO_PACKAGING && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {packagingWorks.filter((w) => WORK_PREFIX + w.id !== id).map((w) => {
                            const on = works.includes(WORK_PREFIX + w.id);
                            return <button key={w.id} className="btn" data-testid={`variant-${i}-work-${w.id}`} style={workChip(on)} onClick={() => toggleVariantWork(product.sku, id, WORK_PREFIX + w.id)}>{on ? "✓ " : "＋ "}🏷 {w.name}</button>;
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {linkedIds.length > 0 && (
              <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 14 }}>
                {several ? "При упаковке сотрудник выбирает вариант; основной предлагается первым, " : "Вариант "}списывается при сканировании и в «Недавно упаковано», учитывается в сверке поставки. Работы у варианта включаются и выключаются кнопками под ним.
              </div>
            )}

            <div style={{ background: "var(--surface-2, var(--surface))", border: "1px dashed var(--border)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={sectionTitle}>{linkedIds.length ? "Добавить ещё вариант" : "Добавить вариант"}</div>
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 6 }}>1. Отметьте работы этого варианта (можно несколько или ни одной):</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {packagingWorks.map((w) => {
                  const on = newWorks.includes(WORK_PREFIX + w.id);
                  return (
                    <span key={w.id} style={{ display: "inline-flex" }}>
                      <button className="btn" data-testid={"new-work-" + w.id} style={{ padding: "7px 10px", fontSize: 13, background: on ? "var(--accent)" : undefined, color: on ? "#1a1a1a" : undefined }}
                        onClick={() => setPLM({ newWorks: on ? newWorks.filter((x) => x !== WORK_PREFIX + w.id) : [...newWorks, WORK_PREFIX + w.id] })}>{on ? "✓ " : ""}🏷 {w.name}</button>
                      {isAdminUser && <button className="btn" title="Удалить этот вид работы совсем" style={{ padding: "7px 8px", fontSize: 11, marginLeft: 2, color: "var(--muted-2)" }} onClick={() => removePackagingWork(w)}>✕</button>}
                    </span>
                  );
                })}
              </div>
              {isAdminUser && (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <input placeholder="Новый вид работы, например: Термоусадка" value={productLinkModal.newWork || ""} onChange={(e) => setPLM({ newWork: e.target.value })} style={{ flex: 1 }} />
                  <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={async () => { const w = await addPackagingWork(productLinkModal.newWork); if (w) setPLM({ newWork: "" }); }}>Добавить вид работы</button>
                </div>
              )}
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 6 }}>2. Выберите упаковку — вариант сразу добавится:</div>
              <button className="btn" data-testid="add-variant-nopack" style={{ padding: "8px 10px", fontSize: 13, marginBottom: 8, display: "block", width: "100%", textAlign: "left" }}
                onClick={() => linkProductToMaterialConfirm(NO_PACKAGING, "")}>
                ＋ Без упаковки{newWorks.length ? " — " + newWorks.map(packagingLabel).join(" + ") : " — упаковка не нужна, отгружается как есть"}
              </button>
              <input placeholder="Поиск упаковки по названию или артикулу..." value={productLinkModal.query} onChange={(e) => setPLM({ query: e.target.value })} style={{ width: "100%", marginBottom: 8 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
                {results.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>Подходящих упаковок нет — можно создать новую ниже.</div>}
                {results.map((m) => (
                  <button key={m.id} className="btn" style={{ padding: "8px 10px", fontSize: 13, textAlign: "left" }} onClick={() => linkProductToMaterialConfirm(m.id, m.name)}>
                    ＋ {m.name}{newWorks.length ? " + " + newWorks.map(packagingLabel).join(" + ") : ""} <span className="mono" style={{ fontSize: 11, opacity: 0.8 }}>· арт. {m.sku}</span> · остаток: {m.stock}
                    {linkedIds.includes(m.id) && <span style={{ fontSize: 11, color: "var(--muted-2)" }}> · уже есть — работы заменятся</span>}
                  </button>
                ))}
              </div>

              {!productLinkModal.showCreateForm ? (
                <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setPLM({ showCreateForm: true, newType: PACKAGING_TYPES[0].key, newSize: "", newStock: "" })}>+ Создать новую упаковку</button>
              ) : (
                <div style={{ background: "var(--surface)", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <select value={productLinkModal.newType} onChange={(e) => setPLM({ newType: e.target.value })}>
                    {PACKAGING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <input placeholder="Размер, например 35х40" value={productLinkModal.newSize} onChange={(e) => setPLM({ newSize: e.target.value })} />
                  <input type="text" inputMode="numeric" placeholder="Начальный остаток (необязательно)" value={productLinkModal.newStock} onChange={(e) => setPLM({ newStock: e.target.value })} />
                  <div style={{ fontSize: 11, color: "var(--muted-2)" }}>
                    Будет создано: {buildPackagingSkuName(productLinkModal.newType, productLinkModal.newSize || "…").name} (арт. {buildPackagingSkuName(productLinkModal.newType, productLinkModal.newSize || "…").sku})
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-accent" style={{ padding: "6px 12px", fontSize: 12 }} onClick={async () => {
                      const created = await createPackagingMaterial(productLinkModal.newType, productLinkModal.newSize, productLinkModal.newStock);
                      if (created) setPLM({ showCreateForm: false, pendingLinkId: created.id, pendingLinkName: created.name });
                    }}>Создать и добавить вариант</button>
                    <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setPLM({ showCreateForm: false })}>Отмена</button>
                  </div>
                </div>
              )}
            </div>

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
                <table className="m-cards" style={{ fontSize: 12 }}>
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
                <table className="m-cards" style={{ fontSize: 12 }}>
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

// Журнал движений упаковки (администратор): все изменения остатков — кто, когда, сколько
const MOVE_TYPES = { in: "Приход", out: "Списание", set: "Инвентаризация", pack: "Упаковка товара", new: "Новая упаковка", delete: "Упаковка удалена" };
export function StockMovesModal(ctx) {
  const { stockMoves, setStockMoves, loadStockMoves } = ctx;
  const fmt = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70, padding: 16 }} onClick={() => setStockMoves(null)}>
      <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 860, maxHeight: "calc(88vh / var(--ui-zoom, 1))", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Журнал движений упаковки</div>
          <button className="btn" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => setStockMoves(null)}>Закрыть</button>
        </div>
        {stockMoves.rows.length === 0 && !stockMoves.loading && <div style={{ fontSize: 13, color: "var(--muted-2)" }}>Движений пока нет. Журнал ведётся с момента установки этой версии.</div>}
        {stockMoves.rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="m-cards" style={{ fontSize: 12 }}>
              <thead><tr><th>Когда</th><th>Упаковка</th><th>Операция</th><th>Изменение</th><th>Было → стало</th><th>Кто</th></tr></thead>
              <tbody>
                {stockMoves.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{fmt(r.timestamp)}</td>
                    <td>{r.name} <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}>· {r.sku}</span></td>
                    <td>{MOVE_TYPES[r.type] || r.type}{r.productSku !== undefined ? <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)" }}> · арт. {r.productSku}</span> : null}</td>
                    <td className="mono" style={{ color: r.delta < 0 ? "var(--danger)" : "var(--accent)", fontWeight: 600 }}>{r.delta > 0 ? "+" : ""}{r.delta}</td>
                    <td className="mono">{r.before} → {r.after}</td>
                    <td>{r.userName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stockMoves.loading && <div className="mono" style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 10 }}>загрузка…</div>}
        {stockMoves.hasMore && !stockMoves.loading && (
          <div style={{ textAlign: "center", marginTop: 12 }}><button className="btn" onClick={() => loadStockMoves(true)}>Показать более ранние</button></div>
        )}
      </div>
    </div>
  );
}
