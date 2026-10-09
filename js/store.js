/**
 * MySENGER — состояние и хранилище.
 * Все функции чистые: принимают состояние, возвращают новое.
 * Хранилище (localStorage / память) передаётся как параметр,
 * поэтому модуль можно тестировать в Node без DOM.
 */

import { digitsOnly, formatPhone, phoneKey } from './phone.js';

export const STORAGE_KEY = 'mysenger.state.v1';
export const STATE_VERSION = 1;
export const SAVED_CHAT_ID = 'saved';

const PALETTE = [
  '#6c5ce7', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#14b8a6', '#8b5cf6', '#f97316', '#22c55e',
];

let uidCounter = 0;

/** Уникальный id (не криптографический, для UI достаточно). */
export function uid(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}`;
}

/** Стабильный цвет аватара по строке (номеру телефона). */
export function colorFor(seed) {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Инициалы для аватара без фото. */
export function initialsOf(name) {
  const clean = String(name ?? '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function createDefaultState() {
  return {
    version: STATE_VERSION,
    profile: {
      name: 'Я',
      avatar: null,
      color: '#6c5ce7',
    },
    contacts: [
      {
        id: SAVED_CHAT_ID,
        kind: 'saved',
        name: 'Избранное',
        phone: null,
        avatar: null,
        color: '#0ea5e9',
        createdAt: Date.now(),
      },
    ],
    chats: {},
    settings: {
      theme: 'light',
      autoReply: false,
      enterToSend: true,
    },
    ui: { activeContactId: null },
    savedAt: null,
  };
}

/** Дозаполняет недостающие поля (миграция / битые данные). */
export function migrateState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') return base;
  const state = {
    ...base,
    ...raw,
    profile: { ...base.profile, ...(raw.profile || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    chats: raw.chats && typeof raw.chats === 'object' ? raw.chats : {},
    contacts: Array.isArray(raw.contacts) && raw.contacts.length ? raw.contacts : base.contacts,
  };
  state.contacts = state.contacts.map((contact, index) => ({
    avatar: null,
    kind: 'contact',
    color: contact.color || colorFor(contact.phone || contact.id || index),
    createdAt: contact.createdAt || Date.now(),
    ...contact,
  }));
  for (const [id, chat] of Object.entries(state.chats)) {
    state.chats[id] = {
      messages: Array.isArray(chat?.messages) ? chat.messages : [],
      unread: Number(chat?.unread) || 0,
      updatedAt: Number(chat?.updatedAt) || 0,
    };
  }
  if (!state.contacts.some((c) => c.id === SAVED_CHAT_ID)) {
    state.contacts.unshift(base.contacts[0]);
  }
  if (state.ui?.activeContactId && !state.contacts.some((c) => c.id === state.ui.activeContactId)) {
    state.ui.activeContactId = null;
  }
  return state;
}

/** Читает состояние из хранилища; при любой ошибке — состояние по умолчанию. */
export function loadState(storage, key = STORAGE_KEY) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return createDefaultState();
    return migrateState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

/**
 * Сохраняет состояние. Возвращает { ok, error }.
 * Не бросает исключение при переполнении квоты — UI покажет подсказку.
 */
export function saveState(storage, state, key = STORAGE_KEY) {
  const next = { ...state, savedAt: Date.now() };
  try {
    storage.setItem(key, JSON.stringify(next));
    return { ok: true, state: next };
  } catch (error) {
    return { ok: false, error, state: next };
  }
}

export function getContact(state, contactId) {
  return state.contacts.find((contact) => contact.id === contactId) || null;
}

export function findContactByPhone(state, e164) {
  const key = phoneKey(e164);
  if (!key) return null;
  return state.contacts.find((contact) => phoneKey(contact.phone) === key) || null;
}

/**
 * Добавляет контакт по номеру телефона.
 * Если контакт с таким номером уже есть — возвращает существующий.
 */
export function addContactByPhone(state, e164, name) {
  const existing = findContactByPhone(state, e164);
  if (existing) return { state, contact: existing, created: false };
  const id = `c_${phoneKey(e164)}`;
  const contact = {
    id,
    kind: 'contact',
    name: String(name || '').trim() || formatPhone(e164),
    phone: e164,
    avatar: null,
    color: colorFor(e164),
    createdAt: Date.now(),
  };
  return {
    state: { ...state, contacts: [...state.contacts, contact] },
    contact,
    created: true,
  };
}

export function updateContact(state, contactId, patch) {
  return {
    ...state,
    contacts: state.contacts.map((contact) =>
      contact.id === contactId ? { ...contact, ...patch } : contact,
    ),
  };
}

export function removeContact(state, contactId) {
  if (contactId === SAVED_CHAT_ID) return state;
  const chats = { ...state.chats };
  delete chats[contactId];
  return {
    ...state,
    contacts: state.contacts.filter((contact) => contact.id !== contactId),
    chats,
    ui: { ...state.ui, activeContactId: state.ui.activeContactId === contactId ? null : state.ui.activeContactId },
  };
}

function pushMessage(state, contactId, message, { incoming = false } = {}) {
  const chat = state.chats[contactId] || { messages: [], unread: 0, updatedAt: 0 };
  const unread = incoming ? chat.unread + 1 : 0;
  return {
    ...state,
    chats: {
      ...state.chats,
      [contactId]: {
        messages: [...chat.messages, message],
        unread,
        updatedAt: message.ts,
      },
    },
  };
}

/** Отправка своего сообщения. */
export function sendMessage(state, contactId, text) {
  const value = String(text ?? '').trim();
  if (!value || !contactId) return state;
  return pushMessage(state, contactId, {
    id: uid('m'),
    author: 'me',
    text: value,
    ts: Date.now(),
  });
}

/** Входящее сообщение (демо-ответ собеседника). */
export function receiveMessage(state, contactId, text) {
  const value = String(text ?? '').trim();
  if (!value || !contactId) return state;
  return pushMessage(
    state,
    contactId,
    { id: uid('m'), author: 'them', text: value, ts: Date.now() },
    { incoming: true },
  );
}

export function markChatRead(state, contactId) {
  const chat = state.chats[contactId];
  if (!chat || chat.unread === 0) return state;
  return {
    ...state,
    chats: { ...state.chats, [contactId]: { ...chat, unread: 0 } },
  };
}

export function clearChat(state, contactId) {
  const chat = state.chats[contactId];
  if (!chat) return state;
  return {
    ...state,
    chats: { ...state.chats, [contactId]: { messages: [], unread: 0, updatedAt: chat.updatedAt } },
  };
}

export function setProfile(state, patch) {
  return { ...state, profile: { ...state.profile, ...patch } };
}

export function setSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}

export function setActiveContact(state, contactId) {
  return { ...state, ui: { ...state.ui, activeContactId: contactId } };
}

export function getChat(state, contactId) {
  return state.chats[contactId] || { messages: [], unread: 0, updatedAt: 0 };
}

export function totalUnread(state) {
  return Object.values(state.chats).reduce((sum, chat) => sum + (chat.unread || 0), 0);
}

/** Фильтр контактов по имени/номеру. */
export function searchContacts(state, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return state.contacts;
  const digits = digitsOnly(q);
  return state.contacts.filter((contact) => {
    const name = String(contact.name || '').toLowerCase();
    const phone = phoneKey(contact.phone);
    return name.includes(q) || (digits && phone.includes(digits));
  });
}

/** Контакты, отсортированные по свежести переписки. */
export function sortedContacts(state, contacts = state.contacts) {
  return contacts.slice().sort((a, b) => {
    if (a.id === SAVED_CHAT_ID) return -1;
    if (b.id === SAVED_CHAT_ID) return 1;
    const at = getChat(state, a.id).updatedAt || a.createdAt || 0;
    const bt = getChat(state, b.id).updatedAt || b.createdAt || 0;
    return bt - at;
  });
}

export function lastMessage(state, contactId) {
  const chat = getChat(state, contactId);
  return chat.messages.length ? chat.messages[chat.messages.length - 1] : null;
}

/** Статистика для раздела «Данные» в настройках. */
export function usageStats(state) {
  const messages = Object.values(state.chats).reduce((sum, chat) => sum + chat.messages.length, 0);
  const contacts = state.contacts.filter((contact) => contact.id !== SAVED_CHAT_ID).length;
  return { contacts, messages, chats: Object.keys(state.chats).length };
}
