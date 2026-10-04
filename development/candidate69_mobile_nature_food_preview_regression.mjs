import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const index=fs.readFileSync(new URL('index.html',root),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('release.json',root),'utf8'));

assert.match(release.id,/^\d{4}-\d{2}-\d{2}-candidate\d+-/,'release id must use the current candidate format');
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`),'checkpoint release id must match Candidate 69');

// Browser/runtime consistency: do not leave the major-only Tesseract URL in the production page.
assert.ok(index.includes('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'),'Tesseract.js must be pinned to 5.1.1');
assert.ok(!index.includes('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'),'major-only Tesseract URL must not remain');

// Legacy 691x1536 layouts must use dedicated nature OCR without blindly replacing
// a usable first-pass value with one valid-looking retry. Candidate 71 records multiple
// readings and resolves disagreements instead of accepting a single dictionary-valid word.
assert.ok(app.includes("natureEvidenceEntry(raw.nature,'composite','6')"),'legacy nature flow must keep composite OCR evidence');
assert.ok(app.includes("'せいかく確認2',idx,total,{psm:'11'}"),'legacy nature flow must include a second single-line/sparse read');
assert.ok(app.includes('applyNatureEvidence(parsed,['),'legacy nature reads must be arbitrated together');
assert.ok(!app.includes("raw.natureDedicated=nr;const nb=parseNatureText(nr.text);if(nb.score>=.55){parsed.nature=nb.value"),'a single dedicated nature read must not blindly overwrite the first-pass value');

// Review-screen food crops must be generated lazily after a species confirmation,
// without opening the full manual-completion editor.
assert.ok(app.includes('async function ensureFoodReviewPreviews(r){'),'lazy food-review preview helper must exist');
assert.ok(app.includes("const pending=[0,1,2].filter(i=>{const f=r.foods?.[i];return (f?.needsReview||!String(f?.name||'').trim())&&!r.foodPreviews[i];});"),'only missing unresolved/review food previews should be generated');
for(const cls of ['.species-single-confirm','.speciesconfirm']){
  const escaped=cls.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(app,new RegExp(`querySelectorAll\\('${escaped}'\\)\\)b\\.addEventListener\\('click',async e=>\\{[^}]*[\\s\\S]*?await ensureFoodReviewPreviews\\(r\\);`),`${cls} must await lazy food preview generation`);
}
assert.match(app,/querySelectorAll\('\.foodreopen'\)\)b\.addEventListener\('click',async e=>\{[\s\S]*?await ensureFoodReviewPreviews\(r\);/,'reopened food review should also get its crop when missing');

function extractAsyncFunction(name){
  const marker=`async function ${name}(`;const start=app.indexOf(marker);assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);return app.slice(start,end);
}
const generated=[];let decodeCount=0;
const previewCtx={
  console:{warn(){}},
  imageToCanvas:async()=>{decodeCount++;return {};},
  POKESLEEP_FOOD_MATCHER:{cropFood(_canvas,key){generated.push(key);return {toDataURL:()=>`data:${key}`};}}
};
vm.createContext(previewCtx);
vm.runInContext(`${extractAsyncFunction('ensureFoodReviewPreviews')}
this.ensureFoodReviewPreviews=ensureFoodReviewPreviews;`,previewCtx);
const previewResult={sourceFile:{},foodPreviews:['keep','','already'],foods:[{name:'ピュアなオイル',needsReview:false},{name:'',needsReview:true},{name:'めざましコーヒー',needsReview:true}]};
assert.equal(await previewCtx.ensureFoodReviewPreviews(previewResult),true);
assert.equal(decodeCount,1,'lazy food preview generation should decode the source once');
assert.deepEqual(generated,['food2'],'only the missing review/blank food crop should be generated');
assert.equal(previewResult.foodPreviews[0],'keep');assert.equal(previewResult.foodPreviews[1],'data:food2');assert.equal(previewResult.foodPreviews[2],'already');

// The reported screenshot is classifier-sensitive to nature: correct nature uniquely yields Shuckle,
// while a wrong nature breaks exact species inference. This guards the reason for the dedicated retry.
const ctx={window:{}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('master_data.js',root),'utf8'),ctx);
vm.runInContext(fs.readFileSync(new URL('classifier.js',root),'utf8'),ctx);
const C=ctx.window.POKESLEEP_CLASSIFIER;
const base={level:22,sp:787,helpSeconds:3707,carry:16,skillLevel:1,mainSkill:'きのみジュース (げんきオールS)',subskills:['スキル確率アップM','スキル確率アップS','最大所持数アップS','最大所持数アップL','食材確率アップS']};
const correct=C.inferWithoutFoods({...base,nature:'おくびょう'});
const wrong=C.inferWithoutFoods({...base,nature:'てれや'});
assert.equal(correct.status,'UNIQUE');assert.deepEqual([...correct.candidates],['ツボツボ']);
assert.equal(wrong.status,'NO_EXACT_MATCH');

const expectedCore={
  'classifier.js':'93a1fbe56887ae9683409ca5db48563f18c78711aedac01b8758510768ec7c71',
  'master_data.js':'403b28544bf650323b1c5d2c1cde4b71be09d6897949cf6ea8c6cf896fc3a8f5',
  'food_matcher.js':'68f20e2ce1ab45222824669514eaa62077add12dfe8949658caf0f6a9589c9a7',
  'food_features.js':'d5f68af858d37abfbdfad50138f9f9bd5dc6cdc7bf91ea56f5e0b684e9b61750',
  'food_color_features.js':'e00286ae2e8fe96d6f0b49c93e03150469175382ba09c62b499e6f33d85ae444'
};
for(const [file,expected] of Object.entries(expectedCore)){
  const got=crypto.createHash('sha256').update(fs.readFileSync(new URL(file,root))).digest('hex');
  assert.equal(got,expected,`${file} recognition core changed unexpectedly`);
}

console.log('OK: Candidate 69 legacy-nature robustness + lazy review food preview regression passed');
