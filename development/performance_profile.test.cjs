'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app.js','utf8');
const begin=src.indexOf('// Read-only timing probes:');
const end=src.indexOf('async function trackedWorkerRecognize(',begin);
assert.ok(begin>0&&end>begin,'telemetry outside frozen OCR');
function fixture(){
 let time=0,hidden=false,listener=null;
 const document={get hidden(){return hidden;},addEventListener:(name,fn)=>{if(name==='visibilitychange')listener=fn;}};
 const ctx={document,performance:{now:()=>time},Date,results:[],worker:null,
  ocrRecognizeCallsTotal:0,ocrRecognizeCallsSinceWorkerReset:0};
 vm.createContext(ctx);
 vm.runInContext(src.slice(begin,end),ctx);
 vm.runInContext(src.slice(end,src.indexOf('async function maybeRecycleOcrWorkerForMemorySafety(',end)),ctx);
 return {ctx,tick:n=>{time+=n;},hidden:on=>{hidden=on;listener();}};
}
test('per-image stages and Tesseract recognition timing, with background transition',async()=>{
 const x=fixture(),{ctx}=x;ctx.scanPerfStart(7);
 ctx.scanPerfStage('imageDecode');x.tick(7);ctx.scanPerfStage('initialTesseract');
 ctx.worker={recognize:async input=>{x.tick(19);return {data:{text:input}};}};
 const output=await ctx.trackedWorkerRecognize('unchanged');
 assert.equal(output.data.text,'unchanged');x.tick(4);x.hidden(true);x.tick(10);x.hidden(false);
 ctx.scanPerfStage('subskillVerification');x.tick(6);ctx.scanPerfRecognize(5);x.tick(8);
 const p=ctx.scanPerfFinish();
 assert.equal(p.totalMs,54);assert.equal(p.stages.imageDecode,7);
 assert.equal(p.stages.initialTesseract,33);assert.equal(p.stages.subskillVerification,14);
 assert.equal(p.tesseract.calls,2);assert.equal(p.tesseract.totalMs,24);
 assert.equal(p.tesseract.byStage.initialTesseract.totalMs,19);
 assert.equal(p.tesseract.byStage.subskillVerification.totalMs,5);
 assert.equal(p.visibility.changes,2);assert.equal(p.visibility.hiddenMs,10);
 assert.equal(p.failed,false);assert.equal(ctx.scanPerfFinish(),null);
});
test('failed images and batch timings remain observable and do not affect results',async()=>{
 const x=fixture(),{ctx}=x;ctx.scanPerfStart(0);x.tick(5);
 const p=ctx.scanPerfFinish(true);assert.equal(p.failed,true);assert.equal(p.totalMs,5);
 ctx.results=[{performanceProfile:p}];
 await ctx.scanPerfMeasureBatch('workerPrepare',async()=>{x.tick(14);return true;});
 await ctx.scanPerfMeasureBatch('checkpointWrites',async()=>{x.tick(9);});
 let snap=ctx.scanPerfSessionSummary();
 assert.equal(snap.profiledImages,1);assert.equal(snap.workerPrepare.totalMs,14);
 assert.equal(snap.checkpointWrites.totalMs,9);
 assert.equal(snap.tesseractAverageMs,0);
 assert.equal(snap.stageTotalsMs.initialTesseract,0);assert.equal(snap.tesseractCalls,0);
 ctx.scanPerfResetSession();snap=ctx.scanPerfSessionSummary();
 assert.equal(snap.workerPrepare.calls,0);assert.equal(snap.profiledImages,1);
 ctx.scanPerfStart(1);x.tick(2);assert.equal(ctx.scanPerfFinish().totalMs,2);
});
test('timing hooks and diagnostic format are wired without changing OCR logic',()=>{
 for(const v of ["scanPerfStage('imageDecode')","scanPerfStage('initialTesseract')",
  "scanPerfStage('targetedOcr')","scanPerfStage('subskillVerification')",
  "scanPerfStage('nicknameAndStructuredRescue')","scanPerfStage('foodMatchingAndSafety')",
  "scanPerfStage('resultAssemblyAndPreviews')","result.performanceProfile=scanPerfFinish(false)",
  "err.performanceProfile=scanPerfFinish(true)","performanceDiagnostics:scanPerfSessionSummary()",
  "performanceProfile:r.performanceProfile||null",
  "scanPerfMeasureBatch('workerPrepare',()=>ensureWorker())",
  "scanPerfMeasureBatch('checkpointWrites',()=>checkpointWriteResultAndMeta(analyzed,'running',i+1,null))"
 ])assert.ok(src.includes(v),'missing telemetry: '+v);
});
