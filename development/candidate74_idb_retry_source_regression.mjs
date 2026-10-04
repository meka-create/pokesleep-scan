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

assert.ok(app.includes("IMAGE_SOURCE_READ_TIMEOUT_MS=15000"),'image source read must have a bounded timeout');
assert.ok(app.includes('checkpointReadStableFile(pauseIndex)'),'paused retry must reload the failed source from IndexedDB checkpoint');

// Timeout helper must reject a permanently pending File.arrayBuffer() instead of hanging forever.
const timeoutCtx={setTimeout,clearTimeout,Promise,Math,Error};
vm.createContext(timeoutCtx);
vm.runInContext(extractFunction('imageArrayBufferWithTimeout')+'\nthis.helper=imageArrayBufferWithTimeout;',timeoutCtx);
const t0=Date.now();
await assert.rejects(
  timeoutCtx.helper({arrayBuffer(){return new Promise(()=>{});}},20),
  /タイムアウト/
);
assert.ok(Date.now()-t0<500,'timeout helper should settle promptly in regression test');

// A fresh pause at image-data preparation must swap the poisoned in-memory File for
// the stable source reconstructed from the checkpoint before restarting the batch.
const poisoned={name:'1000005195.jpg',tag:'poisoned'};
const fresh={name:'1000005195.jpg',tag:'idb-fresh'};
const done={sourceIndex:0};
const failure={file:'1000005195.jpg',sourceIndex:1,sourceFile:poisoned,processingError:{stage:'画像データ準備',message:'timeout'}};
const batch=[{name:'first.png'},poisoned,{name:'third.png'}];
const ctx={
  results:[done,failure],selected:[batch[0],poisoned,batch[2]],analysisPause:{batch,index:1,result:failure},isRunning:false,
  checkpointReads:[],resetCalls:0,runCalls:[],renders:0,
  pausedFailureIndex(ri){return ctx.analysisPause&&ctx.results[ri]===ctx.analysisPause.result?ctx.analysisPause.index:-1;},
  async checkpointReadStableFile(index){ctx.checkpointReads.push(index);return fresh;},
  async checkpointPrepareRetry(index){ctx.prepareRetry=(ctx.prepareRetry||[]).concat(index);return true;},
  render(){ctx.renders++;},
  async resetAnalysisRuntimeForRetry(){ctx.resetCalls++;},
  async runAnalysisBatch(nextBatch,index){ctx.runCalls.push({nextBatch:[...nextBatch],index});return true;},
  async ensureWorker(){throw new Error('not expected');},
  async analyzeSingleImage(){throw new Error('not expected');},
  makeProcessingFailureResult(){throw new Error('not expected');},
  refreshCompletedProgress(){},syncSessionGuard(){},console
};
vm.createContext(ctx);
vm.runInContext(extractFunction('retryProcessingFailure')+'\nthis.retry=retryProcessingFailure;',ctx);
await ctx.retry(1);
assert.deepEqual(ctx.checkpointReads,[1],'retry must fetch exactly the paused image from checkpoint');
assert.deepEqual(ctx.prepareRetry,[1],'retry must atomically remove the stale failure result and mark the same index running before restart');
assert.equal(ctx.selected[1],fresh,'selected source must be replaced by the IDB-reconstructed File');
assert.equal(batch[1],fresh,'paused batch source must be replaced by the IDB-reconstructed File');
assert.equal(failure.sourceFile,fresh,'failure card source must point at the reconstructed File during recovery');
assert.equal(ctx.results.length,1,'failure card must be removed before normal batch retry resumes');
assert.equal(ctx.analysisPause,null,'pause must be cleared only after source rehydration is prepared');
assert.equal(ctx.resetCalls,1);
assert.equal(ctx.runCalls.length,1);
assert.equal(ctx.runCalls[0].index,1);
assert.equal(ctx.runCalls[0].nextBatch[1],fresh,'batch restart must receive the fresh checkpoint source');

// Current recovery hardening reloads the paused image from checkpoint for every failure stage.
const ocrFailure={file:'ocr.jpg',sourceIndex:1,sourceFile:poisoned,processingError:{stage:'OCR',message:'worker'}};
const batch2=[batch[0],poisoned,batch[2]];
ctx.results=[done,ocrFailure];ctx.selected=[batch2[0],poisoned,batch2[2]];ctx.analysisPause={batch:batch2,index:1,result:ocrFailure};ctx.checkpointReads=[];ctx.runCalls=[];ctx.resetCalls=0;
await ctx.retry(1);
assert.deepEqual(ctx.checkpointReads,[1],'OCR-stage retry must also rebuild a fresh checkpoint source');
assert.equal(ctx.runCalls[0].nextBatch[1],fresh,'OCR-stage retry must not reuse the previous in-memory File');

console.log('OK: Candidate 74 IDB retry source regression passed');
