/**
 * Складывает веб-часть мессенджера в www/ — именно её Capacitor
 * упаковывает в APK (android/app/src/main/assets/public).
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'www');
const sources = ['index.html', 'css', 'js'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const item of sources) {
  await cp(path.join(root, item), path.join(out, item), { recursive: true });
}

console.log(`www/ собрано: ${sources.join(', ')}`);
