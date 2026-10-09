import test from 'node:test';
import assert from 'node:assert/strict';

import {
  avatarHTML,
  chatRowHTML,
  contactLabel,
  esc,
  formatDayLabel,
  formatListTime,
  formatTime,
  renderChatList,
  renderMessages,
} from '../js/ui.js';
import * as store from '../js/store.js';

const PHONE = '+79123456789';

test('esc экранирует разметку', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('"кавычки" & \'апостроф\''), '&quot;кавычки&quot; &amp; &#39;апостроф&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(42), '42');
});

test('formatTime и formatDayLabel', () => {
  const now = Date.now();
  assert.match(formatTime(now), /^\d{2}:\d{2}$/);
  assert.equal(formatDayLabel(now), 'Сегодня');
  assert.equal(formatDayLabel(now - 86400000), 'Вчера');
  assert.match(formatDayLabel(new Date(2024, 2, 8).getTime()), /^8 марта/);
  assert.match(formatDayLabel(new Date(2019, 0, 2).getTime()), /2019$/);
});

test('formatListTime: сегодня, вчера, день недели, дата', () => {
  const now = Date.now();
  assert.match(formatListTime(now), /^\d{2}:\d{2}$/);
  assert.equal(formatListTime(now - 86400000), 'вчера');
  assert.match(formatListTime(now - 3 * 86400000), /^(вс|пн|вт|ср|чт|пт|сб)$/);
  assert.match(formatListTime(now - 30 * 86400000), /^\d{2}\.\d{2}\.\d{2}$/);
  assert.equal(formatListTime(0), '');
});

test('avatarHTML: инициалы или фото', () => {
  assert.equal(
    avatarHTML({ name: 'Мама Папа', color: '#ff0000' }),
    '<span class="avatar " style="--c:#ff0000">МП</span>',
  );
  const withPhoto = avatarHTML({ name: 'Я', avatar: 'data:image/png;base64,AA', color: '#000' }, 'avatar--sm');
  assert.match(withPhoto, /<img src="data:image\/png;base64,AA" alt="">/);
  assert.match(withPhoto, /class="avatar avatar--sm"/);
});

test('contactLabel: имя, иначе номер', () => {
  assert.equal(contactLabel({ name: 'Мама', phone: PHONE }), 'Мама');
  assert.equal(contactLabel({ name: '', phone: PHONE }), '+7 (912) 345-67-89');
  assert.equal(contactLabel({ name: '', phone: null }), 'Без имени');
});

test('renderMessages: пусто, разделители по дням, экранирование', () => {
  assert.match(renderMessages({ messages: [] }), /Сообщений пока нет/);

  const day1 = new Date();
  day1.setHours(10, 0, 0, 0);
  const day2 = day1.getTime() - 86400000;
  const chat = {
    messages: [
      { id: '1', author: 'them', text: '<script>alert(1)</script>', ts: day2 },
      { id: '2', author: 'me', text: 'Привет', ts: day1.getTime() },
    ],
  };
  const html = renderMessages(chat);
  assert.equal(html.match(/class="day"/g).length, 2, 'два разделителя даты');
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /msg--them/);
  assert.match(html, /msg--me/);
});

test('chatRowHTML и renderChatList показывают последнее сообщение и непрочитанное', () => {
  let state = store.createDefaultState();
  const { contact } = store.addContactByPhone(state, PHONE, 'Мама');
  state = store.addContactByPhone(state, PHONE, 'Мама').state;
  state = store.receiveMessage(state, contact.id, 'Позвони мне');

  const html = renderChatList(state, store.sortedContacts(state), null);
  assert.match(html, /Мама/);
  assert.match(html, /Позвони мне/);
  assert.match(html, /<span class="badge">1<\/span>/);
  assert.match(html, /data-contact-id="c_79123456789"/);

  const active = renderChatList(state, [contact], contact.id);
  assert.match(active, /class="row is-active"/);

  const mine = chatRowHTML(store.sendMessage(state, contact.id, 'Наберу'), contact, false);
  assert.match(mine, /<b>Вы:<\/b> Наберу/);
});

test('renderChatList экранирует имя контакта', () => {
  let state = store.createDefaultState();
  state = store.addContactByPhone(state, PHONE, '<b>Хакер</b>').state;
  const html = renderChatList(state, state.contacts, null);
  assert.match(html, /&lt;b&gt;Хакер&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Хакер<\/b>/);
});
