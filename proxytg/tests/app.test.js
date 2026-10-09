/** Сквозной тест ProxyTG в jsdom: кликаем по настоящему интерфейсу. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const STATE_KEY = 'proxytg.state.v1';

const GLOBALS = [
  'window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame',
  'cancelAnimationFrame', 'getComputedStyle', 'HTMLElement', 'Element', 'Node',
  'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'Blob', 'URL',
  'TextEncoder', 'TextDecoder',
];

let bootCount = 0;

async function boot({ seed = {}, fetchStub = null } = {}) {
  const dom = new JSDOM(HTML, { url: 'https://proxytg.test/', pretendToBeVisual: true });
  const { window } = dom;
  for (const [key, value] of Object.entries(seed)) window.localStorage.setItem(key, value);
  for (const key of [...GLOBALS, 'window']) {
    const val = key === 'window' ? window : window[key];
    if (val === undefined) continue;
    try {
      Object.defineProperty(globalThis, key, { value: val, configurable: true, writable: true });
    } catch { /* read-only */ }
  }
  globalThis.fetch = fetchStub || (async () => { throw new Error('network off'); });

  bootCount += 1;
  await import(`../js/app.js?boot=${bootCount}`);
  return { window, document: window.document };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const readState = (window) => JSON.parse(window.localStorage.getItem(STATE_KEY));
const SAMPLE = [
  'https://t.me/proxy?server=one.example.com&port=443&secret=ee' + '11'.repeat(16) + '676f6f676c652e636f6d',
  'https://t.me/proxy?server=two.example.com&port=8443&secret=dd' + '22'.repeat(16),
].join('\n');

test('на старте секрет уже сгенерирован, ссылка собрана', async () => {
  const { document } = await boot();
  assert.match(document.getElementById('secret-preview').textContent, /^ee[0-9a-f]{32,}/);
  assert.match(document.getElementById('link-preview').textContent, /^https:\/\/t\.me\/proxy\?server=&port=443&secret=ee/);
  assert.match(document.getElementById('status').textContent, /Заполните сервер/);
  assert.equal(document.getElementById('secret-kind').textContent, 'Fake-TLS');
});

test('заполнение хоста делает прокси готовым', async () => {
  const { document } = await boot();
  const host = document.getElementById('inp-host');
  host.value = 'my.vps.example';
  host.dispatchEvent(new host.ownerDocument.defaultView.Event('input', { bubbles: true }));
  assert.match(document.getElementById('status').textContent, /Готов к подключению/);
  assert.ok(document.querySelector('.card--hero').classList.contains('is-ready'));
  assert.match(document.getElementById('link-preview').textContent, /server=my\.vps\.example/);
  assert.match(document.getElementById('chips').textContent, /SNI/);
});

test('кнопка CF подставляет IP из белого списка Cloudflare', async () => {
  const { document } = await boot();
  document.getElementById('btn-cf').click();
  await tick();
  const ip = document.getElementById('inp-host').value;
  assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/);
  assert.match(document.getElementById('link-preview').textContent, new RegExp(`server=${ip.replace(/\./g, '\\.')}`));
});

test('сохранение в «Мои прокси» добавляет строку и пишет в localStorage', async () => {
  const { document, window } = await boot();
  const host = document.getElementById('inp-host');
  host.value = '10.0.0.1';
  host.dispatchEvent(new host.ownerDocument.defaultView.Event('input', { bubbles: true }));
  document.getElementById('btn-save-proxy').click();
  await tick();
  assert.equal(document.querySelectorAll('#proxy-list .prow').length, 1);
  assert.equal(readState(window).proxies.length, 1);
  assert.equal(readState(window).proxies[0].source, 'generated');
  // повторное сохранение не дублирует
  document.getElementById('btn-save-proxy').click();
  await tick();
  assert.equal(readState(window).proxies.length, 1);
});

test('загрузка публичных списков парсит ссылки и пополняет «Мои прокси»', async () => {
  const calls = [];
  const fetchStub = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, text: async () => SAMPLE };
  };
  const { document, window } = await boot({ fetchStub });
  document.getElementById('btn-fetch').click();
  await tick(20);
  const state = readState(window);
  assert.ok(calls.length >= 2, 'опрошены оба источника по умолчанию');
  assert.equal(state.proxies.length, 2, 'две уникальные ссылки из образца');
  assert.match(document.getElementById('fetch-note').textContent, /Добавлено новых: 2/);
  assert.equal(document.querySelectorAll('#proxy-list .prow').length, 2);
});

test('ошибка сети не роняет приложение', async () => {
  const fetchStub = async () => { throw new Error('offline'); };
  const { document, window } = await boot({ fetchStub });
  document.getElementById('btn-fetch').click();
  await tick(20);
  assert.match(document.getElementById('fetch-note').textContent, /Источников отвечало: 0/);
  assert.equal(readState(window).proxies.length, 0);
});

test('переключение темы', async () => {
  const { document } = await boot();
  assert.equal(document.documentElement.dataset.theme, 'dark', 'по умолчанию тёмная');
  document.querySelector('[data-theme-value="light"]').click();
  await tick();
  assert.equal(document.documentElement.dataset.theme, 'light');
});

test('журнал фиксирует действия', async () => {
  const { document } = await boot();
  document.getElementById('btn-gen-secret').click();
  document.getElementById('btn-cf').click();
  await tick();
  const kinds = Array.from(document.querySelectorAll('#log-list .lrow__k')).map((n) => n.textContent);
  assert.ok(kinds.includes('gen'));
  assert.ok(kinds.includes('cf'));
});

test('редактирование SNI-списка', async () => {
  const { document, window } = await boot();
  // перейти на вкладку списки
  document.querySelector('[data-tab="lists"]').click();
  const before = document.querySelectorAll('#sni-chips .chip--x').length;
  const input = document.getElementById('inp-sni');
  input.value = 'my.domain.example';
  document.getElementById('btn-sni-add').click();
  await tick();
  assert.equal(document.querySelectorAll('#sni-chips .chip--x').length, before + 1);
  assert.ok(readState(window).sniList.includes('my.domain.example'));
});
