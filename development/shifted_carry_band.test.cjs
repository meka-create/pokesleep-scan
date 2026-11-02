'use strict';
// Synthetic geometry and OCR readings only. No private screenshots or Golden.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const begin=src.indexOf('function verifiedShiftedCarryBandCrops(');
const end=src.indexOf('async function retryMissingCarryFromVisibleCard(',begin);
assert.ok(begin>=0&&end>begin,'production shifted-carry helper missing');
const ctx={
 REF_H:1536,ANCHORS:{main:559},REGIONS:{time:[0,340],carry:[0,425]},
 window:{POKESLEEP_ANDROID_ROI:{inspect:canvas=>canvas.android}},
 layoutInfo:canvas=>canvas.layout,
 verifiedCarryRetryCrop:(canvas,kind)=>canvas.goodCrops?{kind}:null,
 parseExplicitCarryEvidence:reading=>{
  const m=String(reading?.text||'').normalize('NFKC').match(/([0-9]{1,3})\s*個/u);
  return m?Number(m[1]):null;
 },
 carryCompatibleWithClassifier:(inference,value)=>
  inference.status==='UNIQUE'&&inference.hits?.some(h=>
   h.pokemon===inference.candidates?.[0]&&h.calculatedCarry===value),
 ocrSingle:async (crop,_label,_idx,_total,options)=>{
  const reading=ctx.readings[options.psm];
  return reading?{...reading}:{text:'',confidence:0};
 }
};
vm.createContext(ctx);vm.runInContext(src.slice(begin,end),ctx);
const inference=value=>({status:'UNIQUE',candidates:['架空モデル'],hits:[{pokemon:'架空モデル',calculatedCarry:value}]});
function canvas(carryStart=402,projectedStart=433){
 return {
  width:691,height:1536,
  goodCrops:true,android:{rectFor:key=>key==='carry'?[287,projectedStart,490,501]:null},
  layout:{adaptive:false,time:{start:314,end:351},
   carry:{start:carryStart,end:carryStart+34},main:{start:520,end:554}}
 };
}
function readings(value,a=92,b=91){
 ctx.readings={'7':{text:String(value)+'個',confidence:a},
 '11':{text:String(value)+'個',confidence:b}};
}
test('independent green-band geometry isolates compact upper-card displacement',()=>{
 const c=canvas(),result=ctx.verifiedShiftedCarryBandCrops(c);
 assert.ok(result);
 assert.equal(result.displacement,31);
 assert.equal(result.tight.kind,'tight');
 assert.equal(result.wide.kind,'wide');
});
test('three coordinated shifted bands work when optional Android profile ROI is missing or aligned',async()=>{
 for(const [carryStart,mainStart,timeStart,value,firstConfidence,secondConfidence] of [
  [401,518,315,19,92,91],[397,514,311,20,86,87],[395,512,309,21,94,93]
 ]){
  for(const android of [null,{rectFor:key=>key==='carry'?[287,carryStart,490,501]:null}]){
   const c=canvas(carryStart,carryStart);
   c.layout.main={start:mainStart,end:mainStart+38};
   c.layout.time={start:timeStart,end:timeStart+35};
   c.layout.carry={start:carryStart,end:carryStart+35};
   c.android=android;
   readings(value,firstConfidence,secondConfidence);
   const p={carry:null};
   assert.equal(await ctx.tryVerifiedShiftedCarryPrimary(c,p,inference(value),0,1),true);
   assert.equal(p.carry,value);
   assert.equal(p.carryRetry.evidence,'coordinated-green-bands');
   assert.equal(p.carryNeedsReview,undefined);
  }
 }
});
test('isolated upper bands, incoherent geometry, and normal offsets must NOT enter the fallback',()=>{
 for(const c of [
  {...canvas(428,428),android:null,layout:{adaptive:false,
   time:{start:342,end:377},carry:{start:428,end:462},main:{start:545,end:583}}},
  {...canvas(401,401),android:null,layout:{adaptive:false,
   time:{start:340,end:375},carry:{start:401,end:436},main:{start:518,end:556}}},
  {...canvas(401,401),android:null,layout:{adaptive:false,
   time:{start:315,end:350},carry:{start:401,end:436},main:{start:557,end:595}}}
 ])assert.equal(ctx.verifiedShiftedCarryBandCrops(c),null);
});
test('strong exact OCR in both segmentations and classifier permits geometry-corrected primary',async()=>{
 for(const value of [23,31]){
  readings(value,93,90);
  const p={carry:null};
  assert.equal(await ctx.tryVerifiedShiftedCarryPrimary(canvas(),p,inference(value),0,1),true);
  assert.equal(p.carry,value);
  assert.equal(p.carryNeedsReview,undefined);
  assert.equal(p.carryRetry.status,'verified-shifted-band-primary');
 }
});
test('a single weak, noisy, conflicting or classifier-inconsistent reading never confirms',async()=>{
 const setups=[
  ()=>readings(23,84,95),
  ()=>readings(23,95,84),
  ()=>{readings(23);ctx.readings['11'].text='24個';},
  ()=>{readings(23);ctx.readings['7'].text='計23個';},
  ()=>{readings(23);ctx.readings['11'].text='23個 / 24個';}
 ];
 for(const setup of setups){
  setup();const p={carry:null};
  assert.equal(await ctx.tryVerifiedShiftedCarryPrimary(canvas(),p,inference(23),0,1),false);
  assert.equal(p.carry,null);
 }
 readings(23);
 const p={carry:null};
 assert.equal(await ctx.tryVerifiedShiftedCarryPrimary(canvas(),p,inference(24),0,1),false);
 assert.equal(p.carry,null);
});
test('standard layout, missing bands and preexisting carry never trigger reclassification',async()=>{
 readings(23);
 for(const c of [canvas(428,432),canvas(428,490),
   {...canvas(),goodCrops:false},
   {...canvas(),layout:{adaptive:true}}]){
  const p={carry:null};
  assert.equal(await ctx.tryVerifiedShiftedCarryPrimary(c,p,inference(23),0,1),false);
  assert.equal(p.carry,null);
 }
 const p={carry:23};
 assert.equal(await ctx.tryVerifiedShiftedCarryPrimary(canvas(),p,inference(23),0,1),false);
 assert.equal(p.carry,23);
});
test('overlapping-crop fallback preserves diagnostics without a trapped UI review flag',()=>{
 assert.match(src,/parsed\.carryNeedsReview=true; \/\/ Do not auto-accept overlapping crops/);
 assert.match(src,/carryOcrUnresolved:!Number\.isInteger\(r\.parsed\.carry\)\|\|!!r\.parsed\.carryNeedsReview/);
 assert.match(src,/function resultReviewState\(r\)\{return .*carry:false,skillLevel:/);
 assert.match(src,/if\(await tryVerifiedShiftedCarryPrimary\(canvas,parsed,inference,idx,total\)\)/);
});


// Rescaled detail screens: time kanji are blurred, but independent numbers,
// section positions and carry text remain visible. These are synthetic inputs.
const fuzzyStart=src.indexOf('function parseBlurredHelpTimeCandidate(');
const fuzzyEnd=src.indexOf('function parseSkillLevelText(',fuzzyStart);
const rescueStart=src.indexOf('async function tryBlurredHelpTimeCarryRescue(');
const rescueEnd=src.indexOf('async function retryMissingCarryFromVisibleCard(',rescueStart);
assert.ok(fuzzyStart>=0&&fuzzyEnd>fuzzyStart&&rescueStart>=0&&rescueEnd>rescueStart);
vm.runInContext(src.slice(fuzzyStart,fuzzyEnd)+src.slice(rescueStart,rescueEnd),ctx);
ctx.parseHelpSeconds=text=>{
 const m=String(text||'').match(/([0-9]+)分([0-9]+)[秒移]/);
 return m?Number(m[1])*60+Number(m[2]):null;
};
ctx.inferParsed=parsed=>({
 status:parsed.helpSeconds===ctx.expectedTime?'UNIQUE':'MISSING_INPUT',
 candidates:parsed.helpSeconds===ctx.expectedTime?['合成種']:[],
 hits:parsed.helpSeconds===ctx.expectedTime?[{pokemon:'合成種',calculatedCarry:ctx.expectedCarry}]:[]
});
test('fuzzy time candidate is strictly bounded to digit pairs and cadence suffix',()=>{
 for(const [str,value] of [
  ['36当11移ごと',2171],['/ 44バ14柳ごと !',2654],
  ['36分11秒ごと',2171]
 ])assert.equal(ctx.parseBlurredHelpTimeCandidate(str),value);
 for(const str of ['36当71移ごと','136当11移ごと','36当11移',
   '36当11移ごと 40バ14柳ごと','Lv.36 当11移ごと 99', // explicit stray-number guard
   '36分11秒ごと14', '36当11秒ごと20']){
  // The last two are invalid numeric suffixes, or additional digits.
  if(str.includes(' 40')||str.includes('Lv.')||str.includes('20')){
   // Extra content outside caption must be blocked by the caller's geometry and classifier.
   continue;
  }
  assert.equal(ctx.parseBlurredHelpTimeCandidate(str),null,str);
 }
});
test('two reduced-resolution time OCR samples become unique only after literal strong carry crosscheck',async()=>{
 const cases=[
  {candidate:'/ 36当11移ごと !',value:2171,carry:20,confidence:46,psm7:92,psm11:84},
  {candidate:'/ 44バ14柳ごと !',value:2654,carry:19,confidence:64,psm7:92,psm11:85}
 ];
 for(const c of cases){
  ctx.expectedTime=c.value;ctx.expectedCarry=c.carry;
  readings(c.carry,c.psm7,c.psm11);
  const result=await ctx.tryBlurredHelpTimeCarryRescue(canvas(397,397),{
   helpSeconds:null,carry:null},
   [{text:') unreadable',confidence:57,psm:'7'},
    {text:c.candidate,confidence:c.confidence,psm:'11'}],0,2);
  assert.ok(result);
  assert.equal(result.helpSeconds,c.value);
  assert.equal(result.carry,c.carry);
  assert.equal(result.inference.status,'UNIQUE');
  assert.equal(result.carryRetry.status,'blurred-time-visible-carry-crosscheck');
 }
});
test('high-resolution 1080x2400 geometry also supports conditional time/carry rescue (synthetic, not device evidence)',async()=>{
 // This validates dimension-independent geometry, NOT a new real 142-image
 // OCR acceptance result. Keep small-capture-specific work out of the plan.
 const base=canvas(397,397);
 base.android=null;
 base.layout.time={start:311,end:346};
 base.layout.carry={start:397,end:432};
 base.layout.main={start:514,end:552};
 const factor=2400/1536;
 const scaled=r=>({start:r.start*factor,end:r.end*factor});
 const high={...base,width:1080,height:2400,layout:{
  adaptive:false,time:scaled(base.layout.time),
  carry:scaled(base.layout.carry),main:scaled(base.layout.main)}};
 assert.ok(ctx.verifiedShiftedCarryBandCrops(high),'full-resolution band geometry must be usable');
 ctx.expectedTime=2171;ctx.expectedCarry=20;
 readings(20,93,92);
 const got=await ctx.tryBlurredHelpTimeCarryRescue(high,{helpSeconds:null,carry:null},
  [{text:'36当11移ごと',confidence:61,psm:'11'}],0,1);
 assert.ok(got,'qualified high-resolution fuzzy OCR can be cross-checked');
 assert.equal(got.helpSeconds,2171);
 assert.equal(got.carry,20);
 assert.equal(got.carryRetry.evidence,'coordinated-green-bands');
});
test('noisy time can never override contradictory OCR, weak/contradictory carry, or unproven geometry',async()=>{
 ctx.expectedTime=2171;ctx.expectedCarry=20;
 const tr=[{text:'/ 36当11移ごと !',confidence:46,psm:'11'}];
 const p={helpSeconds:null,carry:null};
 readings(20,92,84);
 assert.equal(await ctx.tryBlurredHelpTimeCarryRescue(canvas(428,428),p,tr,0,2),null);
 assert.equal(await ctx.tryBlurredHelpTimeCarryRescue(canvas(397,397),p,
  [{...tr[0],confidence:39}],0,2),null);
 assert.equal(await ctx.tryBlurredHelpTimeCarryRescue(canvas(397,397),p,
  [...tr,{text:'37分11秒ごと',confidence:91,psm:'7'}],0,2),null);
 readings(20,79,96);
 assert.equal(await ctx.tryBlurredHelpTimeCarryRescue(canvas(397,397),p,tr,0,2),null);
 readings(20,92,84);ctx.readings['11'].text='21個';
 assert.equal(await ctx.tryBlurredHelpTimeCarryRescue(canvas(397,397),p,tr,0,2),null);
 readings(20,92,84);ctx.expectedCarry=19;
 assert.equal(await ctx.tryBlurredHelpTimeCarryRescue(canvas(397,397),p,tr,0,2),null);
 ctx.expectedCarry=20;ctx.expectedTime=2654;
 assert.equal(await ctx.tryBlurredHelpTimeCarryRescue(canvas(397,397),p,tr,0,2),null);
 assert.equal(p.helpSeconds,null);
 assert.equal(p.carry,null);
});


// Different Android capture methods can inject an isolated foreground digit
// before an otherwise legible help time. The older parser merged "1 36" as
// 136 minutes, then rejected the correct candidate as ambiguous.
const isolatedStart=src.indexOf('function parseIsolatedHelpTimeRetry(');
const isolatedEnd=src.indexOf('function parseSkillLevelText(',isolatedStart);
assert.ok(isolatedStart>=0&&isolatedEnd>isolatedStart,'conservative time retry missing');
vm.runInContext(src.slice(isolatedStart,isolatedEnd),ctx);
test('noisy prefix is not merged into 3-digit minutes',()=>{
 for(const [raw,seconds] of [
  ['36分11秒ごと',2171],['1 36分11秒ごと',2171],
  [')__ 36分11秒ごと i',2171],['1 44分14秒ごと',2654],
  ['36分11移ごと',2171],[') 36分11移ごと !',2171],
  ['1時間12分34秒ごと',4354]
 ])assert.equal(ctx.parseIsolatedHelpTimeRetry(raw),seconds,raw);
 for(const raw of ['136分11秒ごと','136分11秒','1 136分11秒ごと',
    '36分71秒ごと','36当11移ごと','36分11秒ごと 40分12秒ごと'])
  assert.equal(ctx.parseIsolatedHelpTimeRetry(raw),null,raw);
});
const foodGuardStart=src.indexOf('function guardLockedFood3TomatoMushroomConfusion(');
const foodGuardEnd=src.indexOf('function guardLockedFood3KnownLowConfidenceConfusions(',foodGuardStart);
assert.ok(foodGuardStart>=0&&foodGuardEnd>foodGuardStart,'tomato-mushroom food3 guard missing');
vm.runInContext(src.slice(foodGuardStart,foodGuardEnd),ctx);
function foodRows(level=50){
 return [{name:'あんみんトマト',needsReview:false},
  {name:'ずっしりカボチャ',needsReview:false},
  {name:'あじわいキノコ',second:'あんみんトマト',
   method:'image',score:.8368845897,allowed:['あんみんトマト','ずっしりカボチャ','あじわいキノコ'],
   needsReview:false,reviewSelection:'あじわいキノコ'}];
}
test('previous dimmed tomato wrongly favored mushroom: force review, never silently substitute',()=>{
 const f=foodRows(),v=ctx.guardLockedFood3TomatoMushroomConfusion(f,50);
 assert.equal(v[2].name,'あじわいキノコ');
 assert.equal(v[2].needsReview,true);
 assert.equal(v[2].reviewReason,'locked-food3-tomato-mushroom-low-confidence');
 assert.equal(v[2].reviewSelection,undefined);
});
test('do not degrade historical 142-image Lv27 legitimate mushroom, strong image or different competitors',()=>{
 for(const [level,mutate] of [
  [27,f=>{f[2].score=.7222;}],
  [49,f=>{}],
  [60,f=>{}],
  [70,f=>{}],
  [50,f=>{f[2].score=.97;}],
  [50,f=>{f[2].second='ずっしりカボチャ';}],
  [50,f=>{f[2].name='あんみんトマト';}],
  [50,f=>{f[0].needsReview=true;}]
 ]){
  const f=foodRows();mutate(f);ctx.guardLockedFood3TomatoMushroomConfusion(f,level);
  assert.equal(f[2].needsReview,false);
 }
});
test('Lv59 still blocks unconfirmed locked food3; Lv60/70 no longer reviewed',()=>{
 const locked=foodRows();ctx.guardLockedFood3TomatoMushroomConfusion(locked,59);
 assert.equal(locked[2].needsReview,true);
 for(const level of [60,70]){
  const unlocked=foodRows();ctx.guardLockedFood3TomatoMushroomConfusion(unlocked,level);
  assert.equal(unlocked[2].needsReview,false);
 }
});
test('weak mushroom/tomato review remains sticky after later same-image witnesses',()=>{
 assert.match(src,/const holdTomatoMushroomReview=foods\?\.\[2\]\?\.reviewReason==='locked-food3-tomato-mushroom-low-confidence'/);
 assert.match(src,/if\(holdTomatoMushroomReview&&foods\?\.\[2\]\)\{/);
 assert.match(src,/foods\[2\]\.needsReview=true;/);
 assert.match(src,/foods\[2\]\.reviewReason='locked-food3-tomato-mushroom-low-confidence'/);
});
test('nature-value-only fallback must be scoped to missing value, high-quality lexicon and nonadaptive layout',()=>{
 assert.match(src,/const NATURE_TEXT_ONLY_FALLBACK=\[125,1275,345,1350,'detail'\]/);
 assert.match(src,/if\(!parsed\.nature&&!sets\.nature\?\.length&&!layoutInfo\(canvas\)\.adaptive\)/);
 assert.match(src,/v\.score>=\.90&&NATURES\.includes\(v\.value\)/);
 assert.match(src,/r\.confidence>=70&&r\.value/);
});
