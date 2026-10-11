'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function segment(first,last){
 const a=src.indexOf(first),b=src.indexOf(last,a+first.length);
 assert.ok(a>=0&&b>a,'Missing production function: '+first);
 return src.slice(a,b);
}
function safetyApi(){
 const ctx={
  validPokemonLevelValue:n=>Number.isInteger(n)&&n>=1&&n<=100,
  speciesNeedsReview:r=>r.classification?.status!=='UNIQUE'&&!r.speciesManualOverride,
  applyNicknameSafety:()=>{}
 };
 vm.createContext(ctx);
 vm.runInContext(segment('function weakThirdFoodEvidence(foods){','function foodConflictReviewSlots('),ctx);
 return ctx;
}
function makeRow(status='UNIQUE'){
 return {
  file:'synthetic.png',classification:{status},
  parsed:{level:25,mainSkill:'げんきエールS',subs:[{value:'きのみの数S'},{value:'最大所持数アップS'}]},
  raw:{mainskill:{confidence:90}},
  foods:[
   {method:'db-inferred',name:'a'},
   {method:'db-inferred',name:'b'},
   {method:'image',name:'c',score:.97,secondScore:.71,needsReview:false}
  ]
 };
}
test('unresolved species never silently confirms OCR level or main skill',()=>{
 const ctx=safetyApi(),r=makeRow('MISSING_INPUT'),prior=r.parsed.level;
 ctx.applyResultReviewSafetyGuards(r);
 assert.equal(r.parsed.level,prior,'Safety check must not rewrite OCR values');
 assert.equal(r.parsed.levelNeedsReview,true);
 assert.equal(r.parsed.mainSkillNeedsReview,true);
 assert.match(r.parsed.levelReviewReason,/species-unresolved/);
 assert.match(r.parsed.mainSkillReviewReason,/species-unresolved/);
 // Sticky even when the user later manually selects a species.
 r.speciesManualOverride='Synthetic confirmed species';
 ctx.applyResultReviewSafetyGuards(r);
 assert.equal(r.parsed.levelNeedsReview,true);
 assert.equal(r.parsed.mainSkillNeedsReview,true);
});
test('unique species and strong third-food evidence are not reflagged',()=>{
 const ctx=safetyApi(),r=makeRow();
 ctx.applyResultReviewSafetyGuards(r);
 assert.equal(!!r.parsed.levelNeedsReview,false);
 assert.equal(!!r.parsed.mainSkillNeedsReview,false);
 assert.equal(r.foods[2].needsReview,false);
});
test('weak independent image evidence must cause user review, not a guessed substitute',()=>{
 const ctx=safetyApi(),r=makeRow();
 r.foods[2]={method:'image',name:'mushroom',score:.8524,second:'tomato',secondScore:.7127,needsReview:false};
 ctx.applyResultReviewSafetyGuards(r);
 assert.equal(r.foods[2].name,'mushroom');
 assert.equal(r.foods[2].needsReview,true);
 assert.equal(r.foods[2].reviewReason,'weak-third-food-image-with-inferred-preceding-slots');
});
test('manual food overrides remain authoritative',()=>{
 const ctx=safetyApi(),r=makeRow();
 r.foods[2]={method:'image',name:'tomato',score:.83,secondScore:.72,manualOverride:true};
 ctx.applyResultReviewSafetyGuards(r);
 assert.equal(!!r.foods[2].needsReview,false);
});
test('existing review, legacy fallbacks and manual validation remain connected',()=>{
 assert.match(src,/function levelDataNeedsReview\(r\)\{return !!r\?\.parsed\?\.levelNeedsReview/);
 assert.match(src,/p\.levelNeedsReview=false;delete p\.levelReviewReason/);
 assert.match(src,/levelRows\+\+;details\.push\(\{ri,file:label,issue:'レベルを再確認してください'/);
 assert.match(src,/blocked:speciesRows>0\|\|levelRows>0\|\|skillLevelRows>0/);
 assert.match(src,/function crop\(canvas,key,scale=1\)/);
 assert.match(src,/window\.POKESLEEP_ANDROID_ROI\?\.inspect\(canvas\)/);
 assert.doesNotMatch(src,/reviewQueueSummary|pendingReviewItemCount|nextReview/);
});
