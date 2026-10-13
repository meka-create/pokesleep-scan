'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const index=fs.readFileSync('index.html','utf8');
const worker=fs.readFileSync('sw.js','utf8');
const app=fs.readFileSync('app.js','utf8');
// The HTML can be network-fresh while an OLD controlling Service Worker
// still answers local script requests. An unchanged ?release= query can return
// stale code for the full session. Always bump script query when OCR logic
// changes, in BOTH dynamic loader and PWA precache manifest.
const indexRevs=[...index.matchAll(/(?:watchUrl|u)\.searchParams\.set\('ui','([^']+)'\)/g)].map(m=>m[1]);
assert.equal(indexRevs.length,2,'the main and health local-script loaders both need a pinned cache revision');
assert.equal(indexRevs[0],indexRevs[1]);
const swRev=worker.match(/&ui=([^\x60]+)\x60/);
assert(swRev,'SW precache URL query must carry the same asset revision');
assert.equal(swRev[1],indexRevs[0],'precache must use the exact dynamic script URL');
assert.match(indexRevs[0],/food3-pixel-v4/,'new pixel witnesses must not reuse the older cache key');
assert.match(worker,/food3-pixel-witness-v4-query-refresh/,'rotate SW cache namespace');
assert.match(app,/codeRevision:'20261013-food3-pixel-v4-query-refresh'/);
assert.match(app,/lockedFood3PixelWitness\(canvas,foods,parsed\.level\)/);
console.log('PASS: cache-busted live script URLs, SW precache parity, observable diagnostics fingerprint');
