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
  const parenStart=app.indexOf('(',fnStart);let p=0,parenEnd=-1;
  for(let i=parenStart;i<app.length;i++){if(app[i]==='(')p++;else if(app[i]===')'&&--p===0){parenEnd=i;break;}}
  const bodyStart=app.indexOf('{',parenEnd);let d=0,end=-1;
  for(let i=bodyStart;i<app.length;i++){if(app[i]==='{')d++;else if(app[i]==='}'&&--d===0){end=i+1;break;}}
  assert.ok(end>start,`could not extract ${name}`);
  return app.slice(start,end);
}

assert.ok(app.includes(`CHECKPOINT_RELEASE_ID='${release.id}'`));
assert.ok(app.includes('CHECKPOINT_TTL_MS=7*24*60*60*1000'),'checkpoint TTL must be seven days');
assert.ok(app.indexOf('if(checkpointExpired(meta))') < app.indexOf("tx=db.transaction(['files','results'],'readonly')"),'expired checkpoint must be rejected before blobs/results are loaded');
assert.ok(app.includes('if(snapshot.incompatible||snapshot.expired)return;'),'expired checkpoint must silently exit recovery flow');

const ttlCtx={Date,Number,CHECKPOINT_TTL_MS:7*24*60*60*1000};
vm.createContext(ttlCtx);
vm.runInContext(extractFunction('checkpointExpired')+'\nthis.expired=checkpointExpired;',ttlCtx);
const now=10_000_000_000;
assert.equal(ttlCtx.expired({savedAt:now-6*24*60*60*1000},now),false,'six-day checkpoint should remain recoverable');
assert.equal(ttlCtx.expired({savedAt:now-7*24*60*60*1000},now),false,'exact TTL boundary should remain recoverable');
assert.equal(ttlCtx.expired({savedAt:now-7*24*60*60*1000-1},now),true,'older than seven days must expire');
assert.equal(ttlCtx.expired({},now),true,'checkpoint without savedAt must not persist indefinitely');

let cleared=0;const opened=[];
const expiredMeta={key:'active',schema:1,releaseId:release.id,status:'paused',total:2,nextIndex:1,savedAt:1};
const db={transaction(store){opened.push(store);return {objectStore(){return {get(){return {value:expiredMeta};}};}};}};
const loadCtx={
  console:{warn(){}},Promise,Number,Math,File:function(){},stableSourceFiles:new WeakSet(),
  CHECKPOINT_META_KEY:'active',CHECKPOINT_SCHEMA_VERSION:1,CHECKPOINT_RELEASE_ID:release.id,
  checkpointSaveChain:Promise.resolve(),checkpointSupported(){return true;},checkpointExpired(){return true;},
  async openCheckpointDb(){return db;},async checkpointRequest(req){return req.value;},async checkpointTxDone(){return true;},
  async checkpointClearNow(){cleared++;return true;}
};
vm.createContext(loadCtx);
vm.runInContext(extractFunction('loadAnalysisCheckpoint')+'\nthis.load=loadAnalysisCheckpoint;',loadCtx);
const expired=await loadCtx.load();
assert.equal(expired.expired,true);
assert.equal(cleared,1);
assert.deepEqual(opened,['meta'],'expired checkpoint must be discarded before files/results stores are opened');

// Pending public release must be applied at the next-session boundary before a new file picker/batch starts.
assert.ok(html.includes('const applyPendingReleaseForNewSession=()=>{'));
assert.ok(html.includes('window.__BUKKOMI_APPLY_PENDING_RELEASE_FOR_NEW_SESSION__=applyPendingReleaseForNewSession'));
assert.ok(html.includes("window.__BUKKOMI_PENDING_RELEASE_ID__=''"));
assert.ok(app.includes("fileInput?.addEventListener('click',e=>{if(applyPendingReleaseBeforeNewSelection())e.preventDefault();});"));
assert.ok(app.includes("function setSelectedFiles(fileList,{clearInput=false}={}){if(applyPendingReleaseBeforeNewSelection())return false;"),'drop/programmatic selection must also refuse to begin on a pending old release');

let calls=0;
const pendingCtx={window:{__BUKKOMI_APPLY_PENDING_RELEASE_FOR_NEW_SESSION__(){calls++;return true;}},console:{warn(){}}};
vm.createContext(pendingCtx);
vm.runInContext(extractFunction('applyPendingReleaseBeforeNewSelection')+'\nthis.apply=applyPendingReleaseBeforeNewSelection;',pendingCtx);
assert.equal(pendingCtx.apply(),true);
assert.equal(calls,1);
pendingCtx.window.__BUKKOMI_APPLY_PENDING_RELEASE_FOR_NEW_SESSION__=undefined;
assert.equal(pendingCtx.apply(),false);

// Candidate 67 cleanup should stay clean: remove only truly unused helpers.
for(const name of ['nicknameConsensus','foodReviewCount','scoreClass']){
  assert.ok(!app.includes(`function ${name}(`),`${name} should be removed as unused`);
}
for(const live of ['chooseNickname','markFoodReviews','speciesNeedsReview'])assert.ok(app.includes(`function ${live}(`),`live helper accidentally removed: ${live}`);

console.log('OK: Candidate 77 pending release boundary + checkpoint TTL + dead helper cleanup regression passed');
