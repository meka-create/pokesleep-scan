import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');

// ⑦: level values are self-describing even when table headers are hidden on mobile.
assert.match(app,/class="level-value">Lv\.\$\{esc\(p\.level\?\?'—'\)\}/);
assert.match(app,/class="skill-level-value">Lv\.\$\{esc\(p\.skillLevel\?\?'—'\)\}/);

// ⑧: mobile order is game-like: level left of species, foods stay full-width,
// main skill left with skill level on the right, subskills then nature.
for(const needle of [
  '#tbl .level-cell{order:3;grid-column:1',
  '#tbl .pokemon-cell{order:4;grid-column:2/-1',
  '#tbl .foods{order:5;grid-column:1/-1',
  '#tbl .main-skill-cell{order:6;grid-column:1/3',
  '#tbl .skill-level-cell{order:7;grid-column:3',
  '#tbl .subs{order:8;grid-column:1/-1',
  '#tbl .nature-cell{order:9;grid-column:1/-1'
]) assert.ok(html.includes(needle),`missing mobile layout rule: ${needle}`);

// ⑨: manual completion edits the same result row instead of opening a second row/card.
assert.ok(app.includes('const pokemon=chosenSpecies(r),manual=!!r.manualEditOpen'));
assert.ok(app.includes('class="manual-editor-input manual-species"'));
assert.ok(app.includes('class="manual-editor-input manual-level"'));
assert.ok(app.includes('class="manual-editor-input manual-skill-level"'));
assert.ok(app.includes('class="manual-editor-input manual-main-skill"'));
assert.ok(app.includes('class="manual-editor-input manual-nature"'));
assert.ok(app.includes('class="manual-editor-input manual-food"'));
assert.ok(app.includes('class="manual-editor-input manual-sub"'));
assert.ok(!app.includes('if(r.manualEditOpen){const mr=document.createElement(\'tr\')'), 'separate manual row is still rendered');

// Blank/manual-review fields keep review state, including after species has been confirmed.
assert.ok(app.includes('function foodDataNeedsReview(r)'));
assert.ok(app.includes('if(x?.needsReview||!name)return true'));
assert.ok(app.includes('foods:foodDataNeedsReview(r)'));
assert.ok(app.includes('subskills:subskillNeedsReview(r)'));
assert.ok(app.includes('Object.values(resultReviewState(r)).some(Boolean)'));
assert.ok(app.includes("needsReview:!name"), 'manual completion should not mark blank food as resolved');

// Empty manual fields get screenshot crop assistance, generated lazily from the source image.
assert.ok(app.includes('async function ensureManualPreviews(r)'));
assert.ok(app.includes("key:'profile',make:c=>crop(c,'nicklevel').toDataURL('image/png')"));
assert.ok(app.includes("key:'mainSkill',make:c=>crop(c,'mainskill').toDataURL('image/png')"));
assert.ok(app.includes("key:'nature',make:c=>crop(c,'nature').toDataURL('image/png')"));
assert.ok(app.includes('POKESLEEP_FOOD_MATCHER.cropFood(c,`food${i+1}`)'));
assert.ok(app.includes("['sub10','sub25','sub50','sub70','sub80']"));
assert.ok(app.includes('await ensureManualPreviews(r);render();'));
assert.ok(html.includes('.manual-field-preview'));

// Once species is known, a blank normal food review can fall back to master-data choices.
assert.ok(app.includes('fallback=species?manualFoodOptions(species,knownFoods,i):[]'));

console.log('OK: Candidate 52 steps ⑦-⑨ inline manual + mobile game-like layout regression passed');
