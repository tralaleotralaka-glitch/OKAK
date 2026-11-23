/**
 * VOX AI — клиентское приложение.
 * Чат с потоковыми ответами, голосовой ввод (Web Speech API) и озвучка.
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------------------------- state --------------------------------- */

const state = {
  config: null,
  settings: null,
  messages: [], // { role, content }
  sending: false,
  controller: null,
  speaking: false,
  listening: false,
  recognition: null,
  audio: null,
};

const PRESETS = {
  assistant:
    'Ты VOX AI — дружелюбный и точный голосовой ассистент. Отвечай на языке пользователя, кратко и по делу, без лишних вступлений. Если ответ читают вслух — избегай таблиц, длинных списков и разметки.',
  teacher:
    'Ты VOX AI в роли терпеливого преподавателя. Объясняй простыми словами, приводи примеры из жизни, проверяй понимание вопросом в конце. Пиши так, чтобы текст было приятно слушать.',
  coder:
    'Ты VOX AI — опытный инженер-программист. Давай рабочий код с короткими пояснениями, указывай версии и подводные камни. Форматируй код в блоках ```.',
  friend:
    'Ты VOX AI — дружелюбный собеседник с чувством юмора. Общайся тепло и живо, но не переигрывай. Отвечай коротко, как в разговоре голосом.',
};

/* --------------------------------- утилиты -------------------------------- */

function toast(message, type = '', timeout = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'all .2s';
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

function timeString(date = new Date()) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

const isConfigured = (s) =>
  Boolean(s && s.model && (s.hasKey || !state.config?.providers?.[s.provider]?.requiresKey) && (s.baseUrl || state.config?.providers?.[s.provider]?.baseUrl));

/* ------------------------------ отрисовка --------------------------------- */

function renderStatus() {
  const s = state.settings;
  const dot = $('#statusDot');
  const text = $('#statusText');
  const meta = $('#statusMeta');
  dot.className = 'dot';
  if (!s) return;
  if (isConfigured(s)) {
    dot.classList.add('ok');
    text.textContent = 'Готов к работе';
    meta.textContent = `${s.model} · ключ ${s.hasKey ? s.apiKeyMasked : 'не нужен'}`;
  } else if (s.hasKey) {
    dot.classList.add('warn');
    text.textContent = 'Укажите модель';
    meta.textContent = 'Откройте настройки и выберите модель.';
  } else {
    dot.classList.add('err');
    text.textContent = 'Нужен API-ключ';
    meta.textContent = 'Вставьте ключ в «Настройки и API».';
  }
  $('#modelPill').textContent = s.model || 'модель не выбрана';
  $('#providerPill').textContent = state.config?.providers?.[s.provider]?.name || s.provider;
}

function renderMessages() {
  const box = $('#messages');
  box.innerHTML = '';
  $('#welcome').style.display = state.messages.length ? 'none' : 'grid';
  state.messages.forEach((m, index) => box.append(buildMessage(m, index)));
  scrollToBottom();
}

function buildMessage(message, index) {
  const el = document.createElement('div');
  el.className = `msg ${message.role}${message.error ? ' error' : ''}`;
  el.dataset.index = index;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = message.role === 'user' ? 'Вы' : 'V';
  if (!message.role) avatar.textContent = 'V';

  const body = document.createElement('div');
  body.className = 'body';

  const meta = document.createElement('div');
  meta.className = 'meta';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = message.role === 'user' ? 'Вы' : 'VOX AI';
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = message.time || timeString();
  meta.append(who, time);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = message.content || '';

  body.append(meta, bubble);

  if (message.role === 'assistant' && message.content) {
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    const speakBtn = document.createElement('button');
    speakBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15 9a4 4 0 0 1 0 6"/></svg> Озвучить';
    speakBtn.onclick = () => speak(message.content, speakBtn);
    toolbar.append(speakBtn);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Копировать';
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        toast('Скопировано', 'ok', 1600);
      } catch {
        toast('Не удалось скопировать', 'err');
      }
    };
    toolbar.append(copyBtn);

    const regenBtn = document.createElement('button');
    regenBtn.textContent = 'Ещё вариант';
    regenBtn.onclick = () => regenerate(index);
    toolbar.append(regenBtn);

    body.append(toolbar);
  }

  el.append(avatar, body);
  return el;
}

function scrollToBottom() {
  const chat = $('#chat');
  chat.scrollTop = chat.scrollHeight;
}

/* ---------------------------------- чат ----------------------------------- */

function pushMessage(role, content, extra = {}) {
  const message = { role, content, time: timeString(), ...extra };
  state.messages.push(message);
  $('#welcome').style.display = 'none';
  $('#messages').append(buildMessage(message, state.messages.length - 1));
  scrollToBottom();
  return message;
}

async function send(textOverride) {
  const input = $('#input');
  const text = (textOverride ?? input.value).trim();
  if (!text || state.sending) return;

  input.value = '';
  autoGrow();
  updateCharCount();

  pushMessage('user', text);
  await streamReply();
}

async function streamReply() {
  if (state.sending) return;
  if (!isConfigured(state.settings)) {
    toast('Сначала укажите API-ключ и модель в настройках.', 'err');
    openDrawer();
    return;
  }

  state.sending = true;
  updateSendButton();

  const assistant = pushMessage('assistant', '');
  const el = $(`.msg[data-index="${state.messages.length - 1}"]`);
  const bubble = el.querySelector('.bubble');
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';

  const controller = new AbortController();
  state.controller = controller;
  let buffer = '';

  const paint = () => {
    bubble.textContent = buffer;
    if (state.settings.stream) {
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      bubble.append(cursor);
    }
    scrollToBottom();
  };

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.messages.filter((m) => m.content) }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Ошибка ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('text/event-stream')) {
      const data = await res.json();
      buffer = data.message || '';
      bubble.textContent = buffer;
      assistant.content = buffer;
      if (data.usage) assistant.usage = data.usage;
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const events = pending.split('\n\n');
        pending = events.pop() ?? '';
        for (const raw of events) {
          const line = raw.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let event;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (event.type === 'delta') {
            buffer += event.text;
            paint();
          } else if (event.type === 'usage') {
            assistant.usage = event.usage;
          } else if (event.type === 'error') {
            throw new Error(event.error);
          }
        }
      }
      bubble.textContent = buffer;
      assistant.content = buffer;
    }

    if (!buffer.trim()) {
      throw new Error('Модель вернула пустой ответ.');
    }

    // Добавляем панель действий к готовому сообщению
    const fresh = buildMessage(assistant, state.messages.length - 1);
    el.replaceWith(fresh);
    scrollToBottom();

    if (state.settings.autoSpeak) speak(buffer);
    if (state.settings.autoListen && !state.listening) setTimeout(() => startListening(), 700);
  } catch (err) {
    const aborted = err.name === 'AbortError';
    const message = aborted ? (buffer || 'Остановлено.') : err.message;
    bubble.textContent = message;
    assistant.content = message;
    if (!aborted) {
      assistant.error = true;
      el.classList.add('error');
      toast(message, 'err', 6000);
    }
  } finally {
    state.sending = false;
    state.controller = null;
    updateSendButton();
  }
}

async function regenerate(index) {
  if (state.sending) return;
  // Отрезаем всё после предыдущего вопроса и генерируем заново
  let cut = index;
  while (cut > 0 && state.messages[cut]?.role !== 'user') cut -= 1;
  state.messages = state.messages.slice(0, cut);
  renderMessages();
  await streamReply();
}

function stopStreaming() {
  state.controller?.abort();
}

function updateSendButton() {
  const btn = $('#sendBtn');
  btn.classList.toggle('stop', state.sending);
  btn.title = state.sending ? 'Остановить' : 'Отправить';
  btn.innerHTML = state.sending
    ? '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 12h13M13 6l6 6-6 6"/></svg>';
}

/* ---------------------------------- голос --------------------------------- */

const synth = window.speechSynthesis;
let voices = [];

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices();
  const select = $('#voiceName');
  const current = state.settings?.voiceName || select.value || '';
  const auto = isConfigured(state.settings) && state.settings.language !== 'auto' ? state.settings.language.split('-')[0] : 'ru';
  const sorted = [...voices].sort((a, b) => {
    const score = (v) => (v.lang.startsWith(auto) ? 0 : 1) + (v.localService ? 0 : 0.5);
    return score(a) - score(b) || a.name.localeCompare(b.name);
  });
  select.innerHTML = '<option value="">Автоматически</option>';
  for (const v of sorted) {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = `${v.name} — ${v.lang}${v.localService ? '' : ' (сеть)'}`;
    select.append(opt);
  }
  select.value = current;
}

function speak(text, triggerButton) {
  if (!text) return;
  const s = state.settings || {};

  // Серверная озвучка, если включена
  if (speak.mode === 'server') {
    serverSpeak(text);
    return;
  }

  if (!synth) {
    toast('Браузер не поддерживает озвучку. Включите «Озвучка через API».', 'err');
    return;
  }
  synth.cancel();
  const clean = text
    .replace(/```[\s\S]*?```/g, ' (код пропущен) ')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
  const utter = new SpeechSynthesisUtterance(clean);
  const voice = voices.find((v) => v.name === s.voiceName) || null;
  if (voice) utter.voice = voice;
  utter.rate = Number(s.voiceRate) || 1;
  utter.pitch = Number(s.voicePitch) || 1;
  utter.volume = Number(s.voiceVolume) ?? 1;
  if (s.language && s.language !== 'auto') utter.lang = s.language === 'ru' ? 'ru-RU' : s.language;

  utter.onstart = () => {
    state.speaking = true;
    triggerButton?.classList.add('active');
  };
  const reset = () => {
    state.speaking = false;
    triggerButton?.classList.remove('active');
  };
  utter.onend = reset;
  utter.onerror = reset;
  synth.speak(utter);
}

async function serverSpeak(text) {
  try {
    toast('Синтезируем речь через API…', '', 1600);
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 3900) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Провайдер не поддерживает озвучку.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    state.audio?.pause();
    state.audio = new Audio(url);
    state.audio.volume = Number(state.settings.voiceVolume) ?? 1;
    state.audio.playbackRate = Math.min(2, Math.max(0.5, Number(state.settings.voiceRate) || 1));
    await state.audio.play();
    state.audio.onended = () => URL.revokeObjectURL(url);
  } catch (err) {
    toast(`${err.message} Использую голос браузера.`, 'err', 5500);
    speak.mode = 'browser';
    speak(text);
  }
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function startListening() {
  if (!SpeechRecognition) {
    toast('Распознавание речи не поддерживается этим браузером. Попробуйте Chrome или Edge.', 'err', 6000);
    return;
  }
  if (state.listening) return;
  if (state.sending) {
    toast('Дождитесь окончания ответа.', '');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = state.settings?.language === 'auto' || !state.settings?.language ? 'ru-RU' : state.settings.language === 'ru' ? 'ru-RU' : state.settings.language;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalText = '';

  recognition.onstart = () => {
    state.listening = true;
    $('#micBtn').classList.add('recording');
    $('#recordingBanner').hidden = false;
    $('#recLabel').textContent = 'Слушаю…';
    synth?.cancel();
  };

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    $('#input').value = (finalText + interim).trim();
    autoGrow();
    updateCharCount();
    $('#recLabel').textContent = interim ? 'Распознаю…' : 'Слушаю…';
  };

  recognition.onerror = (event) => {
    const map = {
      'not-allowed': 'Доступ к микрофону запрещён. Разрешите его в настройках браузера.',
      'service-not-allowed': 'Браузерный сервис распознавания недоступен.',
      'no-speech': 'Речь не распознана — попробуйте ещё раз.',
      network: 'Нет связи с сервисом распознавания речи.',
      'audio-capture': 'Микрофон не найден.',
    };
    if (event.error !== 'aborted') toast(map[event.error] || `Ошибка микрофона: ${event.error}`, 'err', 5000);
  };

  recognition.onend = () => {
    state.listening = false;
    state.recognition = null;
    $('#micBtn').classList.remove('recording');
    $('#recordingBanner').hidden = true;
    const value = $('#input').value.trim();
    if (value) send(value);
  };

  state.recognition = recognition;
  try {
    recognition.start();
  } catch {
    toast('Не удалось запустить микрофон.', 'err');
  }
}

function stopListening() {
  state.recognition?.stop();
}

/* --------------------------------- drawer --------------------------------- */

function openDrawer() {
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#backdrop').hidden = false;
  fillSettingsForm();
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#backdrop').hidden = true;
}

/* ------------------------------ настройки: UI ----------------------------- */

function fillProviderSelect() {
  const select = $('#provider');
  select.innerHTML = '';
  for (const [id, p] of Object.entries(state.config.providers)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = p.name;
    select.append(opt);
  }
}

function fillSettingsForm() {
  const s = state.settings;
  if (!s) return;
  $('#provider').value = s.provider;
  $('#apiKey').value = '';
  $('#apiKey').placeholder = s.hasKey ? `Сохранён: ${s.apiKeyMasked} (оставьте пустым, чтобы не менять)` : 'sk-…';
  $('#baseUrl').value = s.baseUrl || '';
  $('#baseUrl').placeholder = state.config.providers[s.provider]?.baseUrl || 'https://…/v1';
  $('#model').value = s.model || '';
  $('#temperature').value = s.temperature;
  $('#tempVal').textContent = Number(s.temperature).toFixed(1);
  $('#topP').value = s.topP;
  $('#topPVal').textContent = Number(s.topP).toFixed(2);
  $('#maxTokens').value = s.maxTokens;
  $('#stream').checked = s.stream;
  $('#memory').checked = s.memory;
  $('#historyLimit').value = s.historyLimit;
  $('#historyVal').textContent = s.historyLimit;
  $('#systemPrompt').value = s.systemPrompt;
  $('#language').value = s.language;
  $('#autoSpeak').checked = s.autoSpeak;
  $('#autoListen').checked = s.autoListen;
  $('#voiceName').value = s.voiceName || '';
  $('#voiceRate').value = s.voiceRate;
  $('#voiceRateVal').textContent = `${Number(s.voiceRate).toFixed(2)}×`;
  $('#voicePitch').value = s.voicePitch;
  $('#voicePitchVal').textContent = Number(s.voicePitch).toFixed(2);
  $('#voiceVolume').value = s.voiceVolume;
  $('#voiceVolumeVal').textContent = `${Math.round(s.voiceVolume * 100)}%`;
  $('#keyHelp').textContent = s.hasKey
    ? `Ключ сохранён на сервере (${s.apiKeyMasked}). Введите новый, чтобы заменить.`
    : 'Ключ сохраняется на сервере, в браузер не возвращается.';
  updateProviderHelp();
  fillModelDatalist();
  syncQuickControls();
}

function updateProviderHelp() {
  const id = $('#provider').value;
  const provider = state.config.providers[id];
  const docs = $('#providerDocs');
  if (!provider) return;
  if (provider.docs) {
    docs.innerHTML = `Ключ можно получить здесь: <a href="${provider.docs}" target="_blank" rel="noopener">${provider.docs.replace(/^https?:\/\//, '')}</a>`;
  } else {
    docs.textContent = 'Укажите свой Base URL и модель.';
  }
  $('#baseUrl').placeholder = provider.baseUrl || 'https://…/v1';
  if (provider.requiresKey === false) {
    $('#keyHelp').textContent = 'Этому провайдеру ключ не нужен.';
  }
}

function fillModelDatalist(models) {
  const list = $('#modelList');
  const provider = state.config.providers[$('#provider').value];
  const items = models?.length ? models : provider?.models || [];
  list.innerHTML = '';
  for (const m of items) {
    const opt = document.createElement('option');
    opt.value = m;
    list.append(opt);
  }
}

function syncQuickControls() {
  $('#quickSpeak').checked = Boolean(state.settings.autoSpeak);
  $('#quickListen').checked = Boolean(state.settings.autoListen);
  $('#quickRate').value = state.settings.voiceRate;
  $('#rateVal').textContent = `${Number(state.settings.voiceRate).toFixed(1)}×`;
}

function collectForm() {
  const patch = {
    provider: $('#provider').value,
    baseUrl: $('#baseUrl').value.trim(),
    model: $('#model').value.trim(),
    temperature: Number($('#temperature').value),
    topP: Number($('#topP').value),
    maxTokens: Number($('#maxTokens').value),
    stream: $('#stream').checked,
    memory: $('#memory').checked,
    historyLimit: Number($('#historyLimit').value),
    systemPrompt: $('#systemPrompt').value,
    language: $('#language').value,
    autoSpeak: $('#autoSpeak').checked,
    autoListen: $('#autoListen').checked,
    voiceName: $('#voiceName').value,
    voiceRate: Number($('#voiceRate').value),
    voicePitch: Number($('#voicePitch').value),
    voiceVolume: Number($('#voiceVolume').value),
  };
  const key = $('#apiKey').value.trim();
  if (key) patch.apiKey = key;
  return patch;
}

async function saveSettings({ silent = false } = {}) {
  try {
    const data = await api('/api/settings', { method: 'PUT', body: JSON.stringify(collectForm()) });
    state.settings = data.settings;
    renderStatus();
    fillSettingsForm();
    if (!silent) toast('Настройки сохранены', 'ok', 2200);
    return true;
  } catch (err) {
    toast(`Не удалось сохранить: ${err.message}`, 'err');
    return false;
  }
}

async function testConnection() {
  const result = $('#testResult');
  result.hidden = false;
  result.className = 'test-result';
  result.textContent = 'Проверяем подключение…';
  const saved = await saveSettings({ silent: true });
  if (!saved) {
    result.className = 'test-result err';
    result.textContent = 'Сначала исправьте настройки.';
    return;
  }
  try {
    const data = await api('/api/test', { method: 'POST' });
    if (data.ok) {
      result.className = 'test-result ok';
      result.innerHTML = `✓ Подключение работает<br>Модель: <b>${escapeHtml(data.model)}</b> · ответ за ${data.latencyMs} мс<br>Endpoint: ${escapeHtml(data.endpoint)}`;
      toast('API отвечает — можно общаться!', 'ok');
      renderStatus();
    } else {
      result.className = 'test-result err';
      result.innerHTML = `✗ ${escapeHtml(data.error || 'Ошибка подключения')}<br><span class="help">Endpoint: ${escapeHtml(data.endpoint || '—')} · ключ: ${escapeHtml(data.keyMasked || '—')}</span>`;
    }
  } catch (err) {
    result.className = 'test-result err';
    result.textContent = `✗ ${err.message}`;
  }
}

async function loadModels() {
  const btn = $('#loadModelsBtn');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    await saveSettings({ silent: true });
    const data = await api('/api/models');
    fillModelDatalist(data.models);
    if (data.ok) {
      const first = data.models.find((m) => m === $('#model').value) || data.models[0];
      if (!$('#model').value && first) $('#model').value = first;
      toast(`Доступно моделей: ${data.models.length}`, 'ok');
    } else {
      toast(`Список моделей недоступен (${data.error || 'ошибка'}). Показаны стандартные.`, 'err', 6000);
    }
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Загрузить';
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* -------------------------------- textarea -------------------------------- */

function autoGrow() {
  const el = $('#input');
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
}

function updateCharCount() {
  const len = $('#input').value.length;
  $('#charCount').textContent = len ? `${len} симв.` : '';
}

/* -------------------------------- экспорт --------------------------------- */

function exportChat() {
  if (!state.messages.length) {
    toast('Диалог пока пуст.', '');
    return;
  }
  const lines = state.messages.map((m) => `${m.role === 'user' ? 'Вы' : 'VOX AI'} (${m.time || ''}):\n${m.content}\n`);
  const header = `VOX AI · диалог от ${new Date().toLocaleString('ru-RU')}\nМодель: ${state.settings.model} · провайдер: ${state.settings.provider}\n${'='.repeat(48)}\n\n`;
  const blob = new Blob([header + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vox-ai-dialog-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Диалог сохранён в файл', 'ok', 2200);
}

/* --------------------------------- тема ----------------------------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('vox.theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#f4f6fc' : '#06070d';
}

/* ------------------------------ инициализация ----------------------------- */

function bindEvents() {
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.sending) stopStreaming();
    else send();
  });

  $('#input').addEventListener('input', () => {
    autoGrow();
    updateCharCount();
  });

  $('#input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // Пробел как push-to-talk, когда поле пустое
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !state.listening && document.activeElement !== $('#input') && !$('#drawer').classList.contains('open') && e.target === document.body) {
      e.preventDefault();
      startListening();
    }
    if (e.key === 'Escape') {
      if ($('#drawer').classList.contains('open')) closeDrawer();
      else if (state.listening) stopListening();
      else if (state.sending) stopStreaming();
    }
  });

  $('#micBtn').addEventListener('click', () => (state.listening ? stopListening() : startListening()));
  $('#recCancel').addEventListener('click', () => {
    if (state.recognition) {
      state.recognition.onend = null;
      state.recognition.abort();
      state.recognition = null;
    }
    state.listening = false;
    $('#micBtn').classList.remove('recording');
    $('#recordingBanner').hidden = true;
    $('#input').value = '';
    autoGrow();
    updateCharCount();
  });

  $('#chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) send(chip.dataset.prompt);
  });

  $('#newChatBtn').addEventListener('click', () => {
    if (state.sending) stopStreaming();
    state.messages = [];
    renderMessages();
    $('#sidebar').classList.remove('open');
    toast('Новый диалог', 'ok', 1600);
  });

  $('#openSettingsBtn').addEventListener('click', openDrawer);
  $('#closeDrawer').addEventListener('click', closeDrawer);
  $('#backdrop').addEventListener('click', closeDrawer);
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  $('#saveBtn').addEventListener('click', async () => {
    const ok = await saveSettings();
    if (ok) closeDrawer();
  });

  $('#testBtn').addEventListener('click', testConnection);
  $('#loadModelsBtn').addEventListener('click', loadModels);

  $('#deleteKeyBtn').addEventListener('click', async () => {
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ apiKey: null }) });
      state.settings = (await api('/api/settings'));
      fillSettingsForm();
      renderStatus();
      toast('Ключ удалён с сервера', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('#resetBtn').addEventListener('click', async () => {
    try {
      const data = await api('/api/settings/reset', { method: 'POST' });
      state.settings = data.settings;
      fillSettingsForm();
      renderStatus();
      toast('Настройки сброшены', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('#toggleKey').addEventListener('click', () => {
    const input = $('#apiKey');
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    $('#toggleKey').textContent = hidden ? 'Скрыть' : 'Показать';
  });

  $('#provider').addEventListener('change', () => {
    const provider = state.config.providers[$('#provider').value];
    fillModelDatalist();
    updateProviderHelp();
    if (provider?.models?.length && !provider.models.includes($('#model').value)) {
      $('#model').value = provider.models[0];
    }
    if (!state.settings.baseUrl) $('#baseUrl').value = '';
  });

  // Пресеты промпта
  $$('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('#systemPrompt').value = PRESETS[btn.dataset.preset] || '';
      toast('Промпт заменён — не забудьте сохранить', '', 2600);
    });
  });

  // Живые значения слайдеров
  const bind = (id, labelId, format) => {
    $(`#${id}`).addEventListener('input', () => {
      $(`#${labelId}`).textContent = format($(`#${id}`).value);
    });
  };
  bind('temperature', 'tempVal', (v) => Number(v).toFixed(1));
  bind('topP', 'topPVal', (v) => Number(v).toFixed(2));
  bind('historyLimit', 'historyVal', (v) => v);
  bind('voiceRate', 'voiceRateVal', (v) => `${Number(v).toFixed(2)}×`);
  bind('voicePitch', 'voicePitchVal', (v) => Number(v).toFixed(2));
  bind('voiceVolume', 'voiceVolumeVal', (v) => `${Math.round(v * 100)}%`);

  // Быстрые переключатели в сайдбаре
  $('#quickSpeak').addEventListener('change', async (e) => {
    state.settings.autoSpeak = e.target.checked;
    $('#autoSpeak').checked = e.target.checked;
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ autoSpeak: e.target.checked }) });
  });
  $('#quickListen').addEventListener('change', async (e) => {
    state.settings.autoListen = e.target.checked;
    $('#autoListen').checked = e.target.checked;
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ autoListen: e.target.checked }) });
  });
  $('#quickRate').addEventListener('input', (e) => {
    $('#rateVal').textContent = `${Number(e.target.value).toFixed(1)}×`;
    $('#voiceRate').value = e.target.value;
    $('#voiceRateVal').textContent = `${Number(e.target.value).toFixed(2)}×`;
    state.settings.voiceRate = Number(e.target.value);
  });
  $('#quickRate').addEventListener('change', async (e) => {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ voiceRate: Number(e.target.value) }) });
  });

  $('#testVoiceBtn').addEventListener('click', () => {
    speak('Привет! Я VOX AI. Так будет звучать мой голос.');
  });

  $('#serverTtsBtn').addEventListener('click', async () => {
    speak.mode = speak.mode === 'server' ? 'browser' : 'server';
    const mode = speak.mode === 'server' ? 'через API' : 'браузерный';
    $('#serverTtsBtn').textContent = speak.mode === 'server' ? 'Вернуть голос браузера' : 'Озвучка через API';
    toast(`Режим озвучки: ${mode}`, '', 2600);
    if (speak.mode === 'server') serverSpeak('Привет! Я VOX AI, озвучка через API работает.');
  });

  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    state.settings.theme = next;
    api('/api/settings', { method: 'PUT', body: JSON.stringify({ theme: next }) }).catch(() => {});
  });

  $('#exportBtn').addEventListener('click', exportChat);

  document.addEventListener('click', (e) => {
    const sidebar = $('#sidebar');
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !e.target.closest('#menuBtn')) {
      sidebar.classList.remove('open');
    }
  });

  if (synth) {
    synth.onvoiceschanged = loadVoices;
    loadVoices();
  }
}

async function init() {
  applyTheme(localStorage.getItem('vox.theme') || 'dark');
  bindEvents();

  try {
    state.config = await api('/api/config');
    state.settings = state.config.settings;
  } catch (err) {
    toast(`Сервер недоступен: ${err.message}`, 'err', 8000);
    return;
  }

  applyTheme(state.settings.theme || 'dark');
  fillProviderSelect();
  fillSettingsForm();
  renderStatus();
  renderMessages();
  updateSendButton();

  if (!isConfigured(state.settings)) {
    setTimeout(() => {
      toast('Добро пожаловать в VOX AI! Вставьте API-ключ, чтобы начать.', '', 6000);
      openDrawer();
    }, 700);
  }

  if (!SpeechRecognition) {
    $('#engineHint').textContent = 'Голосовой ввод: только Chrome/Edge · Enter — отправить';
  }
}

init();
