/**
 * ProxyTG — состояние и localStorage. Чистый модуль: хранилище инжектится.
 */
import { CF_IPV4, DEFAULT_LIST_SOURCES, DEFAULT_SNI, isValidPort, isValidSecret } from './core.js';

export const STORAGE_KEY = 'proxytg.state.v1';
export const STATE_VERSION = 1;
export const LOG_LIMIT = 200;
export const PROXY_LIMIT = 300;

let uidCounter = 0;
export function uid(prefix = 'id') {
  uidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}`;
}

export function createDefaultState() {
  return {
    version: STATE_VERSION,
    settings: {
      theme: 'dark',
      defaultPort: 443,
      autoRandomSni: true,
      listSources: [...DEFAULT_LIST_SOURCES],
    },
    sniList: [...DEFAULT_SNI],
    cfList: [...CF_IPV4],
    proxies: [],
    logs: [],
    savedAt: null,
  };
}

export function migrateState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    sniList: Array.isArray(raw.sniList) && raw.sniList.length ? raw.sniList.map(String) : base.sniList,
    cfList: Array.isArray(raw.cfList) && raw.cfList.length ? raw.cfList.map(String) : base.cfList,
    proxies: Array.isArray(raw.proxies) ? raw.proxies.filter(isProxyValid) : [],
    logs: Array.isArray(raw.logs) ? raw.logs.slice(0, LOG_LIMIT) : [],
  };
}

export function isProxyValid(p) {
  return Boolean(p) && typeof p.server === 'string' && p.server
    && isValidPort(p.port)
    && typeof p.secret === 'string' && isValidSecret(p.secret);
}

export function loadState(storage, key = STORAGE_KEY) {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return createDefaultState();
    return migrateState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

export function saveState(storage, state, key = STORAGE_KEY) {
  const next = { ...state, savedAt: Date.now() };
  try {
    storage.setItem(key, JSON.stringify(next));
    return { ok: true, state: next };
  } catch (error) {
    return { ok: false, error, state: next };
  }
}

export function proxyKey(p) {
  return `${p.server}:${p.port}:${p.secret}`;
}

/** Добавляет прокси без дублей; возвращает { state, proxy, created }. */
export function addProxy(state, { server, port, secret }, source = 'manual') {
  const candidate = {
    id: uid('p'),
    server: String(server).trim().replace(/\.$/, ''),
    port: Number(port),
    secret: String(secret).trim(),
    source,
    addedAt: Date.now(),
    lastUsedAt: null,
  };
  if (!isProxyValid(candidate)) return { state, proxy: null, created: false };
  const key = proxyKey(candidate);
  const existing = state.proxies.find((p) => proxyKey(p) === key);
  if (existing) return { state, proxy: existing, created: false };
  const proxies = [candidate, ...state.proxies].slice(0, PROXY_LIMIT);
  return { state: { ...state, proxies }, proxy: candidate, created: true };
}

/** Массовое добавление (публичные списки); возвращает счётчики. */
export function addProxies(state, items, source = 'public') {
  let added = 0;
  let current = state;
  for (const item of items) {
    const res = addProxy(current, item, source);
    if (res.created) {
      added += 1;
      current = res.state;
    }
  }
  return { state: current, added };
}

export function removeProxy(state, id) {
  return { ...state, proxies: state.proxies.filter((p) => p.id !== id) };
}

export function touchProxy(state, id) {
  return {
    ...state,
    proxies: state.proxies.map((p) => (p.id === id ? { ...p, lastUsedAt: Date.now() } : p)),
  };
}

export function addLog(state, kind, text) {
  const entry = { id: uid('l'), ts: Date.now(), kind, text };
  return { ...state, logs: [entry, ...state.logs].slice(0, LOG_LIMIT) };
}

export function clearLogs(state) {
  return { ...state, logs: [] };
}

export function setSettings(state, patch) {
  return { ...state, settings: { ...state.settings, ...patch } };
}

export function setLists(state, { sniList, cfList } = {}) {
  return {
    ...state,
    sniList: sniList ?? state.sniList,
    cfList: cfList ?? state.cfList,
  };
}
