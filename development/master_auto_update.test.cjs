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
 const ctx={window:{},F:{foods:{}},cropFood:()=>{throw Error('Unexpected icon scoring')}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const result=ctx.resolveSlots(null,{hits:[{foods:['将来の新食材','将来の新食材','将来の新食材']}]},1);
 assert.equal(result[0].needsReview,true);
 assert.equal(result[0].name,'');
 assert.equal(result[0].method,'missing-template');
});
test('registered new food follows standard automatic recognition',()=>{
 const source=fs.readFileSync(path.join(root,'food_matcher.js'),'utf8');
 const start=source.indexOf('function uniqueProfiles('),end=source.indexOf('// Independent shape recheck',start);
 const ctx={window:{},F:{foods:{'未来の食材':{w:1,h:1,rgba:[0,0,0,0]}}},
   cropFood:()=>{throw Error('Single allowed food does not require crop')}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const food=ctx.resolveSlots(null,{hits:[{foods:['未来の食材','未来の食材','未来の食材']}]},30)[0];
 assert.equal(food.name,'未来の食材');assert.equal(food.method,'db-inferred');
 assert.notEqual(food.needsReview,true);
});
test('new known food in species and CSV follows normal eligibility rules',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const names=['manualAutoFirstFood','autoResolveFirstFoodForSpecies','foodSlotNeedsReview','csvFoodResolvedForPokesleepTool'];
 const lines=app.split('\n'),source=names.map(n=>{
   const s=lines.find(line=>line.startsWith('function '+n+'('));
   assert.ok(s,'missing '+n);return s;
 }).join('\n');
 const ctx={NO_FOOD:'―',manualFoodOptions:()=>['未来の食材'],
 chosenSpecies:()=> 'future',speciesFoodReviewSlots:()=>[],
 manualProfilesForSpecies:()=>[['未来の食材','未来の食材','未来の食材']]};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 assert.equal(ctx.manualAutoFirstFood('future'),'未来の食材');
 const r={foods:[{name:'',needsReview:true}]};
 assert.equal(ctx.autoResolveFirstFoodForSpecies(r,'future'),true);
 assert.equal(ctx.foodSlotNeedsReview(r,0),false);
 assert.equal(ctx.csvFoodResolvedForPokesleepTool('future',r.foods[0],0),true);
});
test('future species are never blanket-blocked solely because they are new',()=>{
 const cls=fs.readFileSync(path.join(root,'classifier.js'),'utf8');
 const shared=fs.readFileSync(path.join(root,'shared_master.js'),'utf8');
 const matcher=fs.readFileSync(path.join(root,'food_matcher.js'),'utf8');
 assert.doesNotMatch(cls,/BASELINE_SPECIES|POKESLEEP_BASELINE_SKILLS/);
 assert.doesNotMatch(shared,/POKESLEEP_BASELINE_SPECIES|POKESLEEP_BASELINE_SKILLS|POKESLEEP_BASELINE_FOODS/);
 assert.doesNotMatch(matcher,/new-food-review/);
});
test('checkpoints are master-bound, while v7-v11 baseline sessions remain recoverable',()=>{
 const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const begin=source.indexOf('function checkpointMasterKey()'),end=source.indexOf('function checkpointMeta(',begin);
 assert.ok(begin>=0&&end>begin,'no master-specific checkpoint guard');
 const state={sha256:'d60410ba1f92d80c67ca3ff40bc8aa7a2cd51d4c03fc33f9e99fa83bb8e77a38'};
 const ctx={window:{POKESLEEP_SHARED_MASTER:{getStatus:()=>state}}};
 vm.createContext(ctx);vm.runInContext(source.slice(begin,end),ctx);
 const legacy={releaseId:'2026-10-12-android-roi-standard-inline-add-v7',
   compatibilityId:'checkpoint-compat-2026-10-12-android-roi-standard-inline-add-v7'};
 assert.equal(ctx.checkpointMasterMatches(legacy),true,'v7 checkpoint migration must survive');
 assert.equal(ctx.checkpointMasterMatches({...legacy,releaseId:'2026-10-06-older-master'}),false);
 assert.equal(ctx.checkpointMasterMatches({masterSha256:state.sha256}),true);
 assert.equal(ctx.checkpointMasterMatches({masterSha256:'f'.repeat(64)}),false);
 state.sha256='a'.repeat(64);
 assert.equal(ctx.checkpointMasterMatches(legacy),false);
 assert.equal(ctx.checkpointMasterMatches({masterSha256:state.sha256}),true);
 assert.match(source,/masterSha256:checkpointMasterKey\(\)/);
 assert.match(source,/if\(!checkpointMasterMatches\(meta\)\)return \{masterChanged:true,meta,files\}/);
 assert.match(source,/tx\.objectStore\('results'\)\.clear\(\)/);
 assert.match(source,/await runAnalysisBatch\(\[\.\.\.selected\],0\)/);
});
test('unknown food energy coefficients never become automatic classifier candidates',()=>{
 const text=fs.readFileSync(path.join(root,'classifier.js'),'utf8');
 assert.equal(text.split('Object.hasOwn(ING_BASE,it.key)').length,3);
 assert.match(text,/Object.assign\(ING_BASE,window.POKESLEEP_EXTRA_INGREDIENT_STRENGTH/);
 assert.equal(text.split('Object.hasOwn(BERRY_BASE,sp.type)').length,3);
 assert.doesNotMatch(text,/POKESLEEP_BASELINE_SKILLS/);
});


test('pending new species shows accurate copy; sync failure and local master faults stay failures',()=>{
 const src=fs.readFileSync(path.join(root,'master-update-status.js'),'utf8');
 const a=src.indexOf('function localFailure()'),b=src.indexOf('async function refresh()',a);
 assert.ok(a>=0&&b>a,'health rendering segment must exist');
 const ctx={window:{POKESLEEP_SHARED_MASTER:{getStatus:()=>({source:'verified-local-master'})}},
   badge:{hidden:true},dialog:{open:false,close(){this.open=false}},
   title:{textContent:''},message:{textContent:''},current:{state:'pending',reason:'init'}};
 vm.createContext(ctx);
 vm.runInContext(src.slice(a,b),ctx);
 vm.runInContext("render({state:'attention',reason:'NEW_SPECIES_PENDING'})",ctx);
 assert.equal(ctx.badge.hidden,false);
 assert.match(ctx.title.textContent,/新しいポケモンのデータ/);
 assert.match(ctx.message.textContent,/既存のマスターデータは正常/);
 vm.runInContext("render({state:'attention',reason:'SYNC_FAILED'})",ctx);
 assert.match(ctx.title.textContent,/マスター更新を確認できませんでした/);
 ctx.window.POKESLEEP_SHARED_MASTER.getStatus=()=>({source:'fallback'});
 vm.runInContext("render({state:'attention',reason:'NEW_SPECIES_PENDING'})",ctx);
 assert.match(ctx.title.textContent,/マスター更新を確認できませんでした/);
});
