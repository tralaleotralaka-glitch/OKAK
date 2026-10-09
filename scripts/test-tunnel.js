#!/usr/bin/env node

/**
 * OKAK Local Proxy / Tunnel Test Utility
 */

const http = require('http');

const PROXY_HOST = '127.0.0.1';
const PROXY_PORT = 8085;

console.log(`[OKAK Test] Проверка подключения через локальный прокси ${PROXY_HOST}:${PROXY_PORT}...`);

const req = http.request({
  host: PROXY_HOST,
  port: PROXY_PORT,
  method: 'GET',
  path: '/'
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`[OKAK Test] Ответ получен (HTTP ${res.statusCode}):`);
    console.log(body);
    console.log('[OKAK Test] Прокси-шлюз активен и готов к работе!');
  });
});

req.on('error', (err) => {
  console.log('[OKAK Test] Сервер прокси еще не запущен или порт занят:', err.message);
  console.log('Запустите сервер командой: npm start');
});

req.end();
