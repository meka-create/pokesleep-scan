'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
 vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function sourceFunction(name){
 const source=app.split('\n').find(line=>line.startsWith('function '+name+'('));
 assert.ok(source,'Missing '+name);return source;
}
const parts=['toHiragana','speciesSearchKey','speciesPrefixMatch','choicePickerRowMatches'].map(sourceFunction);
const ctx={};
vm.createContext(ctx);
vm.runInContext(parts.join('\n'),ctx);
const match=(candidate,query)=>ctx.choicePickerRowMatches({label:candidate},query);
test('ミ or み immediately matches ミュウ (and full-width/half-width kana)',()=>{
 for(const q of ['ミ','み','ミュ','みゅ','ﾐ','ﾐｭ','みゅう','ミュウ']){
  assert.equal(match('ミュウ',q),true,'Failed prefix '+q);
 }
 assert.equal(match('ミュウ','ュ'),false);
 assert.equal(match('ミュウ','ゅう'),false);
 assert.equal(match('ミュウ','ゆ'),false);
 assert.equal(match('ミュウ','みや'),false);
});
test('Hiragana and katakana prefixes are interchangeable across all candidates',()=>{
 for(const [label,queries] of [
  ['ピカチュウ',['ぴ','ピ','ぴか','ピカ']],
  ['ほっこりポテト',['ほ','ホ','ほっ','ホッ']],
  ['きのみの数S',['き','キ','きの','キノ']],
  ['せっかち',['せ','セ','せっ','セッ']],
  ['おてつだいスピードM',['お','オ','おて','オテ']],
  ['ニャース（種族名候補）',['に','ニ','にゃ','ニャ']],
  ['ゆめのかけらゲットS',['ゆ','ユ','ゆめ','ユメ']]
 ])for(const q of queries)assert.equal(match(label,q),true,label+' '+q);
});
test('All picker candidate searches are strictly prefix, never substring',()=>{
 for(const [label,q] of [
  ['ミュウ','ゅう'],['ピカチュウ','カ'],['ほっこりポテト','ぽてと'],
  ['きのみの数S','数'],['せっかち','かち'],['おてつだいスピードM','スピ'],
  ['ニャース（種族名候補）','種族'],['ゆめのかけらゲットS','かけら']
 ])assert.equal(match(label,q),false,label+' unexpectedly matched '+q);
 assert.equal(match('ミュウ',''),true);
 assert.equal(match('ミュウ','   '),true);
 assert.equal(match('ミュウ','みゅうつー'),false);
});
test('Shared picker search handles case folding, whitespace and NFKC',()=>{
 assert.equal(match('SkillS','sK'),true);
 assert.equal(match('ピカチュウ','　ぴか　'),true);
 assert.equal(match('ミュウ','ミｭ'),true);
});
test('All actual search fields use the shared prefix predicate',()=>{
 assert.match(app,/function choicePickerRowMatches\(row,query\)\{return speciesPrefixMatch\(row\?\.label\|\|'',query\);\}/);
 assert.match(app,/choicePickerOptions\.filter\(x=>choicePickerRowMatches\(x,q\)\)/);
 assert.match(app,/allSpeciesNames\(\)\.filter\(n=>speciesPrefixMatch\(n,q\)\)/);
 assert.match(app,/search\.oninput=\(\)=>\{renderChoicePickerOptions\(search\.value\)/);
 assert.doesNotMatch(sourceFunction('choicePickerRowMatches'),/\.includes\(/);
});
test('Nickname heading is shown above standard and unresolved inputs exactly once',()=>{
 assert.match(app,/if\(!manual\)nicknameHtml='<div class="nickname-field-label">ニックネーム<\/div>'\+nicknameHtml/);
 assert.match(app,/if\(manual\).*?manual-inline-label.*?ニックネーム/);
 assert.match(html,/\.nickname-field-label\{margin-bottom:3px;color:#9299a8;font-size:9px;font-weight:850/);
});
