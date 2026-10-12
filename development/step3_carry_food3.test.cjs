'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
const fm=fs.readFileSync(path.join(root,'food_matcher.js'),'utf8');
const grab=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,a);return source.slice(i,j)};
const A=grab('function parseExplicitCarryEvidence(reading){','function detectWhiteMint(canvas){');
const B=grab('function carryManualChoices(r){','function resultReviewState(r){');
const ctx={
 REF_W:691,layoutInfo:c=>c.layout,cropCanvasRect:(_c,r)=>({rect:r}),
 inferParsed:p=>({status:'UNIQUE',hits:[{pokemon:'ミュウ',calculatedCarry:p.carry}]}),
 chosenSpecies:r=>r.species||'',
 recomputeClassificationFromFoods:r=>{r.recomputed=true},
 ocrSingle:async(src,_label,_i,_total,opt)=>({text:'44 個',confidence:85,psm:opt.psm}),
};
vm.createContext(ctx);vm.runInContext(A+B,ctx);
const observed=(n,opts={})=>({text:n+' 個',value:n,crop:opts.crop||'tight',psm:opts.psm||'7',confidence:opts.conf||90});
const inference={status:'UNIQUE',candidates:['ミュウ'],
 hits:[38,39,41,44,46].map(n=>({pokemon:'ミュウ',calculatedCarry:n}))};
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
test('visible card corroboration updates parsed carry and inference',async()=>{
 const p={carry:null},c={width:691,height:1536,layout:{
   time:{start:309,end:344},carry:{start:395,end:430},main:{start:512,end:550}
 }};
 const got=await ctx.retryMissingCarryFromVisibleCard(c,p,inference,0,1);
 assert.equal(p.carry,44);assert.equal(p.carryRetry.status,'corroborated-needs-user-verification');
 assert.equal(p.carryNeedsReview,true);
 assert.equal(got.status,'UNIQUE');assert.equal(p.carryRetry.readings.length,3);
});
test('only legal classifier carry values can be manually confirmed',()=>{
 const r={species:'ミュウ',parsed:{carry:null},inference};
 assert.deepEqual(Array.from(ctx.carryManualChoices(r)),[38,39,41,44,46]);
 assert.equal(ctx.applyManuallyVerifiedCarry(r,20),false);
 assert.equal(r.parsed.carry,null);
 assert.equal(ctx.applyManuallyVerifiedCarry(r,44),true);
 assert.equal(r.parsed.carry,44);assert.equal(r.parsed.carryManualConfirmed,true);
 assert.equal(r.parsed.carryNeedsReview,false);
 assert.equal(r.recomputed,true);
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
 assert.match(source,/p\.carryNeedsReview=false/);
});
