import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url),'utf8'));

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');

// Source-image control: no eye motif; use a quiet photo/frame line icon.
assert.ok(!app.includes('M3 12s3.4-5 9-5 9 5 9 5'),'eye icon must be removed');
assert.match(app,/<rect x="3\.5" y="4\.5" width="17" height="15" rx="2\.5"><\/rect>/,'photo frame icon should be used');
assert.match(app,/m5\.5 17 4\.3-4\.2 3\.2 3 2\.2-2\.1 3\.3 3\.3/,'photo landscape line should be used');
assert.match(html,/\.file-open\{[^}]*border:1px solid #e1e5ed[^}]*background:#f7f8fb[^}]*color:#667185/,'image control should stay quiet, neutral, and visibly clickable');

// Confirm controls: clearly colored, premium/subdued blue-indigo, not low-contrast gray.
assert.match(html,/\.review-confirm\{[^}]*background:linear-gradient\(135deg,#5d60ed,#4b4ed9\)[^}]*color:#fff/);
assert.ok(!html.includes('background:linear-gradient(180deg,#fbfcfe,#f2f4f8);color:#4f596f'),'Candidate 58 low-contrast confirm style must be gone');
assert.match(html,/\.manual-confirm\{[^}]*background:linear-gradient\(135deg,#5d60ed,#4b4ed9\)[^}]*color:#fff/);

console.log('OK: Candidate 59 refined confirm/image control regression passed');
