/**
 * Складывает веб-часть в www/ — именно её Capacitor пакует в APK.
 * Использование: node scripts/build-web.mjs [каталог-источник]
 * По умолчанию берёт proxytg (MySENGER остаётся веб-приложением).
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = process.argv[2] || 'proxytg';
const srcDir = path.join(root, source);
const out = path.join(root, 'www');
const candidates = ['index.html', 'css', 'js', 'vendor'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const copied = [];
for (const item of candidates) {
  const from = path.join(srcDir, item);
  try {
    await stat(from);
  } catch {
    continue; // нет такого элемента у источника
  }
  await cp(from, path.join(out, item), { recursive: true });
  copied.push(item);
}

console.log(`www/ собрано из ${source}/: ${copied.join(', ')}`);
