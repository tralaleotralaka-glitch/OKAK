import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../js/store.js';

/** Хранилище в памяти — замена localStorage для тестов. */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    _map: map,
  };
}

const PHONE = '+79123456789';

test('loadState: пустое хранилище даёт состояние по умолчанию', () => {
  const state = store.loadState(memoryStorage());
  assert.equal(state.profile.name, 'Я');
  assert.equal(state.settings.theme, 'light');
  assert.equal(state.contacts.length, 1);
  assert.equal(state.contacts[0].id, store.SAVED_CHAT_ID);
  assert.deepEqual(state.chats, {});
});

test('loadState: битый JSON не роняет приложение', () => {
  const storage = memoryStorage();
  storage.setItem(store.STORAGE_KEY, '{ не json');
  const state = store.loadState(storage);
  assert.equal(state.contacts.length, 1);
});

test('loadState: нет хранилища вовсе', () => {
  assert.equal(store.loadState(undefined).profile.name, 'Я');
});

test('saveState → loadState сохраняет переписку и контакты', () => {
  const storage = memoryStorage();
  let state = store.loadState(storage);
  const { state: withContact, contact } = store.addContactByPhone(state, PHONE);
  state = store.sendMessage(withContact, contact.id, 'Привет!');
  assert.equal(store.saveState(storage, state).ok, true);

  const restored = store.loadState(storage);
  assert.equal(restored.contacts.length, 2);
  assert.equal(restored.contacts[1].phone, PHONE);
  assert.equal(store.getChat(restored, contact.id).messages[0].text, 'Привет!');
  assert.ok(restored.savedAt, 'отметка о сохранении');
});

test('saveState: переполнение квоты не бросает исключение', () => {
  const broken = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };
  const result = store.saveState(broken, store.createDefaultState());
  assert.equal(result.ok, false);
  assert.equal(result.error.message, 'QuotaExceededError');
});

test('migrateState достраивает недостающие поля', () => {
  const state = store.migrateState({
    version: 1,
    contacts: [{ id: 'c_1', name: 'Старый', phone: '+79123456789' }],
    chats: { c_1: { messages: 'не массив' } },
  });
  assert.equal(state.contacts.length, 2, 'вернулось «Избранное»');
  assert.equal(state.contacts[0].id, store.SAVED_CHAT_ID);
  assert.ok(state.contacts[1].color, 'цвет аватара подобран');
  assert.deepEqual(state.chats.c_1.messages, []);
  assert.equal(state.settings.theme, 'light');
  assert.equal(state.ui.activeContactId, null);
});

test('addContactByPhone не дублирует контакт', () => {
  let state = store.createDefaultState();
  const first = store.addContactByPhone(state, PHONE);
  assert.equal(first.created, true);
  assert.equal(first.contact.name, '+7 (912) 345-67-89', 'имя по умолчанию — номер');

  const second = store.addContactByPhone(first.state, '+7 (912) 345-67-89');
  assert.equal(second.created, false);
  assert.equal(second.state.contacts.length, 2);
  assert.equal(second.contact.id, first.contact.id);
});

test('addContactByPhone принимает своё имя', () => {
  const { contact } = store.addContactByPhone(store.createDefaultState(), PHONE, 'Мама');
  assert.equal(contact.name, 'Мама');
});

test('sendMessage: пустой текст игнорируется', () => {
  const { state, contact } = store.addContactByPhone(store.createDefaultState(), PHONE);
  assert.equal(store.sendMessage(state, contact.id, '   '), state);
  assert.equal(store.sendMessage(state, null, 'текст'), state);
});

test('receiveMessage копится в непрочитанных, markChatRead сбрасывает', () => {
  const { state, contact } = store.addContactByPhone(store.createDefaultState(), PHONE);
  let next = store.receiveMessage(state, contact.id, 'Ку');
  next = store.receiveMessage(next, contact.id, 'Ты тут?');
  assert.equal(store.getChat(next, contact.id).unread, 2);
  assert.equal(store.totalUnread(next), 2);

  next = store.markChatRead(next, contact.id);
  assert.equal(store.getChat(next, contact.id).unread, 0);
  assert.equal(store.totalUnread(next), 0);
  assert.equal(store.markChatRead(next, contact.id), next, 'повторный вызов ничего не меняет');
});

test('отправка сбрасывает счётчик непрочитанных', () => {
  const { state, contact } = store.addContactByPhone(store.createDefaultState(), PHONE);
  const withUnread = store.receiveMessage(state, contact.id, 'Привет');
  assert.equal(store.getChat(withUnread, contact.id).unread, 1);
  const replied = store.sendMessage(withUnread, contact.id, 'Привет!');
  assert.equal(store.getChat(replied, contact.id).unread, 0);
});

test('clearChat чистит сообщения, но оставляет контакт', () => {
  const { state, contact } = store.addContactByPhone(store.createDefaultState(), PHONE);
  const next = store.clearChat(store.sendMessage(state, contact.id, 'Раз'), contact.id);
  assert.equal(store.getChat(next, contact.id).messages.length, 0);
  assert.equal(next.contacts.length, 2);
});

test('removeContact убирает и переписку, «Избранное» неприкосновенно', () => {
  const { state, contact } = store.addContactByPhone(store.createDefaultState(), PHONE);
  const active = store.setActiveContact(store.sendMessage(state, contact.id, 'Раз'), contact.id);
  const removed = store.removeContact(active, contact.id);
  assert.equal(removed.contacts.length, 1);
  assert.equal(removed.chats[contact.id], undefined);
  assert.equal(removed.ui.activeContactId, null);
  assert.equal(store.removeContact(removed, store.SAVED_CHAT_ID), removed);
});

test('updateContact, setProfile, setSettings', () => {
  const { state, contact } = store.addContactByPhone(store.createDefaultState(), PHONE);
  let next = store.updateContact(state, contact.id, { name: 'Мама', avatar: 'data:1' });
  assert.equal(store.getContact(next, contact.id).name, 'Мама');
  assert.equal(store.getContact(next, contact.id).avatar, 'data:1');

  next = store.setProfile(next, { name: 'Алексей', avatar: null });
  assert.equal(next.profile.name, 'Алексей');
  assert.equal(next.profile.avatar, null);

  next = store.setSettings(next, { theme: 'dark' });
  assert.equal(next.settings.theme, 'dark');
  assert.equal(next.settings.autoReply, false, 'остальные настройки на месте');
});

test('searchContacts ищет по имени и по цифрам номера', () => {
  const { state, contact } = store.addContactByPhone(store.createDefaultState(), PHONE);
  const renamed = store.updateContact(state, contact.id, { name: 'Мама' });
  assert.equal(store.searchContacts(renamed, 'мам').length, 1);
  assert.equal(store.searchContacts(renamed, '912').length, 1);
  assert.equal(store.searchContacts(renamed, 'нет такого').length, 0);
  assert.equal(store.searchContacts(renamed, '').length, 2);
  assert.equal(store.searchContacts(renamed, '  ').length, 2);
});

test('sortedContacts: «Избранное» сверху, дальше по свежести', async () => {
  let state = store.createDefaultState();
  const a = store.addContactByPhone(state, '+79123456789').contact;
  state = store.addContactByPhone(state, '+79123456789').state;
  const b = store.addContactByPhone(state, '+79001112233').contact;
  state = store.addContactByPhone(state, '+79001112233').state;

  let order = store.sortedContacts(state).map((c) => c.id);
  assert.equal(order[0], store.SAVED_CHAT_ID);

  await new Promise((resolve) => setTimeout(resolve, 5)); // чтобы отметки времени разошлись
  state = store.sendMessage(state, b.id, 'позже');
  order = store.sortedContacts(state).map((c) => c.id);
  assert.equal(order[0], store.SAVED_CHAT_ID);
  assert.equal(order[1], b.id, 'чат со свежим сообщением выше');
  assert.equal(order[2], a.id);
});

test('lastMessage и usageStats', () => {
  let state = store.createDefaultState();
  const { contact } = store.addContactByPhone(state, PHONE);
  state = store.addContactByPhone(state, PHONE).state;
  assert.equal(store.lastMessage(state, contact.id), null);
  state = store.sendMessage(state, contact.id, 'Первое');
  state = store.sendMessage(state, contact.id, 'Второе');
  assert.equal(store.lastMessage(state, contact.id).text, 'Второе');

  const stats = store.usageStats(state);
  assert.deepEqual(stats, { contacts: 1, messages: 2, chats: 1 });
});

test('colorFor и initialsOf стабильны', () => {
  assert.equal(store.colorFor(PHONE), store.colorFor(PHONE));
  assert.match(store.colorFor(PHONE), /^#[0-9a-f]{6}$/);
  assert.equal(store.initialsOf('Мама Папа'), 'МП');
  assert.equal(store.initialsOf('мама'), 'МА');
  assert.equal(store.initialsOf(''), '?');
});

test('uid не повторяется', () => {
  const ids = new Set(Array.from({ length: 200 }, () => store.uid('m')));
  assert.equal(ids.size, 200);
});
