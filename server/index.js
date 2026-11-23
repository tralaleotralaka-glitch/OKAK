/**
 * VOX AI — HTTP-сервер.
 *
 * Бэкенд держит API-ключ у себя и проксирует запросы к провайдеру,
 * поэтому ключ не утекает в браузер.
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_SETTINGS,
  describeHttpError,
  resolveBaseUrl,
} from './providers.js';
import { loadSettings, saveSettings, publicSettings, sanitizeSettings, maskKey } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/* --------------------------------- helpers -------------------------------- */

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Слишком большой файл (максимум 12 МБ).'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Некорректный JSON в запросе.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Слишком большой файл (максимум 12 МБ).'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function authHeaders(settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  if (settings.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://vox-ai.local';
    headers['X-Title'] = 'VOX AI';
  }
  return headers;
}

function requireConfigured(settings) {
  const base = resolveBaseUrl(settings);
  if (!base) throw Object.assign(new Error('Не задан адрес API. Откройте «Настройки» и укажите Base URL.'), { status: 400 });
  if (!settings.model) throw Object.assign(new Error('Не выбрана модель. Откройте «Настройки» и укажите модель.'), { status: 400 });
  if (PROVIDERS[settings.provider]?.requiresKey && !settings.apiKey) {
    throw Object.assign(new Error('Не задан API-ключ. Откройте «Настройки» и вставьте ключ.'), { status: 400 });
  }
  return base;
}

async function callProvider(settings, pathname, init) {
  const base = requireConfigured(settings);
  const url = `${base}${pathname}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Провайдер не ответил за 2 минуты. Проверьте сеть и Base URL.'), { status: 504 });
    }
    throw Object.assign(
      new Error(
        `Не удалось подключиться к ${url}. Проверьте Base URL, интернет и доступность провайдера.`
      ),
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------------- API ---------------------------------- */

async function handleApi(req, res, url) {
  const settings = await loadSettings();
  const route = url.pathname;

  // GET /api/config — публичная конфигурация
  if (route === '/api/config' && req.method === 'GET') {
    return json(res, 200, {
      app: 'VOX AI',
      version: '1.0.0',
      settings: publicSettings(settings),
      defaults: { ...DEFAULT_SETTINGS, apiKey: '' },
      providers: Object.fromEntries(
        PROVIDER_IDS.map((id) => {
          const p = PROVIDERS[id];
          return [id, { name: p.name, baseUrl: p.baseUrl, models: p.models, docs: p.docs, requiresKey: p.requiresKey }];
        })
      ),
      // Серверная озвучка доступна, если провайдер умеет /audio/speech (OpenAI и совместимые)
      serverTtsAvailable: Boolean(resolveBaseUrl(settings)),
    });
  }

  // GET /api/settings — настройки с маской ключа
  if (route === '/api/settings' && req.method === 'GET') {
    return json(res, 200, publicSettings(settings));
  }

  // PUT /api/settings — сохранить настройки
  if (route === '/api/settings' && (req.method === 'PUT' || req.method === 'POST')) {
    const body = await readBody(req);
    const patch = { ...body };
    // Пустая строка в apiKey означает «не менять сохранённый ключ»,
    // явная null — «удалить ключ».
    if (patch.apiKey === '' || patch.apiKey === undefined) delete patch.apiKey;
    if (patch.apiKey === null) patch.apiKey = '';
    const saved = await saveSettings(patch);
    return json(res, 200, { ok: true, settings: publicSettings(saved) });
  }

  // POST /api/settings/reset — сброс
  if (route === '/api/settings/reset' && req.method === 'POST') {
    const saved = await saveSettings({ ...DEFAULT_SETTINGS });
    return json(res, 200, { ok: true, settings: publicSettings(saved) });
  }

  // POST /api/settings/rotate-key — проверка связи с провайдером
  if (route === '/api/test' && req.method === 'POST') {
    const started = Date.now();
    const base = requireConfigured(settings);
    const response = await callProvider(settings, '/chat/completions', {
      method: 'POST',
      headers: authHeaders(settings),
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        stream: false,
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      return json(res, 200, {
        ok: false,
        status: response.status,
        error: describeHttpError(response.status, text),
        latencyMs: Date.now() - started,
        endpoint: `${base}/chat/completions`,
        keyMasked: maskKey(settings.apiKey),
      });
    }
    let content = '';
    try {
      content = JSON.parse(text)?.choices?.[0]?.message?.content ?? '';
    } catch {
      /* ignore */
    }
    return json(res, 200, {
      ok: true,
      status: response.status,
      latencyMs: Date.now() - started,
      endpoint: `${base}/chat/completions`,
      model: settings.model,
      keyMasked: maskKey(settings.apiKey),
      sample: String(content).slice(0, 120),
    });
  }

  // GET /api/models — список моделей у провайдера
  if (route === '/api/models' && req.method === 'GET') {
    const provider = PROVIDERS[settings.provider] || PROVIDERS.custom;
    try {
      const response = await callProvider(settings, '/models', {
        method: 'GET',
        headers: authHeaders(settings),
      });
      if (!response.ok) {
        const text = await response.text();
        return json(res, 200, {
          ok: false,
          models: provider.models,
          error: describeHttpError(response.status, text),
        });
      }
      const data = await response.json();
      const models = (data?.data || data?.models || [])
        .map((m) => (typeof m === 'string' ? m : m.id || m.name))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return json(res, 200, { ok: true, models: models.length ? models : provider.models });
    } catch (err) {
      return json(res, 200, { ok: false, models: provider.models, error: err.message });
    }
  }

  // POST /api/chat — основной чат (streaming SSE или обычный JSON)
  if (route === '/api/chat' && req.method === 'POST') {
    const body = await readBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return json(res, 400, { error: 'Пустой запрос: нет сообщений.' });

    // Подрезаем историю, если память ограничена
    const limit = settings.memory ? Math.max(0, settings.historyLimit) : 0;
    const cleaned = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-limit || undefined)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 20000) }));

    const payloadMessages = [];
    if (settings.systemPrompt) payloadMessages.push({ role: 'system', content: settings.systemPrompt });
    payloadMessages.push(...cleaned);

    const wantsStream = settings.stream && body.stream !== false;
    const response = await callProvider(settings, '/chat/completions', {
      method: 'POST',
      headers: authHeaders(settings),
      body: JSON.stringify({
        model: body.model || settings.model,
        messages: payloadMessages,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens,
        stream: wantsStream,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return json(res, response.status, { error: describeHttpError(response.status, text) });
    }

    if (!wantsStream) {
      const data = await response.json();
      const message = data?.choices?.[0]?.message?.content ?? '';
      return json(res, 200, {
        message,
        usage: data?.usage || null,
        model: data?.model || settings.model,
      });
    }

    // --- Потоковая передача ---
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              send({ type: 'delta', text: delta });
            }
            if (parsed?.usage) send({ type: 'usage', usage: parsed.usage });
          } catch {
            /* пропускаем неполные куски */
          }
        }
      }
      send({ type: 'done', message: full });
    } catch (err) {
      send({ type: 'error', error: `Поток прерван: ${err.message}` });
    }
    res.end();
    return;
  }

  // POST /api/tts — серверная озвучка (OpenAI-совместимый /audio/speech)
  if (route === '/api/tts' && req.method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text || '').slice(0, 4000);
    if (!text) return json(res, 400, { error: 'Пустой текст.' });
    const response = await callProvider(settings, '/audio/speech', {
      method: 'POST',
      headers: authHeaders(settings),
      body: JSON.stringify({
        model: process.env.VOX_TTS_MODEL || 'gpt-4o-mini-tts',
        voice: process.env.VOX_TTS_VOICE || 'alloy',
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      return json(res, response.status, { error: describeHttpError(response.status, err) });
    }
    const audio = Buffer.from(await response.arrayBuffer());
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    return res.end(audio);
  }

  // POST /api/stt — распознавание речи (OpenAI-совместимый /audio/transcriptions)
  if (route === '/api/stt' && req.method === 'POST') {
    const url2 = new URL(req.url, 'http://local');
    const model = url2.searchParams.get('model') || 'whisper-1';
    const audio = await readRaw(req);
    if (!audio.length) return json(res, 400, { error: 'Пустое аудио.' });
    const base = requireConfigured(settings);
    const contentType = req.headers['content-type'] || 'audio/webm';

    const form = new FormData();
    form.append('file', new Blob([audio], { type: contentType }), 'speech.webm');
    form.append('model', model);
    if (settings.language && settings.language !== 'auto') form.append('language', settings.language.split('-')[0]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/audio/transcriptions`, {
        method: 'POST',
        headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
        body: form,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) return json(res, response.status, { error: describeHttpError(response.status, text) });
      let parsed = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        /* ignore */
      }
      return json(res, 200, { text: parsed.text || '' });
    } catch (err) {
      return json(res, 502, { error: `Распознавание недоступно: ${err.message}` });
    } finally {
      clearTimeout(timer);
    }
  }

  // GET /api/health
  if (route === '/api/health') {
    return json(res, 200, { ok: true, uptime: process.uptime() });
  }

  return json(res, 404, { error: 'Неизвестный маршрут API.' });
}

/* -------------------------------- static --------------------------------- */

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(data);
  } catch {
    // SPA-фолбэк
    try {
      const html = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(html);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
}

/* --------------------------------- server --------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    json(res, err.status || 500, { error: err.message || 'Внутренняя ошибка сервера.' });
  }
});

await loadSettings();

server.listen(PORT, HOST, () => {
  console.log(`\n  VOX AI запущен → http://localhost:${PORT}`);
  console.log(`  Провайдер по умолчанию: ${DEFAULT_SETTINGS.provider} · ключ хранится в data/settings.json\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

export { server };
