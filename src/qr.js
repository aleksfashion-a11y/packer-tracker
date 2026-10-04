// Построение QR-кода прямо в приложении — без обращения к сторонним сервисам.
// Раньше картинку QR рисовал внешний сайт, и код входа сотрудника уходил ему в адресе
// запроса. Теперь код никуда не отправляется.
//
// Поддерживается то, что нужно для кодов входа: текст до 106 байт, версии QR 1–5,
// уровень коррекции L, байтовый режим.

const CAPACITY = [17, 32, 53, 78, 106];      // сколько байт текста помещается (версии 1..5)
const DATA_CODEWORDS = [19, 34, 55, 80, 108]; // кодовых слов данных
const EC_CODEWORDS = [7, 10, 15, 20, 26];     // кодовых слов коррекции ошибок

// --- арифметика поля GF(256) для кода Рида — Соломона ---
const EXP = new Array(512);
const LOG = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsRemainder(data, ecLen) {
  // порождающий многочлен: (x - α^0)(x - α^1)...(x - α^(ecLen-1))
  let gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const rem = new Array(ecLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift(); rem.push(0);
    for (let j = 0; j < ecLen; j++) rem[j] ^= gfMul(gen[j + 1], factor);
  }
  return rem;
}

function utf8Bytes(text) {
  const out = [];
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function maskFn(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function penalty(m) {
  const n = m.length;
  let score = 0;
  // 1) серии из 5+ одинаковых модулей подряд
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j <= n; j++) {
        const cur = j < n ? (pass ? m[j][i] : m[i][j]) : null;
        const prev = pass ? m[j - 1][i] : m[i][j - 1];
        if (j < n && cur === prev) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
    }
  }
  // 2) блоки 2×2 одного цвета
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  // 3) узоры, похожие на угловой маркер
  const pat = [true, false, true, true, true, false, true];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) {
      const at = (k) => (pass ? m[j + k][i] : m[i][j + k]);
      let a = true, b = true;
      for (let k = 0; k < 7; k++) { if (at(k) !== pat[k]) a = false; if (at(k + 4) !== pat[k]) b = false; }
      for (let k = 7; k < 11; k++) if (at(k)) a = false;
      for (let k = 0; k < 4; k++) if (at(k)) b = false;
      if (a) score += 40;
      if (b) score += 40;
    }
  }
  // 4) перекос в сторону тёмных или светлых модулей
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

// Возвращает квадратную матрицу: true — тёмный модуль. null — если текст не помещается.
export function qrMatrix(text) {
  const bytes = utf8Bytes(text);
  const vi = CAPACITY.findIndex((cap) => bytes.length <= cap);
  if (vi === -1) return null;
  const version = vi + 1;
  const size = 17 + 4 * version;

  // --- поток данных ---
  const bits = [];
  const push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };
  push(0b0100, 4);          // байтовый режим
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const totalBits = DATA_CODEWORDS[vi] * 8;
  for (let i = 0; i < 4 && bits.length < totalBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0; data.length < DATA_CODEWORDS[vi]; pad++) data.push(pad % 2 ? 0x11 : 0xec);
  const codewords = data.concat(rsRemainder(data, EC_CODEWORDS[vi]));

  // --- служебные узоры ---
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, v) => { m[r][c] = v; reserved[r][c] = true; };
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      set(rr, cc, ring !== 2 && ring !== 4);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  if (version >= 2) {
    const p = size - 7;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(p + r, p + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }
  set(size - 8, 8, true); // всегда тёмный модуль
  // места под служебную информацию о формате
  for (let i = 0; i <= 8; i++) { if (!reserved[8][i]) set(8, i, false); if (!reserved[i][8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); if (i < 7) set(size - 1 - i, 8, false); }

  // --- укладка данных зигзагом ---
  const stream = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) stream.push((cw >> i) & 1);
  let idx = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // вертикальную линию синхронизации пропускаем
    for (let k = 0; k < size; k++) {
      const r = up ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (reserved[r][c]) continue;
        m[r][c] = idx < stream.length ? stream[idx] === 1 : false;
        idx++;
      }
    }
    up = !up;
  }

  // --- выбор маски и запись формата ---
  const build = (mask) => {
    const out = m.map((row) => row.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!reserved[r][c] && maskFn(mask, r, c)) out[r][c] = !out[r][c];
    // 15 бит формата: уровень L (01) + номер маски, защита BCH(15,5)
    const fmtData = (0b01 << 3) | mask;
    let rem = fmtData << 10;
    for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
    const fmt = ((fmtData << 10) | rem) ^ 0x5412;
    const bit = (i) => ((fmt >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) out[8][i] = bit(14 - i);
    out[8][7] = bit(8); out[8][8] = bit(7); out[7][8] = bit(6);
    for (let i = 0; i <= 5; i++) out[5 - i][8] = bit(5 - i);
    for (let i = 0; i < 7; i++) out[size - 1 - i][8] = bit(14 - i);
    for (let i = 0; i < 8; i++) out[8][size - 8 + i] = bit(7 - i);
    return out;
  };
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = build(mask);
    const p = penalty(candidate);
    if (!best || p < best.p) best = { p, matrix: candidate };
  }
  return best.matrix;
}

// Готовая SVG-картинка QR-кода (строка) с белыми полями вокруг
export function qrSvg(text, pixelSize) {
  const matrix = qrMatrix(text);
  if (!matrix) return null;
  const quiet = 4;
  const n = matrix.length + quiet * 2;
  let path = "";
  for (let r = 0; r < matrix.length; r++) for (let c = 0; c < matrix.length; c++) {
    if (matrix[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  const px = pixelSize || 220;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
