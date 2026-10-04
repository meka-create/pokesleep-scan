import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');

function extractFunction(name){
  const marker=`function ${name}(`;
  let start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  if(app.slice(Math.max(0,start-6),start)==='async ')start-=6;
  const fnStart=app.indexOf(`function ${name}`,start);
  const parenStart=app.indexOf('(',fnStart);
  let pDepth=0,parenEnd=-1;
  for(let i=parenStart;i<app.length;i++){
    if(app[i]==='(')pDepth++;
    else if(app[i]===')' && --pDepth===0){parenEnd=i;break;}
  }
  const bodyStart=app.indexOf('{',parenEnd);
  let depth=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){
    if(app[i]==='{')depth++;
    else if(app[i]==='}' && --depth===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

for(const marker of [
  'analysisPause=null',
  '解析を一時停止しました',
  '再解析して再開',
  '停止した画像から再開',
  'const exportDisabled=isRunning||!!analysisPause||!results.length',
  'if(!selected.length||isRunning||analysisPause',
  'batch.splice(pauseIndex,1)',
  'await runAnalysisBatch(batch,pauseIndex)',
  'async function resumeAfterManualCompletion(ri)',
  'async function decodeImageSource(file)',
  'async function ocrCompositeWithRecovery(canvas,idx,total)'
]) assert.ok(app.includes(marker),`missing pause/resume marker: ${marker}`);
assert.ok(!app.includes('未処理画像も結果一覧に残しています'),'old failure-flood path must be removed');

const controls=new Map();
const $=sel=>{if(!controls.has(sel))controls.set(sel,{disabled:false});return controls.get(sel);};
const calls=[];
let failIndex=1;
const ctx={
  console:{error(){},warn(){},log(){}},setTimeout,Promise,Array,Number,Math,
  selected:[{name:'0.png'},{name:'1.png'},{name:'2.png'},{name:'3.png'}],
  results:[],worker:null,isRunning:false,analysisPause:null,renderPending:false,
  $,
  syncSessionGuard(){},syncRunActionButton(){},render(){},renderDuringAnalysis(){},reviewEditorActive(){return false;},
  setProgressState(){},setFloatingProgress(){},refreshCompletedProgress(){ctx.completed=true;},
  async ensureWorker(){},async resetWorker(){ctx.resetCount=(ctx.resetCount||0)+1;},async resetAnalysisRuntimeForRetry(){ctx.resetCount=(ctx.resetCount||0)+1;},
  async checkpointWriteResult(){return true;},async checkpointWriteResultAndMeta(){return true;},async checkpointPrepareRetry(){return true;},async checkpointReadStableFile(index){return ctx.selected[index];},cloneStableImageSource(file){return file;},async saveAnalysisCheckpoint(){return true;},async clearAnalysisCheckpoint(){return true;},
  async stableImageSource(f){return f;},
  runtimeErrorText(e){return e?.message||String(e);},
  makeProcessingFailureResult(file,stage,error,elapsedMs,{sourceFile,sourceIndex}){return {file:file.name,sourceFile,sourceIndex,processingError:{stage,message:error?.message||String(error)},elapsedMs};},
  async analyzeSingleImage(file,idx,total,{sourceIndex,displayName}){calls.push(sourceIndex);if(sourceIndex===failIndex)throw Object.assign(new Error('mobile decoder transient failure'),{processingStage:'画像読み込み',processingSourceFile:file,processingElapsedMs:12});return {file:displayName,sourceFile:file,sourceIndex,processingError:null};}
};
vm.createContext(ctx);
const code=[
  extractFunction('pausedFailureIndex'),
  extractFunction('setPausedAnalysis'),
  extractFunction('runAnalysisBatch'),
  extractFunction('retryProcessingFailure')
].join('\n')+'\nthis.api={runAnalysisBatch,retryProcessingFailure};';
vm.runInContext(code,ctx);

await ctx.api.runAnalysisBatch(ctx.selected,0);
assert.deepEqual(calls,[0,1],'batch must stop immediately at first processing error');
assert.equal(ctx.results.length,2,'only successful cards plus the failed card should exist at pause');
assert.equal(ctx.results[1].processingError.stage,'画像読み込み');
assert.equal(ctx.analysisPause.index,1);
assert.equal(ctx.isRunning,false);

failIndex=-1;
await ctx.api.retryProcessingFailure(1);
assert.equal(ctx.analysisPause,null,'successful retry should clear pause');
assert.deepEqual(calls,[0,1,1,2,3],'retry must restart at failed image, then continue remaining images');
assert.equal(ctx.results.length,4);
assert.deepEqual(ctx.results.map(r=>r.sourceIndex),[0,1,2,3]);
assert.equal(ctx.completed,true);
assert.ok(ctx.resetCount>=1,'worker/runtime should be rebuilt before paused retry');

console.log('OK: Candidate 62 processingError pause/resume regression passed');
