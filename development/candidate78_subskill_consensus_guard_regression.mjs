import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('release.json',root),'utf8'));
const fixture=JSON.parse(fs.readFileSync(new URL('development/classifier100_fixture.json',root),'utf8'));
const reported=fixture.results.find(x=>x.file==='1000005045.png');
assert.ok(reported,'1000005045.png fixture missing');
assert.equal(reported.parsed.subskills[0],'睡眠EXPボーナス');

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
const ctx={SUBSKILLS,Set,Math,String,Number};vm.createContext(ctx);
for(const name of ['norm','lev','similarity','best','longestCommonRun','exactContainedSubskill','bestSubskill','subskillDistinctiveSupport','subskillEvidenceEntry','subskillEvidenceDecision','consensusSubskillRetryValue']){
  vm.runInContext(`${extractFunction(name)}\nthis.${name}=${name};`,ctx);
}
vm.runInContext("this.SUBSKILL_EXP_PAIR=new Set(['睡眠EXPボーナス','リサーチEXPボーナス']);",ctx);

const ev=(text,source,confidence=90)=>ctx.subskillEvidenceEntry({text,confidence},source,'6','test');

// Reported 1000005045 failure: one pass may call the row Research EXP even though
// independent passes read Sleep EXP. Majority OCR evidence must fix it without classifier help.
let d=ctx.subskillEvidenceDecision([
  ev('リサーチEXPボーナス','fallback',94),
  ev('睡眠EXPボーナス','verify',91),
  ev('睡眠EXPボーナス','psm7',93),
  ev('睡眠EXPボーナス','psm11',92),
],'リサーチEXPボーナス');
assert.equal(d.value,'睡眠EXPボーナス');
assert.equal(d.needsReview,false);

// If independent OCR splits 2-2, never silently pick one as certain.
d=ctx.subskillEvidenceDecision([
  ev('リサーチEXPボーナス','fallback',94),
  ev('睡眠EXPボーナス','verify',91),
  ev('睡眠EXPボーナス','psm7',93),
  ev('リサーチEXPボーナス','psm11',92),
],'リサーチEXPボーナス');
assert.equal(d.value,'リサーチEXPボーナス');
assert.equal(d.needsReview,true);

// Generic suffix-only readings are not enough to auto-confirm an EXP bonus.
d=ctx.subskillEvidenceDecision([
  ev('EXPボーナス','a',95),ev('EXPボーナス','b',94)
],'睡眠EXPボーナス');
assert.equal(d.needsReview,true);

// Apply the same consensus rule to S/M/L families, not only the reported EXP pair.
d=ctx.subskillEvidenceDecision([
  ev('スキル確率アップS','first',90),
  ev('スキル確率アップM','verify',92),
  ev('スキル確率アップM','psm7',91),
],'スキル確率アップS');
assert.equal(d.value,'スキル確率アップM');
assert.equal(d.needsReview,false);

// Structured rescue must not accept a one-off subskill retry merely because classifier likes it.
assert.equal(ctx.consensusSubskillRetryValue([{text:'リサーチEXPボーナス',confidence:95,psm:'7',crop:'primary'}]),'');
assert.equal(ctx.consensusSubskillRetryValue([
  {text:'睡眠EXPボーナス',confidence:91,psm:'7',crop:'primary'},
  {text:'睡眠EXPボーナス',confidence:89,psm:'11',crop:'section-relative'}
]),'睡眠EXPボーナス');

assert.ok(app.includes('parsed=await verifySubskills(canvas,rawFirstPass,raw,parsed,idx,total)'));
assert.ok(app.includes("raw._subskillVerification=verifyRaw"));
assert.ok(app.includes("const v=consensusSubskillRetryValue(a)"));
assert.ok(app.includes("subReview.has(i)?'':(p.subs?.[i]?.value||'')"),'review-required subskills must be blank in CSV');
assert.ok(app.includes("r?.parsed?.subs?.[i]?.needsReview&&(v||!myth)"));

console.log('OK: Candidate 78 subskill OCR consensus guard prevents silent cross-label misrecognition');
