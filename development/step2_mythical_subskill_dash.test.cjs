'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=app.indexOf('function mythicalSubskillDashPixelStats(');
const end=app.indexOf('const NO_SUBSKILL=',start);
assert.ok(start>0&&end>start,'Blank-subskill screen-pixel implementation must be present');
const functions=app.slice(start,end);
function setup(species='ダークライ'){
 const context={
  layoutInfo:()=>({detail:{start:1217}}),
  speciesIsMythical:n=>['ミュウ','ダークライ'].includes(n),
  inferParsed:()=>({status:'UNIQUE',candidates:[species]}),
  LEVELS:[10,25,50,70,80],
 };
 return vm.runInNewContext(functions+';({stats:mythicalSubskillDashPixelStats,screen:visibleMythicalSubskillDash,apply:applyVisibleMythicalSubskillDashes});',context);
}
function roi(kind='dash',column=70){
 const a=new Uint8ClampedArray(140*28*4);
 for(let j=0;j<a.length;j+=4)a.set([255,255,255,255],j);
 if(kind==='dash')for(let y=12;y<15;y++)for(let x=column-3;x<=column+3;x++)
   a.set([195,181,176,255],(y*140+x)*4);
 if(kind==='long-text')for(let y=8;y<20;y++)for(let x=25;x<=110;x+=4)
   a.set([195,181,176,255],(y*140+x)*4);
 if(kind==='colored')for(let y=12;y<15;y++)for(let x=column-3;x<=column+3;x++)
   a.set([190,80,50,255],(y*140+x)*4);
 return a;
}
function screenshot(kind='dash',index=4,detail=1217){
 return {width:691,height:1536,getContext:()=>({getImageData:(x,y,w,h)=>{
  assert.equal(x,index===3?425:120);assert.equal(y,Math.round(detail+(index===3?-205:-100))-14);
  assert.equal(w,140);assert.equal(h,28);
  return {data:roi(kind,index===3?77:69)};
 }})};
}
function record(){return {subs:[0,1,2,3,4].map(i=>({value:i<3?'スキル確率アップS':'きのみの数S',needsReview:i>=3,score:0.2})),visibleEmptySubskillProofs:undefined};}
test('Real-size 7x3 pale-gray dash accepted; absent/color/text/shifted strokes rejected',()=>{
 const {stats}=setup();
 assert.equal(stats(roi('dash'),140,28).confirmed,true);
 assert.equal(stats(roi('blank'),140,28).confirmed,false);
 assert.equal(stats(roi('colored'),140,28).confirmed,false);
 assert.equal(stats(roi('long-text'),140,28).confirmed,false);
 assert.equal(stats(roi('dash',120),140,28).confirmed,false);
 assert.equal(stats(null,140,28).confirmed,false);
 assert.equal(stats(roi('dash'),141,28).confirmed,false);
});
test('Pixel proof uses detail green heading and only expected two late subskill cards',()=>{
 const {screen}=setup();
 assert.equal(screen(screenshot('dash',3),3).confirmed,true);
 assert.equal(screen(screenshot('dash',4),4).confirmed,true);
 assert.equal(screen({width:1080,height:2400},4).confirmed,false);
 assert.equal(screen({width:691,height:1200},4).confirmed,false);
 assert.equal(screen(screenshot('dash',4),2).confirmed,false);
});
test('Only unique mythical species and already-reviewed slots may be resolved',()=>{
 const {apply}=setup();
 let p=record(),inference={status:'UNIQUE',candidates:['ダークライ']};
 let out=apply(screenshot('dash',4),p,inference);
 assert.equal(out.parsed.subs[4].value,'');
 assert.equal(out.parsed.subs[4].needsReview,false);
 assert.equal(out.parsed.subs[3].needsReview,true);
 assert.equal(out.parsed.visibleEmptySubskillProofs[0].level,80);
 const normal=apply(screenshot('dash',4),record(),{status:'UNIQUE',candidates:['ライコウ']});
 assert.equal(normal.parsed.subs[4].needsReview,true);
 const ambiguous=apply(screenshot('dash',4),record(),{status:'AMBIGUOUS',candidates:['ミュウ','ダークライ']});
 assert.equal(ambiguous.parsed.subs[4].needsReview,true);
 const noProof=apply(screenshot('long-text',4),record(),inference);
 assert.equal(noProof.parsed.subs[4].needsReview,true);
 const alreadyAccepted=record();alreadyAccepted.subs[4].needsReview=false;
 assert.equal(apply(screenshot('dash',4),alreadyAccepted,inference).parsed.subs[4].value,'きのみの数S');
});
test('A changed classifier verdict vetoes any pixel-based rewrite',()=>{
 const {stats}=setup();assert.equal(stats(roi(),140,28).confirmed,true);
 const context={layoutInfo:()=>({detail:{start:1217}}),speciesIsMythical:()=>true,
  inferParsed:()=>({status:'AMBIGUOUS',candidates:[]}),LEVELS:[10,25,50,70,80]};
 const {apply}=vm.runInNewContext(functions+';({apply:applyVisibleMythicalSubskillDashes})',context);
 const p=record(),out=apply(screenshot(),p,{status:'UNIQUE',candidates:['ダークライ']});
 assert.equal(out.parsed.subs[4].value,'きのみの数S');
 assert.equal(out.parsed.subs[4].needsReview,true);
});
test('Original subskill verifier, duplicate guard, and CSV mapping still present',()=>{
 assert.match(app,/verifySubskills\(canvas,rawFirstPass,raw,parsed/);
 assert.match(app,/rejectImpossibleDuplicateSubskills\(parsed\)/);
 assert.match(app,/applyVisibleMythicalSubskillDashes\(canvas,parsed,inference\)/);
 assert.match(app,/function csvFoodResolvedForPokesleepTool/);
});
