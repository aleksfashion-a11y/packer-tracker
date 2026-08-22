import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// --- window.storage shim ---
// Mimics the Claude-artifact window.storage API, but backed by:
//  - shared=true  -> our own Express server (data/store.json on disk / PostgreSQL)
//  - shared=false -> the browser's localStorage (per-device personal prefs)
//
// Offline support: every successful "shared" read is mirrored into localStorage.
// If a "shared" read fails because there's no network, we transparently fall back
// to that last-known-good mirror instead of throwing — so the app can still open
// and show the last data it saw, even with zero connectivity.
const LOCAL_PREFIX = "packer-kv:";
const MIRROR_PREFIX = "packer-kv-mirror:";

function isNetworkError(err) {
  // A real HTTP error (4xx/5xx) has a numeric .status — those are legitimate
  // server responses, not connectivity problems, so we don't want to mask those
  // with stale cached data. A network-level failure (offline, DNS, timeout) has
  // no .status at all (fetch() itself rejects before getting a response).
  return !err || typeof err.status !== "number";
}

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
    try {
      const result = await apiFetch(`/api/kv/${encodeURIComponent(key)}`);
      try { localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(result)); } catch (e) { /* storage full — ignore */ }
      return result;
    } catch (err) {
      if (isNetworkError(err)) {
        const mirrored = localStorage.getItem(MIRROR_PREFIX + key);
        if (mirrored !== null) return JSON.parse(mirrored);
      }
      throw err;
    }
  },
  async set(key, value, shared) {
    if (!shared) {
      localStorage.setItem(LOCAL_PREFIX + key, value);
      return { key, value, shared: false };
    }
    const result = await apiFetch(`/api/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    // Keep the offline mirror in sync with what we just successfully wrote,
    // so a later offline read of this key reflects our own latest change.
    try { localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify({ key, value, shared: true })); } catch (e) {}
    return result;
  },
  async delete(key, shared) {
    if (!shared) {
      localStorage.removeItem(LOCAL_PREFIX + key);
      return { key, deleted: true, shared: false };
    }
    const result = await apiFetch(`/api/kv/${encodeURIComponent(key)}`, { method: "DELETE" });
    localStorage.removeItem(MIRROR_PREFIX + key);
    return result;
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

// Регистрируем service worker (кэш «оболочки» приложения — html/js/иконки), чтобы
// сама страница открывалась даже совсем без интернета. Без этого браузер не может
// загрузить даже bundle.js при первом заходе офлайн — до кода приложения дело не
// доходит вообще.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* не критично, просто не будет офлайн-загрузки оболочки */ });
  });
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);
