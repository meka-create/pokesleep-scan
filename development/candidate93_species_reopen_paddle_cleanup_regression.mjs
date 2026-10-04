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

assert.match(release.id,/candidate93-/);
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));
assert.ok(app.includes("CHECKPOINT_COMPATIBILITY_ID='checkpoint-compat-2026-10-04-v1'"));

// 1) Species reopen: unresolved state restores transient species-food conflict overlays.
const speciesCtx={window:{POKESLEEP_MASTER:{pokemon:[
  {name:'A',profiles:[['a1','a2','a3']]},
  {name:'B',profiles:[['b1','b2','b3']]}
]}},POKESLEEP_CLASSIFIER:{profiles(sp){return sp.profiles.map(xs=>({items:xs.map(name=>({name}))}));}},String,Set,Array};
vm.createContext(speciesCtx);
vm.runInContext([
  extractFunction('chosenSpecies'),
  extractFunction('speciesMasterRows'),
  extractFunction('manualProfilesForSpecies'),
  extractFunction('manualFoodOptions'),
  extractFunction('manualAutoFirstFood'),
  extractFunction('autoResolveFirstFoodForSpecies'),
  extractFunction('releaseAutoResolvedFirstFood'),
  extractFunction('restoreSpeciesConflictFoodReview'),
  extractFunction('restoreSpeciesConflictReviews'),
  extractFunction('speciesFoodReviewSlots'),
  extractFunction('revalidateFoodsForSpecies'),
  extractFunction('reopenSpeciesSelection')
].join('\n')+'\nthis.api={autoResolveFirstFoodForSpecies,revalidateFoodsForSpecies,reopenSpeciesSelection};',speciesCtx);

const unresolved={
  classification:{status:'AMBIGUOUS',candidates:['A','B']},
  speciesManualOverride:'B',
  foods:[
    {name:'',needsReview:true},
    {name:'a2',needsReview:false},
    {name:'a3',needsReview:true,reviewReason:'locked-food3-dimmed-shape-arbitration'}
  ]
};
speciesCtx.api.autoResolveFirstFoodForSpecies(unresolved,'B');
speciesCtx.api.revalidateFoodsForSpecies(unresolved,'B');
assert.equal(unresolved.foods[1].reviewReason,'species-food-conflict');
assert.equal(unresolved.foods[2].reviewReason,'species-food-conflict');
assert.equal(speciesCtx.api.reopenSpeciesSelection(unresolved),'');
assert.equal(unresolved.speciesManualOverride,undefined);
assert.equal(unresolved.foods[0].name,'');
assert.equal(unresolved.foods[0].reviewReason,'species-reopened');
assert.equal(unresolved.foods[1].needsReview,false,'clean food review state must be restored when species becomes unresolved');
assert.equal(unresolved.foods[1].reviewReason,undefined);
assert.equal(unresolved.foods[2].needsReview,true);
assert.equal(unresolved.foods[2].reviewReason,'locked-food3-dimmed-shape-arbitration');
assert.equal('speciesConflictBaseReview' in unresolved.foods[1],false);
assert.equal('speciesConflictBaseReview' in unresolved.foods[2],false);

// 2) If the underlying classifier is already UNIQUE for the same species, reopening must retain fixed food1.
const sameUnique={
  classification:{status:'UNIQUE',candidates:['A']},
  speciesManualOverride:'A',
  foods:[{name:'',needsReview:true},{name:'a2',needsReview:false},{name:'a3',needsReview:false}]
};
speciesCtx.api.autoResolveFirstFoodForSpecies(sameUnique,'A');
assert.equal(sameUnique.foods[0].name,'a1');
assert.equal(sameUnique.foods[0].autoResolvedFromSpecies,true);
assert.equal(speciesCtx.api.reopenSpeciesSelection(sameUnique),'A');
assert.equal(sameUnique.foods[0].name,'a1','same UNIQUE species must keep deterministic food1');
assert.equal(sameUnique.foods[0].needsReview,false);
assert.equal(sameUnique.foods[0].autoResolvedFromSpecies,true);

// Different underlying UNIQUE species should re-resolve food1 to that species.
const differentUnique={
  classification:{status:'UNIQUE',candidates:['A']},
  speciesManualOverride:'B',
  foods:[{name:'',needsReview:true},{name:'a2',needsReview:false},{name:'a3',needsReview:false}]
};
speciesCtx.api.autoResolveFirstFoodForSpecies(differentUnique,'B');
assert.equal(differentUnique.foods[0].name,'b1');
assert.equal(speciesCtx.api.reopenSpeciesSelection(differentUnique),'A');
assert.equal(differentUnique.foods[0].name,'a1');
assert.equal(differentUnique.foods[0].needsReview,false);
assert.equal(differentUnique.foods[0].autoResolvedFromSpecies,true);
assert.match(app,/\.speciesreopen'\)\)b\.addEventListener\('click',e=>\{const r=results\[\+e\.currentTarget\.dataset\.ri\];reopenSpeciesSelection\(r\);/);

// 3) Verified mirror partial failure must revoke attempt-local Blob URLs before fallback.
const paddleCtx={Promise,Error,paddleRuntimeGeneration:7,paddleModelBlobUrls:[],revoked:[]};
paddleCtx.URL={revokeObjectURL(url){paddleCtx.revoked.push(url);}};
paddleCtx.fetchVerifiedPaddleModel=async(kind,urls)=>{
  if(kind==='det'){urls.push('blob:det');return 'blob:det';}
  throw new Error('rec failed');
};
vm.createContext(paddleCtx);
vm.runInContext(`${extractFunction('revokePaddleModelBlobUrls')}\n${extractFunction('prepareVerifiedPaddleModels')}\nthis.prepare=prepareVerifiedPaddleModels;`,paddleCtx);
await assert.rejects(()=>paddleCtx.prepare(7),/rec failed/);
assert.deepEqual(Array.from(paddleCtx.revoked),['blob:det']);
assert.deepEqual(Array.from(paddleCtx.paddleModelBlobUrls),[],'failed mirror attempt must not commit Blob URLs globally');

paddleCtx.revoked.length=0;
paddleCtx.fetchVerifiedPaddleModel=async(kind,urls)=>{const url=`blob:${kind}`;urls.push(url);return url;};
const prepared=await paddleCtx.prepare(7);
assert.equal(prepared.detUrl,'blob:det');
assert.equal(prepared.recUrl,'blob:rec');
assert.deepEqual(Array.from(paddleCtx.revoked),[]);
assert.deepEqual(Array.from(paddleCtx.paddleModelBlobUrls),['blob:det','blob:rec'],'successful mirror attempt must commit both Blob URLs');

paddleCtx.paddleModelBlobUrls.length=0;paddleCtx.revoked.length=0;
await assert.rejects(()=>paddleCtx.prepare(6),/runtime reset superseded model preparation/);
assert.deepEqual(new Set(Array.from(paddleCtx.revoked)),new Set(['blob:det','blob:rec']),'generation mismatch must revoke both attempt-local URLs');
assert.deepEqual(Array.from(paddleCtx.paddleModelBlobUrls),[]);
assert.match(extractFunction('prepareVerifiedPaddleModels'),/Promise\.allSettled/);

// 4) Documentation: Candidate31 old empty-food statement is explicitly marked historical; new species remain deferred.
assert.match(readme,/Candidate 31時点ではLv30未満の食材2・Lv60未満の食材3を空欄で確定できましたが、現行仕様は後続Candidateで変更/);
assert.match(readme,/Candidate 93/);
assert.match(readme,/タマゲタケ／モロバレルは性能データ未確定のため\*\*このCandidateではmasterへ追加していません\*\*/);

// 5) Recognition core remains byte-identical to Candidate92; no speculative new-species data was added.
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
const master=fs.readFileSync(path.join(root,'master_data.js'),'utf8');
assert.equal(master.includes('タマゲタケ'),false);
assert.equal(master.includes('モロバレル'),false);

console.log('OK: Candidate93 species reopen state restoration, deterministic food1 retention, Paddle Blob cleanup, and README maintenance passed');
