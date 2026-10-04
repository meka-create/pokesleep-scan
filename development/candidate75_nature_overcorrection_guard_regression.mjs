import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=new URL('../',import.meta.url);
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('release.json',root),'utf8'));
const fixture=JSON.parse(fs.readFileSync(new URL('development/classifier100_fixture.json',root),'utf8'));
assert.ok(typeof release.id==='string'&&release.id.length>0,'current release id must be present');
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));
assert.ok(app.includes('function blockClassifierOnlyNatureSuggestion(parsed,diag)'));
assert.ok(app.includes("diag.attempts.natureClassifierOnlySuggestion={blocked:true"));
assert.ok(app.includes("reason:'classifier-only nature correction is unsafe without OCR support'"));
assert.ok(!app.includes("reason:'nature-classifier-exhaustive-rescue'"),'classifier-only 25-nature result must never auto-apply');

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
vm.runInContext(fs.readFileSync(new URL('classifier.js',root),'utf8'),cctx);
const M=cctx.window.POKESLEEP_MASTER,C=cctx.window.POKESLEEP_CLASSIFIER;

// Find a real regression fixture where a small error in another field can be
// "explained" by changing only nature. This is precisely the dangerous case
// that Candidate 71's exhaustive rescue could silently auto-confirm.
let counterexample=null;
for(const row of fixture.results){
  const base=row.parsed;
  for(const delta of [-2,-1,1,2]){
    const changed={...base,sp:Number(base.sp)+delta};
    if(C.inferWithoutFoods(changed).status!=='NO_EXACT_MATCH')continue;
    const hits=[];
    for(const nature of M.natures.map(x=>x.ja)){
      const inf=C.inferWithoutFoods({...changed,nature});
      if(inf.status==='UNIQUE')hits.push({nature,species:inf.candidates[0]});
    }
    const species=[...new Set(hits.map(x=>x.species))],natures=[...new Set(hits.map(x=>x.nature))];
    if(species.length===1&&natures.length===1&&natures[0]!==base.nature){counterexample={row,changed,suggestion:hits[0]};break;}
  }
  if(counterexample)break;
}
assert.ok(counterexample,'fixture should contain at least one classifier-only nature overcorrection counterexample');

const ctx={
  NATURES:M.natures.map(x=>x.ja),
  POKESLEEP_CLASSIFIER:C,
  MAIN_SKILLS:M.mainSkills||[],
};
vm.createContext(ctx);
for(const name of ['observedFromParsed','inferParsed','norm','lev','similarity','best','applyStructuredValues','candidateProduct','testStructuredCandidates','chooseUniqueRescue','blockClassifierOnlyNatureSuggestion']){
  vm.runInContext(`${extractFunction(name)}\nthis.${name}=${name};`,ctx);
}
const src=counterexample.changed;
const parsed={...src,subs:(src.subskills||[]).map(value=>({value,score:1})),natureNeedsReview:false};
delete parsed.subskills;
const before=parsed.nature;
const diag={attempts:{}};
const suggestion=ctx.blockClassifierOnlyNatureSuggestion(parsed,diag);
assert.ok(suggestion,'classifier-only alternative should be detected diagnostically');
assert.notEqual(suggestion.vals.nature,before);
assert.equal(parsed.nature,before,'classifier-only suggestion must not mutate the recognized nature');
assert.equal(parsed.natureNeedsReview,true,'unsafe classifier-only discrepancy must remain user-reviewable');
assert.equal(diag.attempts.natureClassifierOnlySuggestion.blocked,true);
assert.equal(diag.attempts.natureClassifierOnlySuggestion.value,suggestion.vals.nature);

// Preserve the safe part of Candidate 71: OCR-supported nature evidence can
// still be resolved by classifier consistency for the reported Shuckle row.
const reported=fixture.results.find(x=>x.file==='1000005041.png');
assert.ok(reported,'1000005041.png fixture missing');
const reportedBase={...reported.parsed};
assert.equal(C.inferWithoutFoods({...reportedBase,nature:'おくびょう'}).status,'UNIQUE');
assert.equal(C.inferWithoutFoods({...reportedBase,nature:'てれや'}).status,'NO_EXACT_MATCH');

console.log('OK: Candidate 75 blocks classifier-only nature overcorrection while retaining OCR-supported nature handling');
console.log('counterexample:',counterexample.row.file,'SP',counterexample.row.parsed.sp,'->',counterexample.changed.sp,'nature',counterexample.row.parsed.nature,'suggested',counterexample.suggestion.nature,'species',counterexample.suggestion.species);
