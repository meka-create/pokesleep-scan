import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');

function extractFunction(name){
  const marker=`function ${name}(`;
  const start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  let i=app.indexOf('{',start),depth=0,end=-1;
  for(;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}' && --depth===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

const names=[
  'speciesNeedsReview','foodDataNeedsReview','validPokemonLevelValue','validSkillLevelValue',
  'validMainSkillValue','validNatureValue','nicknameDataNeedsReview','levelDataNeedsReview',
  'skillLevelDataNeedsReview','mainSkillDataNeedsReview','natureDataNeedsReview',
  'resultReviewState','statusView','resultNeedsReview','subskillReviewSlots','subskillNeedsReview',
  'speciesIsMythical'
];
const source=names.map(extractFunction).join('\n');
const ctx={
  MAX_POKEMON_LEVEL:70,
  NATURES:['きまぐれ','すなお'],
  SUBSKILLS:['おてつだいボーナス','きのみの数S','スキル確率アップS','食材確率アップS','最大所持数アップS'],
  LEVELS:[10,25,50,70,80],
  NO_FOOD:'―',
  MEW_VERSATILE_KEYS:new Set(['Metronome']),
  detailedMewVersatileSkill:p=>p?.versatileSkill||'',
  noneFoodAllowed:()=>false,
  manualSkillLevelMax:species=>species==='フシギダネ'?6:8,
  chosenSpecies:r=>r?.speciesManualOverride||(r?.classification?.status==='UNIQUE'&&r.classification.candidates?.length===1?r.classification.candidates[0]:''),
  speciesMasterRows:name=>name==='フシギダネ'?[{name,mainSkill:'食材ゲットS'}]:name==='ミュウ'?[{name,mainSkill:'オールマイティー',mythIng:[]}]:[],
  POKESLEEP_CLASSIFIER:{mainSkillMatches:(a,b)=>a===b}
};
vm.createContext(ctx);
vm.runInContext(source+'\nthis.api={resultReviewState,resultNeedsReview,statusView,subskillReviewSlots};',ctx);

const complete=()=>({
  classification:{status:'UNIQUE',candidates:['フシギダネ']},
  speciesManualOverride:'フシギダネ',
  parsed:{nickname:'フシギダネ',nicknameNeedsReview:false,level:25,skillLevel:2,mainSkill:'食材ゲットS',nature:'きまぐれ',subs:[
    {value:'おてつだいボーナス'},{value:'きのみの数S'},{value:'スキル確率アップS'},{value:'食材確率アップS'},{value:'最大所持数アップS'}
  ]},
  foods:[{name:'A',needsReview:false},{name:'B',needsReview:false},{name:'C',needsReview:false}]
});

let r=complete();
assert.equal(ctx.api.resultNeedsReview(r),false,'complete row should not require review');
assert.deepEqual(Array.from(Object.entries(ctx.api.resultReviewState(r)).filter(([,v])=>v).map(([k])=>k)),[]);

for(const [field,mutate] of [
  ['nickname',r=>{r.parsed.nickname='';}],
  ['level',r=>{r.parsed.level=null;}],
  ['skillLevel',r=>{r.parsed.skillLevel=null;}],
  ['mainSkill',r=>{r.parsed.mainSkill='';}],
  ['nature',r=>{r.parsed.nature='';}],
  ['foods',r=>{r.foods[1].name='';}],
  ['subskills',r=>{r.parsed.subs[2].value='';}],
]){
  r=complete(); mutate(r);
  const state=ctx.api.resultReviewState(r);
  assert.equal(state[field],true,`${field} must keep the row in review`);
  assert.equal(ctx.api.resultNeedsReview(r),true,`${field} must be included by resultNeedsReview`);
  assert.equal(ctx.api.statusView(r)[0],'要確認',`${field} must show 要確認 status semantics`);
}

r=complete();
r.parsed.subs[4].value='おてつだいボーナス';
assert.deepEqual(Array.from(ctx.api.subskillReviewSlots(r)),[0,4],'duplicate subskills should both be review slots');
assert.equal(ctx.api.resultNeedsReview(r),true);

r=complete();
r.speciesManualOverride='ミュウ';
r.classification={status:'MISSING_INPUT',candidates:[]};
r.parsed.mainSkill='オールマイティー';
r.parsed.versatileSkill='';
r.parsed.skillLevel=8;
r.parsed.subs=[{value:''},{value:''},{value:''},{value:''},{value:''}];
r.foods=[{name:'A',needsReview:false},{name:'B',needsReview:false},{name:'C',needsReview:false}];
assert.equal(ctx.api.resultReviewState(r).mainSkill,true,'Mew concrete Versatile skill must remain part of main-skill review');
assert.deepEqual(Array.from(ctx.api.subskillReviewSlots(r)),[],'mythical blank subskills remain allowed');

// Static UI/flow checks: every newly unified field has an item-level badge path,
// and completion progress uses row-level review consistency rather than a partial sum.
for(const needle of [
  'reviewState.level?',
  'reviewState.skillLevel?',
  'reviewState.mainSkill?',
  'reviewState.nature?',
  'else if(reviewState.nickname)',
  'reviews=results.filter(resultNeedsReview).length'
]) assert.ok(app.includes(needle),`missing unified review UI/flow: ${needle}`);

console.log('OK: Candidate 53 unified review consistency regression passed');
