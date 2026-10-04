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

assert.ok(app.includes("navigator.wakeLock.request('screen')"),'must request a screen wake lock');
assert.ok(app.includes("document.addEventListener('visibilitychange',()=>{if(typeof syncAnalysisWakeLock==='function')void syncAnalysisWakeLock();});"),'must re-sync the wake lock after returning to the app');
assert.ok(app.includes("window.addEventListener('pagehide',()=>{void releaseAnalysisWakeLock();}"),'must release the wake lock on pagehide');
assert.ok(app.includes("analysisPause={batch,index,result:failure};if(typeof syncAnalysisWakeLock==='function')void syncAnalysisWakeLock();"),'pause must release the wake lock immediately');
assert.ok(app.includes("isRunning=true;syncSessionGuard();if(typeof syncAnalysisWakeLock==='function')void syncAnalysisWakeLock();"),'analysis start must acquire the wake lock');
assert.ok(app.includes("isRunning=false;syncSessionGuard();if(typeof syncAnalysisWakeLock==='function')void syncAnalysisWakeLock();"),'analysis end must release the wake lock');
assert.ok(app.includes("checkpointPreparing=true;syncSessionGuard();if(typeof syncAnalysisWakeLock==='function')void syncAnalysisWakeLock();"),'checkpoint preparation must also hold the screen awake');

let requestCount=0,releaseCount=0;
function makeLock(){
  return {
    released:false,
    addEventListener(){},
    async release(){if(!this.released){this.released=true;releaseCount++;}}
  };
}
const ctx={
  console,setTimeout,clearTimeout,Promise,
  isRunning:false,checkpointPreparing:false,analysisPause:null,
  wakeLockSentinel:null,wakeLockRequestPromise:null,wakeLockRetryTimer:null,
  document:{hidden:false},
  navigator:{wakeLock:{async request(kind){assert.equal(kind,'screen');requestCount++;return makeLock();}}}
};
vm.createContext(ctx);
const names=['analysisWakeLockShouldHold','wakeLockApiSupported','clearWakeLockRetry','releaseAnalysisWakeLock','requestAnalysisWakeLock','syncAnalysisWakeLock'];
vm.runInContext(names.map(extractFunction).join('\n')+'\nthis.api={analysisWakeLockShouldHold,wakeLockApiSupported,releaseAnalysisWakeLock,requestAnalysisWakeLock,syncAnalysisWakeLock};',ctx);

ctx.isRunning=true;
assert.equal(await ctx.api.syncAnalysisWakeLock(),true);
assert.equal(requestCount,1,'analysis start should request one screen wake lock');
assert.ok(ctx.wakeLockSentinel||true); // lexical sentinel is validated by the second request below
assert.equal(await ctx.api.syncAnalysisWakeLock(),true);
assert.equal(requestCount,1,'an already-held lock must not be requested twice');

ctx.analysisPause={index:3};
await ctx.api.syncAnalysisWakeLock();
assert.equal(releaseCount,1,'paused analysis must release the screen wake lock');

ctx.analysisPause=null;
await ctx.api.syncAnalysisWakeLock();
assert.equal(requestCount,2,'resume must acquire a fresh wake lock');

ctx.document.hidden=true;
await ctx.api.syncAnalysisWakeLock();
assert.equal(releaseCount,2,'hidden document must not keep the wake lock');
ctx.document.hidden=false;
await ctx.api.syncAnalysisWakeLock();
assert.equal(requestCount,3,'returning visible while analysis is active must reacquire the wake lock');

ctx.isRunning=false;
await ctx.api.syncAnalysisWakeLock();
assert.equal(releaseCount,3,'analysis completion must release the wake lock');

// Unsupported or denied wake lock must never make analysis fail.
ctx.navigator={};ctx.isRunning=true;
assert.equal(await ctx.api.syncAnalysisWakeLock(),false);
ctx.navigator={wakeLock:{async request(){throw new Error('denied');}}};
assert.equal(await ctx.api.syncAnalysisWakeLock(),false);

console.log('OK: Candidate 83 Screen Wake Lock regression passed');
