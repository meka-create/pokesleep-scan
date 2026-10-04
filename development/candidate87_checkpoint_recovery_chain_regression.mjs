import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

function extractFunction(name){
  const marker=`function ${name}(`;
  let start=app.indexOf(marker);
  assert.ok(start>=0,`missing ${name}`);
  if(app.slice(Math.max(0,start-6),start)==='async ')start-=6;
  const fnStart=app.indexOf(`function ${name}`,start);
  const parenStart=app.indexOf('(',fnStart);
  let p=0,parenEnd=-1;
  for(let i=parenStart;i<app.length;i++){
    if(app[i]==='(')p++;
    else if(app[i]===')'&&--p===0){parenEnd=i;break;}
  }
  const bodyStart=app.indexOf('{',parenEnd);
  let d=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){
    if(app[i]==='{')d++;
    else if(app[i]==='}'&&--d===0){end=i+1;break;}
  }
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

// Normal batch transitions must commit result + progress meta atomically.
assert.ok(app.includes("checkpointWriteResultAndMeta(analyzed,'running',i+1,null)"));
assert.ok(app.includes("checkpointWriteResultAndMeta(failed,'paused',i,i)"));
assert.ok(!app.includes("results.push(analyzed);await checkpointWriteResult(analyzed)"));
assert.ok(!app.includes("await checkpointWriteResult(failed);await saveAnalysisCheckpoint('paused',i,i)"));
assert.ok(app.includes("meta.status==='paused'?r.sourceIndex<=pausedIndex:r.sourceIndex<runningNext"),'restore must discard legacy result rows beyond the committed meta boundary');

const calls=[];
const controls=new Map();
const batchCtx={
  console:{error(){},warn(){},log(){}},Promise,Array,Number,Math,setTimeout,
  selected:[{name:'0.png'},{name:'1.png'}],results:[],isRunning:false,analysisPause:null,renderPending:false,
  $:sel=>{if(!controls.has(sel))controls.set(sel,{disabled:false});return controls.get(sel);},
  syncSessionGuard(){},syncRunActionButton(){},render(){},renderDuringAnalysis(){},reviewEditorActive(){return false;},
  setProgressState(){},setFloatingProgress(){},refreshCompletedProgress(){},
  async ensureWorker(){},async stableImageSource(f){return f;},runtimeErrorText(e){return e?.message||String(e);},
  makeProcessingFailureResult(file,stage,error,elapsedMs,{sourceFile,sourceIndex}){return {file:file.name,sourceFile,sourceIndex,processingError:{stage,message:error?.message||String(error)},elapsedMs};},
  async analyzeSingleImage(file,idx,total,{sourceIndex,displayName}){return {file:displayName,sourceFile:file,sourceIndex,processingError:null};},
  async checkpointWriteResultAndMeta(r,status,nextIndex,pauseIndex){calls.push(['commit',r.sourceIndex,status,nextIndex,pauseIndex]);return true;},
  async saveAnalysisCheckpoint(status,nextIndex,pauseIndex){calls.push(['meta',status,nextIndex,pauseIndex]);return true;},
  async clearAnalysisCheckpoint(){calls.push(['clear']);return true;}
};
vm.createContext(batchCtx);
vm.runInContext(extractFunction('setPausedAnalysis')+'\n'+extractFunction('runAnalysisBatch')+'\nthis.run=runAnalysisBatch;',batchCtx);
await batchCtx.run(batchCtx.selected,0);
assert.deepEqual(calls,[['meta','running',0,null],['commit',0,'running',1,null],['commit',1,'running',2,null],['clear']]);

// Rehydrating remaining sources should recreate every unprocessed File/Blob from IDB.
const original=[{name:'0',tag:'done'},{name:'1',tag:'failed'},{name:'2',tag:'stale-2'},{name:'3',tag:'stale-3'}];
const rehydrateCalls=[];
const rehydrateCtx={
  Array,Number,Promise,Math,console,
  selected:[...original],CHECKPOINT_FILE_WRITE_BATCH:3,
  async checkpointReadStableFile(i){rehydrateCalls.push(i);return {name:String(i),tag:`fresh-${i}`};},
  cloneStableImageSource(f){return {...f,tag:`clone-${f?.tag||'x'}`};},
  async waitMs(){}
};
vm.createContext(rehydrateCtx);
vm.runInContext(extractFunction('checkpointRehydrateRemainingSources')+'\nthis.rehydrate=checkpointRehydrateRemainingSources;',rehydrateCtx);
const batch=[...original];
await rehydrateCtx.rehydrate(batch,2);
assert.deepEqual(rehydrateCalls,[2,3]);
assert.equal(batch[2].tag,'fresh-2');
assert.equal(batch[3].tag,'fresh-3');
assert.equal(rehydrateCtx.selected[2].tag,'fresh-2');
assert.equal(rehydrateCtx.selected[3].tag,'fresh-3');

// A paused retry must freshen the failed image AND all following images, then rebuild runtimes,
// while the pause still protects the transition.
const order=[];
const failed={file:'1.png',sourceIndex:1,sourceFile:original[1],processingError:{stage:'画像読み込み',message:'transient'}};
const retryBatch=[...original];
const retryCtx={
  Array,Number,Promise,Math,console,
  results:[{sourceIndex:0},failed],selected:[...original],analysisPause:{batch:retryBatch,index:1,result:failed},isRunning:false,
  CHECKPOINT_FILE_WRITE_BATCH:3,
  pausedFailureIndex(ri){return retryCtx.analysisPause&&retryCtx.results[ri]===retryCtx.analysisPause.result?retryCtx.analysisPause.index:-1;},
  render(){},refreshCompletedProgress(){},syncSessionGuard(){},
  async checkpointReadStableFile(i){order.push(['read',i]);return {name:`${i}.png`,tag:`fresh-${i}`};},
  cloneStableImageSource(f){return {...f,tag:'fallback'};},
  async waitMs(){},
  async resetAnalysisRuntimeForRetry(){order.push(['reset']);},
  async checkpointPrepareRetry(i){order.push(['prepare',i]);return true;},
  async runAnalysisBatch(next,start){order.push(['run',start,...next.slice(start).map(x=>x.tag)]);return true;},
  async ensureWorker(){throw new Error('unexpected');},async analyzeSingleImage(){throw new Error('unexpected');},makeProcessingFailureResult(){throw new Error('unexpected');}
};
vm.createContext(retryCtx);
vm.runInContext(extractFunction('checkpointRehydrateRemainingSources')+'\n'+extractFunction('retryProcessingFailure')+'\nthis.retry=retryProcessingFailure;',retryCtx);
await retryCtx.retry(1);
assert.deepEqual(order,[['read',1],['read',2],['read',3],['reset'],['prepare',1],['run',1,'fresh-1','fresh-2','fresh-3']]);
assert.equal(retryCtx.analysisPause,null);
assert.deepEqual(retryCtx.results.map(x=>x.sourceIndex),[0]);

// All user-visible processing-error continuation routes should use the full runtime reset.
const reselectStart=app.indexOf('async function reselectProcessingFailure');
const deleteStart=app.indexOf('async function deleteProcessingFailure');
const manualStart=app.indexOf('async function resumeAfterManualCompletion');
assert.ok(app.slice(reselectStart,deleteStart).includes('await resetAnalysisRuntimeForRetry()'),'reselect must rebuild Tesseract + Paddle runtime');
assert.ok(app.slice(deleteStart,manualStart).includes('await resetAnalysisRuntimeForRetry()'),'delete-and-continue must rebuild Tesseract + Paddle runtime');
assert.ok(app.slice(manualStart,app.indexOf('async function runPrimaryAnalysisAction')).includes('await resetAnalysisRuntimeForRetry()'),'manual-completion continue must rebuild Tesseract + Paddle runtime');

console.log('OK: Candidate 87 atomic checkpoint + recovery-chain hardening regression passed');
