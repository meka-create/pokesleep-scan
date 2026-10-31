'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const fm=fs.readFileSync(path.join(root,'food_matcher.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const grab=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,a);return source.slice(i,j)};
const A=grab('function parseExplicitCarryEvidence(reading){','function detectWhiteMint(canvas){');
const B=grab('function numericDataNeedsReview(r,key){','function statusView(r){');
const ctx={
 window:{POKESLEEP_ANDROID_ROI:{inspect:()=>null}}, // synthetic legacy canvases have no verified Android ROI
 REF_W:691,REF_H:1536,ANCHORS:{main:559},REGIONS:{time:[0,340],carry:[0,425]},
 layoutInfo:c=>c.layout,cropCanvasRect:(_c,r)=>({rect:r}),
 inferParsed:p=>({status:'UNIQUE',hits:[{pokemon:'ミュウ',calculatedCarry:p.carry}]}),
 chosenSpecies:r=>r.species||'',
 numericSpEvidenceConflict:()=>false,
 speciesNeedsReview:()=>false,nicknameDataNeedsReview:()=>false,
 levelDataNeedsReview:()=>false,skillLevelDataNeedsReview:()=>false,
 mainSkillDataNeedsReview:()=>false,natureDataNeedsReview:()=>false,
 foodDataNeedsReview:()=>false,subskillNeedsReview:()=>false,
 ocrSingle:async(src,_label,_i,_total,opt)=>({text:'44 個',confidence:85,psm:opt.psm}),
};
vm.createContext(ctx);vm.runInContext(A+B,ctx);
const observed=(n,opts={})=>({text:n+' 個',value:n,crop:opts.crop||'tight',psm:opts.psm||'7',confidence:opts.conf||90});
const inference={status:'UNIQUE',candidates:['ミュウ'],
 hits:[38,39,41,44,46].map(n=>({pokemon:'ミュウ',calculatedCarry:n}))};
test('four-line Latias layout diagnostic geometry triggers shifted carry band search',()=>{
 for(const heading of [514,518]){
  const c={height:1536,width:691,layout:{
   main:{start:0,end:heading===514?1:5},detail:{start:heading,end:heading+38},
   time:null,carry:null}};
  const zones=ctx.shiftedCarrySearchRects(c);
  assert.equal(zones.length,4);
  assert.equal(zones[0].rect[1],heading-394);
  assert.equal(zones[3].rect[3],heading-18);
  assert.equal(zones[3].rect[0],255);
  assert.ok(zones.every(z=>z.rect[3]<heading));
 }
 const normal={height:1536,width:691,layout:{
   main:{start:552},detail:{start:1205},time:{start:350,end:386},
   carry:{start:435,end:470}}};
 assert.equal(ctx.shiftedCarrySearchRects(normal).length,0);
});
test('shifted Latias carry 20 or 19 is a reviewed OCR candidate, never auto-confirmed',async()=>{
 const original=ctx.ocrSingle;
 try{
  for(const [heading,carry] of [[514,20],[518,19]]){
   const c={height:1536,width:691,layout:{
    main:{start:0,end:3},detail:{start:heading,end:heading+38},time:null,carry:null}};
   ctx.ocrSingle=async(src,_lbl,_i,_total,opt)=>{
    const [x1,y1]=src.rect;
    const isLast=y1===heading-127,correct=isLast&&
       (x1===255||x1===285);
    return {text:correct?carry+' 個':'',confidence:correct?92:0};
   };
   const inf={status:'UNIQUE',candidates:['ラティアス'],
    hits:[19,20,22,25,27].map(n=>({pokemon:'ラティアス',calculatedCarry:n}))};
   const parsed={carry:null};
   const next=await ctx.retryMissingCarryFromVisibleCard(c,parsed,inf,0,1);
   assert.equal(parsed.carry,carry);
   assert.equal(parsed.carryNeedsReview,true);
   assert.equal(parsed.carryRetry.status,'shifted-ocr-needs-user-verification');
   assert.equal(parsed.carryManualConfirmed,undefined);
   assert.equal(next.status,'UNIQUE');
  }
 }finally{ctx.ocrSingle=original;}
});
test('disagreeing or missing shifted OCR cannot supply an unverified carry number',async()=>{
 const original=ctx.ocrSingle;
 try{
  const heading=514,c={height:1536,width:691,layout:{
   main:{start:0,end:1},detail:{start:heading,end:heading+38},time:null,carry:null}};
  const inf={status:'UNIQUE',candidates:['ラティアス'],
   hits:[19,20,22,25,27].map(n=>({pokemon:'ラティアス',calculatedCarry:n}))};
  ctx.ocrSingle=async()=>({text:'',confidence:0});
  const missing={carry:null};
  await ctx.retryMissingCarryFromVisibleCard(c,missing,inf,0,1);
  assert.equal(missing.carry,null);
  assert.equal(missing.carryRetry.status,'unresolved-shifted-ocr');
  let n=0;
  ctx.ocrSingle=async()=>{n++;return {text:n===2?'19個':n===3?'20個':'',confidence:93};};
  const conflict={carry:null};
  await ctx.retryMissingCarryFromVisibleCard(c,conflict,inf,0,1);
  assert.equal(conflict.carry,null);
  assert.equal(conflict.carryRetry.status,'conflicting-shifted-ocr');
 }finally{ctx.ocrSingle=original;}
});
test('parse exact and unambiguous number with unit 個 only',()=>{
 assert.equal(ctx.parseExplicitCarryEvidence({text:'44 個'}),44);
 assert.equal(ctx.parseExplicitCarryEvidence({text:'44個'}),44);
 assert.equal(ctx.parseExplicitCarryEvidence({text:'SP6592 / 44個'}),44);
 assert.equal(ctx.parseExplicitCarryEvidence({text:'44'}),null);
 assert.equal(ctx.parseExplicitCarryEvidence({text:'SP6592'}),null);
 assert.equal(ctx.parseExplicitCarryEvidence({text:'44個 / 39個'}),null);
 assert.equal(ctx.parseExplicitCarryEvidence({text:'999個'}),null);
});
test('two confirmed crops plus classified carry support can recover',()=>{
 assert.equal(ctx.corroboratedCarryRetry([observed(44),observed(44,{crop:'wide',psm:'11'})],inference),44);
});
test('never infer unseen sleep ribbon count from one crop or classifier alone',()=>{
 assert.equal(ctx.corroboratedCarryRetry([],inference),null);
 assert.equal(ctx.corroboratedCarryRetry([observed(44)],inference),null);
 assert.equal(ctx.corroboratedCarryRetry([observed(44),observed(44,{crop:'tight',psm:'11'})],inference),null);
});
test('conflicting OCR, too little confidence or carry not supported abstain',()=>{
 assert.equal(ctx.corroboratedCarryRetry([observed(44),observed(39,{crop:'wide',psm:'11'})],inference),null);
 assert.equal(ctx.corroboratedCarryRetry([observed(44,{conf:50}),observed(44,{crop:'wide',psm:'11',conf:55})],inference),null);
 assert.equal(ctx.corroboratedCarryRetry([observed(20),observed(20,{crop:'wide',psm:'11'})],inference),null);
});
test('no visible carry band, no OCR and never invent a number',async()=>{
 const p={carry:null};
 const c={layout:{carry:null,time:null,main:{start:0}}};
 const got=await ctx.retryMissingCarryFromVisibleCard(c,p,inference,0,1);
 assert.equal(got,inference);assert.equal(p.carry,null);
 assert.equal(p.carryRetry.status,'not-visible-or-no-verified-carry-band');
});
test('normal visible card corroboration stays in the review-only legacy path',async()=>{
 const p={carry:null},c={width:691,height:1536,layout:{
   time:{start:342,end:377},carry:{start:428,end:463},main:{start:545,end:583}
 }};
 const got=await ctx.retryMissingCarryFromVisibleCard(c,p,inference,0,1);
 assert.equal(p.carry,44);assert.equal(p.carryRetry.status,'corroborated-needs-user-verification');
 assert.equal(p.carryNeedsReview,true);
 assert.equal(got.status,'UNIQUE');assert.equal(p.carryRetry.readings.length,3);
});
test('missing or ambiguous carry never blocks exportable review status',()=>{
 const r={parsed:{carry:null,carryNeedsReview:true,sp:1000,helpSeconds:2500}};
 assert.equal(ctx.numericDataNeedsReview(r,'carry'),false);
 assert.equal(ctx.resultReviewState(r).carry,false);
 assert.equal(Object.values(ctx.resultReviewState(r)).some(Boolean),false);
 r.parsed.carry=44;
 assert.equal(ctx.resultReviewState(r).carry,false);
 assert.ok(source.includes('carryOcrUnresolved:!Number.isInteger(r.parsed.carry)'));
});
test('carry is never a CSV column, stays OCR-only and has no manual UI',()=>{
 assert.ok(source.includes('function observedFromParsed(parsed)'));
 assert.ok(source.includes('carry:parsed.carry'));
 assert.ok(source.includes('function retryMissingCarryFromVisibleCard('));
 assert.ok(source.includes('function toPokesleepToolCsvRow('));
 assert.ok(source.includes('return [p.nickname,species,p.level'));
 assert.ok(source.includes('carry:false'));
 for(const forbidden of ['function carryManualChoices','function applyManuallyVerifiedCarry',
  'carrymanual','carryedit','carryconfirm','has-carry-review',
  'carryManualConfirmed','carryVerificationOutOfModel']){
   assert.equal(source.includes(forbidden),false,forbidden);
   assert.equal(html.includes(forbidden),false,forbidden);
 }
});
test('shape second opinion is explicitly non-authoritative',()=>{
 assert.match(fm,/function reviewShapeOpinion\(/);
 assert.match(fm,/automatic:false/);
 assert.match(source,/third\.shapeReview=opinion/);
 assert.match(source,/third\.reviewSuggestedName=opinion\.name/);
 assert.match(source,/third\?\.needsReview&&third\?\.method==='image'/);
 assert.doesNotMatch(source,/third\.name\s*=\s*opinion\.name/);
 assert.match(source,/形状照合の参考候補/);
 assert.match(source,/parsed\.carryNeedsReview=true/);
 assert.match(source,/carryOcrUnresolved:/);
});
