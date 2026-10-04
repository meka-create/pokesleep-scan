import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));

function extractFunction(name){
  const markers=[`async function ${name}(`,`function ${name}(`];let start=-1;
  for(const marker of markers){start=app.indexOf(marker);if(start>=0)break;}
  assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}'&&--depth===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

assert.match(release.id,/^2026-10-04-candidate\d+-/);
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));
assert.ok(app.includes("CHECKPOINT_COMPATIBILITY_ID='checkpoint-compat-2026-10-04-v1'"));

// 1) Species-food conflict is an overlay: original review state survives A -> B -> A.
const speciesCtx={window:{POKESLEEP_MASTER:{pokemon:[
  {name:'A',profiles:[['a1','a2','a3']]},
  {name:'B',profiles:[['b1','b2','b3']]}
]}},POKESLEEP_CLASSIFIER:{profiles(sp){return sp.profiles.map(xs=>({items:xs.map(name=>({name}))}));}},String,Set,Array};
speciesCtx.chosenSpecies=r=>r.species;
vm.createContext(speciesCtx);
vm.runInContext(`${extractFunction('speciesMasterRows')}\n${extractFunction('manualProfilesForSpecies')}\n${extractFunction('speciesFoodReviewSlots')}\n${extractFunction('revalidateFoodsForSpecies')}\nthis.revalidate=revalidateFoodsForSpecies;`,speciesCtx);

const reviewed={species:'A',foods:[
  {name:'a1',needsReview:false},
  {name:'a2',needsReview:false},
  {name:'a3',needsReview:true,reviewReason:'locked-food3-dimmed-shape-arbitration'}
]};
reviewed.species='B';speciesCtx.revalidate(reviewed,'B');
assert.equal(reviewed.foods[2].needsReview,true);
assert.equal(reviewed.foods[2].reviewReason,'species-food-conflict');
assert.deepEqual({...reviewed.foods[2].speciesConflictBaseReview},{needsReview:true,reviewReason:'locked-food3-dimmed-shape-arbitration'});
reviewed.species='A';speciesCtx.revalidate(reviewed,'A');
assert.equal(reviewed.foods[2].needsReview,true,'original food3 review must survive species round-trip');
assert.equal(reviewed.foods[2].reviewReason,'locked-food3-dimmed-shape-arbitration');
assert.equal('speciesConflictBaseReview' in reviewed.foods[2],false);

const clean={species:'A',foods:[{name:'a1',needsReview:false},{name:'a2',needsReview:false},{name:'a3',needsReview:false}]};
clean.species='B';speciesCtx.revalidate(clean,'B');
assert.equal(clean.foods[2].reviewReason,'species-food-conflict');
clean.species='A';speciesCtx.revalidate(clean,'A');
assert.equal(clean.foods[2].needsReview,false,'clean food must return to clean state after species round-trip');
assert.equal(clean.foods[2].reviewReason,undefined);

// Explicit manual food confirmation supersedes any saved overlay state.
assert.match(app,/f\.name=v;f\.needsReview=false;f\.manualOverride=true;delete f\.speciesConflictBaseReview;/);
assert.match(app,/delete next\.speciesConflictBaseReview;return next;/,'full manual completion must discard transient species-conflict backup');

// 2) Nature is now a hard CSV compatibility preflight blocker when unresolved.
const csvCtx={
  results:[],String,Set,
  chosenSpecies:r=>r.species||'',
  detailedMewVersatileSkill:()=>'',
  MEW_VERSATILE_KEYS:new Set(),
  mewVersatileCsvLabel:()=>'',
  speciesFoodReviewSlots:()=>[],
  csvFoodResolvedForPokesleepTool:()=>true,
  natureDataNeedsReview:r=>!!r?.parsed?.natureNeedsReview||!['きまぐれ','おだやか'].includes(String(r?.parsed?.nature||'').trim())
};
vm.createContext(csvCtx);
vm.runInContext(`${extractFunction('csvCompatibilityBlockers')}\nthis.test=csvCompatibilityBlockers;`,csvCtx);
const base={file:'x.png',species:'フシギダネ',parsed:{nature:'きまぐれ',natureNeedsReview:false},foods:[{name:'a'},{name:'b'},{name:'c'}]};
csvCtx.results=[structuredClone(base)];let blockers=csvCtx.test();
assert.equal(blockers.blocked,false);assert.equal(blockers.natureRows,0);
const uncertain=structuredClone(base);uncertain.parsed.natureNeedsReview=true;csvCtx.results=[uncertain];blockers=csvCtx.test();
assert.equal(blockers.blocked,true);assert.equal(blockers.natureRows,1);assert.equal(blockers.details[0].field,'nature');
const blank=structuredClone(base);blank.parsed.nature='';csvCtx.results=[blank];blockers=csvCtx.test();
assert.equal(blockers.blocked,true);assert.equal(blockers.natureRows,1);
const invalid=structuredClone(base);invalid.parsed.nature='不正値';csvCtx.results=[invalid];blockers=csvCtx.test();
assert.equal(blockers.blocked,true);assert.equal(blockers.natureRows,1);

assert.match(readme,/せいかくが未確定・要確認.*CSV保存\/コピーを止め/s);
assert.match(readme,/Candidate92/);
assert.match(readme,/level \/ skillLevel \/ ordinary mainSkill のCSV preflight policyは変更しません/);

// 3) Candidate91 recognition behavior remains untouched.
assert.match(app,/guardLockedFood3DimmedArbitration\(markFoodReviews\(POKESLEEP_FOOD_MATCHER\.resolveSlots\(canvas,inference,parsed\.level\)\),parsed\.level\)/);
assert.match(app,/NO_FOOD_EMPTY_SCORE_MIN=\.50,NO_FOOD_EMPTY_MARGIN_MIN=\.10/);

const coreHashes={
 'classifier.js':'93a1fbe56887ae9683409ca5db48563f18c78711aedac01b8758510768ec7c71',
 'master_data.js':'403b28544bf650323b1c5d2c1cde4b71be09d6897949cf6ea8c6cf896fc3a8f5',
 'food_matcher.js':'68f20e2ce1ab45222824669514eaa62077add12dfe8949658caf0f6a9589c9a7',
 'food_features.js':'d5f68af858d37abfbdfad50138f9f9bd5dc6cdc7bf91ea56f5e0b684e9b61750',
 'food_color_features.js':'e00286ae2e8fe96d6f0b49c93e03150469175382ba09c62b499e6f33d85ae444'
};
for(const [file,expected] of Object.entries(coreHashes)){
  const got=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  assert.equal(got,expected,`${file} changed unexpectedly`);
}

console.log('OK: Candidate92 species-review overlay preservation and nature CSV safety checks passed');
