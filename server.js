const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(require("os").tmpdir(), "packer-tracker-data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  } catch (e) {
    return {};
  }
}
function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store));
}

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

// GET /api/kv?prefix=xxx  -> list keys
// GET /api/kv/:key        -> get one value
app.get("/api/kv", (req, res) => {
  const store = loadStore();
  const prefix = req.query.prefix || "";
  const keys = Object.keys(store).filter((k) => k.startsWith(prefix));
  res.json({ keys, prefix, shared: true });
});

app.get("/api/kv/:key", (req, res) => {
  const store = loadStore();
  const key = req.params.key;
  if (!(key in store)) return res.status(404).json({ error: "not found" });
  res.json({ key, value: store[key], shared: true });
});

app.put("/api/kv/:key", (req, res) => {
  const store = loadStore();
  const key = req.params.key;
  store[key] = req.body.value;
  saveStore(store);
  res.json({ key, value: store[key], shared: true });
});

app.delete("/api/kv/:key", (req, res) => {
  const store = loadStore();
  const key = req.params.key;
  const existed = key in store;
  delete store[key];
  saveStore(store);
  res.json({ key, deleted: existed, shared: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}, данные в ${STORE_FILE}`);
});
