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
  for(const m of markers){start=app.indexOf(m);if(start>=0)break;}assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);return app.slice(start,end);
}

assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));
assert.ok(app.includes("CHECKPOINT_COMPATIBILITY_ID='checkpoint-compat-2026-10-04-v1'"));

// 1) Verified mirror downloads must not monkey-patch global fetch in parallel.
const verifiedFn=extractFunction('fetchVerifiedPaddleModel');
assert.match(verifiedFn,/paddleFetchWithTrace\('verified-model-download:'\+kind,url,\{cache:'force-cache'\}\)/);
assert.equal(verifiedFn.includes('withPaddleFetchTrace('),false,'verified mirror must not use temporary global fetch monkey-patch');
const directTraceFn=extractFunction('paddleFetchWithTrace');
assert.equal(directTraceFn.includes('globalThis.fetch='),false,'direct model fetch trace must not assign global fetch');
const traceCtx={paddleInitDiagnostics:{fetchTrace:[]},performance:{now:(()=>{let n=0;return()=>++n;})()},String,Error};
traceCtx.globalThis=traceCtx;
const originalFetch=async input=>({ok:true,status:200,statusText:'OK',url:String(input),type:'cors',headers:{get:()=> 'application/x-tar'}});
traceCtx.fetch=originalFetch;vm.createContext(traceCtx);vm.runInContext(`${extractFunction('fetchTraceUrl')}\n${directTraceFn}\nthis.test=paddleFetchWithTrace;`,traceCtx);
await Promise.all([traceCtx.test('a','https://example.test/a'),traceCtx.test('b','https://example.test/b')]);
assert.equal(traceCtx.fetch,originalFetch,'parallel direct traces must leave global fetch untouched');
assert.equal(traceCtx.paddleInitDiagnostics.fetchTrace.length,2);

// 2) Empty-reference load failure must be retryable in the same session.
const emptyCtx={CHECKPOINT_RELEASE_ID:release.id,encodeURIComponent,String,Error,attempts:0};
emptyCtx.Image=class {constructor(){this.naturalWidth=48;this.naturalHeight=48;this.width=48;this.height=48;}set src(_){emptyCtx.attempts++;const fail=emptyCtx.attempts===1;Promise.resolve().then(()=>fail?this.onerror?.():this.onload?.());}};
emptyCtx.document={createElement(type){assert.equal(type,'canvas');return {width:0,height:0,getContext(){return {drawImage(){}};}};}};
vm.createContext(emptyCtx);vm.runInContext(`let foodEmptyReferenceCanvasPromise=null;\n${extractFunction('loadFoodEmptyReferenceCanvas')}\nthis.test=loadFoodEmptyReferenceCanvas;`,emptyCtx);
await assert.rejects(()=>emptyCtx.test(),/食材なし参照画像/);
await emptyCtx.test();
assert.equal(emptyCtx.attempts,2,'failed reference load must be attempted again');

// 3) NO_FOOD must fail closed when regular-best evidence is not finite.
const noFoodCtx={Number,NO_FOOD_EMPTY_SCORE_MIN:.50,NO_FOOD_EMPTY_MARGIN_MIN:.10};vm.createContext(noFoodCtx);
vm.runInContext(`${extractFunction('noFoodTemplateEligible')}\nthis.test=noFoodTemplateEligible;`,noFoodCtx);
assert.equal(noFoodCtx.test(true,0.589109,0.439723),true);
assert.equal(noFoodCtx.test(true,0.50,0.40),true);
assert.equal(noFoodCtx.test(true,0.51,NaN),false,'NO_FOOD must fail closed without finite regular-best evidence');
assert.equal(noFoodCtx.test(false,0.90,0.10),false);

// 4) Candidate90 real-device issue: locked food3 dimmed-shape arbitration becomes review-only.
const food3Ctx={Number,String};vm.createContext(food3Ctx);vm.runInContext(`${extractFunction('guardLockedFood3DimmedArbitration')}\nthis.test=guardLockedFood3DimmedArbitration;`,food3Ctx);
let foods=[{name:'a'},{name:'b'},{name:'つやつやアボカド',needsReview:false,dimmedShapeArbitration:true}];
food3Ctx.test(foods,35);assert.equal(foods[2].needsReview,true);assert.equal(foods[2].reviewReason,'locked-food3-dimmed-shape-arbitration');
foods=[{name:'a'},{name:'b',needsReview:false,dimmedShapeArbitration:true},{name:'c',needsReview:false}];food3Ctx.test(foods,20);assert.equal(foods[1].needsReview,false,'food2 rescue behavior must remain unchanged');
foods=[{name:'a'},{name:'b'},{name:'c',needsReview:false,dimmedShapeArbitration:true}];food3Ctx.test(foods,60);assert.equal(foods[2].needsReview,false,'unlocked food3 must not be changed');
assert.match(app,/guardLockedFood3DimmedArbitration\(markFoodReviews\(POKESLEEP_FOOD_MATCHER\.resolveSlots\(canvas,inference,parsed\.level\)\),parsed\.level\)/);

// 5) Manual species change must revalidate all food slots and expose illegal values for correction.
const speciesCtx={window:{POKESLEEP_MASTER:{pokemon:[
  {name:'A',profiles:[['a1','a2','a3'],['a1','x2','x3']]},
  {name:'B',profiles:[['b1','b2','b3']]}
]}},POKESLEEP_CLASSIFIER:{profiles(sp){return sp.profiles.map(xs=>({items:xs.map(name=>({name}))}));}},String,Set,Array};
speciesCtx.chosenSpecies=r=>r.species;
vm.createContext(speciesCtx);
vm.runInContext(`${extractFunction('speciesMasterRows')}\n${extractFunction('manualProfilesForSpecies')}\n${extractFunction('speciesFoodReviewSlots')}\n${extractFunction('revalidateFoodsForSpecies')}\n${extractFunction('foodSlotNeedsReview')}\nthis.slots=speciesFoodReviewSlots;this.revalidate=revalidateFoodsForSpecies;this.needs=foodSlotNeedsReview;`,speciesCtx);
const row={species:'B',foods:[{name:'b1',needsReview:false},{name:'a2',needsReview:false},{name:'a3',needsReview:false}]};
assert.deepEqual(Array.from(speciesCtx.slots('B',row.foods)),[1,2]);speciesCtx.revalidate(row,'B');
assert.equal(row.foods[1].needsReview,true);assert.equal(row.foods[2].needsReview,true);assert.equal(row.foods[1].reviewReason,'species-food-conflict');
assert.equal(speciesCtx.needs(row,1),true);
assert.match(app,/speciesManualOverride=v;autoResolveFirstFoodForSpecies\(r,v\);revalidateFoodsForSpecies\(r,v\)/);
assert.match(app,/if\(foodSlotNeedsReview\(r,i\)\)/,'inline food UI must open for illegal species-food combinations');
assert.match(app,/illegal=new Set\([^;]*speciesFoodReviewSlots\(species,r\.foods\)[^;]*\)/,'CSV preflight must block illegal species-food combinations');

// 6) README/current-spec cleanup and intentional preflight-policy preservation.
assert.match(readme,/CSV保存\/コピーを止め/);
assert.match(readme,/pokesleep_ocr_integrated_v12_YYYYMMDD-HHMMSS\.csv/);
assert.match(readme,/pokesleep_ocr_v12_diagnostics_YYYYMMDD-HHMMSS\.json/);
assert.match(readme,/WebCrypto.*official-auto-fallback/s);
assert.match(readme,/Candidate91/);
assert.match(app,/function csvWarnings\(\).*ニックネーム要確認/s,'non-blocking warning policy remains present');

// Recognition core remains byte-identical.
const coreHashes={
 'classifier.js':'93a1fbe56887ae9683409ca5db48563f18c78711aedac01b8758510768ec7c71',
 'master_data.js':'403b28544bf650323b1c5d2c1cde4b71be09d6897949cf6ea8c6cf896fc3a8f5',
 'food_matcher.js':'68f20e2ce1ab45222824669514eaa62077add12dfe8949658caf0f6a9589c9a7',
 'food_features.js':'d5f68af858d37abfbdfad50138f9f9bd5dc6cdc7bf91ea56f5e0b684e9b61750',
 'food_color_features.js':'e00286ae2e8fe96d6f0b49c93e03150469175382ba09c62b499e6f33d85ae444'
};
for(const [file,expected] of Object.entries(coreHashes)){
 const got=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');assert.equal(got,expected,`${file} changed unexpectedly`);
}
console.log('OK: Candidate91 audit fixes, species-food safety, locked food3 review guard, and documentation checks passed');
