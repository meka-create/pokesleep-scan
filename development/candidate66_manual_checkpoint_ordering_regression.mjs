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

assert.ok(typeof release.id==='string'&&release.id.length>0,'release id must be present');
assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`),'checkpoint release id must match release.json');
assert.ok(app.includes('CHECKPOINT_MANUAL_SAVE_DELAY_MS=120'));
for(const key of ['manualPreviews','nicknamePreview','foodPreviews','classificationPreview'])assert.ok(app.includes(`key==='${key}'`),`${key} must be excluded from checkpoint-safe result serialization`);

// Confirmed manual/review changes must schedule an incremental result checkpoint.
for(const selector of ['.nickconfirm','.species-single-confirm','.speciesconfirm','.foodconfirm','.foodreopen','.speciesreopen','.nickreopen']){
  const pos=app.indexOf(`querySelectorAll('${selector}')`);
  assert.ok(pos>=0,`missing handler ${selector}`);
  assert.ok(app.slice(pos,pos+1300).includes('scheduleCheckpointResultSave(r)'),`${selector} must schedule result persistence`);
}
assert.ok(app.includes("else{scheduleCheckpointResultSave(r);render();}"),'normal manual completion must persist while a batch is still running');
assert.ok(app.includes("else{p.nickname=e.target.value;scheduleCheckpointResultSave(r);}"),'direct nickname edits must be debounced into the active checkpoint');

// Debounce: repeated edits to the same result produce one write using the latest object state.
let timerSeq=0;
const timers=new Map();
const cleared=[];
const writes=[];
const result={sourceIndex:2,value:'first'};
const debounceCtx={
  Number,Map,Promise,
  checkpointSessionActive:true,
  checkpointSaveChain:Promise.resolve(),
  CHECKPOINT_MANUAL_SAVE_DELAY_MS:120,
  checkpointManualSaveTimers:new Map(),
  results:[result],
  checkpointSupported(){return true;},
  setTimeout(fn,ms){const id=++timerSeq;timers.set(id,{fn,ms});return id;},
  clearTimeout(id){cleared.push(id);timers.delete(id);},
  checkpointWriteResult(r){writes.push({sourceIndex:r.sourceIndex,value:r.value});return Promise.resolve(true);}
};
vm.createContext(debounceCtx);
vm.runInContext(extractFunction('cancelScheduledCheckpointResultSave')+'\n'+extractFunction('scheduleCheckpointResultSave')+'\nthis.api={scheduleCheckpointResultSave};',debounceCtx);
assert.equal(debounceCtx.api.scheduleCheckpointResultSave(result),true);
const firstId=[...timers.keys()][0];
result.value='latest';
assert.equal(debounceCtx.api.scheduleCheckpointResultSave(result),true);
assert.ok(cleared.includes(firstId),'previous scheduled save must be cancelled');
assert.equal(timers.size,1,'only one debounced save may remain');
const active=[...timers.values()][0];
assert.equal(active.ms,120);
active.fn();
await debounceCtx.checkpointSaveChain;
assert.deepEqual(JSON.parse(JSON.stringify(writes)),[{sourceIndex:2,value:'latest'}]);

// Paused manual completion must write the completed result + running progress in one IDB transaction.
const txStores=[];
const puts=[];
const atomicCtx={
  Number,Promise,
  checkpointSessionActive:true,
  checkpointSaveChain:Promise.resolve(),
  checkpointSupported(){return true;},
  checkpointResultClone(r){return {...r};},
  checkpointMeta(status,nextIndex,pauseIndex){return {key:'active',status,nextIndex,pauseIndex};},
  cancelScheduledCheckpointResultSave(){},
  async openCheckpointDb(){return {transaction(stores,mode){txStores.push([stores,mode]);return {objectStore(name){return {put(value){puts.push([name,value]);}};}};}};},
  async checkpointTxDone(){return true;},
  checkpointPersistenceFailure(){return false;}
};
vm.createContext(atomicCtx);
vm.runInContext(extractFunction('checkpointWriteResultAndMeta')+'\nthis.api={checkpointWriteResultAndMeta};',atomicCtx);
assert.equal(await atomicCtx.api.checkpointWriteResultAndMeta({sourceIndex:4,manualCompleted:true},'running',5,null),true);
assert.deepEqual(JSON.parse(JSON.stringify(txStores)),[[['results','meta'],'readwrite']]);
assert.equal(puts.length,2);
assert.equal(puts[0][0],'results');
assert.equal(puts[0][1].sourceIndex,4);
assert.equal(puts[1][0],'meta');
assert.equal(puts[1][1].status,'running');
assert.equal(puts[1][1].nextIndex,5);

// The pause remains locked while that atomic commit is pending; duplicate resume is ignored.
let resolveCommit;
const commitPromise=new Promise(r=>{resolveCommit=r;});
const pausedResult={sourceIndex:1};
const pause={batch:[{name:'0'},{name:'1'},{name:'2'}],index:1,result:pausedResult};
const ordering=[];
const controls=new Map();
const resumeCtx={
  results:[{sourceIndex:0},pausedResult],analysisPause:pause,isRunning:false,selected:[1,2,3],
  $:sel=>{if(!controls.has(sel))controls.set(sel,{disabled:false});return controls.get(sel);},
  render(){ordering.push(['render',resumeCtx.analysisPause===pause,pause.manualCommitBusy,pausedResult.recoveryBusy]);},
  checkpointWriteResultAndMeta(r,status,nextIndex,pauseIndex){ordering.push(['commit',r.sourceIndex,status,nextIndex,pauseIndex]);return commitPromise;},
  syncSessionGuard(){ordering.push(['sync']);},
  async resetAnalysisRuntimeForRetry(){ordering.push(['reset']);},
  async runAnalysisBatch(batch,nextIndex){ordering.push(['run',nextIndex]);return true;},
  async clearAnalysisCheckpoint(){ordering.push(['clear']);},
  refreshCompletedProgress(){ordering.push(['refresh']);}
};
vm.createContext(resumeCtx);
vm.runInContext(extractFunction('resumeAfterManualCompletion')+'\nthis.api={resumeAfterManualCompletion};',resumeCtx);
const pending=resumeCtx.api.resumeAfterManualCompletion(1);
assert.equal(pause.manualCommitBusy,true);
assert.equal(pausedResult.recoveryBusy,'manual');
assert.equal(resumeCtx.analysisPause,pause,'pause must remain active until the atomic checkpoint commit finishes');
await resumeCtx.api.resumeAfterManualCompletion(1);
assert.equal(ordering.filter(x=>x[0]==='commit').length,1,'duplicate resume during commit must be ignored');
resolveCommit(true);
await pending;
assert.equal(resumeCtx.analysisPause,null);
assert.equal(pausedResult.recoveryBusy,undefined);
assert.deepEqual(ordering.filter(x=>['commit','reset','run'].includes(x[0])).map(x=>x[0]),['commit','reset','run']);
assert.deepEqual(ordering.find(x=>x[0]==='run'),['run',2]);

assert.ok(app.includes('!analysisPause.manualCommitBusy'),'render must not enqueue a stale paused meta write during the atomic transition');
assert.ok(app.includes("r.recoveryBusy==='manual'?'保存して再開中…'"),'manual action must be disabled/labelled while pause completion is committing');
assert.ok(app.includes('cancelScheduledCheckpointResultSaves();checkpointSaveChain'),'clearing a session must cancel delayed writes from the old session');

console.log('OK: Candidate 66 manual checkpoint save + pause ordering regression passed');
