'use strict';
// Synthetic-only review-picker regression. No private screenshots or Golden rows.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
function between(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return src.slice(i,j);}
const ctx={
 MAX_POKEMON_LEVEL:70,
 cleanNick:s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').replace(/^[|。!.,・\-_=]+|[|。!.,・\-_=]+$/g,''),
 validPokemonLevelValue:n=>Number.isInteger(n)&&n>=1&&n<=70,
 chosenSpecies:r=>r?.species||''
};
vm.createContext(ctx);
vm.runInContext(between('function exactSeparatedNickname(', 'function autoConfirmCorroboratedReviewedNickname('),ctx);
vm.runInContext(between('function nicknameLooksUiContaminated(', 'function nicknameKnownSpeciesUiAffix('),ctx);
vm.runInContext(between('function nicknameLevelSeparatedReviewSuggestions(', 'function nicknameCandidatePlaceholder('),ctx);
const row=(texts,nick='ふあてい',level=60,review=true)=>({
 nickname:nick,level,nicknameNeedsReview:review,levelNeedsReview:false,
 nicknameCandidates:texts.map(([text,confidence])=>({text,confidence,source:'synthetic'}))
});
const choices=(p,draft=p.nickname)=>Array.from(ctx.nicknameAlternativeRows({species:'架空種'},p,draft)).map(x=>x.text).filter(x=>x!=='架空種');
test('front, back and bare versions collapse into ONE clean nickname; never show raw Lv',()=>{
 const p=row([['Lv.60ふぁあてい',82],['ふぁあていLv.60',81],
 ['ふぁあてい',95],['Lv.59ふぁあてい',99],['ふあてい',96]]);
 const before=JSON.stringify(p),items=choices(p);
 assert.deepEqual(items,['ふぁあてい']);
 assert.equal(ctx.nicknameLevelSeparatedReviewSuggestions(p).find(x=>x.text==='ふぁあてい').count,3);
 assert.equal(JSON.stringify(p),before,'review-only picker must never mutate OCR readings');
 assert.equal(p.nicknameNeedsReview,true);
});
test('NFKC-equivalent captions and repeated OCR candidates deduplicate after cleaning',()=>{
 const p=row([['Ｌｖ．６０あかさたな',87],['あかさたなLv.60',92],
  ['Lv.60あかさたな',85],['あかさたな',70]]);
 const list=ctx.nicknameLevelSeparatedReviewSuggestions(p);
 assert.equal(list.length,1);
 assert.equal(list[0].text,'あかさたな');
 assert.equal(list[0].count,4);
 assert.equal(list[0].confidence,92);
 assert.deepEqual(choices(p),['あかさたな']);
});
test('a wrong or unverified level never produces an unsafe visible option',()=>{
 for(const p of [
  row([['Lv.59あかさたな',99]]),
  {...row([['Lv.60あかさたな',99]]),levelNeedsReview:true},
  row([['あかLv.60さたな',96]]),
  row([['Lv.60',99]]),
  row([['Lv.60あ',99]]),
  row([['Lv.60あかさたなLv.60',95]]),
  row([['Lv.ああ',99]]), // numeric portion mis-OCRed as Japanese
  row([['テストLV.◇',96]]), // malformed appended Lv must not be offered
  row([['Lv.60あかさたな',59]])
 ])assert.deepEqual(choices(p),[]);
});
test('malformed Lv OCR cannot leak into dropdown alongside a clean reading',()=>{
 const p=row([['テストLV.△',95],['Lv.にあい',91],['Lv.60きれい',84],['きれい',78]],'手入力',60);
 const opts=choices(p);
 assert.deepEqual(opts,['きれい']);
 assert.ok(opts.every(x=>!/lv/i.test(x)));
});
test('a clean candidate remains visible even when level is unverified',()=>{
 const p={...row([['れたす',75],['Lv.60れたす',94]]),levelNeedsReview:true};
 assert.deepEqual(choices(p),['れたす']);
});
test('restored species suggestion displays a plain name beside level-free OCR candidates',()=>{
 const p=row([['Lv.60あかさたな',95],['あかさたなLv.60',90],
  ['Lv.59あかさたな',99],['あかさたな',80]],'ニック');
 const rows=Array.from(ctx.nicknameAlternativeRows({species:'架空種'},p,p.nickname));
 assert.deepEqual(Array.from(rows,x=>x.text),['あかさたな','架空種']);
 assert.equal(rows.some(x=>x.species||x.levelSeparated),false);
 assert.ok(!rows.some(x=>x.text.includes('Lv')));
 assert.equal(ctx.nicknameCandidatePlaceholder?.(rows),undefined,'helper is not in this isolated context');
});
test('species option is unique, omitted when being edited, and never overrides OCR',()=>{
 const p=row([['Lv.60架空種',96],['架空種',88],['Lv.60候補',92]],'手入力');
 const before=JSON.stringify(p);
 assert.deepEqual(Array.from(ctx.nicknameAlternativeRows({species:'架空種'},p,'手入力'),x=>x.text),['架空種','候補']);
 assert.deepEqual(Array.from(ctx.nicknameAlternativeRows({species:'架空種'},p,'架空種'),x=>x.text),['候補']);
 assert.equal(JSON.stringify(p),before);
 assert.equal(p.nicknameNeedsReview,true);
});
test('species stays visible within eight choices even with a full OCR candidate list',()=>{
 const p=row(Array.from({length:9},(_,i)=>['候補'+(i+10),90-i]),'手入力');
 const options=Array.from(ctx.nicknameAlternativeRows({species:'架空種'},p,'手入力'),x=>x.text);
 assert.equal(options.length,8);
 assert.equal(options[options.length-1],'架空種');
 assert.equal(new Set(options).size,8);
});
test('draft selection removes its normalized duplicate and leaves other choices',()=>{
 const p=row([['Lv.60あかさたな',92],['あかさたな',88],
   ['Lv.60かきくけこ',82]],'ニック');
 assert.deepEqual(choices(p,'あかさたな'),['かきくけこ']);
});
test('already-confirmed OCR does not create review-only options',()=>{
 const p=row([['Lv.60あかさたな',98]],'ニック',60,false);
 assert.deepEqual(choices(p),[]);
});
test('picker first render and refresh use plain names and the same helper',()=>{
 assert.match(src,/opt\.textContent=row\.text;/);
 assert.match(src,/const nickAltNames=nicknameAlternativeRows\(r,p,nickDraft\);/);
 assert.match(src,/const nickCandidateOptions=nickAltNames\.map\(x=>\x60<option value="\$\{esc\(x\.text\)\}">\$\{esc\(x\.text\)\}<\/option>\x60\)/);
 assert.doesNotMatch(src,/row\.levelSeparated\?'（Lv表示を分離）'/);
 assert.equal(src.split('function nicknameLevelSeparatedReviewSuggestions(').length-1,1);
});
