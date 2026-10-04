import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const release=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));

function extractFunction(name){
  const markers=[`function ${name}(`,`async function ${name}(`];let start=-1;
  for(const m of markers){start=app.indexOf(m);if(start>=0)break;}assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);return app.slice(start,end);
}

assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));
assert.ok(app.includes("CHECKPOINT_COMPATIBILITY_ID='checkpoint-compat-2026-10-04-v1'"));

// Candidate89 runtime shadow benchmark is intentionally removed.
for(const forbidden of ['function preprocessClahe(','collectSubskillShadowBenchmark','collectUnlockShadowBenchmark','shadowBenchmarkConfig','shadowBenchmark:r.shadowBenchmark','shadow-threshold150','shadow-threshold160','shadow-clahe']){
  assert.equal(app.includes(forbidden),false,`obsolete Candidate89 shadow runtime remains: ${forbidden}`);
}
for(const obsolete of ['candidate89_shadow_benchmark_regression.mjs','candidate89_shadow_benchmark_validation.json','candidate89_preprocess_baseline_report.json']){
  assert.equal(fs.existsSync(path.join(here,obsolete)),false,`obsolete Candidate89 benchmark artifact remains: ${obsolete}`);
}

assert.ok(fs.existsSync(path.join(root,'assets','food-empty-reference.png')),'empty-food reference asset missing');
assert.match(sw,/assets\/food-empty-reference\.png/,'empty-food reference asset not precached');
assert.match(app,/NO_FOOD_EMPTY_SCORE_MIN=\.50,NO_FOOD_EMPTY_MARGIN_MIN=\.10/);
assert.match(app,/inference\?\.status==='UNIQUE'&&inference\?\.candidates\?\.length===1/,'UNIQUE species guard missing');
assert.match(app,/noneFoodAllowed\(species,i\).*f\.allowed\.includes\(NO_FOOD\)/s,'legal species/slot guard missing');
assert.match(app,/foods=await applySafeNoFoodTemplate\(canvas,inference,foods\);const safeFood=resolveFoodsSafely/,'safe no-food decision must run before food-based classification');
assert.match(app,/noFoodTemplateConfig:\{schema:1,scoreMin:NO_FOOD_EMPTY_SCORE_MIN,marginMin:NO_FOOD_EMPTY_MARGIN_MIN/,'diagnostic config missing');

const noFoodCtx={Number,NO_FOOD_EMPTY_SCORE_MIN:.50,NO_FOOD_EMPTY_MARGIN_MIN:.10};vm.createContext(noFoodCtx);
vm.runInContext(`${extractFunction('noFoodTemplateEligible')}\nthis.test=noFoodTemplateEligible;`,noFoodCtx);
assert.equal(noFoodCtx.test(true,0.589109,0.439723),true,'validated Mew positive must pass');
assert.equal(noFoodCtx.test(true,0.50,0.40),true,'boundary score/margin must pass');
assert.equal(noFoodCtx.test(true,0.499999,0.30),false,'score below threshold must fail');
assert.equal(noFoodCtx.test(true,0.55,0.46),false,'margin below threshold must fail');
assert.equal(noFoodCtx.test(false,0.90,0.10),false,'illegal species/slot must never pass');
assert.equal(noFoodCtx.test(true,0.51,NaN),false,'current releases fail closed when regular-best evidence is non-finite');

const paddleCtx={};vm.createContext(paddleCtx);vm.runInContext(`${extractFunction('paddleVerifiedModelDigestAvailable')}\nthis.test=paddleVerifiedModelDigestAvailable;`,paddleCtx);
assert.equal(paddleCtx.test(),false,'missing WebCrypto must report unavailable');
paddleCtx.crypto={subtle:{digest(){}}};assert.equal(paddleCtx.test(),true,'WebCrypto digest must report available');
assert.match(app,/if\(!paddleVerifiedModelDigestAvailable\(\)\)throw new Error\('WebCrypto SHA-256 is unavailable; verified model mirror skipped'\)/,'defensive pre-fetch guard missing');
assert.match(app,/skipped:true,reason:'webcrypto-subtle-digest-unavailable'/,'explicit mirror skip diagnostic missing');
const skipPos=app.indexOf("reason:'webcrypto-subtle-digest-unavailable'");
const mirrorFetchPos=app.indexOf("Promise.all([fetchVerifiedPaddleModel('det'),fetchVerifiedPaddleModel('rec')])");
assert.ok(skipPos>=0&&mirrorFetchPos>skipPos,'WebCrypto skip branch must precede verified mirror fetch branch');
assert.match(app,/configs\.push\(\{name:'official-auto-fallback'/,'official fallback missing');

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
console.log('OK: Candidate90 removes Candidate89 shadow runtime, safely promotes NO_FOOD template gating, and skips verified mirror when WebCrypto digest is unavailable');
