'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('food_matcher.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const window={POKESLEEP_FOOD_COLOR_FEATURES:{foods:{}}};
vm.runInNewContext(src,{window,Map,Set,Float64Array,Math,Number,Array}, {filename:'food_matcher.js'});
const pixel=window.POKESLEEP_FOOD_MATCHER.lockedFood3PixelWitnessFromRgba;
assert.equal(typeof pixel,'function');
assert.match(app,/inference\?\.status==='UNIQUE'&&thirdBeforeWitness\?\.needsReview/);
assert.match(app,/POKESLEEP_FOOD_MATCHER\.lockedFood3PixelWitness\(canvas,foods,parsed\.level\)/);
const analysisStart=app.indexOf('async function analyzeSingleImage(');
const earlyReview=app.indexOf('if(weakThirdFoodEvidence(foods)){',analysisStart);
const witnessCall=app.indexOf('const pixelWitness=POKESLEEP_FOOD_MATCHER.lockedFood3PixelWitness(',analysisStart);
assert(analysisStart>=0&&earlyReview>analysisStart&&witnessCall>earlyReview,
 'the existing weak-food3 review MUST execute before strict pixel verification');
const sample=(base=[254,254,237])=>{
 const d=new Uint8ClampedArray(100*80*4);
 for(let y=0;y<80;y++)for(let x=0;x<100;x++){
  const i=(y*100+x)*4;d[i]=base[0];d[i+1]=base[1];d[i+2]=base[2];d[i+3]=255;
 }
 return d;
};
function put(d,box,rgb){
 const [x1,y1,x2,y2]=box;
 for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){
  const i=(y*100+x)*4;
  for(let c=0;c<3;c++)d[i+c]=rgb[c];
 }
}
const center=[46,29,56,39],bottom=[46,40,56,50],
      left=[25,28,32,44],neck=[46,6,56,16],
      lowerLabel=[46,48,56,58];
const potato=sample();
put(potato,center,[253,225,179]);
put(potato,bottom,[250,215,171]);
put(potato,left,[251,218,173]);
const oil=sample();
put(oil,center,[247,236,160]);
put(oil,lowerLabel,[241,242,213]);
put(oil,neck,[185,196,171]);
const pumpkins=sample();
put(pumpkins,center,[254,214,157]);
put(pumpkins,bottom,[254,214,157]);
put(pumpkins,left,[254,214,157]);
const opts=['ずっしりカボチャ','ほっこりポテト','ピュアなオイル','ワカクサ大豆','あじわいキノコ'];
assert.equal(pixel(potato,100,80,opts)?.name,'ほっこりポテト');
assert.equal(pixel(oil,100,80,opts)?.name,'ピュアなオイル');
assert.equal(pixel(pumpkins,100,80,opts),null,'pumpkin must never be a positive potato witness');
assert.equal(pixel(potato,100,80,['ずっしりカボチャ']),null,'name must be in allowed list');
assert.equal(pixel(oil,100,80,['あじわいキノコ']),null,'name must be in allowed list');
assert.equal(pixel(potato,99,80,opts),null,'unknown geometry must fail closed');
const outOfRange=potato.slice();
put(outOfRange,bottom,[254,214,157]);
assert.equal(pixel(outOfRange,100,80,opts),null,'one conflicting region must prevent acceptance');
const noLabel=oil.slice();
put(noLabel,lowerLabel,[254,254,237]);
assert.equal(pixel(noLabel,100,80,opts),null,'oil must display a distinct lower bottle label');
const noNeck=oil.slice();
put(noNeck,neck,[254,254,237]);
assert.equal(pixel(noNeck,100,80,opts),null,'color alone without visible bottle neck is insufficient');
const transparent=potato.slice();
transparent[(32*100+50)*4+3]=128;
assert.equal(pixel(transparent,100,80,opts),null,'partial alpha must fail closed');
assert.equal(pixel(sample(),100,80,opts),null);
console.log('PASS: independent three-region locked-food pixel witnesses; absence, unknown geometry and decoys abstain');
