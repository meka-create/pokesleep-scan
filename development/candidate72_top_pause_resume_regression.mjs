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

assert.ok(app.includes("void runPrimaryAnalysisAction()"),'top run button must use pause-aware primary action');
assert.ok(app.includes("'停止した画像から再開'"),'paused primary action label must be present');
assert.ok(app.includes('上部の「停止した画像から再開」で再解析できます。'),'restored paused state must explain the top resume action');
assert.ok(app.includes('上部の「停止した画像から再開」または失敗カードから再開できます。'),'fresh pause must explain both recovery paths');

const run={disabled:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};
const failure={sourceIndex:1,processingError:{stage:'画像データ準備',message:'failed'}};
const done={sourceIndex:0};
const ctx={
  analysisPause:{batch:[{name:'0.png'},{name:'1.jpg'},{name:'2.png'}],index:1,result:failure},
  results:[done,failure],selected:[{},{},{}],isRunning:false,checkpointPreparing:false,checkpointRestoreRunning:false,
  $:sel=>sel==='#run'?run:null,
  retryCalls:[],runAllCalls:0,
  async retryProcessingFailure(ri){ctx.retryCalls.push(ri);},
  async runAll(){ctx.runAllCalls++;return 'run-all';}
};
vm.createContext(ctx);
vm.runInContext(extractFunction('syncRunActionButton')+'\n'+extractFunction('runPrimaryAnalysisAction')+'\nthis.api={syncRunActionButton,runPrimaryAnalysisAction};',ctx);
ctx.api.syncRunActionButton();
assert.equal(run.textContent,'停止した画像から再開');
assert.equal(run.disabled,false,'paused top resume button must be clickable after restore/pause settles');
assert.equal(run.attrs['aria-label'],'停止した画像を再解析して残りの解析を再開');
await ctx.api.runPrimaryAnalysisAction();
assert.deepEqual(ctx.retryCalls,[1],'top resume must reuse the paused failure retry path');
assert.equal(ctx.runAllCalls,0,'paused top resume must not start a brand-new batch');

failure.recoveryBusy='retry';
ctx.api.syncRunActionButton();
assert.equal(run.textContent,'再開中…');
assert.equal(run.disabled,true,'top button must lock while retry is already running');
delete failure.recoveryBusy;

ctx.analysisPause=null;
ctx.api.syncRunActionButton();
assert.equal(run.textContent,'解析する');
assert.equal(run.disabled,false);
await ctx.api.runPrimaryAnalysisAction();
assert.equal(ctx.runAllCalls,1,'normal top action must still start a new analysis');

ctx.analysisPause={batch:[],index:1,result:failure};
ctx.checkpointRestoreRunning=true;
ctx.api.syncRunActionButton();
assert.equal(run.disabled,true,'pause action stays locked while checkpoint restore is still finalizing');
ctx.checkpointRestoreRunning=false;
ctx.api.syncRunActionButton();
assert.equal(run.disabled,false,'pause action becomes available after checkpoint restore finalizes');

console.log('OK: Candidate 72 top pause resume regression passed');
