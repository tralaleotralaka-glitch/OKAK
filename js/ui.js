/**
 * MySENGER — DOM-помощники и отрисовка.
 */

import { getChat, initialsOf, lastMessage } from './store.js';
import { formatPhone } from './phone.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Экранирование для вставки в innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 12:45 */
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Сегодня / Вчера / 12 марта */
export function formatDayLabel(ts) {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return 'Сегодня';
  if (day === today - 86400000) return 'Вчера';
  const d = new Date(ts);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** Время в списке чатов: сегодня — часы, вчера — «вчера», дальше — дата. */
export function formatListTime(ts) {
  if (!ts) return '';
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return formatTime(ts);
  if (day === today - 86400000) return 'вчера';
  const d = new Date(ts);
  if (today - day < 6 * 86400000) return WEEKDAYS[d.getDay()];
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Разметка аватара: фото или инициалы на цветном фоне. */
export function avatarHTML({ name, avatar, color }, extraClass = '') {
  const inner = avatar
    ? `<img src="${esc(avatar)}" alt="">`
    : esc(initialsOf(name));
  return `<span class="avatar ${extraClass}" style="--c:${esc(color || '#6c5ce7')}">${inner}</span>`;
}

export function contactLabel(contact) {
  return contact.name || (contact.phone ? formatPhone(contact.phone) : 'Без имени');
}

/** Строка списка чатов. */
export function chatRowHTML(state, contact, isActive) {
  const last = lastMessage(state, contact.id);
  const chat = getChat(state, contact.id);
  const preview = last
    ? `${last.author === 'me' ? '<b>Вы:</b> ' : ''}${esc(last.text)}`
    : '<i>Нет сообщений</i>';
  const time = formatListTime(chat.updatedAt || contact.createdAt);
  const badge = chat.unread
    ? `<span class="badge">${chat.unread > 99 ? '99+' : chat.unread}</span>`
    : '';
  return `
    <button class="row${isActive ? ' is-active' : ''}" role="listitem" data-contact-id="${esc(contact.id)}">
      ${avatarHTML(contact)}
      <span class="row__main">
        <span class="row__top">
          <span class="row__name">${esc(contactLabel(contact))}</span>
          <span class="row__time">${esc(time)}</span>
        </span>
        <span class="row__bottom">
          <span class="row__preview">${preview}</span>
          ${badge}
        </span>
      </span>
    </button>`;
}

export function renderChatList(state, contacts, activeId) {
  return contacts
    .map((contact) => chatRowHTML(state, contact, contact.id === activeId))
    .join('');
}

/** Лента сообщений с разделителями по дням. */
export function renderMessages(chat) {
  if (!chat.messages.length) {
    return `<div class="messages__empty">Сообщений пока нет.<br>Напишите первым 👋</div>`;
  }
  let html = '';
  let lastDay = null;
  for (const message of chat.messages) {
    const day = startOfDay(message.ts);
    if (day !== lastDay) {
      html += `<div class="day">${esc(formatDayLabel(message.ts))}</div>`;
      lastDay = day;
    }
    html += `
      <div class="msg msg--${message.author === 'me' ? 'me' : 'them'}">${esc(message.text)}<span class="msg__meta">${esc(formatTime(message.ts))}</span></div>`;
  }
  return html;
}

export function typingHTML() {
  return `<div class="typing"><i></i><i></i><i></i></div>`;
}

let toastTimer = [];

/** Всплывающее уведомление. */
export function toast(text, ttl = 2200) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = text;
  host.appendChild(node);
  const timer = setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 240);
  }, ttl);
  toastTimer.push(timer);
  if (toastTimer.length > 20) {
    clearTimeout(toastTimer.shift());
    host.firstElementChild?.remove();
  }
}

/**
 * Читает картинку из файла и уменьшает до квадрата size×size,
 * чтобы аватар помещался в localStorage.
 */
export function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('Нужен файл изображения'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Не удалось открыть изображение'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;
        ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
