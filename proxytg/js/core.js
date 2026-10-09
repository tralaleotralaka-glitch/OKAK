/**
 * ProxyTG — ядро: секреты MTProto, ссылки, белые списки.
 * Чистый модуль без DOM, покрыт тестами в proxytg/tests/core.test.js
 *
 * Формат fake-TLS секрета (см. mtg / Telegram-iOS MTProxySecretType2):
 *   ee + 16 случайных байт + hex(домен-SNI)
 * Ссылки:
 *   https://t.me/proxy?server=…&port=…&secret=…
 *   tg://proxy?server=…&port=…&secret=…
 */

/** Официальные IPv4-диапазоны Cloudflare (cloudflare.com/ips-v4, снято 09.10.2026). */
export const CF_IPV4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];

/** Домены маскировки (SNI) по умолчанию — крупные, обычно не блокируемые. */
export const DEFAULT_SNI = [
  'www.google.com', 'www.youtube.com', 'itunes.apple.com', 'www.microsoft.com',
  'cloudflare-dns.com', 'www.wikipedia.org', 'storage.googleapis.com', 'ya.ru',
];

/** Источники публичных списков (raw.githubusercontent — CORS открыт). */
export const DEFAULT_LIST_SOURCES = [
  'https://raw.githubusercontent.com/Grim1313/mtproto-for-telegram/master/all_proxies.txt',
  'https://raw.githubusercontent.com/SoliSpirit/mtproto/master/all_proxies.txt',
];

export const APP_VERSION = '1.0.0';

/* ── hex / байты ── */

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const clean = String(hex).replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function textToHex(text) {
  return bytesToHex(new TextEncoder().encode(text));
}

export function hexToText(hex) {
  const bytes = hexToBytes(hex);
  if (!bytes) return null;
  return new TextDecoder().decode(bytes);
}

/** Криптостойкие случайные байты. */
export function randomBytes(length) {
  const buf = new Uint8Array(length);
  (globalThis.crypto || {}).getRandomValues?.(buf);
  return buf;
}

/* ── секреты ── */

/**
 * Собирает fake-TLS секрет: ee + 16 байт ключа + hex(SNI-домен).
 * rand16 можно передать для детерминированных тестов.
 */
export function makeFakeTlsSecret(sniDomain, rand16 = null) {
  const key = rand16 && rand16.length === 16 ? rand16 : randomBytes(16);
  return `ee${bytesToHex(key)}${textToHex(sniDomain)}`;
}

export function isHexString(value) {
  return /^([0-9a-fA-F]{2})+$/.test(String(value ?? ''));
}

export function isBase64Secret(value) {
  const s = String(value ?? '');
  return /^[A-Za-z0-9+/_=-]{16,}$/.test(s) && !isHexString(s);
}

/**
 * Разбор секрета:
 *  { kind: 'tls', key, domain }   — ee + 16 байт + домен (hex)
 *  { kind: 'tls-no-domain' }      — ee + 16 байт
 *  { kind: 'secure' }             — dd + 16 байт
 *  { kind: 'classic' }            — 16 байт без префикса
 *  { kind: 'base64' }             — base64-вариант, непрозрачный
 *  null                           — не похоже на секрет
 */
export function parseSecret(secret) {
  const s = String(secret ?? '').trim();
  if (!s) return null;
  if (isHexString(s)) {
    const lower = s.toLowerCase();
    if (lower.startsWith('ee')) {
      const rest = lower.slice(2);
      if (rest.length < 32) return null;
      const key = rest.slice(0, 32);
      const tail = rest.slice(32);
      if (!tail) return { kind: 'tls-no-domain', key, domain: null };
      const domain = hexToText(tail);
      if (!domain || !/^[a-z0-9.-]+$/i.test(domain)) return { kind: 'tls-no-domain', key, domain: null };
      return { kind: 'tls', key, domain };
    }
    if (lower.startsWith('dd') && rest16(lower.slice(2))) return { kind: 'secure', key: lower.slice(2), domain: null };
    if (lower.length === 32) return { kind: 'classic', key: lower, domain: null };
    return null;
  }
  if (isBase64Secret(s)) return { kind: 'base64', key: s, domain: null };
  return null;
}

function rest16(hexTail) {
  return hexTail.length === 32;
}

export function isValidSecret(secret) {
  return parseSecret(secret) !== null;
}

export function secretKindLabel(kind) {
  return {
    tls: 'Fake-TLS', 'tls-no-domain': 'Fake-TLS', secure: 'Secure (dd)',
    classic: 'Classic', base64: 'Base64',
  }[kind] || '—';
}

/* ── хост / порт ── */

export function isValidHost(host) {
  const h = String(host ?? '').trim().replace(/\.$/, '');
  if (!h || h.length > 253) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4.test(h)) return h.split('.').every((p) => Number(p) <= 255);
  return /^([a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(h);
}

export function isValidPort(port) {
  const p = Number(port);
  return Number.isInteger(p) && p >= 1 && p <= 65535;
}

/* ── ссылки ── */

function query(params) {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

export function buildTmeLink({ server, port, secret }) {
  return `https://t.me/proxy?${query({ server, port, secret })}`;
}

export function buildTgLink({ server, port, secret }) {
  return `tg://proxy?${query({ server, port, secret })}`;
}

/** Разбирает ссылку t.me/proxy или tg://proxy; null если не она. */
export function parseProxyLink(url) {
  const raw = String(url ?? '').trim();
  let u;
  try {
    u = new URL(raw.replace(/^tg:\/\//, 'https://__tg__/'));
  } catch {
    return null;
  }
  const isTme = /(^|\.)t\.me$|(^|\.)telegram\.me$/.test(u.hostname) && u.pathname === '/proxy';
  const isTg = u.hostname === '__tg__';
  if (!isTme && !isTg) return null;
  const server = (u.searchParams.get('server') || '').trim().replace(/\.$/, '');
  const port = u.searchParams.get('port');
  const secret = (u.searchParams.get('secret') || '').trim();
  if (!server || !isValidPort(port) || !secret) return null;
  return { server, port: Number(port), secret };
}

/** Достаёт все прокси-ссылки из произвольного текста (списки, каналы). */
export function parseProxyList(text) {
  const seen = new Set();
  const out = [];
  const re = /(?:https?:\/\/t\.me\/proxy\?|tg:\/\/proxy\?)[^\s"'<>]+/gi;
  for (const match of String(text).match(re) || []) {
    const parsed = parseProxyLink(match);
    if (!parsed) continue;
    const key = `${parsed.server}:${parsed.port}:${parsed.secret}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

/* ── Cloudflare ── */

/** Случайный IP из CIDR; randBigInt инжектится для тестов. */
export function randomIpFromCidr(cidr, randBigInt = null) {
  const [ip, prefixRaw] = String(cidr).split('/');
  const prefix = Number(prefixRaw);
  if (!ip || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p > 255)) return null;
  let base = 0n;
  for (const p of parts) base = (base << 8n) | BigInt(p);
  const hostBits = 32n - BigInt(prefix);
  const mask = (1n << hostBits) - 1n;
  let rand = randBigInt;
  if (rand === null || rand === undefined) {
    const bytes = randomBytes(8);
    rand = BigInt(`0x${bytesToHex(bytes)}`);
  }
  const addr = (base & ~mask) | (rand & mask);
  const out = [];
  for (let i = 0; i < 4; i += 1) {
    out.unshift(Number((addr >> BigInt(8 * i)) & 0xffn));
  }
  return out.join('.');
}

export function randomFrom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const bytes = randomBytes(4);
  const index = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return list[index % list.length];
}

/** docker-команда для своего сервера (mtg — поддерживает Fake-TLS). */
export function serverDeployCommand(secret, port = 443) {
  return [
    'docker run -d --name proxytg --restart unless-stopped \\',
    `  -p ${port}:${port} nineseconds/mtg:2 run \\`,
    `  --bind-to 0.0.0.0:${port} "${secret}"`,
  ].join('\n');
}
