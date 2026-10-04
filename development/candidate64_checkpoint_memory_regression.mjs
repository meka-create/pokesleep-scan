import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));

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

assert.ok(app.includes("CHECKPOINT_DB_VERSION=2"));
assert.ok(app.includes("db.createObjectStore('results',{keyPath:'sourceIndex'})"));
assert.ok(app.includes("CHECKPOINT_FILE_WRITE_BATCH=3"));
assert.ok(!app.includes("Promise.all((files||[]).map(async(file,index)"),'checkpoint file copy must not fan out all images at once');
assert.ok(!app.includes('selected=files;primeStableImageSources(selected);'),'file selection must not eagerly arrayBuffer every image');
assert.ok(!app.includes('results:results.map(checkpointResultClone)'),'meta must not rewrite every accumulated result on each checkpoint');
assert.ok(app.includes("tx.objectStore('results').put(cloned)"),'results must be persisted incrementally');
assert.ok(app.includes("resultsReq=tx.objectStore('results').getAll()"),'restore must read incremental result store');
assert.ok(app.includes("rawResults?.length?rawResults:meta.results"),'v1 checkpoints remain readable after DB migration');
assert.ok(app.includes('batch[i]=source;selected[i]=source;'),'processed input File must be replaced by stable source so the original can be released');

// checkpointMeta should remain lightweight and contain no accumulated result snapshots.
const ctx={Date,Math,Number,CHECKPOINT_META_KEY:'active',CHECKPOINT_SCHEMA_VERSION:1,CHECKPOINT_RELEASE_ID:release.id,CHECKPOINT_COMPATIBILITY_ID:'checkpoint-compat-2026-10-04-v1',BUILD_ID:'v12-final'};
ctx.selected=[{name:'a.png',size:10,type:'image/png',lastModified:1},{name:'b.png',size:11,type:'image/png',lastModified:2}];
vm.createContext(ctx);
vm.runInContext(extractFunction('checkpointMeta')+'\nthis.api={checkpointMeta};',ctx);
const meta=ctx.api.checkpointMeta('running',1,null);
assert.equal(meta.total,2);
assert.equal(meta.nextIndex,1);
assert.equal(meta.compatibilityId,'checkpoint-compat-2026-10-04-v1');
assert.equal('results' in meta,false);
assert.equal(meta.selectedMeta.length,2);

// A normal batch persists exactly the just-completed results, while progress metadata remains separate.
const commits=[],saves=[];
const controls=new Map();
const $=sel=>{if(!controls.has(sel))controls.set(sel,{disabled:false});return controls.get(sel);};
const batchCtx={
  console:{error(){},warn(){},log(){}},Promise,Array,Number,Math,setTimeout,
  selected:[{name:'0.png'},{name:'1.png'}],results:[],worker:null,isRunning:false,analysisPause:null,renderPending:false,
  $,
  syncSessionGuard(){},syncRunActionButton(){},render(){},renderDuringAnalysis(){},reviewEditorActive(){return false;},
  setProgressState(){},setFloatingProgress(){},refreshCompletedProgress(){batchCtx.completed=true;},
  async ensureWorker(){},async stableImageSource(f){return f;},runtimeErrorText(e){return e?.message||String(e);},
  makeProcessingFailureResult(file,stage,error,elapsedMs,{sourceFile,sourceIndex}){return {file:file.name,sourceFile,sourceIndex,processingError:{stage,message:error?.message||String(error)},elapsedMs};},
  async analyzeSingleImage(file,idx,total,{sourceIndex,displayName}){const stable={name:`stable-${displayName}`};return {file:displayName,sourceFile:stable,sourceIndex,processingError:null};},
  async checkpointWriteResultAndMeta(r,status,nextIndex,pauseIndex){commits.push([r.sourceIndex,r.file,status,nextIndex,pauseIndex]);return true;},
  async saveAnalysisCheckpoint(status,nextIndex,pauseIndex){saves.push([status,nextIndex,pauseIndex]);return true;},
  async clearAnalysisCheckpoint(){saves.push(['clear']);return true;}
};
vm.createContext(batchCtx);
vm.runInContext(extractFunction('setPausedAnalysis')+'\n'+extractFunction('runAnalysisBatch')+'\nthis.api={runAnalysisBatch};',batchCtx);
await batchCtx.api.runAnalysisBatch(batchCtx.selected,0);
assert.deepEqual(commits,[[0,'0.png','running',1,null],[1,'1.png','running',2,null]]);
assert.deepEqual(saves,[['running',0,null],['clear']]);
assert.equal(batchCtx.selected[0].name,'stable-0.png');
assert.equal(batchCtx.selected[1].name,'stable-1.png');
assert.equal(batchCtx.completed,true);

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');
console.log('OK: Candidate 64 checkpoint memory regression passed');
