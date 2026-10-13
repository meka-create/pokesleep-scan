'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const start=src.indexOf('// Nickname-only advisory rescue:');
const end=src.indexOf('function nicknameLooksUiContaminated(',start);
assert.ok(start>=0&&end>start,'nickname-only production helper must exist');
const ctx={
 MAX_POKEMON_LEVEL:100,
 cleanNick:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/^[|。!.,・\-_=]+|[|。!.,・\-_=]+$/g,'')
};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx,{filename:'nickname-review-helper.js'});
const parse=(raw,lv)=>ctx.stripVerifiedNicknameLevelCaption(raw,lv);
function row({current,paddle,level=55,review=true,candidates=[]}){
 return {nickname:current,nicknameNeedsReview:review,level,sp:4400,helpSeconds:3300,
  nature:'ゆうかん',foods:'unmodified',nicknameResolvedBy:'',
  nicknamePaddle:{ok:true,confidence:98,text:paddle,cleanedText:paddle},
  nicknameCandidates:candidates};
}
test('exact on-screen level caption is removable from either end; wrong levels are not stripped',()=>{
 assert.equal(parse('Lv.55アオゾラ',55),'アオゾラ');
 assert.equal(parse('アオゾラLV.55',55),'アオゾラ');
 assert.equal(parse('LV.59ユウLV',59),'ユウ');
 assert.equal(parse('オハヨウLv.27LV.30LV',27),'オハヨウ');
 assert.equal(parse('Lv.55アオゾラ',54),'');
 assert.equal(parse('Lv.55アオゾラ',null),'');
 assert.equal(parse('Lv.55',55),'');
 assert.equal(parse('Lv.55カ',55),'');
});
test('existing reviewed nickname gains a cleaner editable candidate but stays reviewed',()=>{
 const r=row({current:'アオゾラに',paddle:'アオゾラLv.55'});
 const before={sp:r.sp,helpSeconds:r.helpSeconds,nature:r.nature,foods:r.foods};
 assert.equal(ctx.improveReviewedNicknameCaption(r),r);
 assert.equal(r.nickname,'アオゾラ');
 assert.equal(r.nicknameNeedsReview,true);
 assert.deepEqual({sp:r.sp,helpSeconds:r.helpSeconds,nature:r.nature,foods:r.foods},before);
 assert.equal(r.nicknameResolvedBy,'PaddleOCR-level-caption-review-only');
});
test('unreviewed names cannot be edited or auto-accepted by this helper',()=>{
 const r=row({current:'カナミ',paddle:'カナキLv.55',review:false});
 ctx.improveReviewedNicknameCaption(r);
 assert.equal(r.nickname,'カナミ');assert.equal(r.nicknameNeedsReview,false);
});
test('strong current Tesseract evidence vetoes Paddle truncation',()=>{
 const r=row({current:'カナマル',paddle:'カナLv.55',
  candidates:[{text:'Lv.55カナマル',confidence:93},{text:'カナLv.55',confidence:98}]});
 ctx.improveReviewedNicknameCaption(r);
 assert.equal(r.nickname,'カナマル');assert.equal(r.nicknameNeedsReview,true);
});
test('a second strong crop of Paddle candidate permits advisory replacement without auto-confirm',()=>{
 const r=row({current:'ヒマワエ',paddle:'ヒマワリLv.55',
  candidates:[{text:'Lv.55ヒマワエ',confidence:92},{text:'Lv.55ヒマワリ',confidence:80}]});
 ctx.improveReviewedNicknameCaption(r);
 assert.equal(r.nickname,'ヒマワリ');assert.equal(r.nicknameNeedsReview,true);
});
test('unavailable or weak Paddle evidence is inert',()=>{
 for(const bad of [{ok:false,confidence:100,text:'ユキLv.55'},{ok:true,confidence:89,text:'ユキLv.55'}]){
  const r=row({current:'ユキコ',paddle:'ユキLv.55'});r.nicknamePaddle=bad;
  ctx.improveReviewedNicknameCaption(r);
  assert.equal(r.nickname,'ユキコ');assert.equal(r.nicknameNeedsReview,true);
 }
});

test('post-structure retry recovers reviewed captions and refreshes immutable snapshot',()=>{
 for(const [caption,level,want] of [
  ['Lv.14ok',14,'ok'],['LV.17A70',17,'A70'],['LV.16B58',16,'B58']]){
  const p=row({current:caption,paddle:caption,level:null,review:true});
  ctx.improveReviewedNicknameCaption(p);
  assert.equal(p.nickname,caption);
  p.level=level;ctx.improveReviewedNicknameCaption(p);
  assert.equal(p.nickname,want);
  assert.equal(p.nicknameNeedsReview,true);
 }
 const rescue=src.indexOf('({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));');
 const retry=src.indexOf('parsed=improveReviewedNicknameCaption(parsed);',rescue);
 const snapshot=src.indexOf('Object.assign(nicknameReviewAtAnalysis,',rescue);
 assert.ok(rescue>=0 && retry>rescue && snapshot>retry,'snapshot must reflect final nickname');
});

test('all other production code is byte-for-byte identical to pre-nickname baseline',()=>{
 const crypto=require('node:crypto');
 let restored=src.slice(0,start)+src.slice(end);
 const call='parsed=improveReviewedNicknameCaption(parsed);';
 assert.equal(restored.split(call).length-1,2,'nickname hook before and after level rescue');
 restored=restored.replace(call,'');
 const later=`({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));`;
 // Replace only the added post-structure review segment with its original flow.
 const post="({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));\n  // Retry nickname-only caption cleanup after structured OCR provides a verified level.\n  // Reconcile the immutable OCR-time snapshot with the final reviewed candidate.\n  parsed=improveReviewedNicknameCaption(parsed);\n  Object.assign(nicknameReviewAtAnalysis,{value:parsed.nickname,needsReview:!!parsed.nicknameNeedsReview,reason:parsed.nicknameReviewReason||'',resolvedBy:parsed.nicknameResolvedBy||''});\n  inference=await retryMissingCarryFromVisibleCard";
 const old='({parsed,inference}=await rescueStructured(canvas,raw,parsed,inference,idx,total));inference=await retryMissingCarryFromVisibleCard';
 assert.equal(restored.split(post).length-1,1);
 restored=restored.replace(post,old);
 restored=restored.replace("codeRevision:'20261013-nickname-caption-review-v2-postrescue'",
  "codeRevision:'20261013-food3-pixel-v6-direct-files'");
 const sha=crypto.createHash('sha256').update(restored,'utf8').digest('hex');
 assert.equal(sha,'365ae89c57ea414a0fcf196c965fb4023718953bca07c437a62c3a190a5d7c46',
  'non-nickname implementation changed unexpectedly');
});
