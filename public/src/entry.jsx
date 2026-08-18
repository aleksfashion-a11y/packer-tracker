import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// --- window.storage shim ---
// Mimics the Claude-artifact window.storage API, but backed by:
//  - shared=true  -> our own Express server (data/store.json on disk)
//  - shared=false -> the browser's localStorage (per-device personal prefs)
const LOCAL_PREFIX = "packer-kv:";

async function apiFetch(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = new Error("storage request failed: " + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

window.storage = {
  async get(key, shared) {
    if (!shared) {
      const raw = localStorage.getItem(LOCAL_PREFIX + key);
      if (raw === null) throw new Error("not found");
      return { key, value: raw, shared: false };
    }
    return apiFetch(`/api/kv/${encodeURIComponent(key)}`);
  },
  async set(key, value, shared) {
    if (!shared) {
      localStorage.setItem(LOCAL_PREFIX + key, value);
      return { key, value, shared: false };
    }
    return apiFetch(`/api/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  },
  async delete(key, shared) {
    if (!shared) {
      localStorage.removeItem(LOCAL_PREFIX + key);
      return { key, deleted: true, shared: false };
    }
    return apiFetch(`/api/kv/${encodeURIComponent(key)}`, { method: "DELETE" });
  },
  async list(prefix, shared) {
    if (!shared) {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL_PREFIX)) {
          const bare = k.slice(LOCAL_PREFIX.length);
          if (!prefix || bare.startsWith(prefix)) keys.push(bare);
        }
      }
      return { keys, prefix, shared: false };
    }
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : "";
    return apiFetch(`/api/kv${qs}`);
  },
};

const root = createRoot(document.getElementById("root"));
root.render(<App />);
