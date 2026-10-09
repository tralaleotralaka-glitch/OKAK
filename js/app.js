/**
 * MySENGER — логика приложения.
 *
 *  • «+» в правом нижнем углу  → ввод номера → «Применить» → открывается чат
 *  • шестерёнка справа сверху  → аватар, имя, тема; при выходе спрашивает про сохранение
 *  • всё (контакты, переписка, настройки) живёт в localStorage
 */

import {
  COUNTRY_CODES,
  digitsOnly,
  formatAsYouType,
  formatPhone,
  makeE164,
  splitE164,
} from './phone.js';
import * as store from './store.js';
import {
  $,
  avatarHTML,
  chatRowHTML,
  contactLabel,
  fileToAvatar,
  formatListTime,
  renderChatList,
  renderMessages,
  toast,
  typingHTML,
} from './ui.js';

/* ══════════ Состояние ══════════ */

const storage = window.localStorage;
let state = store.loadState(storage);
let typingContactId = null;
let typingTimer = null;
let saveFlashTimer = null;

const REPLIES = [
  'Привет! Я тут 👋',
  'Принято, спасибо!',
  'Ок, договорились 🙂',
  'Хорошо, посмотрю и отвечу.',
  'А можешь подробнее?',
  'Буду через 10 минут.',
  'Отличная идея!',
];

/* ══════════ Ссылки на DOM ══════════ */

const dom = {
  paneChat: $('#pane-chat'),
  chat: $('#chat'),
  chatPlaceholder: $('#chat-placeholder'),
  chatList: $('#chat-list'),
  emptyState: $('#empty-state'),
  search: $('#search'),
  fab: $('#fab'),
  btnSettings: $('#btn-settings'),
  saveChip: $('#save-chip'),

  chatAvatar: $('#chat-avatar'),
  chatName: $('#chat-name'),
  chatSub: $('#chat-sub'),
  btnBack: $('#btn-back'),
  btnContact: $('#btn-contact'),
  btnClearChat: $('#btn-clear-chat'),
  messages: $('#messages'),
  composer: $('#composer'),
  composerInput: $('#composer-input'),
  btnSend: $('#btn-send'),

  scrim: $('#scrim'),
  sheetPhone: $('#sheet-phone'),
  ccSelect: $('#cc-select'),
  phoneInput: $('#phone-input'),
  phoneMsg: $('#phone-msg'),
  btnApply: $('#btn-apply'),
  btnPhoneCancel: $('#btn-phone-cancel'),
  recentBlock: $('#recent-block'),
  recentList: $('#recent-list'),

  panel: $('#panel-settings'),
  btnSettingsBack: $('#btn-settings-back'),
  btnSettingsSave: $('#btn-settings-save'),
  btnSettingsDiscard: $('#btn-settings-discard'),
  dirtyChip: $('#dirty-chip'),
  btnAvatar: $('#btn-avatar'),
  profileAvatar: $('#profile-avatar'),
  btnAvatarRemove: $('#btn-avatar-remove'),
  btnAvatarRandom: $('#btn-avatar-random'),
  inputName: $('#input-name'),
  themeSwitch: $('#theme-switch'),
  inputAutoReply: $('#input-autoreply'),
  inputEnterToSend: $('#input-entertosend'),
  usageStats: $('#usage-stats'),
  btnExport: $('#btn-export'),
  btnWipe: $('#btn-wipe'),

  sheetContact: $('#sheet-contact'),
  contactAvatar: $('#contact-avatar'),
  btnContactAvatar: $('#btn-contact-avatar'),
  contactPhone: $('#contact-phone'),
  inputContactName: $('#input-contact-name'),
  btnContactSave: $('#btn-contact-save'),
  btnContactDelete: $('#btn-contact-delete'),

  modal: $('#modal'),
  modalTitle: $('#modal-title'),
  modalText: $('#modal-text'),
  modalActions: $('#modal-actions'),

  fileInput: $('#file-input'),
  toasts: $('#toasts'),
};

/* ══════════ Оверлеи ══════════ */

const overlayStack = [];

function openOverlay(node) {
  if (overlayStack.includes(node)) return;
  node.hidden = false;
  dom.scrim.hidden = false;
  requestAnimationFrame(() => {
    node.classList.add('is-on');
    dom.scrim.classList.add('is-on');
  });
  overlayStack.push(node);
}

function closeOverlay(node) {
  const index = overlayStack.indexOf(node);
  if (index === -1) return;
  overlayStack.splice(index, 1);
  node.classList.remove('is-on');
  if (!overlayStack.length) {
    dom.scrim.classList.remove('is-on');
    setTimeout(() => {
      if (!overlayStack.length) dom.scrim.hidden = true;
    }, 240);
  }
  // если слой успели открыть снова — не прячем его
  setTimeout(() => {
    if (!overlayStack.includes(node)) node.hidden = true;
  }, 260);
}

const topOverlay = () => overlayStack[overlayStack.length - 1] || null;

/* ══════════ Модальное окно ══════════ */

let modalResolve = null;

/** Показывает диалог; резолвится id нажатой кнопки (или null). */
function askUser({ title, text, buttons }) {
  dom.modalTitle.textContent = title;
  dom.modalText.textContent = text;
  dom.modalActions.innerHTML = '';
  return new Promise((resolve) => {
    modalResolve = resolve;
    buttons.forEach((button) => {
      const node = document.createElement('button');
      const kind = button.kind === 'primary' ? 'btn--primary'
        : button.kind === 'danger' ? 'btn--danger' : 'btn--ghost';
      node.className = `btn ${kind}`;
      node.type = 'button';
      node.textContent = button.label;
      node.addEventListener('click', () => {
        modalResolve = null;
        closeOverlay(dom.modal);
        resolve(button.id);
      });
      dom.modalActions.appendChild(node);
    });
    openOverlay(dom.modal);
  });
}

function cancelModal() {
  if (!modalResolve) return;
  const resolve = modalResolve;
  modalResolve = null;
  closeOverlay(dom.modal);
  resolve(null);
}

/* ══════════ Тема ══════════ */

const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
  || { matches: false, addEventListener() {} };

function resolveTheme(preference) {
  if (preference === 'auto') return darkQuery.matches ? 'dark' : 'light';
  return preference === 'dark' ? 'dark' : 'light';
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0e1118' : '#ffffff');
}

/* ══════════ Сохранение ══════════ */

function persist({ flash = true } = {}) {
  const result = store.saveState(storage, state);
  state = result.state;
  if (!result.ok) {
    toast('Не удалось сохранить: хранилище браузера переполнено');
    return false;
  }
  if (flash) flashSaved();
  return true;
}

function flashSaved() {
  dom.saveChip.textContent = 'Сохранено ✓';
  dom.saveChip.classList.add('is-on');
  clearTimeout(saveFlashTimer);
  saveFlashTimer = setTimeout(() => dom.saveChip.classList.remove('is-on'), 1500);
}

/** Меняет состояние, сохраняет и перерисовывает. */
function commit(next, options) {
  state = next;
  persist(options);
  render();
}

/* ══════════ Отрисовка ══════════ */

function render() {
  renderList();
  renderChat();
  renderTitle();
}

function renderList() {
  const query = dom.search.value;
  const contacts = store.sortedContacts(state, store.searchContacts(state, query));
  dom.chatList.innerHTML = renderChatList(state, contacts, state.ui.activeContactId);
  dom.emptyState.hidden = contacts.length > 0;
}

function renderChat() {
  const contactId = state.ui.activeContactId;
  const contact = contactId ? store.getContact(state, contactId) : null;
  const isOpen = Boolean(contact);

  dom.chat.hidden = !isOpen;
  dom.chatPlaceholder.hidden = isOpen;
  dom.btnBack.hidden = window.innerWidth > 760;

  if (!contact) return;

  const chat = store.getChat(state, contact.id);
  const wasAtBottom = isScrolledToBottom(dom.messages);

  dom.chatAvatar.outerHTML = avatarHTML(contact, 'avatar--sm').replace('<span class="', '<span id="chat-avatar" class="');
  dom.chatAvatar = $('#chat-avatar');
  dom.chatName.textContent = contactLabel(contact);
  dom.chatSub.textContent = contact.kind === 'saved'
    ? 'заметки и файлы для себя'
    : (contact.phone ? formatPhone(contact.phone) : 'контакт');

  const body = renderMessages(chat) + (typingContactId === contact.id ? typingHTML() : '');
  dom.messages.innerHTML = body;
  if (wasAtBottom || chat.messages.length <= 2) scrollToBottom();
}

function renderTitle() {
  const unread = store.totalUnread(state);
  document.title = unread ? `(${unread}) MySENGER` : 'MySENGER — мессенджер';
}

function isScrolledToBottom(node) {
  return node.scrollHeight - node.scrollTop - node.clientHeight < 80;
}

function scrollToBottom() {
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

/* ══════════ Чат ══════════ */

function openChat(contactId, { notify } = {}) {
  state = store.markChatRead(store.setActiveContact(state, contactId));
  persist({ flash: false });
  document.body.classList.add('chat-open');
  render();
  scrollToBottom();
  dom.composerInput.focus();
  if (notify) toast(notify);
}

function closeChat() {
  state = store.setActiveContact(state, null);
  persist({ flash: false });
  document.body.classList.remove('chat-open');
  render();
}

function sendMessage() {
  const contactId = state.ui.activeContactId;
  const text = dom.composerInput.value;
  if (!contactId || !text.trim()) return;
  dom.composerInput.value = '';
  autosize();
  commit(store.sendMessage(state, contactId, text));
  scrollToBottom();
  scheduleReply(contactId);
}

function scheduleReply(contactId) {
  if (!state.settings.autoReply || contactId === store.SAVED_CHAT_ID) return;
  typingContactId = contactId;
  renderChat();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typingContactId = null;
    const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
    let next = store.receiveMessage(state, contactId, reply);
    if (next.ui.activeContactId === contactId) next = store.markChatRead(next, contactId);
    commit(next);
    scrollToBottom();
  }, 1100 + Math.round(Math.random() * 900));
}

function autosize() {
  dom.composerInput.style.height = 'auto';
  dom.composerInput.style.height = `${Math.min(dom.composerInput.scrollHeight, 132)}px`;
  dom.btnSend.disabled = !dom.composerInput.value.trim();
}

/* ══════════ Лист «Новый номер» ══════════ */

function buildCountrySelect() {
  dom.ccSelect.innerHTML = COUNTRY_CODES
    .map((item) => `<option value="${item.cc}">+${item.cc} ${item.label}</option>`)
    .join('');
  updatePhonePlaceholder();
}

function updatePhonePlaceholder() {
  const meta = COUNTRY_CODES.find((item) => item.cc === dom.ccSelect.value) || COUNTRY_CODES[0];
  dom.phoneInput.placeholder = meta.sample;
}

function currentE164() {
  return makeE164(dom.ccSelect.value, dom.phoneInput.value);
}

/** Пересчитывает подсказку и доступность кнопки «Применить». */
function validatePhoneField() {
  const digits = digitsOnly(dom.phoneInput.value);
  const meta = COUNTRY_CODES.find((item) => item.cc === dom.ccSelect.value);
  const e164 = currentE164();
  const wrap = dom.phoneInput.closest('.phone-field__wrap');

  dom.btnApply.hidden = digits.length === 0;
  dom.phoneMsg.classList.remove('is-error', 'is-ok');
  wrap.classList.remove('is-error');

  if (!digits.length) {
    dom.btnApply.disabled = true;
    dom.phoneMsg.textContent = 'Номер сохранится в контактах — переписка не потеряется.';
    return;
  }

  if (e164) {
    dom.btnApply.disabled = false;
    const existing = store.findContactByPhone(state, e164);
    dom.phoneMsg.classList.add('is-ok');
    dom.phoneMsg.textContent = existing
      ? `Уже в контактах: ${contactLabel(existing)} — откроем переписку.`
      : `Готово: ${formatPhone(e164)}`;
    return;
  }

  dom.btnApply.disabled = true;
  if (meta?.fixed && digits.length > meta.fixed) {
    wrap.classList.add('is-error');
    dom.phoneMsg.classList.add('is-error');
    dom.phoneMsg.textContent = `Слишком длинный номер: нужно ${meta.fixed} цифр.`;
  } else if (meta?.fixed) {
    dom.phoneMsg.textContent = `Введите ещё ${meta.fixed - digits.length} цифр(ы).`;
  } else {
    dom.phoneMsg.textContent = 'Продолжайте ввод номера.';
  }
}

function openPhoneSheet() {
  dom.phoneInput.value = '';
  dom.btnApply.hidden = true;
  dom.btnApply.disabled = true;
  renderRecent();
  validatePhoneField();
  openOverlay(dom.sheetPhone);
  setTimeout(() => dom.phoneInput.focus(), 280);
}

function renderRecent() {
  const recent = store.sortedContacts(state)
    .filter((contact) => contact.kind !== 'saved')
    .slice(0, 5);
  dom.recentBlock.hidden = recent.length === 0;
  dom.recentList.innerHTML = recent
    .map((contact) => `<button class="row" type="button" data-recent-phone="${contact.phone || ''}">
        ${avatarHTML(contact, 'avatar--sm')}
        <span class="row__main">
          <span class="row__top"><span class="row__name">${contactLabel(contact)}</span></span>
          <span class="row__bottom"><span class="row__preview">${formatPhone(contact.phone)}</span></span>
        </span>
      </button>`)
    .join('');
}

/** «Применить»: создаёт/находит контакт и открывает чат. */
function applyPhone() {
  const e164 = currentE164();
  if (!e164) {
    dom.phoneInput.closest('.phone-field__wrap').classList.add('is-error');
    dom.phoneMsg.classList.add('is-error');
    dom.phoneMsg.textContent = 'Проверьте номер — он введён не полностью.';
    dom.phoneInput.focus();
    return;
  }
  const { state: nextState, contact, created } = store.addContactByPhone(state, e164);
  state = nextState;
  closeOverlay(dom.sheetPhone);
  openChat(contact.id, {
    notify: created ? `Контакт ${formatPhone(e164)} добавлен` : 'Открываем переписку',
  });
}

/* ══════════ Настройки ══════════ */

let settingsDraft = null;

function openSettings() {
  settingsDraft = {
    name: state.profile.name,
    avatar: state.profile.avatar,
    color: state.profile.color,
    theme: state.settings.theme,
    autoReply: state.settings.autoReply,
    enterToSend: state.settings.enterToSend,
  };
  syncSettingsUI();
  renderUsage();
  openOverlay(dom.panel);
}

function syncSettingsUI() {
  if (!settingsDraft) return;
  dom.inputName.value = settingsDraft.name;
  dom.profileAvatar.outerHTML = avatarHTML(
    { name: settingsDraft.name, avatar: settingsDraft.avatar, color: settingsDraft.color },
    '',
  ).replace('<span class="', '<span id="profile-avatar" class="');
  dom.profileAvatar = $('#profile-avatar');
  dom.themeSwitch.querySelectorAll('.seg').forEach((seg) => {
    seg.classList.toggle('is-on', seg.dataset.themeValue === settingsDraft.theme);
  });
  dom.inputAutoReply.checked = Boolean(settingsDraft.autoReply);
  dom.inputEnterToSend.checked = Boolean(settingsDraft.enterToSend);
  applyTheme(settingsDraft.theme);
  updateDirtyChip();
}

function settingsDirty() {
  if (!settingsDraft) return false;
  return settingsDraft.name !== state.profile.name
    || settingsDraft.avatar !== state.profile.avatar
    || settingsDraft.color !== state.profile.color
    || settingsDraft.theme !== state.settings.theme
    || settingsDraft.autoReply !== state.settings.autoReply
    || settingsDraft.enterToSend !== state.settings.enterToSend;
}

function updateDirtyChip() {
  const dirty = settingsDirty();
  dom.dirtyChip.hidden = !dirty;
  dom.btnSettingsSave.disabled = !dirty;
  dom.btnSettingsSave.style.opacity = dirty ? '' : '.55';
}

function saveSettings({ silent = false } = {}) {
  let next = store.setProfile(state, {
    name: settingsDraft.name.trim() || 'Я',
    avatar: settingsDraft.avatar,
    color: settingsDraft.color,
  });
  next = store.setSettings(next, {
    theme: settingsDraft.theme,
    autoReply: settingsDraft.autoReply,
    enterToSend: settingsDraft.enterToSend,
  });
  commit(next);
  applyTheme(next.settings.theme);
  settingsDraft = null;
  if (!silent) toast('Настройки сохранены');
}

/** Выход из настроек: если есть изменения — спрашиваем. */
async function closeSettings() {
  if (!settingsDirty()) {
    settingsDraft = null;
    closeOverlay(dom.panel);
    return;
  }
  const answer = await askUser({
    title: 'Сохранить настройки?',
    text: 'Вы изменили профиль или оформление. Сохранить изменения перед выходом?',
    buttons: [
      { id: 'save', label: 'Сохранить', kind: 'primary' },
      { id: 'discard', label: 'Не сохранять' },
      { id: 'cancel', label: 'Отмена' },
    ],
  });
  if (answer === 'save') {
    saveSettings();
    closeOverlay(dom.panel);
  } else if (answer === 'discard') {
    applyTheme(state.settings.theme);
    settingsDraft = null;
    closeOverlay(dom.panel);
    toast('Изменения отменены');
  }
}

function renderUsage() {
  const stats = store.usageStats(state);
  dom.usageStats.textContent =
    `${stats.contacts} контакт(ов), ${stats.chats} чат(ов), ${stats.messages} сообщений`;
}

/* ══════════ Карточка контакта ══════════ */

let contactDraftId = null;

function openContactSheet(contactId) {
  const contact = store.getContact(state, contactId);
  if (!contact) return;
  contactDraftId = contactId;
  dom.contactAvatar.outerHTML = avatarHTML(contact, '')
    .replace('<span class="', '<span id="contact-avatar" class="');
  dom.contactAvatar = $('#contact-avatar');
  dom.inputContactName.value = contact.kind === 'saved' ? '' : contact.name;
  dom.inputContactName.placeholder = contact.kind === 'saved'
    ? 'Избранное'
    : formatPhone(contact.phone);
  dom.contactPhone.textContent = contact.kind === 'saved'
    ? 'Личное хранилище сообщений'
    : formatPhone(contact.phone);
  dom.btnContactDelete.hidden = contact.kind === 'saved';
  openOverlay(dom.sheetContact);
}

function saveContactSheet() {
  const contact = store.getContact(state, contactDraftId);
  if (!contact) return;
  const name = dom.inputContactName.value.trim();
  if (contact.kind !== 'saved' && !name) {
    toast('Введите имя или оставьте номер');
    return;
  }
  commit(store.updateContact(state, contact.id, contact.kind === 'saved'
    ? { name: name || 'Избранное' }
    : { name }));
  closeOverlay(dom.sheetContact);
  toast('Контакт сохранён');
}

/* ══════════ Аватары ══════════ */

let avatarTarget = null;

function pickAvatar(target) {
  avatarTarget = target;
  dom.fileInput.value = '';
  dom.fileInput.click();
}

dom.fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file || !avatarTarget) return;
  try {
    const dataUrl = await fileToAvatar(file, 256);
    if (avatarTarget.type === 'profile') {
      settingsDraft.avatar = dataUrl;
      syncSettingsUI();
    } else {
      commit(store.updateContact(state, avatarTarget.id, { avatar: dataUrl }));
      const contact = store.getContact(state, avatarTarget.id);
      if (contact && !dom.sheetContact.hidden) {
        dom.contactAvatar.outerHTML = avatarHTML(contact, '')
          .replace('<span class="', '<span id="contact-avatar" class="');
        dom.contactAvatar = $('#contact-avatar');
      }
      toast('Фото контакта обновлено');
    }
  } catch (error) {
    toast(error.message || 'Не удалось загрузить фото');
  }
});

/* ══════════ Данные ══════════ */

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mysenger-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Копия выгружена');
}

async function wipeData() {
  const answer = await askUser({
    title: 'Удалить все данные?',
    text: 'Контакты, переписка и настройки будут стёрты без возможности восстановления.',
    buttons: [
      { id: 'yes', label: 'Удалить всё', kind: 'danger' },
      { id: 'no', label: 'Отмена' },
    ],
  });
  if (answer !== 'yes') return;
  try { storage.removeItem(store.STORAGE_KEY); } catch { /* хранилище может быть недоступно */ }
  state = store.createDefaultState();
  document.body.classList.remove('chat-open');
  persist();
  render();
  toast('Данные удалены');
}

/* ══════════ События ══════════ */

// — список чатов
dom.chatList.addEventListener('click', (event) => {
  const row = event.target.closest('[data-contact-id]');
  if (row) openChat(row.dataset.contactId);
});

dom.search.addEventListener('input', renderList);

// — FAB «+»
dom.fab.addEventListener('click', openPhoneSheet);

// — ввод номера
dom.ccSelect.addEventListener('change', () => {
  updatePhonePlaceholder();
  dom.phoneInput.value = '';
  validatePhoneField();
  dom.phoneInput.focus();
});

dom.phoneInput.addEventListener('input', () => {
  const caret = dom.phoneInput.selectionStart;
  const { text, caret: nextCaret } = formatAsYouType(dom.ccSelect.value, dom.phoneInput.value, caret);
  dom.phoneInput.value = text;
  dom.phoneInput.setSelectionRange(nextCaret, nextCaret);
  validatePhoneField();
});

dom.phoneInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (!dom.btnApply.disabled) applyPhone();
  }
});

dom.btnApply.addEventListener('click', applyPhone);
dom.btnPhoneCancel.addEventListener('click', () => closeOverlay(dom.sheetPhone));

dom.recentList.addEventListener('click', (event) => {
  const row = event.target.closest('[data-recent-phone]');
  if (!row) return;
  const { countryCode, national } = splitE164(row.dataset.recentPhone);
  dom.ccSelect.value = COUNTRY_CODES.some((item) => item.cc === countryCode) ? countryCode : dom.ccSelect.value;
  updatePhonePlaceholder();
  dom.phoneInput.value = formatAsYouType(dom.ccSelect.value, national).text;
  validatePhoneField();
  dom.phoneInput.focus();
});

// — диалог
dom.btnBack.addEventListener('click', closeChat);
dom.btnContact.addEventListener('click', () => {
  if (state.ui.activeContactId) openContactSheet(state.ui.activeContactId);
});

dom.btnClearChat.addEventListener('click', async () => {
  const contactId = state.ui.activeContactId;
  if (!contactId) return;
  const answer = await askUser({
    title: 'Очистить чат?',
    text: 'Все сообщения в этом чате будут удалены.',
    buttons: [
      { id: 'yes', label: 'Очистить', kind: 'danger' },
      { id: 'no', label: 'Отмена' },
    ],
  });
  if (answer === 'yes') {
    commit(store.clearChat(state, contactId));
    toast('Чат очищен');
  }
});

dom.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage();
});

dom.composerInput.addEventListener('input', autosize);
dom.composerInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const shouldSend = state.settings.enterToSend && !event.shiftKey;
  if (shouldSend) {
    event.preventDefault();
    sendMessage();
  }
});

// — настройки
dom.btnSettings.addEventListener('click', openSettings);
dom.btnSettingsBack.addEventListener('click', closeSettings);
dom.btnSettingsSave.addEventListener('click', () => { saveSettings(); closeOverlay(dom.panel); });
dom.btnSettingsDiscard.addEventListener('click', closeSettings);

dom.inputName.addEventListener('input', () => {
  if (!settingsDraft) return;
  settingsDraft.name = dom.inputName.value;
  syncSettingsUI();
});

dom.themeSwitch.addEventListener('click', (event) => {
  const seg = event.target.closest('[data-theme-value]');
  if (!seg || !settingsDraft) return;
  settingsDraft.theme = seg.dataset.themeValue;
  syncSettingsUI();
});

dom.inputAutoReply.addEventListener('change', () => {
  if (!settingsDraft) return;
  settingsDraft.autoReply = dom.inputAutoReply.checked;
  updateDirtyChip();
});

dom.inputEnterToSend.addEventListener('change', () => {
  if (!settingsDraft) return;
  settingsDraft.enterToSend = dom.inputEnterToSend.checked;
  updateDirtyChip();
});

dom.btnAvatar.addEventListener('click', () => pickAvatar({ type: 'profile' }));
dom.btnAvatarRemove.addEventListener('click', () => {
  settingsDraft.avatar = null;
  syncSettingsUI();
});
dom.btnAvatarRandom.addEventListener('click', () => {
  const palette = ['#6c5ce7', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];
  const used = palette.filter((color) => color !== settingsDraft.color);
  settingsDraft.color = used[Math.floor(Math.random() * used.length)];
  syncSettingsUI();
});

dom.btnExport.addEventListener('click', exportBackup);
dom.btnWipe.addEventListener('click', wipeData);

// — карточка контакта
dom.btnContactSave.addEventListener('click', saveContactSheet);
dom.btnContactAvatar.addEventListener('click', () => {
  if (contactDraftId) pickAvatar({ type: 'contact', id: contactDraftId });
});
dom.btnContactDelete.addEventListener('click', async () => {
  const contact = store.getContact(state, contactDraftId);
  if (!contact) return;
  const answer = await askUser({
    title: `Удалить ${contactLabel(contact)}?`,
    text: 'Контакт и вся переписка с ним будут удалены.',
    buttons: [
      { id: 'yes', label: 'Удалить', kind: 'danger' },
      { id: 'no', label: 'Отмена' },
    ],
  });
  if (answer !== 'yes') return;
  closeOverlay(dom.sheetContact);
  commit(store.removeContact(state, contact.id));
  document.body.classList.remove('chat-open');
  toast('Контакт удалён');
});

// — общие
dom.scrim.addEventListener('click', () => {
  const top = topOverlay();
  if (top === dom.modal) cancelModal();
  else if (top === dom.panel) closeSettings();
  else if (top) closeOverlay(top);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const top = topOverlay();
  if (!top) {
    if (document.body.classList.contains('chat-open') && window.innerWidth <= 760) closeChat();
    return;
  }
  if (top === dom.modal) cancelModal();
  else if (top === dom.panel) closeSettings();
  else closeOverlay(top);
});

darkQuery.addEventListener?.('change', () => {
  applyTheme(settingsDraft ? settingsDraft.theme : state.settings.theme);
});

window.addEventListener('resize', () => {
  dom.btnBack.hidden = window.innerWidth > 760 && Boolean(state.ui.activeContactId);
});

// страховка: сохраняемся при уходе со страницы
window.addEventListener('pagehide', () => { store.saveState(storage, state); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.saveState(storage, state);
});

/* ══════════ Старт ══════════ */

function init() {
  buildCountrySelect();
  applyTheme(state.settings.theme);
  autosize();
  render();
  // на широком экране возвращаем диалог, открытый до выхода
  if (state.ui.activeContactId && window.innerWidth > 760) scrollToBottom();
  if (state.savedAt) {
    dom.saveChip.textContent = `Восстановлено ${formatListTime(state.savedAt)}`;
    dom.saveChip.classList.add('is-on');
    saveFlashTimer = setTimeout(() => dom.saveChip.classList.remove('is-on'), 2400);
  }
}

init();
