// Стили всего приложения и подключение шрифтов.

// GlobalStyle и FontLinks вынесены сюда, ЗА пределы компонента App — раньше они были
// объявлены прямо внутри App() и из-за этого пересоздавались заново при КАЖДОЙ его
// перерисовке (то есть буквально на любое изменение состояния — переключение вкладки,
// новое сообщение в чате и т.п.). React считал их "новым" компонентом на каждый такой
// рендер и полностью пересоздавал <style> (сотни строк CSS) и <link> с шрифтами —
// Safari/WebKit на iPhone заметно тормозит и "дёргается" на такой частой пересборке
// стилей, в отличие от Chrome на Android. Вынесенные наружу, они создаются один раз.
export function GlobalStyle() {
  return (
    <style>{`
      :root {
        --bg: #1B1F24; --bg-alt: #20252A; --surface: #262B31; --surface-2: #2C333B;
        --border: #3A424B; --border-strong: #4B545E; --text: #EDEFF0; --text-secondary: #C7CDD3;
        --muted: #8D97A0; --muted-2: #6C747C; --input-bg: #1F2429;
        --accent: #F2A33B; --accent-hover: #F5B457; --accent-ink: #241705;
        --teal: #49B5A6; --danger: #E2604F;
      }
      [data-theme="light"] {
        --bg: #F3F4F6; --bg-alt: #FFFFFF; --surface: #FFFFFF; --surface-2: #EEF0F2;
        --border: #DADEE3; --border-strong: #C2C8CE; --text: #1B1F24; --text-secondary: #33393F;
        --muted: #5B6470; --muted-2: #7A828C; --input-bg: #FFFFFF;
        --accent: #DB8A2A; --accent-hover: #C97B22; --accent-ink: #FFFFFF;
        --teal: #2E8F82; --danger: #C6462F;
      }
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      html, body { height: 100%; overscroll-behavior-y: none; }
      .btn { cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 8px; padding: 10px 14px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500; transition: background .15s, border-color .15s; text-align: center; }
      label.btn { display: inline-flex; align-items: center; justify-content: center; }
      .pack-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
      .pack-chip { display: inline-flex; align-items: stretch; max-width: 100%; border: 1px solid var(--border); border-radius: 999px; background: var(--bg-alt); font-size: 12px; overflow: hidden; }
      .pack-chip.main { border-color: var(--accent); }
      .pack-chip.empty { border-style: dashed; color: var(--muted-2); padding: 4px 10px; }
      .pack-chip-label { padding: 4px 4px 4px 10px; background: none; border: none; color: var(--text); font: inherit; text-align: left; cursor: default; min-width: 0; overflow-wrap: anywhere; }
      .pack-chip-label.clickable { cursor: pointer; }
      .pack-chip-x { padding: 4px 10px 4px 6px; background: none; border: none; color: var(--muted-2); cursor: pointer; font-size: 13px; line-height: 1; }
      .pack-chip-x:hover { color: var(--danger); }
      .btn:hover { background: var(--surface-2); border-color: var(--border-strong); }
      .btn:active { transform: scale(0.98); }
      .btn-accent { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
      .btn-accent:hover { background: var(--accent-hover); }
      .btn-danger { background: transparent; border-color: var(--border-strong); color: var(--danger); }
      .btn-danger:hover { background: rgba(226,96,79,0.12); }
      input, select, textarea { background: var(--input-bg); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 9px 11px; font-family: 'Inter', sans-serif; font-size: 16px; }
      input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
      input::placeholder, textarea::placeholder { color: var(--muted-2); }
      .mono { font-family: 'IBM Plex Mono', monospace; }
      .display { font-family: 'Oswald', sans-serif; }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: left; padding: 9px 8px; font-size: 13px; }
      th { color: var(--muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; border-bottom: 1px solid var(--border); }
      td { border-bottom: 1px solid var(--surface-2); }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
      .grid-log { display: grid; grid-template-columns: 1.4fr 1fr; gap: 24px; }
      .grid-emp { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .chat-layout { display: flex; gap: 16px; height: 560px; max-width: 900px; }
      .chat-threads { width: 220px; flex-shrink: 0; }
      .chat-panel { flex: 1; min-width: 0; }
      .chat-input-row { padding: 12px; border-top: 1px solid var(--surface-2); display: flex; gap: 8px; align-items: center; }
      .chat-icon-btn { padding: 8px 10px; font-size: 12px; flex-shrink: 0; }
      @media (max-width: 760px) {
        .grid-log, .grid-emp { grid-template-columns: 1fr; gap: 20px; }
        .btn, select, input[type="date"] { min-height: 44px; }
        .pack-chip-label { padding-top: 9px; padding-bottom: 9px; }
        .pack-chip-x { padding: 9px 12px 9px 8px; }
        table { font-size: 12px; }
        th, td { padding: 8px 6px; }
        .chat-layout { flex-direction: column; height: 78vh; max-width: 100%; }
        .chat-threads { width: 100%; max-height: 130px; }
        .chat-panel { min-height: 0; }
        .chat-icon-btn { padding: 8px 8px; font-size: 15px; min-height: 0; }
        .chat-input-row { padding: 8px; gap: 6px; }
        .chat-input-row input[type="text"], .chat-input-row input:not([type]) { min-width: 0; }
      }
      @media (max-width: 480px) {
        .header-btn-label { display: none; }
      }
      @media (max-width: 400px) {
        .display { font-size: 22px !important; }
      }
      .row-wrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .header-search-item:hover { background: var(--surface-2); }
      #print-payslip { display: none; }
      @media print {
        body * { visibility: hidden; }
        #print-payslip, #print-payslip * { visibility: visible; }
        #print-payslip { display: block; position: absolute; top: 0; left: 0; width: 100%; padding: 20px; color: #000; background: #fff; }
        #print-payslip table { border-collapse: collapse; width: 100%; }
        #print-payslip th, #print-payslip td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; text-align: left; }
        #print-payslip h1 { font-size: 18px; margin: 0 0 4px; }
        #print-payslip .print-sub { font-size: 12px; color: #444; margin-bottom: 16px; }
      }
    `}</style>
  );
}

export function FontLinks() {
  return (
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Oswald:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
  );
}
