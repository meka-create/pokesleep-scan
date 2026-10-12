"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const master=JSON.parse(fs.readFileSync(path.join(root,'shared/MASTER_DATA.json')));
const receipt=JSON.parse(fs.readFileSync(path.join(root,'shared/master_release.json')));
test('receipt owned by pokesleep-scan, no AI Scan dependency',()=>{
 assert.equal(receipt.sourceRepo,'nitoyon/pokesleep-tool');
 assert.equal(receipt.speciesCount,master.pokemon.length);
 assert.equal(receipt.ingredientCount,Object.keys(master.ingredients).length);
 assert.match(receipt.sha256,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(fs.readFileSync(path.join(root,'shared_master.js'),'utf8'),/pokesleep-ai-scan/);
});
test('unrecognized ingredient graphic never classified as one of existing images',()=>{
 const source=fs.readFileSync(path.join(root,'food_matcher.js'),'utf8');
 const start=source.indexOf('function uniqueProfiles(');
 const end=source.indexOf('// Independent shape recheck',start);
 assert.ok(start>=0&&end>start);
 const ctx={F:{foods:{}},cropFood:()=>{throw Error('Unexpected icon scoring')}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const result=ctx.resolveSlots(null,{hits:[{foods:['将来の新食材','将来の新食材','将来の新食材']}]},1);
 assert.equal(result[0].needsReview,true);
 assert.equal(result[0].name,'');
 assert.equal(result[0].method,'missing-template');
});
test('unknown food energy coefficients never become automatic classifier candidates',()=>{
 const text=fs.readFileSync(path.join(root,'classifier.js'),'utf8');
 assert.equal(text.split('Object.hasOwn(ING_BASE,it.key)').length,3);
 assert.equal(text.split('Object.hasOwn(BERRY_BASE,sp.type)').length,3);
 assert.equal(text.split('POKESLEEP_BASELINE_SKILLS.has(sp.skill)').length,3);
});
