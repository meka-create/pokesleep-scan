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
test('frozen nickname code stays byte-for-byte identical across unrelated updates',()=>{
 for(const part of FROZEN){
  const observed=crypto.createHash('sha256').update(segment(app,part),'utf8').digest('hex');
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
