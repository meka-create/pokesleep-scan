'use strict';
// Synthetic-only review-picker tests. Never include the private 142-image corpus.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
function between(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j);}
const ctx={
 MAX_POKEMON_LEVEL:70,
 cleanNick:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/^[|。!.,・\\-_=]+|[|。!.,・\\-_=]+$/g,''),
 chosenSpecies:r=>r.species||'',
 validPokemonLevelValue:n=>Number.isInteger(n)&&n>=1&&n<=70
};
vm.createContext(ctx);
vm.runInContext(between('function exactSeparatedNickname(', 'function autoConfirmCorroboratedReviewedNickname('),ctx);
vm.runInContext(between('function nicknameLooksUiContaminated(', 'function nicknameKnownSpeciesUiAffix('),ctx);
vm.runInContext(between('function nicknameLevelSeparatedReviewSuggestions(', 'function nicknameCandidatePlaceholder('),ctx);
const row=(texts,nick='ふあてい',level=60,review=true)=>({
 nickname:nick,level,nicknameNeedsReview:review,levelNeedsReview:false,
 nicknameCandidates:texts.map(([text,confidence])=>({text,confidence,source:'synthetic'}))
});
test('a lower-ranked matching level caption moves a clean suggestion to the top without auto-confirming',()=>{
 const p=row([['ふあてい',96],['Lv.60ふぁあてい',82],['Lv.60ふぁあてい',81],['Lv.59ふぁあてい',99]]);
 const before=JSON.stringify(p);
 const choices=ctx.nicknameAlternativeRows({species:'ダグトリオ'},p,p.nickname);
 assert.equal(choices[0].text,'ふぁあてい');
 assert.equal(choices[0].levelSeparated,true);
 assert.equal(choices[1].species,true);
 assert.ok(choices.some(x=>x.text==='Lv.60ふぁあてい'));
 assert.equal(JSON.stringify(p),before,'UI ranking must not mutate OCR or review state');
 assert.equal(p.nicknameNeedsReview,true);
});
test('normalization deduplicates identical names from prefix and suffix level captions',()=>{
 const p=row([['Lv.60あかさたな',87],['あかさたなLv.60',92],['Lv.60あかさたな',85]]);
 const list=ctx.nicknameLevelSeparatedReviewSuggestions(p);
 assert.equal(list.length,1);
 assert.equal(list[0].text,'あかさたな');
 assert.equal(list[0].count,3);
 assert.equal(list[0].confidence,92);
});
test('unverified or wrong levels never generate normalized candidates',()=>{
 for(const p of [
  row([['Lv.59あかさたな',99]],'ふあてい',60),
  {...row([['Lv.60あかさたな',99]]),levelNeedsReview:true},
  row([['Lv.60あかさたな',79]]),
  row([['あかLv.60さたな',96]]),
  row([['Lv.60',99]]),
  row([['Lv.60あ',99]]),
  row([['Lv.60あかさたな',99]],'ふあてい',60,false)
 ])assert.equal(ctx.nicknameLevelSeparatedReviewSuggestions(p).length,0);
});
test('a deliberate Lv nickname remains selectable unchanged alongside any review-only suggestion',()=>{
 const p=row([['Lv.60あかさたな',99],['あかさたなLv.60',95]],'ニック',60);
 const choices=ctx.nicknameAlternativeRows({species:'架空種'},p,p.nickname);
 assert.equal(choices[0].text,'あかさたな');
 assert.ok(choices.some(x=>x.text==='Lv.60あかさたな'));
 assert.ok(choices.some(x=>x.text==='あかさたなLv.60'));
});
test('picker uses same metadata in first render and dynamic refresh',()=>{
 assert.match(src,/opt\.textContent=\x60\$\{row\.text\}\$\{row\.levelSeparated/);
 assert.match(src,/\$\{esc\(x\.text\)\}\$\{x\.levelSeparated/);
 assert.equal(src.split('function nicknameLevelSeparatedReviewSuggestions(').length-1,1);
});
