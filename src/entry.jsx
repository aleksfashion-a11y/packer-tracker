import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { createStorage } from "./storage.js";

// window.storage — слой между приложением (App.jsx) и сервером, см. storage.js
window.storage = createStorage({
  fetchFn: (path, options) => fetch(path, options),
  ls: window.localStorage,
  // Сервер ответил "нужно войти" (сессия истекла или сотрудника удалили) —
  // сообщаем приложению, оно покажет экран входа
  onAuthExpired: () => window.dispatchEvent(new CustomEvent("packer-auth-expired")),
});

// Service worker кэширует «оболочку» приложения (html/js/иконки), чтобы сама страница
// открывалась даже совсем без интернета.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* не критично, просто не будет офлайн-загрузки оболочки */ });
  });
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);
