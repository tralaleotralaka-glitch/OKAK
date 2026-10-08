(() => {
  "use strict";

  const STORAGE_KEY = "okak.chat.v1";
  const THEME_KEY = "okak.theme";
  const REQUEST_TIMEOUT_MS = 7000; // жёсткий предел пользователя: ответ < 7 с
  const SUGGESTIONS = [
    "Который час?",
    "Какое сегодня число?",
    "Сколько дней до нового года?",
    "Сколько будет 15% от 480?",
    "Корень из 144",
    "Реши x^2 - 5x + 6 = 0",
    "Производная от x^3 + 2x",
    "Кто такой Пушкин?",
    "Столица Франции",
    "Что такое фотосинтез?",
    "Расскажи анекдот",
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    log: $("log"), form: $("form"), input: $("input"), send: $("sendBtn"),
    chips: $("chips"), clear: $("clearBtn"), theme: $("themeBtn"),
    dot: $("statusDot"), statusText: $("statusText"), clock: $("clock"), clockTz: $("clockTz"),
    tplUser: $("tplUser"), tplBot: $("tplBot"),
  };

  let history = loadHistory();
  let busy = false;
  let serverOffsetMs = 0;
  let serverTz = "";

  // ---------- тема ----------
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    els.theme.textContent = theme === "dark" ? "🌙" : "☀️";
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0b1020" : "#eef2ff";
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  els.theme.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // ---------- часы и статус ----------
  function tick() {
    const d = new Date(Date.now() + serverOffsetMs);
    const pad = (n) => String(n).padStart(2, "0");
    els.clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    if (serverTz) els.clockTz.textContent = serverTz;
  }
  setInterval(tick, 1000);
  tick();

  async function checkHealth() {
    try {
      const started = performance.now();
      const res = await fetch("/api/health", { cache: "no-store" });
      const rtt = performance.now() - started;
      const data = await res.json();
      // Сдвиг часов сервера относительно браузера (с поправкой на сетевую задержку).
      serverOffsetMs = new Date(data.time.iso).getTime() - (Date.now() - rtt / 2);
      serverTz = data.time.tz;
      els.dot.className = "dot on";
      els.statusText.textContent = data.mode === "ai" ? "AI-режим · онлайн" : "Локальный режим · онлайн";
    } catch (e) {
      els.dot.className = "dot off";
      els.statusText.textContent = "нет связи с сервером";
    }
  }
  checkHealth();
  setInterval(checkHealth, 60000);

  // ---------- разметка ответов ----------
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function renderText(raw) {
    let html = escapeHtml(raw);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return html.replace(/\n/g, "<br>");
  }

  // ---------- сообщения ----------
  const INTENT_LABEL = {
    smalltalk: "Диалог", time: "Время и дата", math: "Математика", capital: "Знания",
    knowledge: "База знаний", llm: "AI", fallback: "Нет ответа", error: "Ошибка",
  };

  function scrollDown() {
    els.log.scrollTop = els.log.scrollHeight;
  }

  function addUser(text) {
    const node = els.tplUser.content.firstElementChild.cloneNode(true);
    node.querySelector(".bubble").textContent = text;
    els.log.appendChild(node);
    scrollDown();
  }

  function addBot(text, meta) {
    const node = els.tplBot.content.firstElementChild.cloneNode(true);
    node.querySelector(".bubble").innerHTML = renderText(text);
    const m = node.querySelector(".meta");
    if (meta) {
      if (meta.error) node.classList.add("error");
      const label = INTENT_LABEL[meta.intent] || "Ответ";
      m.innerHTML = `<span class="tag${meta.error ? " err" : ""}">${escapeHtml(label)}</span>` +
        (meta.elapsed_ms !== undefined ? `<span>⚡ ${meta.elapsed_ms} мс</span>` : "") +
        (meta.source === "llm" ? `<span>через AI</span>` : "");
    } else {
      m.remove();
    }
    els.log.appendChild(node);
    scrollDown();
    return node;
  }

  function addTyping() {
    const node = els.tplBot.content.firstElementChild.cloneNode(true);
    node.id = "typing";
    node.querySelector(".bubble").innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    node.querySelector(".meta").remove();
    els.log.appendChild(node);
    scrollDown();
  }
  function removeTyping() {
    const t = $("typing");
    if (t) t.remove();
  }

  function renderWelcome() {
    if (history.length) return;
    const w = document.createElement("div");
    w.className = "welcome";
    w.id = "welcome";
    w.innerHTML = `<h2>Привет! Я OKAK</h2>
      <p>Знаю время и дату, считаю математику, решаю уравнения, рассказываю о науке, истории и литературе.
      Выберите подсказку или напишите свой вопрос.</p>`;
    els.log.appendChild(w);
  }

  function renderHistory() {
    els.log.innerHTML = "";
    if (!history.length) return renderWelcome();
    for (const item of history) {
      if (item.role === "user") addUser(item.content);
      else addBot(item.content, item.meta);
    }
    scrollDown();
  }

  // ---------- подсказки ----------
  function renderChips() {
    els.chips.innerHTML = "";
    const pick = [...SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 6);
    for (const text of pick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = text;
      b.addEventListener("click", () => send(text));
      els.chips.appendChild(b);
    }
  }

  // ---------- отправка ----------
  async function ask(message) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function send(text) {
    const message = (text ?? els.input.value).trim();
    if (!message || busy) return;
    busy = true;
    els.send.disabled = true;
    $("welcome")?.remove();

    addUser(message);
    history.push({ role: "user", content: message });
    els.input.value = "";
    autoResize();
    addTyping();

    try {
      const data = await ask(message);
      removeTyping();
      addBot(data.reply, { intent: data.intent, elapsed_ms: data.elapsed_ms, source: data.source });
      history.push({ role: "assistant", content: data.reply, meta: { intent: data.intent, elapsed_ms: data.elapsed_ms, source: data.source } });
    } catch (err) {
      removeTyping();
      const timeout = err.name === "AbortError";
      const text = timeout
        ? "Ответ занял слишком много времени. Попробуйте ещё раз или упростите вопрос."
        : "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.";
      addBot(text, { intent: "error", error: true, elapsed_ms: undefined });
      history.push({ role: "assistant", content: text, meta: { intent: "error", error: true } });
    } finally {
      saveHistory();
      busy = false;
      els.send.disabled = false;
      els.input.focus();
    }
  }

  // ---------- ввод ----------
  function autoResize() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 160) + "px";
  }
  els.input.addEventListener("input", autoResize);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });
  els.clear.addEventListener("click", () => {
    if (!history.length) return;
    history = [];
    saveHistory();
    renderHistory();
    renderChips();
  });

  // ---------- хранение ----------
  function loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw.slice(-40) : [];
    } catch {
      return [];
    }
  }
  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40)));
    } catch {
      /* приватный режим и т.п. — не критично */
    }
  }

  renderHistory();
  renderChips();
  autoResize();
  els.input.focus();
})();
