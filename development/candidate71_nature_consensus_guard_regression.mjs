import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('release.json',root),'utf8'));
assert.match(release.id,/^\d{4}-\d{2}-\d{2}-candidate\d+-/);
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));

assert.ok(app.includes("natureEvidenceEntry(raw.nature,'composite','6')"),'composite nature OCR must remain evidence');
assert.ok(app.includes("'せいかく確認',idx,total,{psm:'7'}"),'PSM7 dedicated nature read required');
assert.ok(app.includes("'せいかく確認2',idx,total,{psm:'11'}"),'PSM11 dedicated nature read required');
assert.ok(app.includes('resolveNatureEvidenceByClassifier(parsed)'),'conflicting nature evidence must be classifier-checked');
assert.ok(app.includes("inference.status==='NO_EXACT_MATCH'&&!layoutInfo(canvas).adaptive"),'legacy NO_EXACT_MATCH nature guard must remain scoped to non-adaptive layout');
assert.ok(app.includes('blockClassifierOnlyNatureSuggestion(parsed,diag)'),'classifier-only nature suggestion must be blocked rather than auto-applied');
assert.ok(!app.includes("reason:'nature-classifier-exhaustive-rescue'"),'unsafe exhaustive nature auto-rescue must not return');
assert.match(app,/function natureDataNeedsReview\(r\)\{return !!r\?\.parsed\?\.natureNeedsReview\|\|!validNatureValue/,'valid-looking but conflicting nature must stay in review');

function extractFunction(name){
  const markers=[`function ${name}(`,`async function ${name}(`];
  let start=-1;for(const m of markers){start=app.indexOf(m);if(start>=0)break;}
  assert.ok(start>=0,`missing ${name}`);
  const bodyStart=app.indexOf('{',start);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);return app.slice(start,end);
}

const NATURES=['てれや','おくびょう','まじめ'];
const ctx={NATURES};vm.createContext(ctx);
for(const name of ['norm','lev','similarity','best','parseNatureText','validNatureValue','uniqVals','natureEvidenceEntry','natureEvidenceValues','applyNatureEvidence']){
  vm.runInContext(`${extractFunction(name)}\nthis.${name}=${name};`,ctx);
}
const parsed={nature:'おくびょう',natureScore:.6};
const evidence=[
  ctx.natureEvidenceEntry({text:'3 お く び ょ う / e',confidence:66},'composite','6'),
  ctx.natureEvidenceEntry({text:'てれや',confidence:91},'dedicated','7'),
  ctx.natureEvidenceEntry({text:'おくびょう',confidence:88},'dedicated','11')
];
ctx.applyNatureEvidence(parsed,evidence);
assert.equal(parsed.nature,'おくびょう','2-vs-1 nature evidence must preserve the consensus value');
assert.equal(parsed.natureNeedsReview,false);
assert.equal(parsed.natureEvidenceConflict,true);

const tied={nature:'おくびょう',natureScore:.6};
ctx.applyNatureEvidence(tied,[
  ctx.natureEvidenceEntry({text:'おくびょう',confidence:66},'composite','6'),
  ctx.natureEvidenceEntry({text:'てれや',confidence:91},'dedicated','7'),
  ctx.natureEvidenceEntry({text:'???',confidence:15},'dedicated','11')
]);
assert.equal(tied.nature,'おくびょう','a tie must not let one retry silently replace the existing first-pass value');
assert.equal(tied.natureNeedsReview,true,'unresolved valid-name disagreement must be reviewable');

// Reported 1000005041.png structured values: only Timid (おくびょう) is a UNIQUE classifier match.
const cctx={window:{}};vm.createContext(cctx);
vm.runInContext(fs.readFileSync(new URL('master_data.js',root),'utf8'),cctx);
vm.runInContext(fs.readFileSync(new URL('classifier.js',root),'utf8'),cctx);
const C=cctx.window.POKESLEEP_CLASSIFIER,M=cctx.window.POKESLEEP_MASTER;
const base={level:22,sp:787,helpSeconds:3707,carry:16,skillLevel:1,mainSkill:'きのみジュース (げんきオールS)',subskills:['スキル確率アップM','スキル確率アップS','最大所持数アップS','最大所持数アップL','食材確率アップS']};
const successes=[];
for(const nature of M.natures.map(x=>x.ja)){
  const inf=C.inferWithoutFoods({...base,nature});
  if(inf.status==='UNIQUE')successes.push({nature,species:inf.candidates[0]});
}
assert.deepEqual(successes,[{nature:'おくびょう',species:'ツボツボ'}]);
assert.equal(C.inferWithoutFoods({...base,nature:'てれや'}).status,'NO_EXACT_MATCH');

console.log('OK: Candidate 71 nature consensus / classifier guard regression passed');
