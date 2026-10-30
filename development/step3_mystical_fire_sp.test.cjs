'use strict';
// Public master-data synthetic tests only. No screenshots, personal Pokémon,
// user CSV, nickname, or private golden data are committed.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const shared=JSON.parse(fs.readFileSync(path.join(root,'shared/MASTER_DATA.json'),'utf8'));
function classifier(){
 const context={window:{POKESLEEP_MASTER:shared,POKESLEEP_EXTRA_INGREDIENT_STRENGTH:shared.ingredientStrength||{}}};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(root,'classifier.js'),'utf8'),context);
 return context.window.POKESLEEP_CLASSIFIER;
}
test('Mystical Fire has the published seven-level SP scale, not generic fallback',()=>{
 const calc=classifier(),published=[1144,1626,2244,3098,4277,5910,7596];
 assert.deepEqual(Array.from(calc.skillSpValues('Cooking Advance S (Mystical Fire)')),published);
 assert.notDeepEqual(Array.from(calc.skillSpValues('Cooking Advance S (Mystical Fire)')),
  Array.from(calc.skillSpValues('unknown-future-skill')));
});
test('a new species with its distinctive skill still classifies from synthetic matching observations',()=>{
 const calc=classifier(),species=shared.pokemon.find(x=>x.name==='ムウマージ');
 assert.ok(species,'verified 2026-10-26 master needs Mismagius');
 const nature=shared.natures.find(x=>x.ja==='てれや');
 const level=31,skillLevel=1,subskills=['スキル確率アップS','おてつだいスピードS'];
 const mod=calc.modFromObserved(subskills,level),profile=calc.profiles(species)[0];
 const sp=calc.computeSp(species,profile,level,nature,mod,0,skillLevel);
 const time=Math.floor(calc.frequency(species,level,nature,mod,0)+1e-9);
 const obs={level,sp,helpSeconds:time,skillLevel,nature:nature.ja,
  mainSkill:species.mainSkill,subskills,carry:null};
 const classified=calc.inferWithoutFoods(obs);
 assert.equal(classified.status,'UNIQUE');
 assert.deepEqual(Array.from(classified.candidates),['ムウマージ']);
 assert.equal(classified.stages?.mainSkill?.[0],'ムウマージ');
 assert.equal(classified.carryConsistentCandidates.length,0,
  'Absent carry may NOT become a fabricated carry confirmation');
 assert.equal(calc.inferWithoutFoods({...obs,nature:''}).status,'MISSING_INPUT',
  'Missing nature must not become a guessed nature');
});
