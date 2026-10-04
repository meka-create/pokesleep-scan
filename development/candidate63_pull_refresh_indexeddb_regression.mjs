import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const release=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));

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

// Pull-to-refresh guard exists only while analysis/preparation/pause is active.
assert.match(html,/analysis-pull-guard[^}]*overscroll-behavior-y\s*:\s*none/);
assert.ok(app.includes("document.addEventListener('touchmove'"));
assert.ok(app.includes('e.preventDefault()'));
assert.match(app,/function pullRefreshGuardActive\(\)\{return !!\(isRunning\|\|analysisPause\|\|checkpointPreparing\);\}/);

// IndexedDB checkpoint structure + resume prompt.
for(const marker of [
  "CHECKPOINT_DB_NAME='bukkomi-scan-checkpoint-v1'",
  "indexedDB.open(CHECKPOINT_DB_NAME,CHECKPOINT_DB_VERSION)",
  "db.createObjectStore('meta'",
  "db.createObjectStore('files'",
  "checkpointWriteResultAndMeta(analyzed,'running',i+1,null)",
  "checkpointWriteResultAndMeta(failed,'paused',i,i)",
  'initializeAnalysisCheckpoint(batch)',
  '前回の解析を復元しますか？',
  '続きから再開',
  'restoreAnalysisCheckpoint(snapshot)',
  'checkpointReplaceFile(pauseIndex,file)',
  'checkpointRewriteFiles(selected)'
]) assert.ok(app.includes(marker),`missing checkpoint marker: ${marker}`);

// Checkpoint serialization must not persist transient File references/busy flags,
// and restored results must reconnect to the persisted image for their sourceIndex.
const ctx={console,JSON,Number};
vm.createContext(ctx);
vm.runInContext(extractFunction('checkpointResultClone')+'\n'+extractFunction('restoreCheckpointResults')+'\nthis.api={checkpointResultClone,restoreCheckpointResults};',ctx);
const source={name:'source.png'};
const input={file:'source.png',sourceIndex:1,sourceFile:source,recoveryBusy:'retry',parsed:{nickname:'X'},foods:[{name:'A'}]};
const cloned=ctx.api.checkpointResultClone(input);
assert.equal(cloned.sourceFile,undefined);
assert.equal(cloned.recoveryBusy,undefined);
assert.equal(cloned.file,'source.png');
const files=[{name:'0.png'},{name:'1.png'}];
const restored=ctx.api.restoreCheckpointResults([cloned],files);
assert.equal(restored.length,1);
assert.equal(restored[0].sourceFile,files[1]);

// Batch execution checkpoints every completed image, and clears the checkpoint at normal completion.
const calls=[],commits=[];
const controls=new Map();
const $=sel=>{if(!controls.has(sel))controls.set(sel,{disabled:false});return controls.get(sel);};
const batchCtx={
  console:{error(){},warn(){},log(){}},Promise,Array,Number,Math,setTimeout,
  selected:[{name:'0.png'},{name:'1.png'}],results:[],worker:null,isRunning:false,analysisPause:null,renderPending:false,
  $,
  syncSessionGuard(){},syncRunActionButton(){},render(){},renderDuringAnalysis(){},reviewEditorActive(){return false;},
  setProgressState(){},setFloatingProgress(){},refreshCompletedProgress(){batchCtx.completed=true;},
  async ensureWorker(){},async stableImageSource(f){return f;},
  runtimeErrorText(e){return e?.message||String(e);},
  makeProcessingFailureResult(file,stage,error,elapsedMs,{sourceFile,sourceIndex}){return {file:file.name,sourceFile,sourceIndex,processingError:{stage,message:error?.message||String(error)},elapsedMs};},
  async analyzeSingleImage(file,idx,total,{sourceIndex,displayName}){return {file:displayName,sourceFile:file,sourceIndex,processingError:null};},
  async checkpointWriteResultAndMeta(r,status,nextIndex,pauseIndex){commits.push([r.sourceIndex,status,nextIndex,pauseIndex]);return true;},
  async saveAnalysisCheckpoint(status,nextIndex,pauseIndex){calls.push(['save',status,nextIndex,pauseIndex]);return true;},
  async clearAnalysisCheckpoint(){calls.push(['clear']);return true;}
};
vm.createContext(batchCtx);
vm.runInContext(extractFunction('setPausedAnalysis')+'\n'+extractFunction('runAnalysisBatch')+'\nthis.api={runAnalysisBatch};',batchCtx);
await batchCtx.api.runAnalysisBatch(batchCtx.selected,0);
assert.deepEqual(calls,[
  ['save','running',0,null],
  ['clear']
]);
assert.deepEqual(commits,[[0,'running',1,null],[1,'running',2,null]]);
assert.equal(batchCtx.completed,true);

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');
console.log('OK: Candidate 63 pull-to-refresh + IndexedDB checkpoint regression passed');
