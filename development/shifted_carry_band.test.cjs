'use strict';
// Synthetic geometry and OCR readings only. No private screenshots or Golden.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const begin=src.indexOf('function verifiedShiftedCarryBandCrops(');
const end=src.indexOf('async function retryMissingCarryFromVisibleCard(',begin);
assert.ok(begin>=0&&end>begin,'production shifted-carry helper missing');
const ctx={
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
 for(const c of [canvas(428,432),canvas(402,490),
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
