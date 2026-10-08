/* ============ Шёпот — логика веб-клиента ============ */
"use strict";

const $ = (sel) => document.querySelector(sel);

const state = {
  cfg: { provider: "demo", demo: true, max_len: 1000 },
  threads: [],
  current: null,        // текущий диалог {id, phone, ...}
  messages: [],
  demoPhone: "",
  tab: "chat",
};

/* ---------- транспорт: браузер (fetch) или Android-мост (ShepotBridge) ---------- */
const Native = (typeof window !== "undefined") ? window.ShepotBridge : null;
let _bSeq = 0;
const _bCbs = new Map();

window._shepotCb = function (id, status, text) {
  const cb = _bCbs.get(id);
  if (!cb) return;
  _bCbs.delete(id);
  let data = null;
  try { data = JSON.parse(text); } catch (_) { /* пустое тело */ }
  if (status >= 400) cb.reject(new Error((data && data.error) || ("Ошибка " + status)));
  else cb.resolve(data || {});
};

async function api(path, opts = {}) {
  if (Native) {
    return new Promise((resolve, reject) => {
      const id = ++_bSeq;
      _bCbs.set(id, { resolve, reject });
      Native.call(String(id), path,
        opts.body ? JSON.stringify(opts.body) : "",
        opts.method || (opts.body ? "POST" : "GET"));
    });
  }
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* пустой ответ */ }
  if (!res.ok) throw new Error(data.error || ("Ошибка " + res.status));
  return data;
}

/* ---------- утилиты ---------- */
function esc(s) { // только для textContent — здесь просто маркер
  return s;
}

function toast(text, isErr = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = text;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yest.toDateString()) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/* SMS-сегменты: юникод (кириллица) — 70/67, GSM — 160/153 */
function smsInfo(text) {
  const len = text.length;
  const wide = /[^\x00-\x7F]/.test(text);
  let seg = 1;
  if (wide) { if (len > 70) seg = Math.ceil(len / 67); }
  else if (len > 160) seg = Math.ceil(len / 153);
  return `${len} симв · ${seg} SMS`;
}

/* ---------- конфиг ---------- */
async function loadConfig() {
  state.cfg = await api("/api/config");
  const mi = document.getElementById("msgInput");
  if (mi) mi.maxLength = state.cfg.max_len || 1000;

  if (state.cfg.native) {
    const tab = document.getElementById("settingsTab");
    if (tab) tab.style.display = "";
    fillSettings();
  }

  const b = $("#modeBadge");
  if (state.cfg.demo) {
    b.textContent = "демо-режим";
    b.className = "mode-badge demo";
    b.title = "SMS не отправляются по-настоящему. Подключите Twilio или SMS.ru в настройках/.env";
  } else {
    b.textContent = "SMS: " + state.cfg.provider;
    b.className = "mode-badge live";
    b.title = "Реальная отправка SMS через " + state.cfg.provider;
    $("#demoNote").classList.add("hidden");
    // симулятор телефона актуален только в демо-режиме
    document.querySelector('[data-tab="phone"]').style.display = "none";
  }
}

/* ---------- настройки (Android) ---------- */
function fillSettings() {
  const s = state.cfg.settings || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
  set("setProvider", s.provider || "demo");
  set("setSignature", s.signature || "");
  set("setTwilioSid", s.twilio_sid || "");
  set("setTwilioToken", s.twilio_token || "");
  set("setTwilioFrom", s.twilio_from || "");
  set("setSmsruId", s.smsru_api_id || "");
  setChk("setSmsruTest", s.smsru_test === "1" || s.smsru_test === true);
}

async function saveSettings() {
  const val = (id) => (document.getElementById(id) || {}).value || "";
  const body = {
    provider: val("setProvider") || "demo",
    signature: val("setSignature").trim(),
    twilio_sid: val("setTwilioSid").trim(),
    twilio_token: val("setTwilioToken").trim(),
    twilio_from: val("setTwilioFrom").trim(),
    smsru_api_id: val("setSmsruId").trim(),
    smsru_test: document.getElementById("setSmsruTest") &&
                document.getElementById("setSmsruTest").checked ? "1" : "0",
  };
  try {
    await api("/api/settings", { method: "POST", body });
    toast("Настройки сохранены");
    await loadConfig();
  } catch (e) {
    toast(e.message, true);
  }
}

/* ---------- диалоги ---------- */
async function loadThreads() {
  const data = await api("/api/threads");
  state.threads = data.threads;
  renderThreads();
}

function renderThreads() {
  const box = $("#threadList");
  box.textContent = "";
  if (!state.threads.length) {
    const e = document.createElement("div");
    e.className = "threads-empty";
    e.textContent = "Пока нет диалогов. Создайте первый ↑";
    box.appendChild(e);
    return;
  }
  for (const t of state.threads) {
    const el = document.createElement("div");
    el.className = "thread" + (state.current && state.current.id === t.id ? " active" : "");

    const top = document.createElement("div");
    top.className = "thread-top";
    const ph = document.createElement("span");
    ph.className = "thread-phone";
    ph.textContent = t.phone_pretty || t.phone;
    const tm = document.createElement("span");
    tm.className = "thread-time";
    tm.textContent = t.last_at ? fmtTime(t.last_at) : "";
    top.append(ph, tm);

    const last = document.createElement("div");
    last.className = "thread-last";
    last.textContent = t.last_body
      ? (t.last_direction === "out" ? "Вы: " : "") + t.last_body
      : "Новый диалог";

    el.append(top, last);
    el.addEventListener("click", () => openThread(t.id));
    box.appendChild(el);
  }
}

async function openThread(id) {
  const t = state.threads.find((x) => x.id === id);
  if (!t) return;
  state.current = t;
  state._sig = null;
  $("#chatEmpty").classList.add("hidden");
  $("#chatActive").classList.remove("hidden");
  $("#sidebar").classList.remove("show");
  $("#chatPhone").textContent = t.phone_pretty || t.phone;
  $("#chatNote").textContent = "анонимная переписка · " + t.phone;
  renderThreads();
  await loadMessages(true);
  $("#msgInput").focus();
}

async function loadMessages(scroll = false) {
  if (!state.current) return;
  const data = await api(`/api/threads/${state.current.id}/messages`);
  const sig = data.messages.map((m) => m.id + ":" + m.status).join(",");
  if (sig === state._sig) return; // ничего не изменилось — не перерисовываем
  state._sig = sig;
  state.messages = data.messages;
  renderMessages(scroll);
}

function renderMessages(scroll = true) {
  const box = $("#messages");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.textContent = "";

  let lastDay = "";
  for (const m of state.messages) {
    const day = fmtDay(m.created_at);
    if (day !== lastDay) {
      const sep = document.createElement("div");
      sep.className = "day-sep";
      sep.textContent = day;
      box.appendChild(sep);
      lastDay = day;
    }
    const el = document.createElement("div");
    el.className = "msg " + (m.direction === "out" ? "out" : "in") +
                   (m.status === "failed" ? " failed" : "");

    const b = document.createElement("div");
    b.className = "bubble";
    b.textContent = m.body;

    const meta = document.createElement("div");
    meta.className = "meta";
    if (m.direction === "out") {
      const st = { sent: "st-sent", queued: "st-sent", delivered: "st-delivered", failed: "st-failed" }[m.status] || "";
      meta.className += " " + st;
      meta.title = { sent: "Отправлено", delivered: "Доставлено получателю", failed: "Не отправлено: " + (m.provider || "") }[m.status] || "";
    }
    meta.appendChild(document.createTextNode(fmtTime(m.created_at)));

    el.append(b, meta);
    box.appendChild(el);
  }
  if (scroll || nearBottom) box.scrollTop = box.scrollHeight;
}

async function createThread() {
  const input = $("#newPhone");
  const raw = input.value.trim();
  if (!raw) { toast("Введите номер телефона", true); return; }
  try {
    const data = await api("/api/threads", { method: "POST", body: { phone: raw } });
    input.value = "";
    await loadThreads();
    await openThread(data.thread.id);
  } catch (e) { toast(e.message, true); }
}

let sending = false;
async function sendMessage() {
  const input = $("#msgInput");
  const body = input.value.trim();
  if (!body) { toast("Введите текст сообщения", true); return; }
  if (sending) return;
  sending = true;
  $("#sendBtn").disabled = true;
  try {
    await api(`/api/threads/${state.current.id}/messages`, { method: "POST", body: { body } });
    input.value = "";
    autoGrow(input);
    updateSeg();
    await loadMessages(true);
    await loadThreads();
  } catch (e) {
    toast(e.message, true);
    await loadMessages(true);
  } finally {
    sending = false;
    $("#sendBtn").disabled = false;
  }
}

/* ---------- телефон получателя (демо) ---------- */
async function loadDemoInbox(scroll = true) {
  if (!state.demoPhone) return;
  try {
    const data = await api("/api/demo/inbox?phone=" + encodeURIComponent(state.demoPhone));
    renderPhone(data.messages);
    if (scroll) { /* прокрутка внутри renderPhone */ }
  } catch (_) { /* демо недоступно — не мешаем */ }
}

function renderPhone(msgs) {
  const box = $("#phoneMsgs");
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.textContent = "";
  if (!msgs.length) {
    const e = document.createElement("div");
    e.className = "phone-placeholder";
    e.innerHTML = "Здесь появятся SMS,<br>отправленные на этот номер";
    box.appendChild(e);
    return;
  }
  for (const m of msgs) {
    const el = document.createElement("div");
    el.className = "pmsg from-service";
    el.textContent = m.body;
    const t = document.createElement("div");
    t.className = "pmsg-time";
    t.style.alignSelf = "flex-start";
    t.textContent = fmtTime(m.created_at);
    box.append(el, t);
  }
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

async function demoLoad() {
  const raw = $("#demoPhone").value.trim();
  if (!raw) { toast("Введите номер", true); return; }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) { toast("Некорректный номер", true); return; }
  state.demoPhone = digits.startsWith("8") && digits.length === 11 ? "7" + digits.slice(1) : digits;
  $("#phoneNum").textContent = "+" + state.demoPhone;
  await loadDemoInbox();
}

async function demoReply() {
  const ta = $("#demoReply");
  const body = ta.value.trim();
  if (!body) return;
  try {
    await api("/api/demo/reply", { method: "POST", body: { phone: state.demoPhone, body } });
    ta.value = "";
    autoGrow(ta);
    // показываем ответ сразу как исходящее у «получателя»
    const el = document.createElement("div");
    el.className = "pmsg from-user";
    el.textContent = body;
    const t = document.createElement("div");
    t.className = "pmsg-time";
    t.style.alignSelf = "flex-end";
    t.textContent = fmtTime(Math.floor(Date.now() / 1000));
    $("#phoneMsgs").append(el, t);
    $("#phoneMsgs").scrollTop = $("#phoneMsgs").scrollHeight;
    toast("Ответ получателя доставлен в диалог");
  } catch (e) { toast(e.message, true); }
}

/* ---------- вкладки ---------- */
function switchTab(name) {
  state.tab = name;
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + name).classList.add("active");
}

/* ---------- мелочи ---------- */
function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
}

function updateSeg() {
  $("#segInfo").textContent = smsInfo($("#msgInput").value);
}

/* ---------- опрос ---------- */
async function poll() {
  try {
    await loadThreads();
    if (state.current) await loadMessages();
    if (state.tab === "phone" && state.demoPhone) await loadDemoInbox();
  } catch (_) { /* сеть моргнула — молча ждём следующего тика */ }
}

/* ---------- инициализация ---------- */
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();

  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $("#newChatBtn").addEventListener("click", createThread);
  $("#newPhone").addEventListener("keydown", (e) => { if (e.key === "Enter") createThread(); });

  $("#sendBtn").addEventListener("click", sendMessage);
  const mi = $("#msgInput");
  mi.addEventListener("input", () => { autoGrow(mi); updateSeg(); });
  mi.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  $("#demoLoadBtn").addEventListener("click", demoLoad);
  $("#demoPhone").addEventListener("keydown", (e) => { if (e.key === "Enter") demoLoad(); });
  $("#demoReplyBtn").addEventListener("click", demoReply);
  const dr = $("#demoReply");
  dr.addEventListener("input", () => autoGrow(dr));
  dr.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); demoReply(); }
  });

  $("#backBtn").addEventListener("click", () => {
    $("#sidebar") && $("#sidebar").classList.add("show");
  });

  const setSave = document.getElementById("setSave");
  if (setSave) setSave.addEventListener("click", saveSettings);

  loadThreads();
  setInterval(poll, 2500);
});
