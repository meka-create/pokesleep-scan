import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');

function extractFunction(name){
  const marker=`function ${name}(`;
  let start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  if(app.slice(Math.max(0,start-6),start)==='async ')start-=6;
  const namePos=app.indexOf(`function ${name}`,start),parenStart=app.indexOf('(',namePos);
  let pDepth=0,parenEnd=-1;
  for(let i=parenStart;i<app.length;i++){if(app[i]==='(')pDepth++;else if(app[i]===')'&&--pDepth===0){parenEnd=i;break;}}
  const bodyStart=app.indexOf('{',parenEnd);let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')depth++;else if(app[i]==='}'&&--depth===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

const names=[
  'speciesNeedsReview','foodDataNeedsReview','validPokemonLevelValue','validSkillLevelValue',
  'validMainSkillValue','validNatureValue','nicknameDataNeedsReview','levelDataNeedsReview',
  'skillLevelDataNeedsReview','mainSkillDataNeedsReview','natureDataNeedsReview',
  'resultReviewState','statusView','resultNeedsReview','subskillReviewSlots','subskillNeedsReview',
  'speciesIsMythical','runtimeErrorText','makeProcessingFailureResult'
];
const ctx={
  MAX_POKEMON_LEVEL:70,
  NATURES:['きまぐれ'],
  SUBSKILLS:['A','B','C','D','E'],
  LEVELS:[10,25,50,70,80],
  NO_FOOD:'―',
  MEW_VERSATILE_KEYS:new Set(['Metronome']),
  detailedMewVersatileSkill:p=>p?.versatileSkill||'',
  noneFoodAllowed:()=>false,
  manualSkillLevelMax:()=>8,
  chosenSpecies:r=>r?.speciesManualOverride||(r?.classification?.status==='UNIQUE'&&r.classification.candidates?.length===1?r.classification.candidates[0]:''),
  speciesMasterRows:()=>[],
  POKESLEEP_CLASSIFIER:{mainSkillMatches:(a,b)=>a===b}
};
vm.createContext(ctx);
vm.runInContext(names.map(extractFunction).join('\n')+'\nthis.api={makeProcessingFailureResult,resultReviewState,resultNeedsReview,statusView};',ctx);

const file={name:'broken.png'};
const r=ctx.api.makeProcessingFailureResult(file,'画像読み込み',new Error('decode failed'),123.4);
assert.equal(r.file,'broken.png');
assert.equal(r.processingError.stage,'画像読み込み');
assert.equal(r.processingError.message,'decode failed');
assert.equal(ctx.api.resultReviewState(r).processingError,true,'fatal processing errors must be review state');
assert.equal(ctx.api.resultNeedsReview(r),true,'fatal processing errors must survive review-only filter');
assert.deepEqual(Array.from(ctx.api.statusView(r)),['解析失敗','bad']);
assert.equal(r.parsed.subs.length,5);
assert.equal(r.foods.length,3);
assert.ok(r.foods.every(x=>x.needsReview));

for(const needle of [
  "makeProcessingFailureResult(file,activeStage,e,e.processingElapsedMs||0",
  "const analyzed=await analyzeSingleImage(file,i,batch.length",
  "setPausedAnalysis(batch,i,failed)",
  "results.filter(r=>!!r.processingError).length",
  "processing-error-note",
  "processing-failed"
]) assert.ok(app.includes(needle)||html.includes(needle),`missing failure-card flow: ${needle}`);

// A processing failure is retained, checkpointed, and pauses at that exact image.
const loopPos=app.indexOf('for(let i=startIndex;i<batch.length;i++)');
const analyzePos=app.indexOf('const analyzed=await analyzeSingleImage(file,i,batch.length',loopPos);
const catchFailurePos=app.indexOf('makeProcessingFailureResult(file,activeStage,e,e.processingElapsedMs||0',analyzePos);
const pausePos=app.indexOf('setPausedAnalysis(batch,i,failed)',catchFailurePos);
const pausedSavePos=app.indexOf("checkpointWriteResultAndMeta(failed,'paused',i,i)",pausePos);
const returnPos=app.indexOf('return false',pausedSavePos);
assert.ok(loopPos>=0 && analyzePos>loopPos && catchFailurePos>analyzePos && pausePos>catchFailurePos && pausedSavePos>pausePos && returnPos>pausedSavePos,'failure must be retained and pause the batch at the failed image');

// Mobile: level/species share a vertically aligned row; skill level starts immediately after the main-skill area rather than at the far right.
assert.ok(html.includes('#tbl tbody tr{grid-template-columns:72px minmax(0,180px) 58px minmax(0,1fr);align-items:start}'));
assert.ok(html.includes('#tbl .level-cell{order:3;grid-column:1;padding:7px 8px 7px 5px;align-self:stretch;display:flex!important;align-items:center;min-height:48px'));
assert.ok(html.includes('#tbl .pokemon-cell{order:4;grid-column:2/-1;padding:7px 5px;align-self:stretch;display:flex!important;align-items:center;min-height:48px'));
assert.ok(html.includes('#tbl .skill-level-cell{order:7;grid-column:3;margin-top:2px;margin-left:0;padding-left:0;text-align:left;justify-self:start'));
assert.ok(html.includes('width:58px;box-sizing:border-box')); // fixed skill-level column

console.log('OK: Candidate 54 failure-card review and mobile alignment regression passed');
