import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const index=fs.readFileSync(new URL('index.html',root),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('release.json',root),'utf8'));
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));

function extractFunction(name){
  const markers=[`function ${name}(`,`async function ${name}(`];
  let start=-1;for(const m of markers){start=app.indexOf(m);if(start>=0)break;}
  assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);return app.slice(start,end);
}

// Normal result cards, not only full manual completion, must expose an inline subskill editor.
for(const token of ['subskill-review-block','subskilledit','subskillconfirm','subskill-preview-retry'])assert.ok(app.includes(token),`missing ${token}`);
assert.ok(app.includes("select.foodedit,select.speciesedit,select.subskilledit"),'subskill review select must use the anchored custom picker');
assert.ok(index.includes('.subskillpreview'),'subskill preview styling missing');
assert.ok(index.includes('.subskill-review-visual'),'inline subskill review layout missing');

// Candidate list must never offer a duplicate already used by another slot, while retaining
// OCR-ranked candidates before the full fallback list.
const masterCtx={window:{}};vm.createContext(masterCtx);
vm.runInContext(fs.readFileSync(new URL('master_data.js',root),'utf8'),masterCtx);
const SUBSKILLS=masterCtx.window.POKESLEEP_MASTER.subskills.map(x=>x.ja);
const optCtx={SUBSKILLS,String,Set};vm.createContext(optCtx);
vm.runInContext(`${extractFunction('subskillReviewOptions')}\nthis.subskillReviewOptions=subskillReviewOptions;`,optCtx);
const r={parsed:{subs:[
  {value:'リサーチEXPボーナス',reviewCandidates:[{value:'睡眠EXPボーナス'},{value:'リサーチEXPボーナス'}]},
  {value:'最大所持数アップM'},
  {value:'スキル確率アップS'},
  {value:'げんき回復ボーナス'},
  {value:''}
]}};
const opts=optCtx.subskillReviewOptions(r,0);
assert.equal(opts[0],'睡眠EXPボーナス','OCR review candidate should be prioritized');
assert.ok(opts.includes('リサーチEXPボーナス'),'current non-duplicate OCR value should remain confirmable');
assert.ok(!opts.includes('最大所持数アップM'),'already-used subskill must not be selectable');

// Runtime-only preview Data URLs must remain excluded from checkpoints.
const cloneCtx={JSON,checkpointPersistenceFailure(){throw new Error('unexpected clone failure');}};vm.createContext(cloneCtx);
vm.runInContext(`${extractFunction('checkpointResultClone')}\nthis.checkpointResultClone=checkpointResultClone;`,cloneCtx);
const cloned=cloneCtx.checkpointResultClone({sourceIndex:3,subskillPreviews:['data:image/png;base64,x'],subskillPreviewErrors:['x'],parsed:{nickname:'a'}});
assert.equal(cloned.sourceIndex,3);assert.equal(cloned.subskillPreviews,undefined);assert.equal(cloned.subskillPreviewErrors,undefined);

// A generated result must create only review-slot crops while the decoded source canvas is already available.
assert.ok(app.includes('generateSubskillReviewPreviewsFromCanvas(result,canvas);return result;'));
assert.ok(app.includes('subskillVerificationCrop(canvas,SUB_KEYS[i])'));
assert.ok(app.includes('pendingSubs=subskillReviewSlots(r).filter(i=>!r.subskillPreviews?.[i])'),'restored checkpoints must lazily regenerate missing subskill review crops');

// Confirmation must clear the review flag, persist the edit, and recompute structured/classification state.
assert.match(app,/querySelectorAll\('\.subskillconfirm'\)[\s\S]*?sub\.needsReview=false;[\s\S]*?sub\.manualConfirmed=true;[\s\S]*?recomputeAfterSubskillConfirm\(r\);[\s\S]*?scheduleCheckpointResultSave\(r\)/);
assert.match(app,/querySelectorAll\('\.subskillreopen'\)[\s\S]*?sub\.needsReview=true;[\s\S]*?ensureSubskillReviewPreviews\(r,\[si\]\)/);

console.log('OK: Candidate 81 inline subskill review exposes crop + picker + confirm without full manual completion');
