/**
 * VOX AI — хранилище настроек.
 *
 * Настройки (включая API-ключ) лежат в data/settings.json — этот каталог в .gitignore,
 * поэтому ключ не попадает в репозиторий. Ключ НИКОГДА не отдаётся браузеру целиком:
 * наружу уходит только маска вида "sk-…7f3a".
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SETTINGS, PROVIDER_IDS } from './providers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const NUMBER_RANGES = {
  temperature: [0, 2],
  maxTokens: [1, 32000],
  topP: [0, 1],
  voiceRate: [0.5, 2],
  voicePitch: [0, 2],
  voiceVolume: [0, 1],
  historyLimit: [0, 100],
};

let cache = { ...DEFAULT_SETTINGS };

export function maskKey(key) {
  if (!key) return '';
  const clean = String(key);
  if (clean.length <= 8) return '•'.repeat(clean.length);
  return `${clean.slice(0, 4)}…${clean.slice(-4)}`;
}

export async function loadSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = sanitizeSettings(parsed);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[vox] не удалось прочитать settings.json:', err.message);
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export async function saveSettings(patch) {
  const merged = sanitizeSettings({ ...cache, ...patch });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
  cache = merged;
  return merged;
}

/** Приводит настройки к безопасному виду (типы, диапазоны, разрешённые поля). */
export function sanitizeSettings(input = {}) {
  const out = { ...DEFAULT_SETTINGS, ...input };

  if (!PROVIDER_IDS.includes(out.provider)) out.provider = DEFAULT_SETTINGS.provider;
  out.apiKey = typeof out.apiKey === 'string' ? out.apiKey.trim() : '';
  out.baseUrl = typeof out.baseUrl === 'string' ? out.baseUrl.trim() : '';
  out.model = typeof out.model === 'string' ? out.model.trim() : '';
  out.systemPrompt =
    typeof out.systemPrompt === 'string' ? out.systemPrompt.slice(0, 8000) : DEFAULT_SETTINGS.systemPrompt;
  out.language = typeof out.language === 'string' ? out.language.slice(0, 12) : DEFAULT_SETTINGS.language;
  out.voiceName = typeof out.voiceName === 'string' ? out.voiceName.slice(0, 120) : '';
  out.theme = out.theme === 'light' ? 'light' : 'dark';

  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    const value = Number(out[key]);
    out[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, key === 'maxTokens' || key === 'historyLimit' ? Math.round(value) : value)) : DEFAULT_SETTINGS[key];
  }

  for (const key of ['autoSpeak', 'autoListen', 'memory', 'stream']) {
    out[key] = Boolean(out[key]);
  }

  return out;
}

/** Публичное представление настроек для браузера (без настоящего ключа). */
export function publicSettings(settings) {
  return {
    ...settings,
    apiKey: '',
    hasKey: Boolean(settings.apiKey),
    apiKeyMasked: maskKey(settings.apiKey),
  };
}
