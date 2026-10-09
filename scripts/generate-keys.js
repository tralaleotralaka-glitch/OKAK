#!/usr/bin/env node

/**
 * OKAK CLI VPN Key & Profile Generator
 * Generates fresh VLESS Reality, AmneziaWG, and WireGuard credentials
 * with terminal QR code output.
 */

const qrcode = require('qrcode');
const {
  generateVlessRealityBundle,
  generateWireguardBundle
} = require('../server/crypto-utils');

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
}

const serverIp = getArg('--ip', 'YOUR_SERVER_IP');
const sni = getArg('--sni', 'gateway.icloud.com');
const port = parseInt(getArg('--port', '443'), 10);
const clientName = getArg('--name', 'OKAK-Device');

async function main() {
  console.log('\n======================================================');
  console.log('       OKAK VPN SUITE - CLI KEY & CONFIG GENERATOR    ');
  console.log('======================================================\n');

  console.log(`[+] Сервер: ${serverIp}:${port}`);
  console.log(`[+] SNI маскировка: ${sni}`);
  console.log(`[+] Клиент: ${clientName}\n`);

  // 1. VLESS Reality
  console.log('--- [1] VLESS Reality (XTLS-Vision) ---');
  const vless = generateVlessRealityBundle({ serverIp, port, sni, clientName });
  console.log('Ссылка для импорта:');
  console.log(vless.clientUri);
  console.log('\nQR-код для сканирования:');
  const vlessQr = await qrcode.toString(vless.clientUri, { type: 'terminal', small: true });
  console.log(vlessQr);

  // 2. AmneziaWG
  console.log('\n--- [2] AmneziaWG (Obfuscated WireGuard) ---');
  const awg = generateWireguardBundle({ serverIp, port: 51820, clientName: `${clientName}-AWG`, isAmnezia: true });
  console.log('Конфигурация клиента (client.conf):');
  console.log(awg.clientConfig);

  console.log('\nQR-код для импорта AmneziaWG:');
  const awgQr = await qrcode.toString(awg.clientConfig, { type: 'terminal', small: true });
  console.log(awgQr);

  console.log('\nГотово! Используйте ссылку или QR-код в клиенте (Streisand, v2rayNG, AmneziaWG).');
}

main().catch(err => {
  console.error('Ошибка:', err);
  process.exit(1);
});
