/**
 * Сквозной тест интерфейса: запускаем настоящий index.html и js/app.js
 * в jsdom и «кликаем» по нему так же, как это делает пользователь.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const STATE_KEY = 'mysenger.state.v1';

const GLOBALS = [
  'window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame',
  'cancelAnimationFrame', 'getComputedStyle', 'HTMLElement', 'Element', 'Node',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'Image', 'FileReader',
  'Blob', 'DOMParser',
];

let bootCount = 0;

/** Поднимает «страницу» с приложением. seed — предварительное содержимое localStorage. */
async function boot({ seed = {}, innerWidth = 1024 } = {}) {
  const dom = new JSDOM(HTML, { url: 'https://mysenger.test/', pretendToBeVisual: true });
  const { window } = dom;
  try {
    Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true, writable: true });
  } catch { /* если jsdom не даёт переопределить — тестируем на десктопе */ }
  for (const [key, value] of Object.entries(seed)) window.localStorage.setItem(key, value);

  for (const key of [...GLOBALS, 'window']) {
    if (key !== 'window' && window[key] === undefined) continue;
    try {
      Object.defineProperty(globalThis, key, {
        value: key === 'window' ? window : window[key],
        configurable: true,
        writable: true,
      });
    } catch { /* глобал только для чтения (например navigator) — пропускаем */ }
  }

  bootCount += 1;
  await import(`../js/app.js?boot=${bootCount}`);
  return { window, document: window.document };
}

const snapshot = (window) => {
  const data = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    data[key] = window.localStorage.getItem(key);
  }
  return data;
};

const readState = (window) => JSON.parse(window.localStorage.getItem(STATE_KEY));
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (node) => node.click();

function typeInto(input, value) {
  input.value = value;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

/** Полный путь пользователя: «+» → номер → Применить → сообщение. */
async function addContactAndWrite(document, phone = '9123456789', message = 'Привет!') {
  click(document.getElementById('fab'));
  const apply = document.getElementById('btn-apply');
  assert.equal(apply.hidden, true, 'кнопки «Применить» нет, пока номер не введён');

  typeInto(document.getElementById('phone-input'), phone);
  assert.equal(apply.hidden, false, '«Применить» появилась после ввода номера');
  assert.equal(apply.disabled, false);
  click(apply);

  typeInto(document.getElementById('composer-input'), message);
  const form = document.getElementById('composer');
  form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
}

test('«+» в правом нижнем углу: номер → «Применить» → чат открыт', async () => {
  const { document } = await boot();

  // лист скрыт до нажатия
  assert.equal(document.getElementById('sheet-phone').hidden, true);
  assert.equal(document.getElementById('chat').hidden, true);

  click(document.getElementById('fab'));
  assert.equal(document.getElementById('sheet-phone').hidden, false);
  assert.equal(document.getElementById('scrim').hidden, false);

  const input = document.getElementById('phone-input');
  const apply = document.getElementById('btn-apply');
  const msg = document.getElementById('phone-msg');

  typeInto(input, '912');
  assert.equal(apply.hidden, false, 'кнопка появилась');
  assert.equal(apply.disabled, true, 'но пока неактивна — номер неполный');
  assert.match(msg.textContent, /Введите ещё 7/);

  typeInto(input, '9123456789');
  assert.equal(input.value, '(912) 345-67-89', 'номер отформатирован');
  assert.equal(apply.disabled, false);
  assert.match(msg.textContent, /Готово: \+7 \(912\) 345-67-89/);

  click(apply);
  await tick(300);

  assert.equal(document.getElementById('sheet-phone').hidden, true, 'лист закрылся');
  assert.equal(document.getElementById('chat').hidden, false, 'открылся диалог');
  assert.equal(document.getElementById('chat-name').textContent, '+7 (912) 345-67-89');
  assert.match(document.getElementById('chat-sub').textContent, /\+7 \(912\) 345-67-89/);
});

test('повторный ввод того же номера не создаёт второй контакт', async () => {
  const { document, window } = await boot();
  await addContactAndWrite(document, '9123456789', 'Первое');

  click(document.getElementById('fab'));
  typeInto(document.getElementById('phone-input'), '9123456789');
  assert.match(document.getElementById('phone-msg').textContent, /Уже в контактах/);
  click(document.getElementById('btn-apply'));
  await tick(300);

  const state = readState(window);
  const contacts = state.contacts.filter((c) => c.id !== 'saved');
  assert.equal(contacts.length, 1);
  assert.equal(state.chats[contacts[0].id].messages.length, 1);
});

test('сообщение сохраняется в localStorage и видно в списке чатов', async () => {
  const { document, window } = await boot();
  await addContactAndWrite(document, '9001112233', 'Как дела?');

  const state = readState(window);
  const contact = state.contacts.find((c) => c.phone === '+79001112233');
  assert.ok(contact, 'контакт записан');
  assert.equal(state.chats[contact.id].messages.length, 1);
  assert.equal(state.chats[contact.id].messages[0].text, 'Как дела?');
  assert.equal(state.chats[contact.id].messages[0].author, 'me');

  const rows = document.querySelectorAll('#chat-list .row');
  assert.equal(rows.length, 2, '«Избранное» + новый контакт');
  assert.match(document.getElementById('chat-list').textContent, /Вы: Как дела\?/);
  assert.equal(document.querySelectorAll('#messages .msg').length, 1);
  assert.equal(document.querySelector('#messages .day').textContent, 'Сегодня');
});

test('настройки: имя, аватар-цвет и тема; выход спрашивает про сохранение', async () => {
  const { document } = await boot();

  click(document.getElementById('btn-settings'));
  const panel = document.getElementById('panel-settings');
  assert.equal(panel.hidden, false, 'панель настроек открылась');
  assert.equal(document.getElementById('dirty-chip').hidden, true);
  assert.equal(document.documentElement.dataset.theme, 'light');

  typeInto(document.getElementById('input-name'), 'Алексей');
  assert.equal(document.getElementById('dirty-chip').hidden, false, 'пометили несохранённые изменения');

  click(document.querySelector('[data-theme-value="dark"]'));
  assert.equal(document.documentElement.dataset.theme, 'dark', 'тема переключилась сразу');

  // выход из настроек с изменениями
  click(document.getElementById('btn-settings-back'));
  await tick();
  const modal = document.getElementById('modal');
  assert.equal(modal.hidden, false);
  assert.match(document.getElementById('modal-title').textContent, /Сохранить настройки\?/);
  const labels = Array.from(document.getElementById('modal-actions').children).map((b) => b.textContent);
  assert.deepEqual(labels, ['Сохранить', 'Не сохранять', 'Отмена']);

  click(document.getElementById('modal-actions').children[0]); // Сохранить
  await tick(300);
  assert.equal(panel.hidden, true);
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('«Не сохранять» откатывает тему и имя, не трогая сохранённое состояние', async () => {
  const { document, window } = await boot();
  // сначала настоящее сохранение, чтобы было с чем сравнивать
  await addContactAndWrite(document, '9123456789', 'Привет');
  assert.equal(readState(window).profile.name, 'Я');

  click(document.getElementById('btn-settings'));
  typeInto(document.getElementById('input-name'), 'Временно');
  click(document.querySelector('[data-theme-value="dark"]'));
  assert.equal(document.documentElement.dataset.theme, 'dark');

  click(document.getElementById('btn-settings-back'));
  await tick();
  click(document.getElementById('modal-actions').children[1]); // Не сохранять
  await tick(300);

  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(readState(window).profile.name, 'Я');
  assert.equal(readState(window).settings.theme, 'light');
  assert.equal(readState(window).contacts.length, 2, 'контакт и переписка не пострадали');
  assert.equal(document.getElementById('panel-settings').hidden, true);
});

test('выход без изменений закрывает настройки без вопроса', async () => {
  const { document } = await boot();
  click(document.getElementById('btn-settings'));
  click(document.getElementById('btn-settings-back'));
  await tick(300);
  assert.equal(document.getElementById('panel-settings').hidden, true);
  assert.equal(document.getElementById('modal').hidden, true);
});

test('после перезапуска всё на месте: контакт, переписка, имя и тема', async () => {
  const first = await boot();

  await addContactAndWrite(first.document, '9123456789', 'Сохрани это');
  click(first.document.getElementById('fab'));
  typeInto(first.document.getElementById('phone-input'), '9001112233');
  click(first.document.getElementById('btn-apply'));
  await tick(300);

  click(first.document.getElementById('btn-settings'));
  typeInto(first.document.getElementById('input-name'), 'Алексей');
  click(first.document.querySelector('[data-theme-value="dark"]'));
  click(first.document.getElementById('btn-settings-save'));
  await tick(300);

  const seed = snapshot(first.window);
  assert.ok(seed[STATE_KEY], 'состояние записано в localStorage');

  // «перезапуск» мессенджера
  const second = await boot({ seed });
  const { document } = second;

  assert.equal(document.documentElement.dataset.theme, 'dark', 'тёмная тема сохранилась');

  const state = readState(second.window);
  assert.equal(state.profile.name, 'Алексей');
  assert.equal(state.contacts.length, 3, '«Избранное» + два контакта');

  const listText = document.getElementById('chat-list').textContent;
  assert.match(listText, /\+7 \(912\) 345-67-89/);
  assert.match(listText, /Сохрани это/);

  // открываем переписку — сообщение на месте
  const rows = document.querySelectorAll('#chat-list .row');
  const row = Array.from(rows).find((node) => node.textContent.includes('912'));
  click(row);
  await tick();
  assert.equal(document.getElementById('chat').hidden, false);
  assert.equal(document.querySelector('#messages .msg').textContent.startsWith('Сохрани это'), true);

  // имя профиля подтянулось в настройки
  click(document.getElementById('btn-settings'));
  assert.equal(document.getElementById('input-name').value, 'Алексей');
  assert.match(document.getElementById('usage-stats').textContent, /2 контакт/);
});

test('карточка контакта: переименование и удаление', async () => {
  const { document, window } = await boot();
  await addContactAndWrite(document, '9123456789', 'Привет');

  click(document.getElementById('btn-contact'));
  await tick(300);
  assert.equal(document.getElementById('sheet-contact').hidden, false);

  typeInto(document.getElementById('input-contact-name'), 'Мама');
  click(document.getElementById('btn-contact-save'));
  await tick(300);
  assert.equal(document.getElementById('chat-name').textContent, 'Мама');
  assert.equal(readState(window).contacts.find((c) => c.phone === '+79123456789').name, 'Мама');

  // удаление контакта вместе с перепиской
  click(document.getElementById('btn-contact'));
  await tick(300);
  click(document.getElementById('btn-contact-delete'));
  await tick();
  click(document.getElementById('modal-actions').children[0]);
  await tick(300);

  const state = readState(window);
  assert.equal(state.contacts.length, 1);
  assert.deepEqual(state.chats, {});
});

test('очистка чата оставляет контакт', async () => {
  const { document, window } = await boot();
  await addContactAndWrite(document, '9123456789', 'Секрет');

  click(document.getElementById('btn-clear-chat'));
  await tick();
  click(document.getElementById('modal-actions').children[0]);
  await tick();

  const state = readState(window);
  assert.equal(state.chats['c_79123456789'].messages.length, 0);
  assert.equal(state.contacts.length, 2);
});

test('поиск по списку чатов', async () => {
  const { document } = await boot();
  await addContactAndWrite(document, '9123456789', 'Раз');
  click(document.getElementById('fab'));
  typeInto(document.getElementById('phone-input'), '9001112233');
  click(document.getElementById('btn-apply'));
  await tick(300);

  typeInto(document.getElementById('search'), '912');
  assert.equal(document.querySelectorAll('#chat-list .row').length, 1);
  typeInto(document.getElementById('search'), 'такого нет');
  assert.equal(document.querySelectorAll('#chat-list .row').length, 0);
  assert.equal(document.getElementById('empty-state').hidden, false);
  typeInto(document.getElementById('search'), '');
  assert.equal(document.querySelectorAll('#chat-list .row').length, 3);
});

test('на мобильной ширине чат открывается поверх списка и возвращается назад', async () => {
  const { document, window } = await boot({ innerWidth: 390 });
  await addContactAndWrite(document, '9123456789', 'Привет');

  assert.equal(document.body.classList.contains('chat-open'), true);
  assert.equal(document.getElementById('btn-back').hidden, false);
  click(document.getElementById('btn-back'));
  await tick();
  assert.equal(document.body.classList.contains('chat-open'), false);
  assert.equal(readState(window).ui.activeContactId, null);
});

test('Enter отправляет сообщение, а с выключенной настройкой — нет', async () => {
  const { document } = await boot();
  await addContactAndWrite(document, '9123456789', 'Первое');

  const input = document.getElementById('composer-input');
  const enter = () => input.dispatchEvent(new input.ownerDocument.defaultView.KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true,
  }));

  typeInto(input, 'Второе');
  enter();
  await tick();
  assert.equal(document.querySelectorAll('#messages .msg').length, 2);

  // выключаем «Enter отправляет» в настройках
  click(document.getElementById('btn-settings'));
  const toggle = document.getElementById('input-entertosend');
  toggle.checked = false;
  toggle.dispatchEvent(new toggle.ownerDocument.defaultView.Event('change', { bubbles: true }));
  click(document.getElementById('btn-settings-save'));
  await tick(300);

  typeInto(input, 'Третье');
  enter();
  await tick();
  assert.equal(document.querySelectorAll('#messages .msg').length, 2, 'сообщение не отправилось');
});

test('демо-ответы выключены по умолчанию', async () => {
  const { document, window } = await boot();
  await addContactAndWrite(document, '9123456789', 'Есть кто-нибудь?');
  await tick(2200);
  assert.equal(readState(window).chats['c_79123456789'].messages.length, 1);
  assert.equal(document.querySelectorAll('#messages .typing').length, 0);
});
