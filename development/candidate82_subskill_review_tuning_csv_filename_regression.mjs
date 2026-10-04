import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const validation=JSON.parse(fs.readFileSync(new URL('development/candidate82_subskill_review_tuning_validation.json',root),'utf8'));

function extractFunction(name){
  const markers=[`function ${name}(`,`async function ${name}(`];
  let start=-1;for(const m of markers){start=app.indexOf(m);if(start>=0)break;}
  assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);return app.slice(start,end);
}

const cctx={window:{}};vm.createContext(cctx);
vm.runInContext(fs.readFileSync(new URL('master_data.js',root),'utf8'),cctx);
const SUBSKILLS=cctx.window.POKESLEEP_MASTER.subskills.map(x=>x.ja);
const ctx={SUBSKILLS,Set,Math,String,Number,Date};vm.createContext(ctx);
for(const name of ['norm','lev','similarity','best','longestCommonRun','exactContainedSubskill','bestSubskill','subskillDistinctiveSupport','subskillEvidenceEntry','subskillEvidenceDecision','csvDownloadTimestamp','csvDownloadFilename']){
  vm.runInContext(`${extractFunction(name)}\nthis.${name}=${name};`,ctx);
}
vm.runInContext("this.SUBSKILL_EXP_PAIR=new Set(['睡眠EXPボーナス','リサーチEXPボーナス']);",ctx);

// All 11 nonblank review slots in the supplied 100-image diagnostics were manually verified by the user as correct.
// Candidate82 should accept these exact OCR patterns without weakening EXP/conflict safeguards.
for(const c of validation.cases){
  const entries=c.evidence.map(e=>ctx.subskillEvidenceEntry({text:e.text,confidence:e.confidence},e.source,e.psm,e.crop));
  const d=ctx.subskillEvidenceDecision(entries,c.current);
  assert.equal(d.value,c.current,`${c.file} Lv${c.level}: changed value`);
  assert.equal(d.needsReview,false,`${c.file} Lv${c.level}: false review remained`);
}

// Noisy OCR that still contains the complete skill label should count as exact evidence.
let b=ctx.bestSubskill('| ee noise | 最大所持数アップM');
assert.equal(b.value,'最大所持数アップM');
assert.equal(b.score,1);

// A single moderately strong reading can only clear review if it supports the already parsed value.
const one=ctx.subskillEvidenceEntry({text:'らい 7 スキ , ルル 確率 アッ プ S',confidence:67.1658},'composite','6','primary');
let d=ctx.subskillEvidenceDecision([one],'スキル確率アップS');
assert.equal(d.needsReview,false);
d=ctx.subskillEvidenceDecision([one],'スキル確率アップM');
assert.equal(d.needsReview,true,'single OCR must not replace a different current value');

// EXP pair remains conservative even for an exact high-confidence single read.
const exp=ctx.subskillEvidenceEntry({text:'睡眠EXPボーナス',confidence:99},'composite','6','primary');
d=ctx.subskillEvidenceDecision([exp],'睡眠EXPボーナス');
assert.equal(d.needsReview,true,'EXP single read must still require independent confirmation');

// Conflicting valid labels remain review-required.
const s=ctx.subskillEvidenceEntry({text:'スキル確率アップS',confidence:95},'a','6','x');
const m=ctx.subskillEvidenceEntry({text:'スキル確率アップM',confidence:95},'b','6','x');
d=ctx.subskillEvidenceDecision([s,m],'スキル確率アップS');
assert.equal(d.needsReview,true);

// CSV filename is local-date/time stamped, avoiding the old fixed-name overwrite behavior.
const fixed=new Date(2026,9,4,14,27,31);
assert.equal(ctx.csvDownloadTimestamp(fixed),'20261004-142731');
assert.equal(ctx.csvDownloadFilename(fixed),'pokesleep_ocr_integrated_v12_20261004-142731.csv');
assert.ok(app.includes('csvDownloadFilename()'));
assert.ok(!app.includes("'pokesleep_ocr_integrated_v12.csv'"));

console.log(`OK: Candidate 82 clears ${validation.cases.length} verified false-positive subskill reviews while preserving conflict/EXP guards; CSV filenames are timestamped`);
