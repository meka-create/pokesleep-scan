import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const master=fs.readFileSync(new URL('../master_data.js', import.meta.url),'utf8');
const classifier=fs.readFileSync(new URL('../classifier.js', import.meta.url),'utf8');

function extractFunction(name){
  const marker=`function ${name}(`;
  let start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  if(app.slice(Math.max(0,start-6),start)==='async ')start-=6;
  let i=app.indexOf('{',start),depth=0,end=-1;
  for(;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}' && --depth===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

// 1) Mobile skill level uses a dedicated fixed-width grid column and no longer floats
// according to the main-skill text length.
assert.match(html,/#tbl tbody tr\{grid-template-columns:72px minmax\(0,180px\) 58px minmax\(0,1fr\)/);
assert.match(html,/#tbl \.main-skill-cell\{[^}]*grid-column:1\/3[^}]*min-width:0/);
assert.match(html,/#tbl \.skill-level-cell\{[^}]*grid-column:3[^}]*width:58px/);

// 2) A regular species with exactly one food-1 value is deterministic; Mew/Darkrai stay selectable.
const ctx={window:{},console};
vm.createContext(ctx);
vm.runInContext(master,ctx);
vm.runInContext(classifier,ctx);
ctx.POKESLEEP_CLASSIFIER=ctx.window.POKESLEEP_CLASSIFIER;
ctx.speciesMasterRows=name=>ctx.window.POKESLEEP_MASTER.pokemon.filter(sp=>sp.name===name);
vm.runInContext([
  extractFunction('manualProfilesForSpecies'),
  extractFunction('manualFoodOptions'),
  extractFunction('manualAutoFirstFood'),
  extractFunction('autoResolveFirstFoodForSpecies'),
  extractFunction('releaseAutoResolvedFirstFood')
].join('\n')+'\nthis.api={manualAutoFirstFood,autoResolveFirstFoodForSpecies,releaseAutoResolvedFirstFood};',ctx);
assert.equal(ctx.api.manualAutoFirstFood('フシギダネ'),'あまいミツ');
assert.equal(ctx.api.manualAutoFirstFood('ピカチュウ'),'とくせんリンゴ');
assert.equal(ctx.api.manualAutoFirstFood('ミュウ'),'');
assert.equal(ctx.api.manualAutoFirstFood('ダークライ'),'');
const r={foods:[{name:'誤候補',needsReview:true,reviewSelection:'誤候補'}]};
assert.equal(ctx.api.autoResolveFirstFoodForSpecies(r,'フシギダネ'),true);
assert.equal(r.foods[0].name,'あまいミツ');
assert.equal(r.foods[0].needsReview,false);
assert.equal(r.foods[0].autoResolvedFromSpecies,true);
assert.equal(r.foods[0].manualOverride,false);
assert.equal(ctx.api.releaseAutoResolvedFirstFood(r),true);
assert.equal(r.foods[0].name,'');
assert.equal(r.foods[0].needsReview,true);
assert.equal(r.foods[0].autoResolvedFromSpecies,undefined);
assert.match(app,/if\(autoFood\)return `<div class="food-review-block manual-food-block is-auto-resolved"/);

// 3) Failed manual cutouts are not cached as a permanent empty success. A later retry
// re-decodes the source and fills all previously missing previews.
let failDecode=true;
const pctx={
  console,
  runtimeErrorText:e=>e?.message||String(e),
  imageToCanvas:async()=>{if(failDecode)throw new Error('temporary decode failure');return {ok:true};},
  crop:(_c,key)=>({toDataURL:()=>`data:${key}`}),
  POKESLEEP_FOOD_MATCHER:{cropFood:(_c,key)=>({toDataURL:()=>`data:${key}`})}
};
vm.createContext(pctx);
vm.runInContext([
  extractFunction('manualPreviewState'),
  extractFunction('manualPreviewEntries'),
  extractFunction('manualPreviewGet'),
  extractFunction('manualPreviewSet'),
  extractFunction('ensureManualPreviews')
].join('\n')+'\nthis.api={ensureManualPreviews};',pctx);
const pr={sourceFile:{name:'x.png'}};
assert.equal(await pctx.api.ensureManualPreviews(pr),false);
assert.equal(pr.manualPreviews.profile,'');
assert.match(pr.manualPreviewErrors.profile,/temporary decode failure/);
assert.match(pr.manualPreviewErrors.foods[1],/temporary decode failure/);
failDecode=false;
assert.equal(await pctx.api.ensureManualPreviews(pr),true);
assert.equal(pr.manualPreviews.profile,'data:nicklevel');
assert.equal(pr.manualPreviews.foods[0],'data:food1');
assert.equal(pr.manualPreviews.foods[2],'data:food3');
assert.equal(pr.manualPreviews.subs[4],'data:sub80');
assert.equal(pr.manualPreviewErrors.profile,'');
assert.equal(pr.manualPreviewErrors.foods[1],'');
assert.match(app,/class="manual-preview-retry"/);
assert.match(app,/\.manual-preview-retry'\)\)b\.addEventListener\('click'/);
assert.match(html,/\.manual-preview-error\{/);

console.log('OK: Candidate 56 fixed skill column / auto food1 / retryable manual previews regression passed');
