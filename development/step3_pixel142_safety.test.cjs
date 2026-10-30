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
  applyNicknameSafety:()=>{},
  FOOD_REVIEW_MARGIN:.015
 };
 vm.createContext(ctx);
 // Review-guard extraction must include dependencies also used by the
 // full application. Test the real functions rather than mocking away safety.
 vm.runInContext(segment('function hasUnreviewedDimmedFoodConflict(f){','function guardLockedFood3DimmedArbitration('),ctx);
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


function mythicalSubskillApi(){
 const ctx={
  NO_SUBSKILL:'―',LEVELS:[10,25,50,70,80],
  SUBSKILLS:['きのみの数S','おてつだいスピードM','最大所持数アップS'],
  speciesIsMythical:name=>name==='ミュウ'||name==='ダークライ',
  chosenSpecies:r=>r.species,
  foodCsvValue:f=>f?.name||'',mainSkillCsvValue:()=> 'メインスキル',
  ribbonCsvValue:()=>0,shinyCsvValue:()=>0,
  mintCsvFlag:r=>r?.parsed?.natureEffect==='neutralized'?'1':'0'
 };
 vm.createContext(ctx);
 vm.runInContext(segment('function subskillReviewSlots(r){','function subskillNeedsReview(r){'),ctx);
 vm.runInContext(segment('function subskillReviewOptions(r,index){','function subskillReviewPreviewHtml(r,ri,index){'),ctx);
 vm.runInContext(segment('function toPokesleepToolCsvRow(r){','function buildCsvText()'),ctx);
 return ctx;
}
function mythicalSubskillRow(species,value='きのみの数S'){
 return {species,parsed:{nickname:'テスト',level:10,skillLevel:1,nature:'てれや',
  subs:[{value,needsReview:true},{value:'おてつだいスピードM'},
        {value:'最大所持数アップS'},{value:''},{value:''}]},
  foods:[{name:'f1'},{name:'f2'},{name:'f3'}],classification:{status:'UNIQUE',candidates:[species]}};
}
test('Mew and Darkrai alone offer the explicit dash in an inline subskill review',()=>{
 const c=mythicalSubskillApi();
 for(const species of ['ミュウ','ダークライ']){
  const row=mythicalSubskillRow(species);
  assert.equal(c.subskillReviewSlots(row).includes(0),true);
  assert.equal(c.subskillReviewOptions(row,0)[0],'―');
  assert.equal(c.subskillReviewOptions(row,0).includes('きのみの数S'),true);
 }
 const ordinary=mythicalSubskillRow('フシギダネ');
 assert.equal(c.subskillReviewOptions(ordinary,0).includes('―'),false);
 assert.equal(c.subskillReviewSlots(ordinary).includes(3),true);
});
test('reviewed mythical empty slot exports as empty CSV field, never a dash',async()=>{
 const c=mythicalSubskillApi();
 for(const species of ['ミュウ','ダークライ']){
  const row=mythicalSubskillRow(species),sub=row.parsed.subs[0];
  sub.reviewSelection='―';
  const results=[row], tb={querySelectorAll:()=>[button]};
  const button={dataset:{ri:'0',si:'0'},addEventListener(_type,handler){this.handler=handler;}};
  Object.assign(c,{tb,results,render:()=>{},
   recomputeAfterSubskillConfirm:()=>{},scheduleCheckpointResultSave:()=>{},
   speciesNeedsReview:()=>false,ensureClassificationPreview:async()=>{}});
  const line=src.split('\n').find(s=>s.includes("querySelectorAll('.subskillconfirm')"));
  assert.ok(line,'Production confirmation listener missing');
  vm.runInContext(line,c);
  await button.handler({currentTarget:button});
  assert.equal(sub.value,'');
  assert.equal(sub.needsReview,false);
  assert.equal(sub.manualConfirmed,true);
  assert.equal(c.subskillReviewSlots(row).includes(0),false);
  const fields=Array.from(c.toPokesleepToolCsvRow(row));
  assert.equal(fields[10],'');
  assert.notEqual(fields[10],'―');
  // The confirmed empty slot can still be reopened for review.
  sub.reviewSelection='―';sub.needsReview=true;delete sub.manualConfirmed;
  assert.equal(c.subskillReviewSlots(row).includes(0),true);
 }
});
test('ordinary species never accepts the no-subskill option',()=>{
 const c=mythicalSubskillApi(),row=mythicalSubskillRow('フシギダネ');
 const sub=row.parsed.subs[0];sub.reviewSelection='―';
 const button={dataset:{ri:'0',si:'0'},addEventListener(_type,handler){this.handler=handler;}};
 Object.assign(c,{tb:{querySelectorAll:()=>[button]},results:[row],
  render:()=>{},recomputeAfterSubskillConfirm:()=>{},
  scheduleCheckpointResultSave:()=>{},speciesNeedsReview:()=>false});
 const line=src.split('\n').find(s=>s.includes("querySelectorAll('.subskillconfirm')"));
 vm.runInContext(line,c);
 return button.handler({currentTarget:button}).then(()=>{
  assert.equal(sub.value,'きのみの数S');
  assert.equal(sub.needsReview,true);
 });
});
test('both mythical manual editors label empty as dash; CSV row remains blank',()=>{
 assert.match(src,/\$\{NO_SUBSKILL\}<\/option>/);
 assert.match(src,/sub\.value=v===NO_SUBSKILL\?'':v;/);
 assert.match(src,/speciesIsMythical\(chosenSpecies\(r\)\)\?NO_SUBSKILL:''/);
 assert.match(src,/speciesIsMythical\(pokemon\)\?NO_SUBSKILL:''/);
 assert.doesNotMatch(src,/sub\.value=NO_SUBSKILL;/);
});
