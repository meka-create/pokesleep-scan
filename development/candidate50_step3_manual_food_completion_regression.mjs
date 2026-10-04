import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const one=prefix=>{const line=app.split('\n').find(x=>x.startsWith(prefix));assert.ok(line,`missing ${prefix}`);return line;};

const fn=one('function manualFoodRequired(');
const sandbox={speciesIsMythical:name=>name==='ミュウ'||name==='ダークライ'};
vm.createContext(sandbox);
vm.runInContext(`${fn}\nthis.manualFoodRequired=manualFoodRequired;`,sandbox);
const req=sandbox.manualFoodRequired;

// Normal species: all three ingredient slots must be explicitly confirmed even before unlock levels.
for(const lv of [1,15,29,30,59,60,70]){
  for(let i=0;i<3;i++) assert.equal(req('ツボツボ',lv,i),true,`normal species Lv${lv} food${i+1} must be required`);
}

// Mythical handling is intentionally unchanged in this step: unlocked slots follow the old level gates,
// while explicit NO_FOOD support remains available for the special slots.
assert.equal(req('ミュウ',1,0),true);
assert.equal(req('ミュウ',1,1),false);
assert.equal(req('ミュウ',1,2),false);
assert.equal(req('ミュウ',30,1),true);
assert.equal(req('ミュウ',60,2),true);

assert.match(one('function manualDraftErrors('),/manualFoodRequired\(d\.species,lv,i\)/,'manual validation must use species-aware food requirements');
assert.match(app,/const foods=manual\?\[0,1,2\]\.map\(i=>\{const opts=manualFoodOptions\(d\.species,d\.foods,i\),required=manualFoodRequired\(d\.species,Number\(d\.level\),i\)/,'inline manual UI must use the same species-aware rule');
assert.match(app,/\$\{required\?'食材を選択':'空欄'\}/,'inline manual UI must reflect required food slots in its placeholder');
assert.doesNotMatch(app,/Lv30未満の食材2、Lv60未満の食材3は空欄でも確定できます。/,'obsolete blank-confirmation guidance must remain removed');

console.log('OK: Candidate 50 step 3 manual food completion semantics regression passed');
