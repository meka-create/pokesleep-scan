'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','food_matcher.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const win={POKESLEEP_FOOD_COLOR_FEATURES:{foods:{}}};
vm.runInNewContext(source,{window:win,document:{}});
const f=win.POKESLEEP_FOOD_MATCHER;
function icon(seed=1,dim=0){
 const data=new Uint8ClampedArray(100*80*4);
 for(let y=0;y<80;y++)for(let x=0;x<100;x++){
  const i=(y*100+x)*4;
  const pix=(Math.imul(x+9,seed*29+13)+Math.imul(y+7,seed*11+73)+Math.imul(x*y+3,seed*7+19))%170+40;
  for(let k=0;k<3;k++){
   const raw=Math.min(255,pix+(k*seed)%19);
   data[i+k]=Math.round(raw*(1-dim)+244*dim);
  }
  data[i+3]=255;
 }
 return {width:100,height:80,getContext:()=>({getImageData:()=>({data})})};
}
const food=(name,score,extra={})=>({name,needsReview:false,manualOverride:false,...extra});
test('same icon with transparent brightening is highly correlated',()=>{
 const x=icon(2,0),faded=icon(2,.53),other=icon(5,.40);
 const same=f.iconSelfCorrelation(x,faded),different=f.iconSelfCorrelation(x,other);
 assert.ok(same>.99,'fade should preserve spatial appearance: '+same);
 assert.ok(different<.90,'unrelated textures must abstain: '+different);
});
test('rescue only a legal earlier food, not a new guess',()=>{
 const foods=[food('ピュアなオイル'),food('あったかジンジャー'),food('あじわいキノコ',0,{method:'image',needsReview:true,allowed:['ピュアなオイル','あじわいキノコ','あったかジンジャー']})];
 const hit=f.thirdFoodSelfMatchFromScores(foods,.943,.35);
 assert.equal(hit.name,'ピュアなオイル');
 assert.equal(f.thirdFoodSelfMatchFromScores(foods,.8,.3),null);
 assert.equal(f.thirdFoodSelfMatchFromScores(foods,.96,.90),null,'two distinct plausible names abstain');
 foods[0].needsReview=true;
 assert.equal(f.thirdFoodSelfMatchFromScores(foods,.99,.5),null,'uncertain predecessor cannot prove third food');
 foods[0].needsReview=false;foods[0].manualOverride=true;
 assert.equal(f.thirdFoodSelfMatchFromScores(foods,.99,.5),null,'manually overridden predecessor does not count');
 foods[0].manualOverride=false;
 foods[2].allowed=['あじわいキノコ','あったかジンジャー'];
 assert.equal(f.thirdFoodSelfMatchFromScores(foods,.99,.5),null,'not allowed by species -> abstain');
});
test('unchanged or missing review/inference cannot trigger rescue',()=>{
 const a=[food('マメミート'),food('ピュアなオイル'),food('ピュアなオイル',0,{method:'db-inferred',needsReview:true,allowed:['マメミート','ピュアなオイル']})];
 assert.equal(f.thirdFoodSelfMatchFromScores(a,.99,.3),null);
 a[2].method='image';a[2].allowed=['マメミート'];
 assert.equal(f.thirdFoodSelfMatchFromScores(a,.99,.3),null);
 a[2].allowed=['マメミート','ピュアなオイル'];
 assert.equal(f.thirdFoodSelfMatchFromScores(a,NaN,NaN),null);
 assert.equal(f.iconSelfCorrelation({width:99,height:80},{width:100,height:80}),-1,'unsupported geometry abstains');
});
test('production integration affects review-only cases, retains existing guards',()=>{
 assert.match(app,/candidateFood3\.needsReview\|\|weakThirdFoodEvidence\(foods\)/);
 assert.match(app,/POKESLEEP_FOOD_MATCHER\.thirdFoodSelfMatch\(canvas,foods\)/);
 assert.match(app,/candidateFood3\.method='image-cross-slot'/);
 assert.match(app,/const safeFood=resolveFoodsSafely\(inference,foods\)/);
 assert.match(app,/if\(weakThirdFoodEvidence\(r\.foods\)\)/);
});
