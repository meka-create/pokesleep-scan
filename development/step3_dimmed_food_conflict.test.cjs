'use strict';
// Safety regression for desaturated, level-locked ingredient icons. Purely
// synthetic ranking fixtures; never upload private game screenshots or CSVs.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const foodSource=fs.readFileSync(path.join(root,'food_matcher.js'),'utf8');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
const win={POKESLEEP_FOOD_COLOR_FEATURES:{foods:{}}};
vm.runInNewContext(foodSource,{window:win,document:{}});
const decide=win.POKESLEEP_FOOD_MATCHER.arbitrateDimmedFoodEvidence;
const colors=(first='めざましコーヒー',second='ほっこりポテト')=>({
 name:first,score:.77,second,secondScore:.75,margin:.02,
 ranking:[{name:first,score:.77},{name:second,score:.75}]
});
const shapes=(first='ほっこりポテト',second='めざましコーヒー',score=.82,runner=.69)=>[
 {name:first,score},{name:second,score:runner}
];
test('color / shape contradiction on locked food2 cannot be auto-confirmed',()=>{
 const color=colors(),r=decide(color,shapes());
 assert.equal(r.name,'めざましコーヒー','Do not secretly replace the color top choice');
 assert.equal(r.second,'ほっこりポテト');
 assert.equal(r.needsReview,true);
 assert.equal(r.dimmedShapeConflict,true);
 assert.equal(r.reviewReason,'dimmed-color-shape-disagreement');
 assert.equal(r.shapeReview.name,'ほっこりポテト');
 assert.equal(r.shapeReview.automatic,false);
 assert.deepEqual(Array.from(r.ranking, x=>x.name),
  ['めざましコーヒー','ほっこりポテト'],'Keep the color ranking for review');
});
test('opposite rank contradiction and weak shape both fail closed',()=>{
 const opposite=decide(colors('ほっこりポテト','めざましコーヒー'),
  shapes('めざましコーヒー','ほっこりポテト'));
 assert.equal(opposite.needsReview,true);
 assert.equal(opposite.name,'ほっこりポテト');
 const weak=decide(colors(),shapes('めざましコーヒー','ほっこりポテト',.73,.72));
 assert.equal(weak.needsReview,true);
 assert.equal(weak.reviewReason,'dimmed-shape-not-corroborated');
});
test('consistent and distinctive evidence stays accepted',()=>{
 const agree=decide(colors(),shapes('めざましコーヒー','ほっこりポテト',.83,.70));
 assert.equal(agree.name,'めざましコーヒー');
 assert.equal(!!agree.needsReview,false);
 assert.equal(agree.shapeReview.automatic,false);
});
function segment(a,b){
 const i=appSource.indexOf(a),j=appSource.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,a);
 return appSource.slice(i,j);
}
const guard={FOOD_REVIEW_MARGIN:.015};
vm.createContext(guard);
vm.runInContext(segment('function hasUnreviewedDimmedFoodConflict(f){','function guardLockedFood3DimmedArbitration('),guard);
vm.runInContext(segment('function foodDataNeedsReview(r){','function validPokemonLevelValue('),guard);
test('saved pre-fix shape arbitration is reflagged on load',()=>{
 const legacy={method:'image',name:'ほっこりポテト',
  score:.83,margin:.12,needsReview:false,dimmedShapeArbitration:true,
  colorRanking:[{name:'めざましコーヒー',score:.77},{name:'ほっこりポテト',score:.75}]};
 assert.equal(guard.hasUnreviewedDimmedFoodConflict(legacy),true);
 const fixed=guard.markFoodReviews([legacy])[0];
 assert.equal(fixed.needsReview,true);
 assert.equal(fixed.reviewReason,'dimmed-color-shape-disagreement');
 assert.equal(guard.foodDataNeedsReview({foods:[legacy]}),true,
  'Even an unmodified historical checkpoint must block silent CSV confirmation');
 const manual={...legacy,manualOverride:true};
 assert.equal(guard.hasUnreviewedDimmedFoodConflict(manual),false);
 assert.equal(guard.foodDataNeedsReview({foods:[manual]}),false);
});
test('normal unambiguous food / single-choice master does not gain review',()=>{
 const inputs=[{method:'db-inferred',name:'ほっこりポテト',score:1,margin:1},
  {method:'image',name:'めざましコーヒー',score:.96,secondScore:.70,margin:.26}];
 const output=guard.markFoodReviews(inputs);
 assert.ok(output.every(x=>!x.needsReview));
});
test('production flow checks the persistent conflict before output',()=>{
 assert.match(appSource,/function applyResultReviewSafetyGuards\(r\)[\s\S]*?hasUnreviewedDimmedFoodConflict\(f\)/);
 assert.match(appSource,/function foodDataNeedsReview\(r\)[\s\S]*?hasUnreviewedDimmedFoodConflict\(x\)/);
 assert.match(appSource,/markFoodReviews\(POKESLEEP_FOOD_MATCHER\.resolveSlots\(/);
});
