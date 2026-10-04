import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8')).id;

assert.match(index, /rel="manifest"/);
assert.ok(index.includes(`manifest.webmanifest?release=${release}`), 'manifest URL must be release-versioned');
assert.match(index, /navigator\.serviceWorker\.register/);
assert.match(index, /updateViaCache:\s*'none'/);
assert.match(index, /visibilitychange/);
assert.match(index, /window\.addEventListener\('focus'/);
assert.match(sw, /skipWaiting\(\)/);
assert.match(sw, /clients\.claim\(\)/);
assert.match(sw, /cache:\s*'no-store'/);
assert.ok(manifest.name.includes('個体値ぶっこみスキャン'));
assert.equal(manifest.display, 'standalone');
for (const size of ['192x192', '512x512']) {
  assert.ok(manifest.icons.some(x => x.sizes === size), `missing ${size} icon`);
}
for (const icon of manifest.icons) assert.ok(icon.src.includes(`release=${release}`), 'icon URL must be release-versioned');
for (const file of ['icon-192.png','icon-512.png','apple-touch-icon.png','favicon-32.png']) {
  assert.ok(fs.existsSync(path.join(root,'icons',file)), `missing ${file}`);
}
console.log('OK: PWA install/update regression checks passed');
