/* MySENGER — простой мессенджер, все данные хранятся в localStorage браузера */
(() => {
  'use strict';

  const STORAGE_KEY = 'mysenger:v1';

  /* ---------- Хранилище ---------- */
  const defaultState = () => ({
    settings: { name: 'Я', avatar: null, theme: 'light' },
    chats: {},            // { [phone]: { phone, createdAt, messages: [{id, text, ts, out}], draft } }
    ui: { screen: 'list', openChat: null },
  });

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const def = defaultState();
      return {
        settings: { ...def.settings, ...(data.settings || {}) },
        chats: data.chats || {},
        ui: { ...def.ui, ...(data.ui || {}) },
      };
    } catch (e) {
      console.warn('Не удалось прочитать сохранённые данные', e);
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Не удалось сохранить: память браузера переполнена');
    }
  }

  let state = load();

  /* ---------- Утилиты ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function normalizePhone(input) {
    const trimmed = input.trim();
    let digits = trimmed.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return null;
    // Российский формат 8XXXXXXXXXX → +7XXXXXXXXXX
    if (!trimmed.startsWith('+') && digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
    return '+' + digits;
  }

  function formatPhone(p) {
    const d = p.replace(/\D/g, '');
    if (d.length === 11 && d[0] === '7') {
      return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
    }
    return '+' + d.replace(/(\d{3})(?=\d)/g, '$1 ');
  }

  const pad = (n) => String(n).padStart(2, '0');
  const timeStr = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

  function dayLabel(ts) {
    const now = Date.now();
    if (sameDay(ts, now)) return 'Сегодня';
    if (sameDay(ts, now - 86400000)) return 'Вчера';
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function listTime(ts) {
    if (sameDay(ts, Date.now())) return timeStr(ts);
    return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }

  function initials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // Цвет аватарки контакта зависит от номера
  const COLORS = ['#4f6bff', '#e5484d', '#30a46c', '#f76b15', '#8e4ec6', '#0091ff', '#d6409f', '#12a594'];
  const colorFor = (s) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

  function paintAvatar(el, { image, text, color }) {
    if (image) {
      el.style.backgroundImage = `url("${image}")`;
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = text;
    }
    el.style.backgroundColor = color || '';
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  /* ---------- Тема ---------- */
  function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
  }

  /* ---------- Навигация ---------- */
  function show(screen) {
    ['list', 'chat', 'settings'].forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== screen));
    state.ui.screen = screen;
    save();
  }

  /* ---------- Список чатов ---------- */
  function renderMe() {
    const { name, avatar } = state.settings;
    paintAvatar($('me-avatar'), { image: avatar, text: initials(name) });
    $('me-name').textContent = name;
  }

  function lastTs(chat) {
    const m = chat.messages[chat.messages.length - 1];
    return m ? m.ts : chat.createdAt;
  }

  function renderList() {
    const list = $('chat-list');
    const chats = Object.values(state.chats).sort((a, b) => lastTs(b) - lastTs(a));
    $('empty-list').classList.toggle('hidden', chats.length > 0);
    list.innerHTML = chats.map((c) => {
      const last = c.messages[c.messages.length - 1];
      const preview = c.draft
        ? `<span style="color:var(--danger)">Черновик:</span> ${esc(c.draft)}`
        : last ? (last.out ? 'Вы: ' : '') + esc(last.text) : '<i>Нет сообщений</i>';
      return `
        <li class="chat-item" data-phone="${esc(c.phone)}">
          <div class="avatar avatar--md" style="background-color:${colorFor(c.phone)}">${esc(c.phone.slice(-2))}</div>
          <div class="chat-item__body">
            <div class="chat-item__row">
              <span class="chat-item__name">${esc(formatPhone(c.phone))}</span>
              <span class="chat-item__time">${listTime(lastTs(c))}</span>
            </div>
            <div class="chat-item__last">${preview}</div>
          </div>
        </li>`;
    }).join('');
  }

  $('chat-list').addEventListener('click', (e) => {
    const item = e.target.closest('.chat-item');
    if (item) openChat(item.dataset.phone);
  });

  /* ---------- Плюс: новый номер ---------- */
  function openAddModal() {
    $('phone-input').value = '';
    $('btn-apply').classList.add('hidden');
    $('phone-error').classList.add('hidden');
    $('modal-add').classList.remove('hidden');
    setTimeout(() => $('phone-input').focus(), 50);
  }
  const closeAddModal = () => $('modal-add').classList.add('hidden');

  $('btn-add').addEventListener('click', openAddModal);
  $('btn-add-cancel').addEventListener('click', closeAddModal);
  $('modal-add').addEventListener('click', (e) => { if (e.target.id === 'modal-add') closeAddModal(); });

  $('phone-input').addEventListener('input', (e) => {
    // Разрешаем только цифры, +, пробелы, скобки и дефисы
    const clean = e.target.value.replace(/[^\d+\s()-]/g, '');
    if (clean !== e.target.value) e.target.value = clean;
    const hasDigits = /\d/.test(clean);
    // Кнопка «Применить» появляется, как только номер введён
    $('btn-apply').classList.toggle('hidden', !hasDigits);
    $('phone-error').classList.add('hidden');
  });

  $('phone-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$('btn-apply').classList.contains('hidden')) applyPhone();
    if (e.key === 'Escape') closeAddModal();
  });

  $('btn-apply').addEventListener('click', applyPhone);

  function applyPhone() {
    const phone = normalizePhone($('phone-input').value);
    if (!phone) {
      $('phone-error').classList.remove('hidden');
      return;
    }
    if (!state.chats[phone]) {
      state.chats[phone] = { phone, createdAt: Date.now(), messages: [], draft: '' };
      save();
    }
    closeAddModal();
    openChat(phone);
  }

  /* ---------- Переписка ---------- */
  function openChat(phone) {
    const chat = state.chats[phone];
    if (!chat) return show('list');
    state.ui.openChat = phone;
    $('chat-title').textContent = formatPhone(phone);
    $('chat-sub').textContent = chat.messages.length ? `сообщений: ${chat.messages.length}` : 'новый чат';
    const av = $('chat-avatar');
    paintAvatar(av, { text: phone.slice(-2), color: colorFor(phone) });
    $('msg-input').value = chat.draft || '';
    updateSendBtn();
    renderMessages();
    show('chat');
    setTimeout(() => $('msg-input').focus(), 50);
  }

  function renderMessages() {
    const chat = state.chats[state.ui.openChat];
    const box = $('messages');
    if (!chat.messages.length) {
      box.innerHTML = `<div class="messages__hint">Напишите первое сообщение на номер<br><b>${esc(formatPhone(chat.phone))}</b></div>`;
      return;
    }
    let html = '';
    let prev = null;
    for (const m of chat.messages) {
      if (!prev || !sameDay(prev.ts, m.ts)) html += `<div class="day-sep">${dayLabel(m.ts)}</div>`;
      html += `<div class="msg ${m.out ? 'msg--out' : 'msg--in'}">${esc(m.text)}<span class="msg__time">${timeStr(m.ts)}</span></div>`;
      prev = m;
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function updateSendBtn() {
    $('btn-send').disabled = !$('msg-input').value.trim();
  }

  $('msg-input').addEventListener('input', () => {
    updateSendBtn();
    const chat = state.chats[state.ui.openChat];
    if (chat) { chat.draft = $('msg-input').value; save(); }
  });

  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('msg-input').value.trim();
    const chat = state.chats[state.ui.openChat];
    if (!text || !chat) return;
    chat.messages.push({ id: Date.now() + Math.random().toString(36).slice(2), text, ts: Date.now(), out: true });
    chat.draft = '';
    save();
    $('msg-input').value = '';
    updateSendBtn();
    $('chat-sub').textContent = `сообщений: ${chat.messages.length}`;
    renderMessages();
  });

  $('btn-back-chat').addEventListener('click', () => {
    state.ui.openChat = null;
    renderList();
    show('list');
  });

  $('btn-delete-chat').addEventListener('click', () => {
    const phone = state.ui.openChat;
    confirmDialog({
      title: 'Удалить чат?',
      text: `Переписка с ${formatPhone(phone)} будет удалена без возможности восстановления.`,
      buttons: [
        { label: 'Отмена', cls: 'btn--text' },
        { label: 'Удалить', cls: 'btn--danger', action: () => {
          delete state.chats[phone];
          state.ui.openChat = null;
          save();
          renderList();
          show('list');
          toast('Чат удалён');
        } },
      ],
    });
  });

  /* ---------- Диалог подтверждения ---------- */
  function confirmDialog({ title, text, buttons }) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    const actions = $('confirm-actions');
    actions.innerHTML = '';
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + b.cls;
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        $('modal-confirm').classList.add('hidden');
        if (b.action) b.action();
      });
      actions.appendChild(btn);
    });
    $('modal-confirm').classList.remove('hidden');
  }

  /* ---------- Настройки ---------- */
  let draft = null; // несохранённые изменения настроек

  function openSettings() {
    draft = { ...state.settings };
    renderSettings();
    show('settings');
  }

  function renderSettings() {
    paintAvatar($('set-avatar'), { image: draft.avatar, text: initials(draft.name) });
    $('btn-avatar-remove').classList.toggle('hidden', !draft.avatar);
    if (document.activeElement !== $('set-name')) $('set-name').value = draft.name;
    document.querySelectorAll('#theme-switch button').forEach((b) =>
      b.classList.toggle('active', b.dataset.theme === draft.theme));
    applyTheme(draft.theme); // предпросмотр темы
  }

  const isDirty = () => draft && (
    draft.name !== state.settings.name ||
    draft.avatar !== state.settings.avatar ||
    draft.theme !== state.settings.theme
  );

  function commitSettings() {
    const name = draft.name.trim() || 'Я';
    state.settings = { ...draft, name };
    save();
    applyTheme(state.settings.theme);
    renderMe();
  }

  function closeSettings() {
    draft = null;
    applyTheme(state.settings.theme);
    renderMe();
    renderList();
    show('list');
  }

  $('btn-settings').addEventListener('click', openSettings);

  $('set-name').addEventListener('input', (e) => { draft.name = e.target.value; renderSettings(); });

  $('theme-switch').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    draft.theme = b.dataset.theme;
    renderSettings();
  });

  $('avatar-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Выберите изображение');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Обрезаем по центру в квадрат и уменьшаем до 256px, чтобы влезло в хранилище
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        draft.avatar = canvas.toDataURL('image/jpeg', 0.85);
        renderSettings();
      };
      img.onerror = () => toast('Не удалось открыть изображение');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  $('btn-avatar-remove').addEventListener('click', () => { draft.avatar = null; renderSettings(); });

  $('btn-save-settings').addEventListener('click', () => {
    commitSettings();
    draft = { ...state.settings };
    renderSettings();
    toast('Настройки сохранены');
  });

  // Выход из настроек — предлагаем сохранить
  $('btn-back-settings').addEventListener('click', () => {
    if (!isDirty()) return closeSettings();
    confirmDialog({
      title: 'Сохранить настройки?',
      text: 'Вы изменили настройки. Сохранить изменения перед выходом?',
      buttons: [
        { label: 'Не сохранять', cls: 'btn--text', action: closeSettings },
        { label: 'Отмена', cls: 'btn--text' },
        { label: 'Сохранить', cls: 'btn--primary', action: () => { commitSettings(); closeSettings(); toast('Настройки сохранены'); } },
      ],
    });
  });

  // Предупреждение браузера, если закрывают страницу с несохранёнными настройками
  window.addEventListener('beforeunload', (e) => {
    if (state.ui.screen === 'settings' && isDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Синхронизация между вкладками
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const screen = state.ui.screen;
    const open = state.ui.openChat;
    state = load();
    state.ui.screen = screen;
    state.ui.openChat = open;
    if (!draft) applyTheme(state.settings.theme);
    renderMe();
    renderList();
    if (screen === 'chat' && state.chats[open]) renderMessages();
  });

  /* ---------- Старт: восстанавливаем, где остановились ---------- */
  applyTheme(state.settings.theme);
  renderMe();
  renderList();
  if (state.ui.screen === 'chat' && state.chats[state.ui.openChat]) openChat(state.ui.openChat);
  else if (state.ui.screen === 'settings') openSettings();
  else show('list');
})();
