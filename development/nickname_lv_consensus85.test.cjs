'use strict';
// Synthetic-only tests. Real meka142 Golden, diagnostics, and filenames remain private.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const a=src.indexOf('function autoConfirmLevelCaptionConsensus85('),b=src.indexOf('// Review-only veto on conflicting small-kana readings.',a);
assert.ok(a>=0&&b>a,'targeted production helper must be present');
const ctx={
 MAX_POKEMON_LEVEL:100,
 cleanNick:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/^[|。!.,・\-_=]+|[|。!.,・\-_=]+$/g,''),
 exactSeparatedNickname:(text,level,side)=>{
  if(!Number.isInteger(level)||level<1||level>100)return '';
  const s=String(text||'').normalize('NFKC').replace(/\s+/g,'');
  const re=side==='front'?new RegExp('^Lv[.,]?'+level+'(?![0-9])','i'):new RegExp('Lv[.,]?'+level+'$','i');
  const m=s.match(re);return m?(side==='front'?s.slice(m[0].length):s.slice(0,m.index)):'';
 },
 nicknameLooksUiContaminated:s=>/(?:Lv[.,]?\s*(?:\d{1,3}|[A-Za-z])|SP\s*\d)/i.test(s),
 nicknameKnownSpeciesUiAffix:()=>false,nicknameNearSpeciesTypo:()=>false,
 nicknameHasUnbalancedClosingPunctuation:()=>false
};
vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);
function row({name='カゼノヒカリ',level=63,paddle='カゼノヒカリLv.63',pc=99.1,
 front='Lv.63カゼノヒカリ',tc=88,review=true,other=[]}={}){
 return {nickname:name,nicknameNeedsReview:review,nicknameResolvedBy:'',nicknameReviewReason:'OCR保留',
 nicknameManualConfirmed:false,level,levelNeedsReview:false,nicknamePaddleUnavailable:false,
 nicknamePaddle:{ok:true,text:paddle,confidence:pc},
 nicknameCandidates:[{text:front,confidence:tc,sources:[null]},...other],sp:3101,carry:30,foods:['A','B','C']};
}
const confirm=r=>ctx.autoConfirmLevelCaptionConsensus85(r);
test('85–89 independent OCR of exact opposite-side Lv captions promotes existing reviewed name only',()=>{
 for(const tc of [85,87,89,89.99]){
  const p=row({tc});const valueBefore=JSON.stringify({name:p.nickname,level:p.level,sp:p.sp,foods:p.foods});
  assert.equal(confirm(p),p);assert.equal(p.nicknameNeedsReview,false);
  assert.match(p.nicknameResolvedBy,/consensus-85/);
  assert.equal(JSON.stringify({name:p.nickname,level:p.level,sp:p.sp,foods:p.foods}),valueBefore);
 }
});
test('outside narrow 85–89 and weak Paddle fail closed',()=>{
 for(const p of [row({tc:84.9}),row({tc:90}),row({pc:97.9}),
  row({paddle:'カゼノヒカリLv.64'}),row({front:'Lv.64カゼノヒカリ'}),
  row({name:'カゼノピカリ'}),row({name:'ok',paddle:'okLv.63',front:'Lv.63ok'}),
  row({name:'カゼノヒカリLv.63'})]){
  confirm(p);assert.equal(p.nicknameNeedsReview,true);
 }
});
test('conflicting credible independent reading vetoes confirmation',()=>{
 const p=row({other:[{text:'Lv.63カゼノヒガリ',confidence:77,sources:[null]}]});
 confirm(p);assert.equal(p.nicknameNeedsReview,true);
});
test('duplicate Paddle reading cannot be mistaken for Tesseract witness',()=>{
 for(const p of [
  row({other:[],tc:0}),
  row({other:[],tc:88}),
 ]){
  p.nicknameCandidates=[{text:'Lv.63カゼノヒカリ',confidence:99,sources:['paddle']}];
  confirm(p);assert.equal(p.nicknameNeedsReview,true);
 }
});
test('unverified level, non-review, manual confirmation, no Paddle, and uncertain OCR abstain',()=>{
 const rows=[row(),row(),row(),row(),row(),row()];
 rows[0].levelNeedsReview=true;rows[1].nicknameNeedsReview=false;
 rows[2].nicknameManualConfirmed=true;rows[3].nicknamePaddle.ok=false;
 rows[4].nicknamePaddleUnavailable=true;rows[5].level=undefined;
 for(const p of rows){const before=JSON.stringify(p);confirm(p);assert.equal(JSON.stringify(p),before);}
});
test('production hook is after original strict gate and before spatial veto/snapshot',()=>{
 const old=src.indexOf('parsed=autoConfirmCorroboratedReviewedNickname(parsed);');
 const narrow=src.indexOf('parsed=autoConfirmLevelCaptionConsensus85(parsed);');
 const spatial=src.indexOf('parsed=window.POKESLEEP_NICKNAME_SPATIAL?.reviewOnly?.(parsed)||parsed;',old);
 const snapshot=src.indexOf('Object.assign(nicknameReviewAtAnalysis,',spatial);
 assert.ok(old>0&&old<narrow&&narrow<spatial&&spatial<snapshot);
 assert.equal(src.split('parsed=autoConfirmLevelCaptionConsensus85(parsed);').length-1,1);
});
