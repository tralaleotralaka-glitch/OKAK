import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CF_IPV4, DEFAULT_SNI, bytesToHex, buildTgLink, buildTmeLink, hexToBytes, hexToText,
  isBase64Secret, isHexString, isValidHost, isValidPort, isValidSecret, makeFakeTlsSecret,
  parseProxyLink, parseProxyList, parseSecret, randomIpFromCidr, secretKindLabel,
  serverDeployCommand, textToHex,
} from '../js/core.js';

test('hex/текст обратимы', () => {
  assert.equal(textToHex('google.com'), '676f6f676c652e636f6d');
  assert.equal(hexToText('676f6f676c652e636f6d'), 'google.com');
  assert.equal(bytesToHex(Uint8Array.of(0, 255)), '00ff');
  assert.deepEqual(Array.from(hexToBytes('00ff')), [0, 255]);
  assert.equal(hexToBytes('abc'), null, 'нечётная длина');
  assert.equal(hexToBytes('zz'), null, 'не hex');
});

test('makeFakeTlsSecret: ee + 16 байт + домен', () => {
  const rand = Uint8Array.from({ length: 16 }, (_, i) => i);
  const secret = makeFakeTlsSecret('itunes.apple.com', rand);
  assert.equal(secret, `ee${'000102030405060708090a0b0c0d0e0f'}${textToHex('itunes.apple.com')}`);
  const parsed = parseSecret(secret);
  assert.equal(parsed.kind, 'tls');
  assert.equal(parsed.domain, 'itunes.apple.com');
  assert.equal(parsed.key, '000102030405060708090a0b0c0d0e0f');
});

test('разбор секретов всех видов', () => {
  assert.equal(parseSecret('ee' + 'ab'.repeat(16) + textToHex('ya.ru')).kind, 'tls');
  assert.equal(parseSecret('ee' + 'ab'.repeat(16)).kind, 'tls-no-domain');
  assert.equal(parseSecret('dd' + 'ab'.repeat(16)).kind, 'secure');
  assert.equal(parseSecret('ab'.repeat(16)).kind, 'classic');
  assert.equal(parseSecret('eeNEgYdJvXrFGRMCIMJdCQ').kind, 'base64');
  assert.equal(parseSecret(''), null);
  assert.equal(parseSecret('ee' + 'ab'.repeat(5)), null, 'короткий ee');
  assert.equal(parseSecret('xyz'), null);
});

test('валидаторы hex/base64', () => {
  assert.equal(isHexString('aabb'), true);
  assert.equal(isHexString('aab'), false);
  assert.equal(isBase64Secret('eeNEgYdJvXrFGRMCIMJdCQ'), true);
  assert.equal(isBase64Secret('aabbcc'), false, 'чистый hex не base64-секрет');
  assert.equal(isValidSecret('ee' + '11'.repeat(16) + textToHex('a.ru')), true);
  assert.equal(isValidSecret('nope!'), false);
});

test('host/port', () => {
  assert.equal(isValidHost('proxy.example.com'), true);
  assert.equal(isValidHost('1.2.3.4'), true);
  assert.equal(isValidHost('256.1.1.1'), false);
  assert.equal(isValidHost('example.com.'), true, ' trailing dot ок');
  assert.equal(isValidHost(''), false);
  assert.equal(isValidHost('-bad-.com'), false);
  assert.equal(isValidPort(443), true);
  assert.equal(isValidPort(0), false);
  assert.equal(isValidPort(65536), false);
  assert.equal(isValidPort('443'), true);
});

test('ссылки строятся и разбираются', () => {
  const cfg = { server: '1.2.3.4', port: 443, secret: 'ee' + '00'.repeat(16) + textToHex('ya.ru') };
  const tme = buildTmeLink(cfg);
  assert.match(tme, /^https:\/\/t\.me\/proxy\?server=1\.2\.3\.4&port=443&secret=ee/);
  const tg = buildTgLink(cfg);
  assert.match(tg, /^tg:\/\/proxy\?/);
  assert.deepEqual(parseProxyLink(tme), cfg);
  assert.deepEqual(parseProxyLink(tg), cfg);
  assert.equal(parseProxyLink('https://example.com/proxy?server=1.2.3.4&port=443&secret=ee'), null, 'чужой хост');
  assert.equal(parseProxyLink('https://t.me/proxy?server=&port=443&secret=ee'), null, 'нет сервера');
});

test('parseProxyList: дедуп, trailing dot, мусор', () => {
  const text = [
    'https://t.me/proxy?server=good.example.com.&port=443&secret=ee' + '11'.repeat(16),
    'https://t.me/proxy?server=good.example.com&port=443&secret=ee' + '11'.repeat(16), // дубль после trim точки
    'tg://proxy?server=2.2.2.2&port=8443&secret=dd' + '22'.repeat(16),
    'какой-то мусор без ссылки',
    'https://t.me/proxy?server=bad&port=99999&secret=ee', // плохой порт
  ].join('\n');
  const list = parseProxyList(text);
  assert.equal(list.length, 2);
  assert.equal(list[0].server, 'good.example.com');
  assert.equal(list[1].server, '2.2.2.2');
});

test('randomIpFromCidr: границы и детерминированность', () => {
  assert.equal(randomIpFromCidr('104.16.0.0/13', 0n), '104.16.0.0');
  // маска /13 → хост-биты 19; максимум = 2^19-1
  const max = (1n << 19n) - 1n;
  assert.equal(randomIpFromCidr('104.16.0.0/13', max), '104.23.255.255');
  const ip = randomIpFromCidr('172.64.0.0/13', 5n);
  assert.equal(ip, '172.64.0.5');
  assert.equal(randomIpFromCidr('не-cidr'), null);
  // случайный (без инжекта) попадает в диапазон
  const rnd = randomIpFromCidr('103.21.244.0/22');
  assert.match(rnd, /^103\.21\.(24[4-9]|25[0-5])\.\d+$/);
});

test('белые списки непустые', () => {
  assert.equal(CF_IPV4.length, 15, 'официальные 15 подсетей Cloudflare');
  assert.ok(CF_IPV4.includes('104.16.0.0/13'));
  assert.ok(DEFAULT_SNI.includes('www.google.com'));
});

test('метки и docker-команда', () => {
  assert.equal(secretKindLabel('tls'), 'Fake-TLS');
  assert.equal(secretKindLabel('secure'), 'Secure (dd)');
  const cmd = serverDeployCommand('ee1234', 8443);
  assert.match(cmd, /-p 8443:8443/);
  assert.match(cmd, /ee1234/);
  assert.match(cmd, /nineseconds\/mtg:2/);
});
