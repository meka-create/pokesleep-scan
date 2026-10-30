'use strict';
// Synthetic-only: no player screenshots or Golden labels are committed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('food_matcher.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const win={POKESLEEP_FOOD_COLOR_FEATURES:{foods:{}}};
vm.runInNewContext(source,{window:win,document:{}});
const f=win.POKESLEEP_FOOD_MATCHER;
const first={name:'ピュアなオイル',needsReview:false};
function pair(){return [ {...first},{name:'ピュアなオイル',needsReview:true,method:'image',
 reviewReason:'dimmed-shape-not-corroborated',score:.8764,margin:.0344,
 allowed:['ピュアなオイル','めざましコーヒー']} ,{name:'めざましコーヒー'}];}
test('only strong within-image exact label corroboration clears a reviewed food2',()=>{
 const foods=pair();const evidence=f.secondFoodSelfMatchFromScore(foods,24,.981985,'UNIQUE');
 assert.equal(evidence.name,'ピュアなオイル');assert.equal(evidence.sourceSlot,1);
 assert.equal(evidence.targetSlot,2);assert.equal(foods[1].needsReview,true,'pure matcher does not mutate');
});
test('threshold boundary and unknown inference or level fail closed',()=>{
 for(const v of [.9749999,0,NaN,Infinity,-1]) assert.equal(f.secondFoodSelfMatchFromScore(pair(),24,v,'UNIQUE'),null);
 for(const lv of [0,30,60,NaN,undefined])assert.equal(f.secondFoodSelfMatchFromScore(pair(),lv,.99,'UNIQUE'),null);
 assert.equal(f.secondFoodSelfMatchFromScore(pair(),24,.99,'NO_EXACT_MATCH'),null);
});
test('no override, unsupported candidate, unresolved first or already finalized food',()=>{
 for(const mod of [
  x=>{x[0].needsReview=true},x=>{x[0].manualOverride=true},
  x=>{x[0].name='めざましコーヒー'},
  x=>{x[1].name='めざましコーヒー'},
  x=>{x[1].allowed=['めざましコーヒー','ほっこりポテト']},
  x=>{x[1].allowed=['ピュアなオイル']},
  x=>{x[1].method='db-inferred'},
  x=>{x[1].needsReview=false},
  x=>{x[1].manualOverride=true},
  x=>{x[1].reviewReason='dimmed-color-shape-disagreement'},
  x=>{x[1].score=.85},
  x=>{x[1].margin=.019},
 ]){
  const p=pair();mod(p);
  assert.equal(f.secondFoodSelfMatchFromScore(p,24,.999,'UNIQUE'),null,JSON.stringify(p));
 }
});
function syntheticIcon(seed,fade=0){
 const data=new Uint8ClampedArray(100*80*4);
 for(let y=0;y<80;y++)for(let x=0;x<100;x++){
  const i=(y*100+x)*4,q=(Math.imul(x+9,seed*29+13)+Math.imul(y+7,seed*11+73)+Math.imul(x*y+3,seed*7+19))%170+40;
  for(let k=0;k<3;k++)data[i+k]=Math.round(Math.min(255,q+k*seed%19)*(1-fade)+244*fade);
  data[i+3]=255;
 }
 return {width:100,height:80,getContext:()=>({getImageData:()=>({data})})};
}
test('synthetic fade preserves visible icon correlation but other textures abstain',()=>{
 const a=syntheticIcon(2),locked=syntheticIcon(2,.55),different=syntheticIcon(7,.55);
 const good=f.iconSelfCorrelation(a,locked),bad=f.iconSelfCorrelation(a,different);
 assert.ok(good>=.975);assert.ok(bad<.975);
 assert.ok(f.secondFoodSelfMatchFromScore(pair(),24,good,'UNIQUE'));
 assert.equal(f.secondFoodSelfMatchFromScore(pair(),24,bad,'UNIQUE'),null);
});
test('production only releases an already reviewed second food; third food is unchanged',()=>{
 assert.match(app,/const second=foods\?\.\[1\];/);
 assert.match(app,/second\?\.needsReview&&parsed\.level<30&&inference\?\.status==='UNIQUE'/);
 assert.match(app,/if\(witness&&witness\.name===second\.name\)/);
 assert.match(app,/second\.method='image-locked-food2-self-witness'/);
 assert.match(app,/const safeFood=resolveFoodsSafely\(inference,foods\)/);
});
