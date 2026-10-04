import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const one=prefix=>{const line=app.split('\n').find(x=>x.startsWith(prefix));assert.ok(line,`missing ${prefix}`);return line;};
const block=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a);assert.ok(a>=0&&b>a,`missing block ${start}`);return app.slice(a,b);};
const source=[
  block('const MEW_VERSATILE_SKILLS=[','const NATURES='),
  one('function norm('),
  one('function mewVersatileSkillFromText('),
  one('function mewVersatileSkillLabel('),
  one('function rescueTextValues('),
  one('function detailedMewVersatileSkill('),
  one('function detailedMewMainSkill('),
].join('\n');
const sandbox={};vm.createContext(sandbox);vm.runInContext(`${source}\nthis.api={MEW_VERSATILE_SKILLS,MEW_VERSATILE_KEYS,mewVersatileSkillFromText,mewVersatileSkillLabel,detailedMewVersatileSkill,detailedMewMainSkill};`,sandbox);
const a=sandbox.api;
assert.equal(a.MEW_VERSATILE_SKILLS.length,12,'must match pokesleep-tool VersatileCandidates count');
assert.equal(a.MEW_VERSATILE_KEYS.size,12);
for(const x of a.MEW_VERSATILE_SKILLS){
  assert.equal(a.mewVersatileSkillFromText(`オールマイティー (${x.label}) Lv.1`),x.key,`OCR label -> explicit key: ${x.label}`);
  assert.equal(a.mewVersatileSkillLabel(x.key),x.label);
}
const dream='Dream Shard Magnet S (Random)';
assert.equal(a.mewVersatileSkillFromText('きのみジュース オールマイティー (ゆめ の かけら ゲッ ト S) Lv.8'),dream);
assert.equal(a.detailedMewVersatileSkill({versatileSkill:dream}),dream);
assert.equal(a.detailedMewMainSkill({versatileSkill:dream}),'オールマイティー (ゆめのかけらゲットS)');
assert.equal(a.detailedMewVersatileSkill({versatileSkill:'',mainSkillRaw:'オールマイティー (ゆめのかけらゲットS) Lv.1'}),dream);
assert.equal(a.detailedMewVersatileSkill({versatileSkill:'',mainSkillRaw:'オールマイティー Lv.1'}),'');
assert.match(app,/class="manual-editor-input manual-versatile-skill"/,'manual Mew editor needs a dedicated concrete-skill selector');
assert.match(app,/オールマイティーの具体スキルを選択してください/,'manual validation must require concrete skill');
assert.match(app,/ミュウの具体スキル未確定/,'CSV preflight must summarize unresolved Mew skills');
assert.match(app,/versatileRows>0/,'CSV must block unresolved Mew Versatile');
assert.match(app,/p\.versatileSkill=d\.species==='ミュウ'/,'manual confirmation must persist explicit Versatile state');
assert.match(app,/parsed\.versatileSkill=detailedMewVersatileSkill\(parsed\)/,'OCR/rescue result must sync explicit Versatile state');
console.log('OK: Candidate 50 step 1 Mew Versatile explicit-state regression passed');
