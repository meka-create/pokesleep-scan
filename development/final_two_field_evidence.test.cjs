'use strict';
// Synthetic-only regression for the final two reviewed, non-nickname fields.
// Real meka142 images, Golden rows and diagnostic OCR text are never committed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const matcherSource=fs.readFileSync('food_matcher.js','utf8');
const win={POKESLEEP_FOOD_COLOR_FEATURES:{foods:{}}};
vm.runInNewContext(matcherSource,{window:win,document:{}});
const food=win.POKESLEEP_FOOD_MATCHER;
function locked(){
 return {name:'ワカクサ大豆',score:.919,margin:.0368,second:'ずっしりカボチャ',
 ranking:[{name:'ワカクサ大豆',score:.919},{name:'ずっしりカボチャ',score:.8822}],
 needsReview:true,reviewReason:'dimmed-shape-not-corroborated',
 shapeReview:{name:'ワカクサ大豆',second:'ずっしりカボチャ',
 score:.969,secondScore:.930,margin:.039,automatic:false,method:'dimmed-shape-advisory',
 ranking:[{name:'ワカクサ大豆',score:.969},{name:'ずっしりカボチャ',score:.930}]},
 method:'image',allowed:['ずっしりカボチャ','ワカクサ大豆']};
}
test('locked food2: close margins and two concordant metrics can release review without changing the name',()=>{
 const x=locked(),before=JSON.stringify(x);
 const w=food.secondFoodColorShapeNearMarginWitness(x,15,'UNIQUE');
 assert.equal(w.name,'ワカクサ大豆');assert.equal(w.automatic,true);
 assert.equal(x.needsReview,true);assert.equal(JSON.stringify(x),before);
});
test('locked food2: any weak, conflicting, unaudited or ambiguous evidence abstains',()=>{
 const mutations=[
  x=>{x.shapeReview.name='ずっしりカボチャ';},
  x=>{x.shapeReview.second='ワカクサ大豆';},
  x=>{x.shapeReview.automatic=true;},
  x=>{x.shapeReview.score=.964;},
  x=>{x.shapeReview.margin=.0349;},
  x=>{x.shapeReview.margin=.0401;},
  x=>{x.score=.914;},
  x=>{x.margin=.0349;},
  x=>{x.margin=.0401;},
  x=>{x.needsReview=false;},
  x=>{x.manualOverride=true;},
  x=>{x.reviewReason='dimmed-color-shape-disagreement';},
  x=>{x.allowed=['ワカクサ大豆'];},
  x=>{x.allowed.push('ほっこりポテト');},
  x=>{x.shapeReview.ranking.push({name:'ほっこりポテト',score:.5});},
  x=>{x.shapeReview.ranking[0].name='ずっしりカボチャ';},
  x=>{x.ranking[0].name='ずっしりカボチャ';},
  x=>{x.method='db-inferred';}
 ];
 for(const mutate of mutations){const x=locked();mutate(x);
  assert.equal(food.secondFoodColorShapeNearMarginWitness(x,15,'UNIQUE'),null,
   'fail closed: '+JSON.stringify(x));}
 for(const level of [0,30,60,NaN,undefined])
  assert.equal(food.secondFoodColorShapeNearMarginWitness(locked(),level,'UNIQUE'),null);
 assert.equal(food.secondFoodColorShapeNearMarginWitness(locked(),15,'AMBIGUOUS'),null);
});
function part(start,end){const a=app.indexOf(start),b=app.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,start);return app.slice(a,b);}
const ctx={SUBSKILLS:['スキルレベルアップS','スキルレベルアップM','最大所持数アップM'],
 SUBSKILL_EXP_PAIR:new Set(['睡眠EXPボーナス','リサーチEXPボーナス'])};
vm.createContext(ctx);
vm.runInContext(part('function subskillEvidenceDecision(entries,current=\'\'){',
 '// A dedicated PSM7 card read is exact and distinctive'),ctx);
vm.runInContext(part('function corroborateStrongSubskillAgainstWeakNoise(',
 'function subskillNeedsTargetedVerification('),ctx);
function sub(){return [
 {source:'composite',psm:'6',crop:'primary',text:'弱い誤読',confidence:55.6,
  value:'スキルレベルアップM',score:.642857,distinctive:false},
 {source:'verify-composite',psm:'6',crop:'threshold190',text:'Lv.50',
  confidence:45,value:'',score:0,distinctive:false},
 {source:'dedicated',psm:'7',crop:'verification',text:'スキルレベルアップS',
  confidence:87,value:'スキルレベルアップS',score:1,distinctive:true}
];}
function decide(entries){return ctx.subskillEvidenceDecision(entries,'スキルレベルアップS');}
test('subskill: one exact dedicated OCR outweighs one weak non-distinctive competing suffix',()=>{
 const entries=sub(),old=decide(entries);assert.equal(old.needsReview,true);
 assert.equal(old.value,'スキルレベルアップS');
 const before=JSON.stringify(entries);const out=ctx.corroborateStrongSubskillAgainstWeakNoise(entries,old);
 assert.equal(out.value,'スキルレベルアップS');assert.equal(out.needsReview,false);
 assert.equal(JSON.stringify(entries),before);
});
test('subskill: strong competitor, weak dedicated or unaudited risk retains review',()=>{
 const mutations=[
  x=>{x[0].distinctive=true;},
  x=>{x[0].confidence=60;},
  x=>{x[0].score=.70;},
  x=>{x[2].confidence=84;},
  x=>{x[2].score=.98;},
  x=>{x[2].source='composite';},
  x=>{x[2].psm='11';},
  x=>{x[2].crop='other';},
  x=>{x.push({...x[2],source:'fallback',psm:'6'});},
  x=>{x[0].value='最大所持数アップM';},
  x=>{x.push({...x[0],value:'最大所持数アップM'});}
 ];
 for(const mutate of mutations){const entries=sub();mutate(entries);
  const old=decide(entries),result=ctx.corroborateStrongSubskillAgainstWeakNoise(entries,old);
  assert.equal(result.needsReview,true,JSON.stringify(entries));}
});
test('subskill and food2 production rescue hooks are scoped and preserve original values',()=>{
 assert.match(app,/decision=corroborateStrongSubskillAgainstWeakNoise\(entries,decision\);const chosen=/);
 assert.match(app,/secondFoodColorShapeNearMarginWitness\(/);
 assert.match(app,/if\(witness&&witness.name===second.name\)/);
 assert.match(app,/second\.method='image-locked-food2-color-shape-agreement'/);
 assert.match(app,/second\.needsReview=false;/);
});
