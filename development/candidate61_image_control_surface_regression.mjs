import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url),'utf8'));

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');
assert.match(app,/class="file-open /,'source image control should remain the existing file-open control');
assert.match(html,/\.file-open\{[^}]*border:1px solid #e1e5ed[^}]*background:#f7f8fb[^}]*box-shadow:0 1px 2px rgba\(31,41,63,\.04\)/,'image control should have a visible subtle surface');
assert.doesNotMatch(html,/\.file-open\{[^}]*background:transparent[^}]*border:1px solid transparent/,'image control surface must not be fully hidden');
assert.match(html,/\.file-open:hover,\.file-open:active\{[^}]*background:#eef1f6[^}]*border-color:#d7dce6/,'image control hover should remain restrained');
assert.match(html,/\.file-open-icon svg\{[^}]*stroke:currentColor/,'photo-frame line icon should remain');
assert.match(html,/\.file-open-mobile\{display:none\}/,'desktop/mobile placement behavior should remain');
assert.match(html,/@media\(max-width:680px\)[\s\S]*?\.file-open-desktop\{display:none\}\.file-open-mobile\{display:inline-flex\}/,'mobile right-side image control should remain');

console.log('OK: Candidate 61 image control surface regression passed');
