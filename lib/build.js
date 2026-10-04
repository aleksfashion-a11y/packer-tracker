// Сборка интерфейса (src/entry.jsx + src/App.jsx → один файл bundle.js) прямо на сервере.
//
// Раньше bundle.js нужно было собирать на своём компьютере и загружать на GitHub
// вместе с исходниками. Теперь сервер собирает его сам при запуске — на GitHub
// достаточно загрузить исходники. Если исходники не менялись с прошлой сборки,
// повторно ничего не собирается.

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const BUILD_OPTIONS_VERSION = "1"; // поменять, если меняются параметры сборки ниже
// BUNDLE_DEBUG=1 — собрать без сжатия кода: в сообщениях об ошибках в браузере будут
// настоящие имена функций и строки (нужно только при поиске ошибки)
const DEBUG = process.env.BUNDLE_DEBUG === "1";

function sourceHash(rootDir) {
  const h = crypto.createHash("sha1");
  h.update("opts:" + BUILD_OPTIONS_VERSION + (DEBUG ? ":debug" : ""));
  // Все исходники интерфейса, включая вложенные папки (screens/, lib/, ui/, data/)
  const srcDir = path.join(rootDir, "src");
  const files = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (/\.(jsx?|css)$/.test(f)) files.push(full);
    }
  })(srcDir);
  for (const full of files) {
    h.update("\n" + path.relative(srcDir, full).split(path.sep).join("/") + "\n");
    h.update(fs.readFileSync(full));
  }
  // Версии библиотек тоже влияют на результат
  for (const dep of ["react", "react-dom", "recharts", "xlsx", "esbuild"]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "node_modules", dep, "package.json"), "utf-8"));
      h.update(`\n${dep}@${pkg.version}`);
    } catch (e) { /* не установлена — сборка сама сообщит об ошибке */ }
  }
  return h.digest("hex").slice(0, 16);
}

function candidateDirs(rootDir) {
  return [path.join(rootDir, ".build"), path.join(os.tmpdir(), "packer-tracker-build")];
}

function readExisting(dir, hash) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf-8"));
    if (meta.hash !== hash) return null;
    const js = fs.readFileSync(path.join(dir, "bundle.js"));
    const read = (name) => { try { return fs.readFileSync(path.join(dir, name)); } catch (e) { return null; } };
    return { hash, js, gz: read("bundle.js.gz"), br: read("bundle.js.br"), dir };
  } catch (e) {
    return null;
  }
}

function writableDir(rootDir) {
  for (const dir of candidateDirs(rootDir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (e) { /* пробуем следующий вариант */ }
  }
  return null;
}

// Возвращает { hash, js, gz, br } или бросает ошибку с понятным описанием.
async function ensureBundle(rootDir, log) {
  log = log || (() => {});
  const hash = sourceHash(rootDir);
  for (const dir of candidateDirs(rootDir)) {
    const existing = readExisting(dir, hash);
    if (existing) {
      log(`✅ Интерфейс уже собран (сборка ${hash}), повторная сборка не нужна`);
      return existing;
    }
  }

  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch (e) {
    throw new Error("не найден пакет esbuild — проверьте, что при деплое выполнился npm install (" + e.message + ")");
  }

  const started = Date.now();
  const result = await esbuild.build({
    entryPoints: [path.join(rootDir, "src", "entry.jsx")],
    bundle: true,
    write: false,
    minify: !DEBUG,
    jsx: "automatic",
    loader: { ".jsx": "jsx", ".js": "js" },
    define: { "process.env.NODE_ENV": '"production"' },
    target: ["es2020"],
    legalComments: "none",
    logLevel: "silent",
    absWorkingDir: rootDir,
  });
  const js = Buffer.from(result.outputFiles[0].contents);
  const gz = zlib.gzipSync(js, { level: 9 });
  const br = zlib.brotliCompressSync(js, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: js.length },
  });

  const dir = writableDir(rootDir);
  if (dir) {
    try {
      fs.writeFileSync(path.join(dir, "bundle.js"), js);
      fs.writeFileSync(path.join(dir, "bundle.js.gz"), gz);
      fs.writeFileSync(path.join(dir, "bundle.js.br"), br);
      fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ hash, builtAt: new Date().toISOString() }));
    } catch (e) { /* не смогли сохранить на диск — не страшно, отдаём из памяти */ }
  }
  const kb = (n) => Math.round(n / 1024) + " КБ";
  log(`✅ Интерфейс собран за ${Date.now() - started} мс (сборка ${hash}): ${kb(js.length)}, в сжатом виде ${kb(br.length)}`);
  return { hash, js, gz, br, dir };
}

module.exports = { ensureBundle };

// Запуск вручную: npm run build
if (require.main === module) {
  ensureBundle(path.join(__dirname, ".."), console.log).catch((e) => {
    console.error("❌ Не удалось собрать интерфейс:", e.message);
    process.exit(1);
  });
}
