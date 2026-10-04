import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url),'utf8'));

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');

// Mobile card header: source-image control shares the top status row and no longer owns a separate mobile row.
assert.match(app,/class=\\?"card-meta-row\\?"/,'card meta row should exist');
assert.match(app,/imageButton\('file-open-mobile'\)/,'mobile image control should be rendered in the status row');
assert.match(app,/imageButton\('file-open-desktop'\)/,'desktop table should retain the image-column control');
assert.match(html,/\.file-open-mobile\{display:none\}/,'mobile copy should be hidden by default');
assert.match(html,/@media\(max-width:680px\)[\s\S]*?\.file-open-desktop\{display:none\}\.file-open-mobile\{display:inline-flex\}/,'mobile should switch to the status-row image control');
assert.match(html,/#tbl \.file-cell\{display:none!important\}/,'mobile source-image row should be removed');
assert.match(html,/\.card-meta-row\{display:flex;align-items:center;justify-content:space-between/,'status and image control should share one aligned row');

// Confirm buttons use the primary Analyze visual language, scaled down for card controls.
assert.match(html,/\.btn-primary\{background:linear-gradient\(135deg,#5d60ed,#4b4ed9\)/,'Analyze primary gradient expected');
assert.match(html,/\.review-confirm\{[^}]*background:linear-gradient\(135deg,#5d60ed,#4b4ed9\)[^}]*color:#fff/,'field confirm should use Analyze primary gradient');
assert.match(html,/\.manual-confirm\{[^}]*background:linear-gradient\(135deg,#5d60ed,#4b4ed9\)[^}]*color:#fff/,'manual confirm should use Analyze primary gradient');
assert.match(html,/\.review-choice>\.review-confirm\{min-height:31px;min-width:0;padding:3px 9px\}/,'mobile field confirm should be compact');
assert.match(html,/\.manual-inline-actions \.manual-confirm\{min-height:32px;padding:0 10px\}/,'mobile manual confirm should be compact');

console.log('OK: Candidate 60 card header / confirm balance regression passed');
