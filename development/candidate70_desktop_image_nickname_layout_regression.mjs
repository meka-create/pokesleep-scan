import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json', import.meta.url),'utf8'));

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`),'checkpoint release id must follow release.json');

// Desktop: keep only the image-column control visible. The status-row/mobile copy must be hidden
// after the generic .file-open display rule so normal CSS cascade cannot accidentally show both.
const genericPos=html.indexOf('.file-open{display:inline-flex');
const mobileHiddenPos=html.indexOf('.file-open-mobile{display:none}');
assert.ok(genericPos>=0&&mobileHiddenPos>genericPos,'desktop mobile-copy hide rule must come after generic .file-open display rule');
assert.match(app,/imageButton\('file-open-desktop'\)/,'desktop image-column button must remain');
assert.match(app,/imageButton\('file-open-mobile'\)/,'mobile status-row button must remain in markup');
assert.match(html,/@media\(max-width:680px\)[\s\S]*?\.file-open-desktop\{display:none\}\.file-open-mobile\{display:inline-flex\}/,'mobile placement must remain unchanged');

// Desktop nickname review: crop first, then dropdown/confirm beneath it, matching mobile stacking.
assert.match(html,/\.nickname-review \.review-visual\{flex-direction:column\}/,'nickname review controls must stack below the nickname crop on desktop');
assert.match(app,/class="review-visual">\$\{nickPreview\}<div class="review-choice">\$\{alt\}<button type="button" class="review-confirm nickconfirm"/,'nickname crop must precede dropdown/confirm in DOM order');

console.log('OK: Candidate 70 desktop image/nickname layout regression passed');
