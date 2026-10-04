import fs from 'node:fs';
import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

// ⑤ nickname alternative must swap immediately after a candidate is chosen.
assert.match(app,/function nicknameAlternativeRows\(r,p,draft\)/);
assert.match(app,/function nicknameCandidatePlaceholder\(rows\)\{return rows\.length===1\?`候補：\$\{rows\[0\]\.text\}`/);
assert.match(app,/function refreshNicknameCandidateControl\(ri,td,p\)/);
assert.match(app,/p\.nicknameReviewDraft=v;[\s\S]*refreshNicknameCandidateControl\(ri,td,p\)/);

// ⑥ opening the source image pushes a same-page history entry; Back closes only the viewer.
assert.match(app,/history\.pushState\(\{\.\.\.history\.state,pokesleepSourceImage:true\},'',location\.href\)/);
assert.match(app,/window\.addEventListener\('popstate',\(\)=>\{if\(!\$\('#imageModal'\)\?\.hidden\)closeSourceImage\(\{fromHistory:true\}\);\}\)/);
assert.match(app,/if\(!fromHistory&&history\.state\?\.pokesleepSourceImage\)\{history\.back\(\);return;\}/);

// Mobile custom picker is now an anchored dropdown, not a bottom sheet.
assert.doesNotMatch(index,/\.choice-picker-panel\{left:0!important;right:0!important;bottom:0!important;top:auto!important;width:100%!important/);
assert.match(index,/@media\(max-width:680px\)[\s\S]*\.choice-picker-backdrop\{background:transparent;backdrop-filter:none\}/);
assert.match(index,/@media\(max-width:680px\)[\s\S]*\.choice-picker-head\{display:none\}/);
assert.match(app,/function positionChoicePicker\(\)\{const panel=.*choicePickerTrigger\)return;/);
assert.doesNotMatch(app,/positionChoicePicker\(\).*choicePickerIsMobile\(\)\)return/);

console.log('OK: Candidate 52 steps ⑤-⑥ + mobile anchored dropdown regression passed');
