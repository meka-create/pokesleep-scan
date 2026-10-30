'use strict';
// Synthetic-only safety tests. Do not commit real screenshots, nickname corpus or Golden.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const part=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j);};
const mew={norm:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/[|\[\]{}<>「」『』【】=＿_—–―:：]/g,'')};
vm.createContext(mew);
vm.runInContext(part('function corroboratedMewDreamShardFallback(parsed){','function detailedMewVersatileSkill('),mew);
function mewCase({raw='オールマイティー (ゆめのかけらゲット??)',retry='オールマイティー (ゆめのはかけらゲットS) Lv.8',confidence=86,psm='11'}={}){
 return {mainSkill:'オールマイティー',mainSkillRaw:raw,structuredRescue:{attempts:{skillLevel:[{text:retry,confidence,psm}]}}};
}
test('two noisy OCR sources can confirm one Mew alternate skill with one extra kana',()=>{
 assert.equal(mew.corroboratedMewDreamShardFallback(mewCase()),'Dream Shard Magnet S (Random)');
});
test('no second witness, weak second witness and wrong main skill fail closed',()=>{
 for(const x of [
  mewCase({raw:'オールマイティー'}),mewCase({confidence:79}),
  mewCase({psm:'7'}),mewCase({retry:'オールマイティー (食材ゲットS) Lv.8'}),
  {...mewCase(),mainSkill:'エナジーチャージS'},
  mewCase({retry:'オールマイティー (ゆめのかなかけらゲットS) Lv.8'})
 ])assert.equal(mew.corroboratedMewDreamShardFallback(x),'');
});
const nick={
 cleanNick:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/^[|。!.,・\-_=]+|[|。!.,・\-_=]+$/g,''),
 exactSeparatedNickname:(s,lv,side)=>side==='front'?String(s).replace(new RegExp('^Lv[.,]?'+lv+'(?![0-9])','i'),''):'',
 editDistance:(a,b)=>{let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let q=[i];for(let j=1;j<=b.length;j++)q[j]=Math.min(q[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=q;}return p[b.length];}
};
vm.createContext(nick);vm.runInContext(part('function reviewConflictingSmallKanaNickname(parsed){','function cloneRaw('),nick);
function caseNick(name='きあてい',level=60,readings=[['Lv.60きぁあてい',82]]){
 return {nickname:name,level,nicknameNeedsReview:false,nicknameManualConfirmed:false,levelNeedsReview:false,
  nicknamePaddle:{ok:true,confidence:91},
  nicknameCandidates:readings.map(([text,confidence])=>({text,confidence,sources:[null]}))};
}
test('independent small-kana disagreement creates review without changing the nickname',()=>{
 const r=caseNick(),name=r.nickname;
 nick.reviewConflictingSmallKanaNickname(r);
 assert.equal(r.nickname,name);assert.equal(r.nicknameNeedsReview,true);
 assert.match(r.nicknameReviewReason,/仮名/);
});
test('credible exact Tesseract witness vetoes review; weak and off-level alternatives do not trigger',()=>{
 const exact=caseNick('きゅうし',50,[['Lv.50きゆうし',89],['Lv.50きゅうし',88]]);
 nick.reviewConflictingSmallKanaNickname(exact);assert.equal(exact.nicknameNeedsReview,false);
 for(const x of [caseNick('きあてい',60,[['Lv.60きぁあてい',79]]),
  caseNick('きあてい',60,[['Lv.59きぁあてい',92]]),
  {...caseNick(),nicknamePaddle:{ok:false}},
  {...caseNick(),nicknameManualConfirmed:true}]){
  nick.reviewConflictingSmallKanaNickname(x);assert.equal(x.nicknameNeedsReview,false);
 }
});
test('a shared small kana with an unrelated consonant disagreement does not create review',()=>{
 const r=caseNick('キョコクタン',60,[['Lv.60キョコクダン',85]]);
 nick.reviewConflictingSmallKanaNickname(r);assert.equal(r.nicknameNeedsReview,false);
});
test('only post-classification review hook is added, and preview is retained',()=>{
 assert.match(src,/reviewConflictingSmallKanaNickname\(p\)/);
 assert.match(src,/if\(parsed\.nicknameNeedsReview&&!result\.nicknamePreview\)result\.nicknamePreview=/);
 assert.match(src,/tesseractAverageMs:scanPerfRounded/);
 assert.match(src,/stageTotalsMs:Object\.fromEntries/);
});
