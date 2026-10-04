// Небольшие самостоятельные элементы интерфейса, которые используются в разных разделах.

import { useEffect, useState } from "react";
import { fmtDate, fmtDuration, proxiedImageUrl } from "../lib/helpers.js";

// Голосовое сообщение: звук загружается с сервера только когда его включают
export const chatAudioCache = new Map();

export function ChatAudio({ message }) {
  const [src, setSrc] = useState(() => message.audio.dataUrl || chatAudioCache.get(message.id) || null);
  const [state, setState] = useState("idle"); // idle | loading | error
  const [autoPlay, setAutoPlay] = useState(false);
  useEffect(() => { if (message.audio.dataUrl) setSrc(message.audio.dataUrl); }, [message.audio.dataUrl]);
  if (src) return <audio controls autoPlay={autoPlay} src={src} style={{ maxWidth: 220, height: 32 }} />;
  const load = async () => {
    setState("loading");
    try {
      const data = await window.storage.api("/api/chat/audio/" + encodeURIComponent(message.id));
      chatAudioCache.set(message.id, data.dataUrl);
      setAutoPlay(true);
      setSrc(data.dataUrl);
    } catch (e) { setState("error"); }
  };
  return (
    <button className="btn chat-icon-btn" style={{ padding: "6px 12px", fontSize: 13 }} disabled={state === "loading"} onClick={load}>
      {state === "loading" ? "Загрузка…" : state === "error" ? "Не удалось загрузить — повторить" : `▶ Голосовое${message.audio.duration ? " · " + message.audio.duration + " с" : ""}`}
    </button>
  );
}

export function ChatMediaCard({ media, setLightbox }) {
  if (media.type === "video") {
    return <video controls src={media.url} style={{ maxWidth: 240, maxHeight: 220, borderRadius: 8, display: "block" }} />;
  }
  return (
    <img src={media.url} alt="" style={{ maxWidth: 200, maxHeight: 200, borderRadius: 8, display: "block", cursor: "pointer", objectFit: "cover" }}
      onClick={() => setLightbox({ images: [media.url], index: 0, name: "Фото" })} />
  );
}

export function ChatProductCard({ sku, catalog, getProductImage, setLightbox }) {
  const p = catalog.find((x) => String(x.sku) === String(sku));
  if (!p) return <div style={{ fontSize: 12, color: "var(--muted-2)", fontStyle: "italic" }}>Товар удалён из каталога</div>;
  const img = getProductImage(p.sku);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 8, maxWidth: 260 }}>
      {img && img.main ? (
        <ProductThumb src={img.main} size={40} onClick={() => setLightbox({ images: [img.main, ...img.gallery], index: 0, name: p.name })} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--surface)", flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted-2)" }}>арт. {p.sku}</div>
      </div>
    </div>
  );
}

export function SearchModeToggle({ mode, onChange }) {
  const options = [
    { v: "all", label: "Везде" },
    { v: "name", label: "Название" },
    { v: "barcode", label: "Штрихкод" },
    { v: "sku", label: "Артикул" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          style={{
            padding: "4px 10px", fontSize: 11, borderRadius: 999, cursor: "pointer",
            border: "1px solid " + (mode === o.v ? "var(--accent)" : "var(--border)"),
            background: mode === o.v ? "var(--accent)" : "transparent",
            color: mode === o.v ? "#1a1a1a" : "var(--muted)",
            fontWeight: mode === o.v ? 600 : 400,
          }}>{o.label}</button>
      ))}
    </div>
  );
}

export function ProductThumb({ src, size, onClick }) {
  const [stage, setStage] = useState("direct");
  if (!src || stage === "broken") {
    return (
      <div style={{ width: size, height: size, flexShrink: 0, borderRadius: size > 44 ? 8 : 6, background: "var(--bg-alt)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 44 ? 10 : 9, color: "var(--muted-2)", textAlign: "center", padding: 2 }}>
        {src ? "не загрузилось" : ""}
      </div>
    );
  }
  const currentSrc = stage === "proxy" ? proxiedImageUrl(src) : src;
  return (
    <img src={currentSrc} alt="" referrerPolicy="no-referrer"
      style={{ width: size, height: size, objectFit: "cover", borderRadius: size > 44 ? 8 : 6, flexShrink: 0, background: "var(--bg-alt)", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      onError={() => setStage((s) => (s === "direct" ? "proxy" : "broken"))} />
  );
}

export function LightboxImage({ src, onStop }) {
  const [stage, setStage] = useState("direct");
  useEffect(() => setStage("direct"), [src]);
  if (stage === "broken") {
    return <div style={{ width: 300, height: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "#222", color: "#999", borderRadius: 8, fontSize: 13 }}>Не удалось загрузить фото</div>;
  }
  const currentSrc = stage === "proxy" ? proxiedImageUrl(src) : src;
  return (
    <img src={currentSrc} alt="" referrerPolicy="no-referrer" style={{ maxWidth: "90vw", maxHeight: "70vh", borderRadius: 8, background: "#fff" }}
      onClick={onStop} onError={() => setStage((s) => (s === "direct" ? "proxy" : "broken"))} />
  );
}

export function PieceOptionRow({ label, qty, onQtyChange, priceLabel, priceColor, onAdd }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "6px 0", borderTop: "1px dashed var(--border)" }}>
      {label && <span className="mono" style={{ fontSize: 11, color: "var(--muted-2)", minWidth: 70 }}>{label}</span>}
      <span className="mono" style={{ color: priceColor, fontSize: 13 }}>{priceLabel}</span>
      <button className="btn" style={{ padding: "6px 12px", marginLeft: "auto" }} onClick={() => onQtyChange(Math.max(1, (parseInt(qty) || 0) - 1))}>-</button>
      <input className="mono" style={{ width: 50, textAlign: "center" }} value={qty}
        onChange={(ev) => {
          const v = ev.target.value;
          if (v === "") { onQtyChange(""); return; } // разрешаем временно очистить поле, чтобы ввести своё число
          if (/^\d+$/.test(v)) onQtyChange(parseInt(v, 10));
        }}
        onBlur={() => { if (qty === "" || Number(qty) < 1) onQtyChange(1); }} />
      <button className="btn" style={{ padding: "6px 12px" }} onClick={() => onQtyChange((parseInt(qty) || 0) + 1)}>+</button>
      <button className="btn btn-accent" style={{ padding: "8px 14px" }} onClick={onAdd}>Добавить</button>
    </div>
  );
}

export function BarcodeAddRow({ sku, onAdd }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open) {
    return (
      <button className="btn" style={{ padding: "4px 10px", fontSize: 11, marginTop: 8 }} onClick={() => setOpen(true)}>+ штрихкод</button>
    );
  }
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <input placeholder="Новый штрихкод" value={val} onChange={(e) => setVal(e.target.value)} style={{ flex: 1 }} />
      <button className="btn btn-accent" style={{ padding: "6px 12px" }} onClick={() => { if (val.trim()) { onAdd(val); setVal(""); setOpen(false); } }}>OK</button>
      <button className="btn" style={{ padding: "6px 12px" }} onClick={() => { setOpen(false); setVal(""); }}>×</button>
    </div>
  );
}

export function SortableTh({ label, sortKey, currentKey, dir, onClick }) {
  const active = sortKey === currentKey;
  return (
    <th style={{ cursor: "pointer", userSelect: "none", color: active ? "var(--accent)" : undefined }} onClick={() => onClick(sortKey)}>
      {label} {active ? (dir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}

export function StopwatchCard({ running, elapsedMs, qtyInput, setQtyInput, onStart, onPause, onReset, onSave, mySessions }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Секундомер</div>
      <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
        <div className="mono" style={{ fontSize: 36, fontWeight: 700, textAlign: "center", color: running ? "var(--accent)" : "var(--text)", marginBottom: 12, letterSpacing: "0.02em" }}>
          {fmtDuration(elapsedMs)}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
          {!running ? (
            <button className="btn btn-accent" style={{ padding: "8px 18px" }} onClick={onStart}>Старт</button>
          ) : (
            <button className="btn" style={{ padding: "8px 18px" }} onClick={onPause}>Пауза</button>
          )}
          <button className="btn" style={{ padding: "8px 14px" }} onClick={onReset}>Сброс</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Сколько шт. упаковано" value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} style={{ flex: 1 }} />
          <button className="btn btn-accent" style={{ padding: "8px 14px" }} onClick={onSave}>Записать</button>
        </div>
        {mySessions.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 6 }}>ПОСЛЕДНИЕ ЗАМЕРЫ</div>
            {mySessions.map((s) => (
              <div key={s.id} className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", padding: "3px 0" }}>
                <span>{fmtDate(s.date)} · {s.qty} шт.</span>
                <span>{fmtDuration(s.seconds * 1000)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Manifest({ employee, entries, totals, money, deleteEntry, onUndoLast }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Сводка за сегодня</div>
        {entries.length > 0 && (
          <button className="btn btn-danger" style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600 }} onClick={onUndoLast}>↩ Отменить последнее</button>
        )}
      </div>
      <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ height: 8, background: "repeating-linear-gradient(90deg, var(--border) 0 6px, transparent 6px 12px)" }} />
        <div style={{ padding: "16px 18px" }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 10 }}>{employee.name.toUpperCase()}</div>
          <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
            {entries.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "8px 0" }}>Пока ничего не добавлено.</div>}
            {entries.map((e) => (
              <div key={e.id} className="mono" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px dashed var(--surface-2)" }}>
                <span style={{ color: "var(--text-secondary)" }}>{e.type === "piece" ? `${e.qty}× ${e.productName}` : `Смена ${e.hours}ч`}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{money(e.type === "piece" ? e.qty * e.unitPrice : e.hours * e.rate)}</span>
                  <button onClick={() => deleteEntry(e.id)} style={{ background: "none", border: "none", color: "var(--muted-2)", cursor: "pointer", fontSize: 15, lineHeight: 1 }} title="Удалить">×</button>
                </span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
            <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 4 }}><span>Сдельная</span><span>{money(totals.piece)}</span></div>
            <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginBottom: 10 }}><span>Почасовая</span><span>{money(totals.hour)}</span></div>
            <div className="display" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 22, fontWeight: 700, color: "var(--accent)" }}><span style={{ fontSize: 14, fontFamily: "Inter" }}>ИТОГО</span><span className="mono">{money(totals.total)}</span></div>
          </div>
        </div>
        <div style={{ height: 8, background: "repeating-linear-gradient(90deg, var(--border) 0 6px, transparent 6px 12px)" }} />
      </div>
    </div>
  );
}
