/**
 * ProxyTG — интерфейс. Свяывает core/store с DOM.
 */
import {
  APP_VERSION, buildTgLink, buildTmeLink, isValidHost, isValidPort, isValidSecret,
  makeFakeTlsSecret, parseProxyLink, parseProxyList, parseSecret, randomFrom,
  randomIpFromCidr, secretKindLabel, serverDeployCommand,
} from './core.js';
import * as store from './store.js';

const storage = window.localStorage;
let state = store.loadState(storage);

// текущая (не сохранённая) конфигурация
const config = { host: '', port: state.settings.defaultPort, secret: '' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const dom = {
  ver: $('#ver-chip'),
  status: $('#status'),
  chips: $('#chips'),
  linkPreview: $('#link-preview'),
  hero: $('.card--hero'),
  btnCopyLink: $('#btn-copy-link'),
  btnOpenTg: $('#btn-open-tg'),
  btnQr: $('#btn-qr'),
  btnSaveProxy: $('#btn-save-proxy'),
  inpHost: $('#inp-host'),
  inpPort: $('#inp-port'),
  btnCf: $('#btn-cf'),
  selSni: $('#sel-sni'),
  btnGen: $('#btn-gen-secret'),
  secretPreview: $('#secret-preview'),
  secretKind: $('#secret-kind'),
  deployCmd: $('#deploy-cmd'),
  btnCopyDeploy: $('#btn-copy-deploy'),
  proxyList: $('#proxy-list'),
  proxyCount: $('#proxy-count'),
  proxyEmpty: $('#proxy-empty'),

  sniChips: $('#sni-chips'),
  inpSni: $('#inp-sni'),
  btnSniAdd: $('#btn-sni-add'),
  cfList: $('#cf-list'),
  btnFetch: $('#btn-fetch'),
  fetchStatus: $('#fetch-status'),
  fetchNote: $('#fetch-note'),

  logList: $('#log-list'),
  logEmpty: $('#log-empty'),
  btnClearLogs: $('#btn-clear-logs'),

  themeSwitch: $('#theme-switch'),
  setAutoSni: $('#set-autosni'),
  setPort: $('#set-port'),
  setSources: $('#set-sources'),
  btnSourcesSave: $('#btn-sources-save'),
  dataStats: $('#data-stats'),
  btnExport: $('#btn-export'),
  btnWipe: $('#btn-wipe'),

  qrModal: $('#qr-modal'),
  qrBox: $('#qr-box'),
  qrLink: $('#qr-link'),
  btnQrCopy: $('#btn-qr-copy'),
  btnQrClose: $('#btn-qr-close'),

  confirmModal: $('#confirm-modal'),
  confirmTitle: $('#confirm-title'),
  confirmText: $('#confirm-text'),
  confirmActions: $('#confirm-actions'),
  toasts: $('#toasts'),
};

/* ── утилиты ── */
function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(text) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = text;
  dom.toasts.appendChild(node);
  setTimeout(() => { node.classList.add('is-out'); setTimeout(() => node.remove(), 240); }, 2000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

function save() {
  const result = store.saveState(storage, state);
  state = result.state;
  if (!result.ok) toast('Не удалось сохранить (хранилище переполнено)');
}

function log(kind, text) {
  state = store.addLog(state, kind, text);
}

let confirmResolve = null;
function askUser({ title, text, buttons }) {
  dom.confirmTitle.textContent = title;
  dom.confirmText.textContent = text;
  dom.confirmActions.innerHTML = '';
  return new Promise((resolve) => {
    confirmResolve = resolve;
    buttons.forEach((b) => {
      const node = document.createElement('button');
      node.className = `btn ${b.kind === 'primary' ? 'btn--primary' : b.kind === 'danger' ? 'btn--danger' : ''}`;
      node.textContent = b.label;
      node.addEventListener('click', () => {
        confirmResolve = null;
        dom.confirmModal.hidden = true;
        resolve(b.id);
      });
      dom.confirmActions.appendChild(node);
    });
    dom.confirmModal.hidden = false;
  });
}

/* ── вычисления ── */
// config хранит хост в поле host; сохранённые прокси — в server. Приводим к общему виду.
function toCfg(c) {
  return { server: c.server ?? c.host, port: c.port, secret: c.secret };
}

function currentLink() {
  return buildTmeLink(toCfg(config));
}

function isReady() {
  return isValidHost(config.host) && isValidPort(config.port) && isValidSecret(config.secret);
}

/* ── отрисовка ── */
function render() {
  renderHero();
  renderSecret();
  renderSniSelect();
  renderSniChips();
  renderCfList();
  renderProxyList();
  renderLogs();
  renderSettings();
}

function renderHero() {
  const secret = parseSecret(config.secret);
  const ready = isReady();
  dom.hero.classList.toggle('is-ready', ready);
  dom.status.textContent = ready ? 'Готов к подключению' : 'Заполните сервер и секрет';
  dom.linkPreview.textContent = currentLink();
  dom.deployCmd.textContent = serverDeployCommand(config.secret, config.port);

  const chips = [];
  chips.push(secret?.domain ? `<span class="chip chip--accent">SNI ${esc(secret.domain)}</span>` : '<span class="chip">SNI —</span>');
  chips.push(`<span class="chip">Порт ${esc(config.port)}</span>`);
  chips.push(`<span class="chip ${ready ? 'chip--ok' : ''}">${esc(secretKindLabel(secret?.kind))}</span>`);
  chips.push(`<span class="chip chip--dim">v${esc(APP_VERSION)}</span>`);
  dom.chips.innerHTML = chips.join('');
}

function renderSecret() {
  dom.secretPreview.textContent = config.secret || '—';
  const secret = parseSecret(config.secret);
  dom.secretKind.textContent = secret ? secretKindLabel(secret.kind) : 'нет секрета';
}

function renderSniSelect() {
  const current = dom.selSni.value;
  dom.selSni.innerHTML = state.sniList
    .map((d) => `<option value="${esc(d)}">${esc(d)}</option>`)
    .join('');
  if (state.sniList.includes(current)) dom.selSni.value = current;
}

function renderSniChips() {
  dom.sniChips.innerHTML = state.sniList
    .map((d) => `<span class="chip chip--x">${esc(d)}<button data-sni-del="${esc(d)}" aria-label="Убрать ${esc(d)}">✕</button></span>`)
    .join('');
}

function renderCfList() {
  dom.cfList.innerHTML = state.cfList
    .map((r) => `<div class="rrow"><code>${esc(r)}</code>
        <button class="btn btn--sm" data-cf-ip="${esc(r)}">IP</button>
        <button class="icon-btn" data-cf-copy="${esc(r)}" aria-label="Копировать ${esc(r)}">
          <svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>
        </button></div>`)
    .join('');
}

function renderProxyList() {
  dom.proxyCount.textContent = state.proxies.length ? `· ${state.proxies.length}` : '';
  dom.proxyEmpty.hidden = state.proxies.length > 0;
  dom.proxyList.innerHTML = state.proxies
    .map((p) => {
      const secret = parseSecret(p.secret);
      const src = { public: 'публичный', generated: 'свой', manual: 'вручную' }[p.source] || p.source;
      return `<div class="prow">
        <div class="prow__main">
          <b>${esc(p.server)}:${esc(p.port)}</b>
          <small>${esc(secretKindLabel(secret?.kind))} · ${esc(src)} · ${esc(secret?.domain || '')}</small>
        </div>
        <div class="prow__act">
          <button class="icon-btn" data-open="${p.id}" title="Открыть в Telegram"><svg viewBox="0 0 24 24"><path d="M2.5 21l19-9-19-9-.01 7L15 12 2.49 14z"/></svg></button>
          <button class="icon-btn" data-copy="${p.id}" title="Скопировать ссылку"><svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg></button>
          <button class="icon-btn" data-del="${p.id}" title="Удалить"><svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg></button>
        </div>
      </div>`;
    })
    .join('');
}

function renderLogs() {
  dom.logEmpty.hidden = state.logs.length > 0;
  dom.logList.innerHTML = state.logs
    .map((l) => {
      const t = new Date(l.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      return `<div class="lrow"><span class="lrow__t">${esc(t)}</span><span class="lrow__k">${esc(l.kind)}</span><span>${esc(l.text)}</span></div>`;
    })
    .join('');
}

function renderSettings() {
  dom.themeSwitch.querySelectorAll('.seg').forEach((s) => s.classList.toggle('is-on', s.dataset.themeValue === state.settings.theme));
  dom.setAutoSni.checked = Boolean(state.settings.autoRandomSni);
  dom.setPort.value = state.settings.defaultPort;
  dom.setSources.value = state.settings.listSources.join('\n');
  dom.dataStats.textContent = `Прокси: ${state.proxies.length} · записей в журнале: ${state.logs.length}`;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', state.settings.theme === 'dark' ? '#0b1220' : '#eef2f9');
}

/* ── действия ── */
function regenerateSecret() {
  const domain = state.settings.autoRandomSni
    ? randomFrom(state.sniList) || dom.selSni.value
    : dom.selSni.value;
  config.secret = makeFakeTlsSecret(domain);
  log('gen', `секрет Fake-TLS для ${domain}`);
  save();
  render();
}

async function openInTelegram(proxyId = null) {
  const cfg = toCfg(proxyId ? state.proxies.find((p) => p.id === proxyId) : config);
  if (!cfg.server || !isValidSecret(cfg.secret)) { toast('Сначала соберите корректный прокси'); return; }
  const link = buildTgLink(cfg);
  if (proxyId) state = store.touchProxy(state, proxyId);
  log('open', `${cfg.server}:${cfg.port}`);
  save();
  render();
  const a = document.createElement('a');
  a.href = link;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function copyProxyLink(proxyId = null) {
  const cfg = toCfg(proxyId ? state.proxies.find((p) => p.id === proxyId) : config);
  const link = buildTmeLink(cfg);
  const ok = await copyText(link);
  log('copy', ok ? link : 'не удалось скопировать');
  save();
  renderLogs();
  toast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать');
}

function showQr(proxyId = null) {
  const cfg = toCfg(proxyId ? state.proxies.find((p) => p.id === proxyId) : config);
  const link = buildTmeLink(cfg);
  dom.qrLink.textContent = link;
  if (window.qrcode) {
    const qr = window.qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    dom.qrBox.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
  } else {
    dom.qrBox.innerHTML = '<span class="muted">QR недоступен в этой среде</span>';
  }
  dom.qrModal.hidden = false;
}

async function fetchPublicLists() {
  dom.btnFetch.disabled = true;
  dom.fetchStatus.textContent = 'Загрузка…';
  let totalAdded = 0;
  let sourcesOk = 0;
  for (const url of state.settings.listSources) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const items = parseProxyList(text);
      const result = store.addProxies(state, items, 'public');
      state = result.state;
      totalAdded += result.added;
      sourcesOk += 1;
      log('fetch', `+${result.added} из ${new URL(url).hostname}`);
    } catch (error) {
      log('fetch', `ошибка: ${new URL(url).hostname} (${error.message})`);
    }
  }
  save();
  render();
  dom.btnFetch.disabled = false;
  dom.fetchStatus.textContent = '';
  dom.fetchNote.textContent = `Источников отвечало: ${sourcesOk}. Добавлено новых: ${totalAdded}.`;
  toast(totalAdded ? `Добавлено прокси: ${totalAdded}` : 'Новых прокси нет');
}

/* ── события ── */
// навигация
$$('.navbtn').forEach((btn) => btn.addEventListener('click', () => {
  $$('.navbtn').forEach((b) => b.classList.toggle('is-active', b === btn));
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.id === `tab-${btn.dataset.tab}`));
}));

// сервер/порт
dom.inpHost.addEventListener('input', () => { config.host = dom.inpHost.value.trim(); render(); });
dom.inpPort.addEventListener('input', () => { config.port = Number(dom.inpPort.value); render(); });
dom.btnCf.addEventListener('click', async () => {
  const range = randomFrom(state.cfList);
  const ip = randomIpFromCidr(range);
  config.host = ip;
  dom.inpHost.value = ip;
  log('cf', `случайный CF IP ${ip} из ${range}`);
  save();
  render();
  await copyText(ip);
  toast(`IP ${ip} скопирован в поле и буфер`);
});

// секрет
dom.btnGen.addEventListener('click', regenerateSecret);
dom.selSni.addEventListener('change', () => {
  if (!state.settings.autoRandomSni) regenerateSecretFor(dom.selSni.value);
});
function regenerateSecretFor(domain) {
  config.secret = makeFakeTlsSecret(domain);
  log('gen', `секрет Fake-TLS для ${domain}`);
  save();
  render();
}

// hero
dom.btnCopyLink.addEventListener('click', () => copyProxyLink());
dom.btnOpenTg.addEventListener('click', () => openInTelegram());
dom.btnQr.addEventListener('click', () => showQr());
dom.btnSaveProxy.addEventListener('click', () => {
  const result = store.addProxy(state, config, 'generated');
  state = result.state;
  log('save', result.created ? `сохранён ${config.host}:${config.port}` : 'уже в списке');
  save();
  render();
  toast(result.created ? 'Сохранено в «Мои прокси»' : 'Такой прокси уже есть');
});

// deploy
dom.btnCopyDeploy.addEventListener('click', async () => {
  await copyText(dom.deployCmd.textContent);
  toast('Команда скопирована');
});

// списки SNI
dom.btnSniAdd.addEventListener('click', addSni);
dom.inpSni.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSni(); });
function addSni() {
  const value = dom.inpSni.value.trim().toLowerCase();
  if (!value || !isValidHost(value)) { toast('Похоже, это не домен'); return; }
  if (!state.sniList.includes(value)) {
    state = store.setLists(state, { sniList: [...state.sniList, value] });
    log('list', `+SNI ${value}`);
    save(); render();
  }
  dom.inpSni.value = '';
}
dom.sniChips.addEventListener('click', (e) => {
  const del = e.target.closest('[data-sni-del]');
  if (!del) return;
  const value = del.dataset.sniDel;
  if (state.sniList.length <= 1) { toast('Нужен хотя бы один домен'); return; }
  state = store.setLists(state, { sniList: state.sniList.filter((d) => d !== value) });
  log('list', `−SNI ${value}`);
  save(); render();
});

// CF список
dom.cfList.addEventListener('click', async (e) => {
  const ipBtn = e.target.closest('[data-cf-ip]');
  const copyBtn = e.target.closest('[data-cf-copy]');
  if (ipBtn) {
    const ip = randomIpFromCidr(ipBtn.dataset.cfIp);
    await copyText(ip);
    log('cf', `IP ${ip} из ${ipBtn.dataset.cfIp}`);
    save(); renderLogs();
    toast(`Скопирован ${ip}`);
  } else if (copyBtn) {
    await copyText(copyBtn.dataset.cfCopy);
    toast('Диапазон скопирован');
  }
});

// публичные
dom.btnFetch.addEventListener('click', fetchPublicLists);

// мои прокси
dom.proxyList.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  const copy = e.target.closest('[data-copy]');
  const del = e.target.closest('[data-del]');
  if (open) openInTelegram(open.dataset.open);
  else if (copy) copyProxyLink(copy.dataset.copy);
  else if (del) {
    state = store.removeProxy(state, del.dataset.del);
    log('del', 'прокси удалён');
    save(); render();
  }
});

// логи
dom.btnClearLogs.addEventListener('click', () => {
  state = store.clearLogs(state);
  save(); renderLogs();
});

// настройки
dom.themeSwitch.addEventListener('click', (e) => {
  const seg = e.target.closest('[data-theme-value]');
  if (!seg) return;
  state = store.setSettings(state, { theme: seg.dataset.themeValue });
  save(); applyTheme(); renderSettings();
});
dom.setAutoSni.addEventListener('change', () => {
  state = store.setSettings(state, { autoRandomSni: dom.setAutoSni.checked });
  save();
});
dom.setPort.addEventListener('change', () => {
  const port = Number(dom.setPort.value);
  if (!isValidPort(port)) { toast('Порт 1–65535'); return; }
  state = store.setSettings(state, { defaultPort: port });
  save();
});
dom.btnSourcesSave.addEventListener('click', () => {
  const list = dom.setSources.value.split('\n').map((s) => s.trim()).filter(Boolean);
  state = store.setSettings(state, { listSources: list });
  save();
  toast('Источники сохранены');
});
dom.btnExport.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proxytg-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
dom.btnWipe.addEventListener('click', async () => {
  const answer = await askUser({
    title: 'Стереть все данные?',
    text: 'Прокси, списки и журнал будут удалены с этого устройства.',
    buttons: [{ id: 'yes', label: 'Стереть', kind: 'danger' }, { id: 'no', label: 'Отмена' }],
  });
  if (answer !== 'yes') return;
  try { storage.removeItem(store.STORAGE_KEY); } catch { /* noop */ }
  state = store.createDefaultState();
  config.host = ''; config.port = state.settings.defaultPort; config.secret = '';
  applyTheme(); regenerateSecret(); render();
  toast('Данные стёрты');
});

// QR модалка
dom.btnQrClose.addEventListener('click', () => { dom.qrModal.hidden = true; });
dom.btnQrCopy.addEventListener('click', async () => {
  await copyText(dom.qrLink.textContent);
  toast('Ссылка скопирована');
});

// закрытие модалок по фону
dom.qrModal.addEventListener('click', (e) => { if (e.target === dom.qrModal) dom.qrModal.hidden = true; });

/* ── старт ── */
function init() {
  dom.ver.textContent = `v${APP_VERSION}`;
  dom.inpHost.value = config.host;
  dom.inpPort.value = config.port;
  applyTheme();
  render();
  regenerateSecret(); // сразу даём рабочий секрет
}
init();
