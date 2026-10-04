import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

// ⑩ Species prefix search normalizes full/half width and katakana -> hiragana,
// so hiragana input matches the displayed katakana species names.
const functionNames=['toHiragana','speciesSearchKey','speciesPrefixMatch'];
let source='';
for(const name of functionNames){
  const marker=`function ${name}(`;
  const start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  let i=app.indexOf('{',start),depth=0,end=-1;
  for(;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}' && --depth===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  source+=app.slice(start,end)+'\n';
}
const ctx={};
vm.createContext(ctx);
vm.runInContext(source+'this.match=speciesPrefixMatch;',ctx);
assert.equal(ctx.match('ピカチュウ','ぴか'),true);
assert.equal(ctx.match('ミュウ','みゅう'),true);
assert.equal(ctx.match('フシギダネ','ふしぎ'),true);
assert.equal(ctx.match('ウパー (パルデア)','うぱー'),true);
assert.equal(ctx.match('ピカチュウ','ちゅう'),false,'search must remain prefix-only');
assert.equal(ctx.match('ピカチュウ','ﾋﾟｶ'),true,'NFKC half-width input should still work');

// ⑪ The duplicate row-level "要確認" badge is omitted. More important states remain.
assert.ok(app.includes("const statusBadge=st==='要確認'?'':`<span class=\"status-pill ${cl}\">${st}</span>`"));
assert.ok(app.includes("return ['手動入力中','warn']"));
assert.ok(app.includes("return ['手動補完済','ok']"));
assert.ok(app.includes("return ['読取失敗','bad']"));
assert.ok(app.includes("<span class=\"card-status-slot\">${statusBadge}</span>${imageButton('file-open-mobile')}"));
assert.ok(app.includes('${processingErrorHtml}${manualAction}</td>')||app.includes('${processingErrorHtml}${manualAction}'));

// TIPS wording should be concise and explain that the value is shown only when calculable.
assert.ok(html.includes('※「一緒に眠った時間」は、計算で確定できた場合のみ表示されます。'));
assert.ok(!html.includes('画面上では確定できる場合のみ'));

console.log('OK: Candidate 52 steps ⑩-⑪ + TIPS regression passed');
