/**
 * VOX AI — каталог провайдеров.
 *
 * Все провайдеры в списке работают через OpenAI-совместимый Chat Completions API,
 * поэтому один и тот же код общается с ними, меняя только baseUrl + apiKey + model.
 */

export const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyPrefixes: ['sk-'],
    docs: 'https://platform.openai.com/api-keys',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    requiresKey: true,
  },
  openrouter: {
    name: 'OpenRouter (100+ моделей)',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPrefixes: ['sk-or-'],
    docs: 'https://openrouter.ai/keys',
    models: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat',
    ],
    requiresKey: true,
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyPrefixes: ['sk-'],
    docs: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
  },
  groq: {
    name: 'Groq (быстро)',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPrefixes: ['gsk_'],
    docs: 'https://console.groq.com/keys',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    requiresKey: true,
  },
  mistral: {
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    keyPrefixes: [],
    docs: 'https://console.mistral.ai/api-keys/',
    models: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo'],
    requiresKey: true,
  },
  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    keyPrefixes: [],
    docs: 'https://api.together.ai/settings/api-keys',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    requiresKey: true,
  },
  xai: {
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    keyPrefixes: ['xai-'],
    docs: 'https://console.x.ai/',
    models: ['grok-2-latest', 'grok-beta'],
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama (локально, без ключа)',
    baseUrl: 'http://localhost:11434/v1',
    keyPrefixes: [],
    docs: 'https://ollama.com',
    models: ['llama3.2', 'qwen2.5', 'mistral', 'gemma2'],
    requiresKey: false,
  },
  custom: {
    name: 'Свой сервер (OpenAI-совместимый)',
    baseUrl: '',
    keyPrefixes: [],
    docs: '',
    models: [],
    requiresKey: false,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export const DEFAULT_SETTINGS = {
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 1200,
  topP: 0.95,
  systemPrompt:
    'Ты VOX AI — дружелюбный и точный голосовой ассистент. Отвечай на языке пользователя, ' +
    'кратко и по делу, без лишних вступлений. Если ответ читают вслух — избегай таблиц, ' +
    'длинных списков и разметки.',
  language: 'ru',
  // Голос
  autoSpeak: true, // озвучивать ответы автоматически
  voiceRate: 1,
  voicePitch: 1,
  voiceVolume: 1,
  voiceName: '', // предпочитаемый голос браузера
  autoListen: false, // после ответа снова включать микрофон
  // Прочее
  memory: true, // держать историю диалога
  historyLimit: 20,
  stream: true,
  theme: 'dark',
};

/** Собирает рабочий URL эндпоинта из настроек. */
export function resolveBaseUrl(settings) {
  const provider = PROVIDERS[settings.provider] || PROVIDERS.custom;
  const raw = (settings.baseUrl || provider.baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  // Пользователь мог вставить полный путь до /chat/completions — обрежем его.
  return raw.replace(/\/chat\/completions$/i, '');
}

/** Человекочитаемое описание ошибки провайдера. */
export function describeHttpError(status, bodyText) {
  let detail = '';
  try {
    const parsed = JSON.parse(bodyText);
    detail = parsed?.error?.message || parsed?.message || parsed?.detail || '';
  } catch {
    detail = (bodyText || '').slice(0, 400);
  }
  const hints = {
    401: 'Неверный или просроченный API-ключ. Проверьте его в настройках.',
    403: 'Ключ принят, но доступ к модели запрещён (нет квоты или тарифа).',
    404: 'Модель или адрес сервера не найдены. Проверьте модель и Base URL.',
    422: 'Провайдер отклонил параметры запроса.',
    429: 'Лимит запросов исчерпан — подождите немного или смените тариф.',
    500: 'Внутренняя ошибка провайдера. Повторите попытку.',
    503: 'Провайдер перегружен. Повторите попытку позже.',
  };
  const base = hints[status] || `Провайдер ответил ошибкой ${status}.`;
  return detail ? `${base} Детали: ${detail}` : base;
}
