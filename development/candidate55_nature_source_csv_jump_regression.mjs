import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');

assert.match(app,/class="nature-value"/,'nature value should have explicit readable styling hook');
assert.match(html,/\.main-skill-value,\.nature-value\{font-weight:850;color:#30384a;line-height:1\.45\}/,'nature and main skill values should share readable typography');
assert.match(html,/\.main-skill-value,\.nature-value\{font-size:13px;font-weight:850\}/,'mobile nature/main skill value sizing should match');
assert.match(html,/content:'せいかく'/,'the existing せいかく label should remain');

assert.doesNotMatch(app,/class="file-source-name"/,'filename should no longer be rendered on the card');
assert.match(app,/class="file-open-label">画像を見る<\/span>/,'image button should have a clear fixed label');
assert.match(app,/file-open-icon[\s\S]*<svg viewBox="0 0 24 24"/,'image button should use the refined inline SVG icon');
assert.doesNotMatch(app,/file-open-name/,'filename should not be squeezed into the image button');
assert.doesNotMatch(app,/file-open-hint/,'the ambiguous compact hint should remain removed');
assert.doesNotMatch(html,/\.file-source-name\{/,'obsolete card filename styling should be absent');

assert.match(app,/details\.push\(\{ri,file:label,issue:'ポケモン種族を確定してください',field:'species'\}\)/,'CSV species blocker should carry result navigation metadata');
assert.match(app,/field:'mainSkill'/,'Mew main-skill blocker should carry target field metadata');
assert.match(app,/field:`food\$\{bad\[0\]\+1\}`/,'food blocker should carry a food target');
assert.match(app,/className='dialog-result-jump'/,'dialog should render blocker items as jump buttons');
assert.match(app,/jumpToResultCard\(ri,field\)/,'dialog jump should navigate to the result card');
assert.match(app,/tr\.dataset\.ri=String\(ri\)/,'rendered result rows should retain stable result indexes');
assert.match(app,/画像ファイル名をタップすると、そのカードへ移動できます。/,'CSV preflight should explain the navigation affordance');
assert.match(html,/\.result-field-highlight/,'jumped fields should receive a visible highlight');

console.log('OK: Candidate 55 nature/source filename/CSV jump regression passed');
