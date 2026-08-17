const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), "packer-tracker-data");
const DATA_FILE = path.join(DATA_DIR, "data.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      employees: [{ id: uid(), name: "Иван", hourlyRate: 250 }],
      products: [
        { id: uid(), name: "Коробка S", price: 15 },
        { id: uid(), name: "Коробка M", price: 25 },
        { id: uid(), name: "Коробка L", price: 40 },
      ],
      entries: [],
      settings: { currency: "₽" },
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {
    return { employees: [], products: [], entries: [], settings: { currency: "₽" } };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/state", (req, res) => {
  res.json(loadData());
});

app.post("/api/employees", (req, res) => {
  const data = loadData();
  const emp = { id: uid(), name: req.body.name, hourlyRate: Number(req.body.hourlyRate) || 0 };
  data.employees.push(emp);
  saveData(data);
  res.json(data);
});

app.put("/api/employees/:id", (req, res) => {
  const data = loadData();
  data.employees = data.employees.map((e) =>
    e.id === req.params.id ? { ...e, name: req.body.name, hourlyRate: Number(req.body.hourlyRate) || 0 } : e
  );
  saveData(data);
  res.json(data);
});

app.delete("/api/employees/:id", (req, res) => {
  const data = loadData();
  data.employees = data.employees.filter((e) => e.id !== req.params.id);
  saveData(data);
  res.json(data);
});

app.post("/api/products", (req, res) => {
  const data = loadData();
  const prod = { id: uid(), name: req.body.name, price: Number(req.body.price) || 0 };
  data.products.push(prod);
  saveData(data);
  res.json(data);
});

app.put("/api/products/:id", (req, res) => {
  const data = loadData();
  data.products = data.products.map((p) =>
    p.id === req.params.id ? { ...p, name: req.body.name, price: Number(req.body.price) || 0 } : p
  );
  saveData(data);
  res.json(data);
});

app.delete("/api/products/:id", (req, res) => {
  const data = loadData();
  data.products = data.products.filter((p) => p.id !== req.params.id);
  saveData(data);
  res.json(data);
});

app.post("/api/entries", (req, res) => {
  const data = loadData();
  const entry = { id: uid(), timestamp: Date.now(), ...req.body };
  data.entries.push(entry);
  saveData(data);
  res.json(data);
});

app.delete("/api/entries/:id", (req, res) => {
  const data = loadData();
  data.entries = data.entries.filter((e) => e.id !== req.params.id);
  saveData(data);
  res.json(data);
});

app.put("/api/settings", (req, res) => {
  const data = loadData();
  data.settings = { ...data.settings, ...req.body };
  saveData(data);
  res.json(data);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
