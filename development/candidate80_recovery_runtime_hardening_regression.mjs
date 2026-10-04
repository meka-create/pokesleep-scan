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

assert.ok(app.includes('IMAGE_DECODE_TIMEOUT_MS=15000'),'image decode must have a bounded timeout');
assert.ok(app.includes('async function resetPaddleRuntime()'),'paused retry must be able to reset PaddleOCR state');
assert.ok(app.includes('paddleRuntimeGeneration++'),'PaddleOCR reset must invalidate stale initialization work');
assert.ok(app.includes("old?.dispose"),'PaddleOCR reset must dispose the old pipeline when available');
assert.ok(app.includes('paddleUnavailableError=null'),'a prior Paddle initialization failure must not poison later retries');
assert.ok(app.includes('paddleModelBlobUrls.splice(0)'),'retry reset must release old Paddle model Blob URLs');
assert.ok(app.includes('await resetAnalysisRuntimeForRetry();await checkpointPrepareRetry(pauseIndex)'),'runtime reset must happen while the pause/checkpoint still protects the failed item');
assert.ok(!app.includes("old.processingError.stage==='画像データ準備'"),'fresh checkpoint source must no longer be limited to one failure stage');

// Generic timeout protection must settle a permanently pending decode/runtime promise.
const timeoutCtx={setTimeout,clearTimeout,Promise,Math,Error};
vm.createContext(timeoutCtx);
vm.runInContext(extractFunction('promiseWithTimeout')+'\nthis.timeout=promiseWithTimeout;',timeoutCtx);
await assert.rejects(timeoutCtx.timeout(new Promise(()=>{}),20,'decode timeout'),/decode timeout/);

// Every paused retry must use a newly reconstructed checkpoint source, including OCR-stage failures.
let freshSerial=0;
const first={name:'done.png'};
const poisoned={name:'1000005195.jpg',tag:'poisoned'};
const calls={reads:[],resets:0,prepare:[],runs:[]};
const ctx={
  results:[],selected:[first,poisoned],analysisPause:null,isRunning:false,console,
  pausedFailureIndex(ri){return ctx.analysisPause&&ctx.results[ri]===ctx.analysisPause.result?ctx.analysisPause.index:-1;},
  async checkpointReadStableFile(index){calls.reads.push(index);freshSerial++;return {name:'1000005195.jpg',tag:`fresh-${freshSerial}`};},
  cloneStableImageSource(file){return {...file,tag:'fallback-clone'};},
  async resetAnalysisRuntimeForRetry(){calls.resets++;},
  async checkpointPrepareRetry(index){calls.prepare.push(index);return true;},
  render(){},refreshCompletedProgress(){},syncSessionGuard(){},
  async runAnalysisBatch(batch,index){calls.runs.push({source:batch[index],index});return true;},
  async ensureWorker(){throw new Error('not expected');},
  async analyzeSingleImage(){throw new Error('not expected');},
  makeProcessingFailureResult(){throw new Error('not expected');}
};
vm.createContext(ctx);
vm.runInContext(extractFunction('retryProcessingFailure')+'\nthis.retry=retryProcessingFailure;',ctx);

for(const stage of ['OCR','画像読み込み']){
  const failure={file:'1000005195.jpg',sourceIndex:1,sourceFile:poisoned,processingError:{stage,message:'transient'}};
  const batch=[first,poisoned];
  ctx.results=[{sourceIndex:0},failure];ctx.selected=[first,poisoned];ctx.analysisPause={batch,index:1,result:failure};
  await ctx.retry(1);
  const last=calls.runs.at(-1);
  assert.equal(last.index,1);
  assert.match(last.source.tag,/^fresh-/,'retry must restart with the fresh IDB-backed source');
  assert.notEqual(last.source,poisoned,'retry must not reuse the previous in-memory File');
}
assert.deepEqual(calls.reads,[1,1],'each retry attempt must re-read the paused image from checkpoint');
assert.equal(calls.resets,2,'each retry attempt must rebuild analysis runtimes');
assert.deepEqual(calls.prepare,[1,1]);
assert.notEqual(calls.runs[0].source,calls.runs[1].source,'repeated retries must receive different fresh File/Blob objects');

console.log('OK: Candidate 80 recovery runtime hardening regression passed');
