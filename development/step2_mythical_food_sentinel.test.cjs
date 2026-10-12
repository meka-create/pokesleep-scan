'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','food_matcher.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const start=source.indexOf('function resolveSlots('),end=source.indexOf('// Independent shape recheck',start);
assert.ok(start>=0&&end>start,'expected resolver implementation exists');
const ctx={
 F:{foods:{'マメミート':{},'げきからハーブ':{},'あまいミツ':{}}},
 uniqueProfiles:hits=>hits.map(h=>({foods:h.foods})),
 cropFood:(_canvas,key)=>({key}),matchCanvas:(_crop,allowed)=>({
  name:allowed[0]||'',score:.95,second:allowed[1]||'',secondScore:.4,margin:.55,
  ranking:allowed.map(name=>({name,score:.9}))
 }),matchDimmedFoodIcon:(_crop,allowed)=>({name:allowed[0]||'',score:.92,margin:.45,ranking:[]})
};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
test('― is a legal absent-food sentinel, not a missing sprite',()=>{
 const inference={hits:[
  {foods:['マメミート','マメミート','げきからハーブ']},
  {foods:['マメミート','マメミート','―']}
 ]};
 const slots=ctx.resolveSlots({},inference,59);
 assert.equal(slots.length,3);
 assert.equal(slots[2].method,'image');
 assert.equal(slots[2].needsReview,undefined);
 assert.equal(slots[2].name,'げきからハーブ');
 assert.deepEqual(Array.from(slots[2].allowed),['げきからハーブ','―']);
 assert.deepEqual(Array.from(slots[2].ranking.map(x=>x.name)),['げきからハーブ']);
 assert.doesNotMatch(slots[2].method,/missing/);
});
test('absence alone is never auto-inferred',()=>{
 const slots=ctx.resolveSlots({}, {hits:[{foods:['マメミート','マメミート','―']}]},59);
 assert.equal(slots[2].name,'');
 assert.equal(slots[2].needsReview,true);
 assert.equal(slots[2].reviewReason,'no-regular-food-template');
});
test('a real missing food template always fails closed despite sentinel',()=>{
 const slots=ctx.resolveSlots({}, {hits:[
  {foods:['マメミート','マメミート','げきからハーブ']},
  {foods:['マメミート','マメミート','謎の食材']},
  {foods:['マメミート','マメミート','―']}
 ]},59);
 assert.equal(slots[2].needsReview,true);
 assert.equal(slots[2].reviewReason,'missing-food-template');
});
test('single real legal food without absent sentinel remains inferred',()=>{
 const slots=ctx.resolveSlots({}, {hits:[{foods:['マメミート','マメミート','げきからハーブ']}]},59);
 assert.equal(slots[2].method,'db-inferred');
 assert.equal(slots[2].name,'げきからハーブ');
});
test('independent actual-absence image proof remains mandatory',()=>{
 assert.match(app,/function noFoodTemplateEligible\(legal,emptyScore,regularBestScore\)/);
 assert.match(app,/regularBestScore\+1e-12>=NO_FOOD_EMPTY_MARGIN_MIN/);
 assert.match(app,/async function applySafeNoFoodTemplate\(canvas,inference,foods\)/);
 assert.match(app,/f\.name=NO_FOOD;f\.score=emptyScore/);
 assert.match(app,/const NO_FOOD='―'/);
});
