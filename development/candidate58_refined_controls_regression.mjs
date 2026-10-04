import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url),'utf8'));
assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');

// Candidate 58's eye/gray-control experiment was superseded. Guard the settled photo-frame + primary-gradient design.
assert.ok(!app.includes('M3 12s3.4-5 9-5 9 5 9 5'),'eye icon must remain removed');
assert.match(app,/<rect x="3\.5" y="4\.5" width="17" height="15" rx="2\.5"><\/rect>/,'photo frame icon should remain');
assert.match(html,/\.file-open\{[^}]*border:1px solid #e1e5ed[^}]*background:#f7f8fb/,'image control should retain its subtle surface');
assert.match(html,/\.review-confirm\{[^}]*background:linear-gradient\(135deg,#5d60ed,#4b4ed9\)[^}]*color:#fff/,'field confirm should retain the primary gradient');
assert.match(html,/\.manual-confirm\{[^}]*background:linear-gradient\(135deg,#5d60ed,#4b4ed9\)[^}]*color:#fff/,'manual confirm should retain the primary gradient');
assert.match(html,/\.review-choice>\.review-confirm\{min-height:31px;min-width:0;padding:3px 9px\}/,'mobile nickname confirm should stay compact');

console.log('OK: Candidate 58 legacy control regression updated to current settled design');
