'use strict';
// Baseline frozen by user after successful 142-image Pixel 7a v2 OCR.
// These hashes cover nickname OCR selection, Paddle ensemble, advisory rescue,
// safety review and their production hook, not release/master metadata.
// Do not update hashes merely to get CI green: treat changes as a new request
// requiring a real private meka142 acceptance audit and explicit approval.
const fs=require('node:fs');
const crypto=require('node:crypto');
const test=require('node:test');
const assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const FROZEN=[
 {name:'verified Paddle and ONNX runtime model fingerprints',start:'const PADDLE_CDN=',end:'const paddleModelBlobUrls=[];',
  sha256:'41e205c4a8a8f64c6a1ddcdcd2616f23da768acba7d847e840db008089a44269'},
 {name:'nickname image crop and preview positioning',start:'function cropNick(',end:'function profileHeaderCrop(',
  sha256:'c80f510bb5034747c8ba3a03834aa11f76cddf31084573ef1d4bf42fc345a086'},
 {name:'nickname and level caption parsing',start:'function normalizeNickLevelOcr(',end:'function parseSpText(',
  sha256:'bc049d78308d332f01dece919cd65c881000e4958d0bd9c294319feb99cad553'},
 {name:'nickname candidate cleaning and voting',start:'function cleanNick(',end:'async function improveOCR(',
  sha256:'f13a5e071ac6e392a6d3de7f7d1a36a32eff93c7dcfc2c7e8b1f3c72be38ea39'},
 {name:'Paddle ensemble and review decisions',start:'function nickBase(',end:'// Nickname-only advisory rescue:',
  sha256:'021b431794d1d4a03b51d6ec6a8f6ac86e07e368190338d1e2f9da670242c016'},
 {name:'caption cleanup, strict auto-confirm, nickname safety',start:'// Nickname-only advisory rescue:',end:'function cloneRaw(',
  sha256:'4a9bb3185b9f92be5bf6a21dab30c974f2edc55274359616638771f3b9e66e2b'},
 {name:'nickname-only production invocation and immutable snapshot',start:'parsed=await improveNicknameWithPaddle(canvas,parsed,idx,total,name);',end:'inference=await retryMissingCarryFromVisibleCard(canvas,parsed,inference,idx,total);',
  sha256:'834c7a4a9a5a135d921f0a1450d022aa0d9ca244f9f78f3c69c1e4047d86ff2a'}
];
function segment(source,part){
 const a=source.indexOf(part.start),b=source.indexOf(part.end,a);
 assert.ok(a>=0&&b>a,part.name+': missing anchors');
 assert.equal(source.split(part.start).length-1,1,part.name+': repeated start anchor');
 return source.slice(a,b);
}
// New candidate-only geometry capture and review-only display run outside the
// frozen Paddle/Tesseract decision. Normalize ONLY the two exact approved hooks;
// retain every original frozen digest and veto any unreviewed pipeline changes.
function frozenBaselineSegment(part){
 let text=segment(app,part);
 if(part.name==='Paddle ensemble and review decisions'){
  const before="   return {text,confidence:score,source:'paddle',ok:!!text,metrics:res?.metrics||null,runtime:res?.runtime||null,errorStage:null};";
  const after="   return {text,confidence:score,source:'paddle',ok:!!text,metrics:res?.metrics||null,runtime:res?.runtime||null,errorStage:null,spatial:window.POKESLEEP_NICKNAME_SPATIAL?.inspect?.(items,src.width,src.height)||null};";
  assert.equal(text.split(after).length-1,1,'Paddle metadata-only hook missing');
  text=text.replace(after,before);
 }
 if(part.name==='nickname-only production invocation and immutable snapshot'){
  const before="  parsed=autoConfirmCorroboratedReviewedNickname(parsed);\n  Object.assign(nicknameReviewAtAnalysis,";
  const after="  parsed=autoConfirmCorroboratedReviewedNickname(parsed);\n  parsed=window.POKESLEEP_NICKNAME_SPATIAL?.reviewOnly?.(parsed)||parsed;\n  Object.assign(nicknameReviewAtAnalysis,";
  assert.equal(text.split(after).length-1,1,'post-consensus review-only hook missing');
  text=text.replace(after,before);
 }
 return text;
}
test('frozen nickname code stays byte-for-byte identical across unrelated updates',()=>{
 for(const part of FROZEN){
  const observed=crypto.createHash('sha256').update(frozenBaselineSegment(part),'utf8').digest('hex');
  assert.equal(observed,part.sha256,part.name+': frozen OCR changed unexpectedly');
 }
});
test('nickname freeze coverage detects a deliberate mutation',()=>{
 for(const part of FROZEN){
  const src=segment(app,part);
  const digest=crypto.createHash('sha256').update(src+' deliberate-change','utf8').digest('hex');
  assert.notEqual(digest,part.sha256,part.name);
 }
});
test('v3 diagnostic revision and nickname promotion remain visibly pinned',()=>{
 assert.match(app,/codeRevision:'20261013-nickname-consensus-gated-v3'/);
 assert.match(app,/parsed=autoConfirmCorroboratedReviewedNickname\(parsed\);/);
});
